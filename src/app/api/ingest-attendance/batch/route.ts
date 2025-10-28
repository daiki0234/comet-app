

// src/app/api/ingest-attendance/batch/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/lib/server/firebaseAdmin';

/**
 * 受信ペイロード
 * - GAS 側で正規化済みを想定（ただしAPIでも最終防衛の正規化を実施）
 */
type IncomingRow = {
  userName: string;            // "姓 名"（半角スペース推奨）
  date: string;                // "YYYY-MM-DD" or Date-like
  month?: string;              // 省略可（API側で補完）
  usageStatus: string;         // ◯/◎/放課後/休校日/欠席/欠席(1)...
  arrivalTime?: string | number | Date; // "HH:mm" or Date-like
  departureTime?: string | number | Date;// 同上
  notes?: string;              // 備考（延長表記を含む）
  extension?: string;          // "1" | "2" | "3" | "" | undefined
};

const OK = (body: any, init?: number) =>
  NextResponse.json(body, { status: init ?? 200 });
const NG = (message: string, init?: number) =>
  NextResponse.json({ ok: false, error: message }, { status: init ?? 400 });

/** JSTのYYYY-MM-DDにそろえる */
function toJstYmd(v: string | Date): string {
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const j = new Date(d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  const y = j.getFullYear();
  const m = String(j.getMonth() + 1).padStart(2, '0');
  const day = String(j.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM" 抽出 */
function toMonthFromYmd(ymd: string): string {
  return ymd ? ymd.slice(0, 7) : '';
}

/** 利用状況の最終正規化（GAS側で済んでいても再度担保） */
function normalizeUsage(raw: any): '放課後' | '休校日' | '欠席' {
  const s = String(raw ?? '').trim();
  if (s === '◯' || s === '1' || s === '放課後') return '放課後';
  if (s === '◎' || s === '2' || s === '休校日') return '休校日';
  if (s.includes('欠席') || s === '3' || s === '欠席') return '欠席';
  // 不明な場合は放課後にフォールバック（必要なら NG にしても可）
  return '放課後';
}

/** 時刻の最終正規化："HH:mm" に丸める（Date/数値/秒付き対応） */
function normalizeHm(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  if (val instanceof Date) {
    const hh = String(val.getHours()).padStart(2, '0');
    const mm = String(val.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const s = String(val).trim();

  // "H:MM" / "HH:MM" / 秒付きを許容
  {
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  }

  // スプレッドシートのシリアル値など数値解釈
  const num = Number(s);
  if (!Number.isNaN(num)) {
    // シリアル（1日=1.0）前提で小数部を時刻に
    const frac = num - Math.floor(num);
    const totalMinutes = Math.round(frac * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  return '';
}

/** users を全件ロードして "姓 名" → userId のマップを作る */
async function buildUserIdMap(db: FirebaseFirestore.Firestore) {
  const snap = await db.collection('users').get();
  const map = new Map<string, string>();
  snap.forEach(doc => {
    const u = doc.data() as any;
    const last = String(u.lastName ?? '').replace(/\s+/g, ' ').trim();
    const first = String(u.firstName ?? '').replace(/\s+/g, ' ').trim();
    if (!last && !first) return;
    const key = `${last} ${first}`.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
    if (key) map.set(key, doc.id);
  });
  return map;
}

export async function POST(req: NextRequest) {
  try {
    // 認証
    // 先頭付近
const token = req.headers.get('x-sync-token');
console.log('x-sync-token length:', token?.length || 0, 'startsWith:', token?.slice(0,3) || '');
console.log('env length:', (process.env.SHEETS_SYNC_TOKEN?.length || 0), 'startsWith:', process.env.SHEETS_SYNC_TOKEN?.slice(0,3) || '');
if (!token || token !== process.env.SHEETS_SYNC_TOKEN) {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
    if (!token || token !== process.env.SHEETS_SYNC_TOKEN) {
      return NG('unauthorized', 401);
    }

    const incoming = await req.json();
    if (!Array.isArray(incoming)) {
      return NG('array required', 400);
    }

    const db = getDb();
    const userIdMap = await buildUserIdMap(db);

    let batch = db.batch();
    let ops = 0;
    let written = 0;

    for (const row of incoming as IncomingRow[]) {
      try {
        if (!row?.userName || !row?.date) continue;

        // 氏名キー正規化（全角→半角スペース）
        const userName = String(row.userName).replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
        const userId = userIdMap.get(userName);
        if (!userId) {
          // 見つからない場合はスキップ（ログに残す）
          console.warn('[batch] userId not found:', userName);
          continue;
        }

        // 日付・月 正規化
        const date = toJstYmd(row.date);
        if (!date) continue;
        const month = row.month && /^\d{4}-\d{2}$/.test(row.month) ? row.month : toMonthFromYmd(date);

        // 利用状況・時刻 正規化（最終防衛）
        const usageStatus = normalizeUsage(row.usageStatus);
        const arrivalTime = normalizeHm(row.arrivalTime ?? '');
        const departureTime = normalizeHm(row.departureTime ?? '');

        // 拡張フィールド
        const extension = (row.extension ?? '').toString();

        // ドキュメントIDは冪等：{date}_{userId}
        const ref = db.collection('attendanceRecords').doc(`${date}_${userId}`);

        batch.set(
          ref,
          {
            userId,
            userName,
            date,
            month,
            usageStatus,
            arrivalTime,
            departureTime,
            notes: row.notes ?? '',
            extension, // "1" | "2" | "3" | ""（延長支援加算）
            source: 'sheet-reimport',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        ops++;
        written++;

        // Firestore バッチは 500 上限。少し手前で切ってもOK
        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      } catch (inner) {
        console.error('[batch] row error:', inner);
        // 行単位の失敗は継続
      }
    }

    if (ops > 0) {
      await batch.commit();
    }

    return OK({ ok: true, count: written });
  } catch (e: any) {
    console.error('ingest batch error:', e);
    return NG(e?.message ?? 'unknown', 500);
  }
}