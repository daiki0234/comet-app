// src/app/api/ingest-attendance/batch/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/lib/server/firebaseAdmin';

type IncomingRow = {
  userName: string;       // 例: "山田 太郎"
  date: string;           // "YYYY/MM/DD" 等
  usageStatus: string;    // "◯"/"◎"/"欠席" or "放課後"/"休校日"/"欠席"
  arrivalTime?: string;   // "hh:mm" or ""
  departureTime?: string; // "hh:mm" or ""
  notes?: string;         // 欠席理由など
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

// ----- 欠席（n）｜理由 のための下処理 -----
const extractAbsenceReason = (raw?: string) => {
  const s = String(raw ?? '').trim();
  return s
    .replace(/^欠席[（(]\d+[）)]\s*[｜\|]\s*/u, '')
    .replace(/^欠席\s*[｜\|]\s*/u, '')
    .trim();
};

async function buildUserIdMap(db: FirebaseFirestore.Firestore) {
  const snap = await db.collection('users').get();
  const map = new Map<string, string>(); // "姓 名" → userId
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

// ----- 延長支援加算のための下処理 -----
function parseHHMM(s?: string): number | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm; // 分
}

/**
 * 延長支援加算ロジック
 * - 放課後: 3時間超過が対象
 * - 休校日: 5時間超過が対象
 * - 超過30分未満は対象外（表示なし）
 * - 30〜59 → '1', 60〜119 → '2', 120以上 → '3'
 * 返却: { label, grade }
 *  - label: "X時間Y分（n）" or ""（対象外）
 *  - grade: '1'|'2'|'3'|''（対象外）
 */
function calcExtension(
  usage: '放課後' | '休校日' | '欠席',
  arrival?: string,
  departure?: string
): { label: string; grade: '' | '1' | '2' | '3' } {
  if (usage === '欠席') return { label: '', grade: '' };
  const a = parseHHMM(arrival);
  const d = parseHHMM(departure);
  if (a == null || d == null) return { label: '', grade: '' };

  let span = d - a; // 分
  if (span <= 0) return { label: '', grade: '' };

  const base = usage === '放課後' ? 180 : 300; // 分
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
    // 認証
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

    // 1) 入力 → userId解決 & JST正規化
    type Row = {
      userId: string;
      userName: string;
      date: string;               // "YYYY-MM-DD"
      month: string;              // "YYYY-MM"
      usageStatus: '放課後' | '休校日' | '欠席';
      arrivalTime: string;
      departureTime: string;
      rawReason: string;          // 欠席理由
    };

    const resolved: Row[] = [];
    for (const r of body as IncomingRow[]) {
      const nameKey = String(r.userName ?? '')
        .replace(/\u3000/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!nameKey || !r.date) continue;

      const userId = userIdMap.get(nameKey);
      if (!userId) {
        console.warn('[ingest] userId not found:', r.userName);
        continue;
      }
      const { date, month } = toJstYmd(String(r.date));
      const usageStatus = toUsage(r.usageStatus);
      const arrivalTime = String(r.arrivalTime ?? '').trim();
      const departureTime = String(r.departureTime ?? '').trim();
      const rawReason = extractAbsenceReason(r.notes);

      resolved.push({
        userId,
        userName: nameKey,
        date,
        month,
        usageStatus,
        arrivalTime,
        departureTime,
        rawReason,
      });
    }

    // 2) 欠席の連番用にグルーピング & 既存件数を踏まえて「欠席（n）」を割当
    const absenceGroups = new Map<string, Row[]>(); // key: `${userId}_${month}`
    for (const row of resolved) {
      if (row.usageStatus !== '欠席') continue;
      const key = `${row.userId}_${row.month}`;
      if (!absenceGroups.has(key)) absenceGroups.set(key, []);
      absenceGroups.get(key)!.push(row);
    }

    const absenceNoteMap = new Map<string, string>(); // docId → "欠席（n）｜理由"
    for (const [key, rows] of absenceGroups.entries()) {
      const [userId, month] = key.split('_');
      const base = await getExistingAbsencesCount(db, userId, month);
      rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      let n = base;
      for (const row of rows) {
        n += 1;
        const reason = row.rawReason || '';
        const formatted = reason ? `欠席（${n}）｜${reason}` : `欠席（${n}）`;
        const docId = `${row.date}_${row.userId}`;
        absenceNoteMap.set(docId, formatted);
      }
    }

    // 3) upsert
    let batch = db.batch();
    let pending = 0;
    let written = 0;

    for (const r of resolved) {
      const ref = db.collection('attendanceRecords').doc(`${r.date}_${r.userId}`);

      // 延長支援加算（欠席は除外）
      const ext = calcExtension(r.usageStatus, r.arrivalTime, r.departureTime); // {label, grade}

      // 欠席のnotes or 延長のnotes を決める（どちらでもなければ notes 未指定 → mergeで保持）
      let notes: string | undefined = undefined;
      if (r.usageStatus === '欠席') {
        notes = absenceNoteMap.get(`${r.date}_${r.userId}`) ?? '';
      } else if (ext.label) {
        notes = ext.label; // "X時間Y分（n）"
      }

      const data: any = {
        userId: r.userId,
        userName: r.userName,
        date: r.date,
        month: r.month,
        usageStatus: r.usageStatus,
        arrivalTime: r.arrivalTime,
        departureTime: r.departureTime,
        // 欠席 or 延長があるときだけ notes を上書き。ないときは触らない。
        updatedAt: FieldValue.serverTimestamp(),
        source: 'sheet-migration',
      };

      if (notes !== undefined) data.notes = notes;
      // 分類は常に反映（欠席は空）
      data.extension = ext.grade; // '1'|'2'|'3'|''

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

    return NextResponse.json({ ok: true, count: written });
  } catch (e: any) {
    console.error('ingest batch error:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 });
  }
}