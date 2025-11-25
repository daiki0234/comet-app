// src/app/api/ingest-attendance/batch/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/lib/server/firebaseAdmin';

type IncomingRow = {
  userName: string;
  date: string;
  usageStatus: string;
  arrivalTime?: string;
  departureTime?: string;
  notes?: string;
};

const toUsage = (v: string): '放課後' | '休校日' | '欠席' => {
  const s = String(v ?? '').trim();
  if (s === '1' || s === '◯' || s === '放課後') return '放課後';
  if (s === '2' || s === '◎' || s === '休校日') return '休校日';
  if (s === '3' || s.includes('欠席') || s === '欠席') return '欠席';
  return '放課後';
};

const toJstYmd = (v: string) => {
  const d = new Date(v);
  const j = new Date(d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  const y = j.getFullYear();
  const m = String(j.getMonth() + 1).padStart(2, '0');
  const day = String(j.getDate()).padStart(2, '0');
  return { date: `${y}-${m}-${day}`, month: `${y}-${m}` };
};

// 既存のデータから「欠席(n)|」を除去して理由だけにする関数
const extractAbsenceReason = (raw?: string) => {
  const s = String(raw ?? '').trim();
  return s
    .replace(/^欠席[（(]\d+[）)]\s*[｜\|]\s*/u, '')
    .replace(/^欠席\s*[｜\|]\s*/u, '')
    .trim();
};

async function buildUserIdMap(db: FirebaseFirestore.Firestore) {
  const snap = await db.collection('users').get();
  const map = new Map<string, string>();
  snap.forEach((doc) => {
    const u = doc.data() as any;
    const key = `${String(u.lastName ?? '').trim()} ${String(u.firstName ?? '').trim()}`
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (key) map.set(key, doc.id);
  });
  return map;
}

// ★★★ 復活: 既存の欠席数をカウントする関数 ★★★
async function getExistingAbsencesCount(
  db: FirebaseFirestore.Firestore,
  userId: string,
  month: string
): Promise<number> {
  const q = await db
    .collection('attendanceRecords')
    .where('userId', '==', userId)
    .where('month', '==', month)
    .where('usageStatus', '==', '欠席')
    .get();
  return q.size;
}

function parseHHMM(s?: string): number | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function calcExtension(
  usage: '放課後' | '休校日' | '欠席',
  arrival?: string,
  departure?: string
): { label: string; grade: '' | '1' | '2' | '3' } {
  if (usage === '欠席') return { label: '', grade: '' };
  const a = parseHHMM(arrival);
  const d = parseHHMM(departure);
  if (a == null || d == null) return { label: '', grade: '' };

  let span = d - a;
  if (span <= 0) return { label: '', grade: '' };

  const base = usage === '放課後' ? 180 : 300;
  const over = span - base;
  if (over < 30) return { label: '', grade: '' };

  let grade: '' | '1' | '2' | '3' = '';
  if (over >= 120) grade = '3';
  else if (over >= 60) grade = '2';
  else grade = '1';

  const hh = Math.floor(over / 60);
  const mm = over % 60;
  const hStr = hh > 0 ? `${hh}時間` : '';
  const mStr = `${mm}分`;
  const label = `${hStr}${mStr}（${grade}）`;
  return { label, grade };
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-sync-token') || '';
    if (!token || token !== (process.env.SHEETS_SYNC_TOKEN || '')) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'array required' }, { status: 400 });
    }

    const db = getDb();
    const userIdMap = await buildUserIdMap(db);

    // 1) 入力データの整理
    type Row = {
      userId: string;
      userName: string;
      date: string;
      month: string;
      usageStatus: '放課後' | '休校日' | '欠席';
      arrivalTime: string;
      departureTime: string;
      rawReason: string;
    };

    const resolved: Row[] = [];
    for (const r of body as IncomingRow[]) {
      const nameKey = String(r.userName ?? '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
      if (!nameKey || !r.date) continue;

      const userId = userIdMap.get(nameKey);
      if (!userId) continue;
      
      const { date, month } = toJstYmd(String(r.date));
      const usageStatus = toUsage(r.usageStatus);
      const rawReason = extractAbsenceReason(r.notes);

      resolved.push({
        userId, userName: nameKey, date, month, usageStatus,
        arrivalTime: String(r.arrivalTime ?? '').trim(),
        departureTime: String(r.departureTime ?? '').trim(),
        rawReason,
      });
    }

    // ★★★ 復活 & 修正: 月ごとの欠席数を管理するマップ ★★★
    const userAbsenceCounts = new Map<string, number>(); // Key: `${userId}_${month}`

    // 2) upsert処理
    let batch = db.batch();
    let pending = 0;
    let written = 0;
    let skipped = 0; // スキップ数

    // 日付順にソートしてから処理（カウントを正確にするため）
    resolved.sort((a, b) => a.date.localeCompare(b.date));

    for (const r of resolved) {
      // 欠席の場合の制限チェック
      if (r.usageStatus === '欠席') {
        const key = `${r.userId}_${r.month}`;
        
        // その月のカウントが未取得ならDBから取得
        if (!userAbsenceCounts.has(key)) {
          const currentCount = await getExistingAbsencesCount(db, r.userId, r.month);
          userAbsenceCounts.set(key, currentCount);
        }

        const count = userAbsenceCounts.get(key) || 0;

        // ★ 4回を超えていたらスキップ (5回目以降は登録しない)
        if (count >= 4) {
          console.log(`[Skip] ${r.userName} (${r.date}) - 欠席制限(4回)超過`);
          skipped++;
          continue; 
        }

        // カウントアップ
        userAbsenceCounts.set(key, count + 1);
      }

      const ref = db.collection('attendanceRecords').doc(`${r.date}_${r.userId}`);
      const ext = calcExtension(r.usageStatus, r.arrivalTime, r.departureTime);

      // notes の決定 (プレフィックスなし)
      let notes: string | undefined = undefined;
      if (r.usageStatus === '欠席') {
        // ★★★ 修正点: 「欠席(n)|」は付けず、理由(rawReason)だけを保存 ★★★
        notes = r.rawReason; 
      } else if (ext.label) {
        notes = ext.label; // 延長の場合は自動生成テキスト
      }

      const data: any = {
        userId: r.userId,
        userName: r.userName,
        date: r.date,
        month: r.month,
        usageStatus: r.usageStatus,
        arrivalTime: r.arrivalTime,
        departureTime: r.departureTime,
        updatedAt: FieldValue.serverTimestamp(),
        source: 'sheet-migration',
      };

      if (notes !== undefined) data.notes = notes;
      data.extension = ext.grade;

      batch.set(ref, data, { merge: true });
      written++;
      pending++;

      if (pending >= 450) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();

    return NextResponse.json({ ok: true, count: written, skipped: skipped });
  } catch (e: any) {
    console.error('ingest batch error:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 });
  }
}