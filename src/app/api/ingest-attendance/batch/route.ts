// src/app/api/ingest-attendance/batch/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/lib/server/firebaseAdmin';

type IncomingRow = {
  userName: string;       // 例: "山田 太郎"
  date: string;           // "YYYY/MM/DD" or Date 文字列
  usageStatus: string;    // "◯" | "◎" | "欠席" | "放課後" | "休校日" | "欠席(1)" など
  arrivalTime?: string;
  departureTime?: string;
  notes?: string;         // 欠席理由など
};

const toJstYmd = (v: string) => {
  const d = new Date(v);
  const j = new Date(d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  const y = j.getFullYear();
  const m = String(j.getMonth() + 1).padStart(2, '0');
  const day = String(j.getDate()).padStart(2, '0');
  return { date: `${y}-${m}-${day}`, month: `${y}-${m}` };
};

const toUsage = (v: string): '放課後' | '休校日' | '欠席' => {
  const s = String(v ?? '').trim();
  if (s === '1' || s === '◯' || s === '放課後') return '放課後';
  if (s === '2' || s === '◎' || s === '休校日') return '休校日';
  if (s === '3' || s.includes('欠席') || s === '欠席') return '欠席';
  return '放課後';
};

// "欠席（n）｜理由" の理由だけを取り出す（既に付いている n は捨てる）
const extractAbsenceReason = (raw: string | undefined) => {
  const s = String(raw ?? '').trim();
  // 先頭の "欠席（数字）" や "欠席(数字)" と区切り "｜" / "|" を除去
  const cleaned = s
    .replace(/^欠席[（(]\d+[）)]\s*[｜\|]\s*/u, '')
    .replace(/^欠席\s*[｜\|]\s*/u, '')
    .trim();
  return cleaned;
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

// 月内の既存「欠席」件数を取得
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

export async function POST(req: NextRequest) {
  try {
    // 認証トークン
    const token = req.headers.get('x-sync-token') || '';
    const env = process.env.SHEETS_SYNC_TOKEN || '';
    if (!token || token !== env) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'array required' }, { status: 400 });
    }

    const db = getDb();
    const userIdMap = await buildUserIdMap(db);

    // まず入力を userId まで解決 & JST 正規化
    type ResolvedRow = {
      userId: string;
      userName: string;
      date: string;         // "YYYY-MM-DD"
      month: string;        // "YYYY-MM"
      usageStatus: '放課後' | '休校日' | '欠席';
      arrivalTime: string;
      departureTime: string;
      rawReason: string;    // 欠席理由の原文（整形前）
    };

    const resolved: ResolvedRow[] = [];
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

    // 欠席だけを ユーザー×月 でグループ化 → 既存件数を踏まえて連番付与
    type GroupKey = string; // `${userId}_${month}`
    const absenceGroups = new Map<GroupKey, ResolvedRow[]>();
    for (const row of resolved) {
      if (row.usageStatus !== '欠席') continue;
      const key = `${row.userId}_${row.month}`;
      if (!absenceGroups.has(key)) absenceGroups.set(key, []);
      absenceGroups.get(key)!.push(row);
    }

    // 既存件数を先に取得して、各グループを日付順に並べて n を割り当て
    const absenceNoteMap = new Map<string, string>(); // docId → formatted note
    for (const [key, rows] of absenceGroups.entries()) {
      const [userId, month] = key.split('_');
      const base = await getExistingAbsencesCount(db, userId, month);

      // 日付昇順に並べる
      rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      let n = base;
      for (const row of rows) {
        n += 1;
        const reason = row.rawReason || ''; // 理由が空なら空のまま
        const formatted = reason
          ? `欠席（${n}）｜${reason}`
          : `欠席（${n}）`; // 理由なしでも n だけ付与
        const docId = `${row.date}_${row.userId}`;
        absenceNoteMap.set(docId, formatted);
      }
    }

    // まとめて upsert
    let batch = db.batch();
    let countInBatch = 0;
    let written = 0;

    for (const r of resolved) {
      const docId = `${r.date}_${r.userId}`;
      const ref = db.collection('attendanceRecords').doc(docId);

      const noteFromAbsence = absenceNoteMap.get(docId);
      const data = {
        userId: r.userId,
        userName: r.userName,
        date: r.date,
        month: r.month,
        usageStatus: r.usageStatus,
        arrivalTime: r.arrivalTime,
        departureTime: r.departureTime,
        // 欠席のときは「欠席（n）｜理由」を優先。出席系は元 notes をそのまま維持したいなら空のまま。
        notes: r.usageStatus === '欠席' ? (noteFromAbsence ?? '') : (undefined as any),
        source: 'sheet-migration',
        updatedAt: FieldValue.serverTimestamp(),
      } as any;

      // notes: undefined は merge 上書きしないようにする（出席時に既存 notes を消さない）
      if (data.notes === undefined) delete data.notes;

      batch.set(ref, data, { merge: true });
      written++;
      countInBatch++;

      if (countInBatch >= 450) {
        await batch.commit();
        batch = db.batch();
        countInBatch = 0;
      }
    }
    if (countInBatch > 0) await batch.commit();

    return NextResponse.json({ ok: true, count: written });
  } catch (e: any) {
    console.error('ingest batch error:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 });
  }
}