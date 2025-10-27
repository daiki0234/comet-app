// src/app/api/ingest-attendance/single/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';

function normalizeSpaces(s = '') {
  return s.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}

// userId があれば date_userId、なければ date_名前スラッグ
function makeId(date: string, userId?: string, userName?: string) {
  if (userId) return `${date}_${userId}`;
  const slug = (s = '') =>
    s.normalize('NFKC').replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 40);
  return `${date}_${slug(userName)}`;
}

export async function GET() {
  return NextResponse.json({ ok: true, method: 'GET ready' });
}

export async function POST(req: NextRequest) {
  // 認証
  const secret = req.headers.get('x-comet-secret');
  if (!secret || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const onlyIfMissing =
    req.headers.get('x-only-if-missing') === '1' ||
    req.nextUrl.searchParams.get('onlyIfMissing') === '1';

  // 受信
  const body = await req.json();
  let {
    date,
    month,
    userName,
    userId,
    usageStatus,
    arrivalTime = '',
    departureTime = '',
    notes = '',
  } = body || {};

  if (!date || !userName || !usageStatus) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const db = getDb();

  // userId が無ければ氏名から解決（姓・名を空白で分割）
  if (!userId) {
    const nameKey = normalizeSpaces(String(userName));
    const [lastName, firstName] = nameKey.split(' ');
    if (lastName && firstName) {
      const snap = await db
        .collection('users')
        .where('lastName', '==', lastName)
        .where('firstName', '==', firstName)
        .limit(1)
        .get();
      if (!snap.empty) userId = snap.docs[0].id;
    }
  }

  // 冪等な docId を採用
  const id = makeId(date, userId, userName);
  const ref = db.collection('attendanceRecords').doc(id);

  if (onlyIfMissing) {
    const existed = (await ref.get()).exists;
    if (existed) return NextResponse.json({ status: 'skipped' });
  }

  await ref.set(
    {
      userId: userId ?? null,
      userName,
      date,
      month: month ?? String(date).slice(0, 7),
      usageStatus,              // "放課後" | "休校日" | "欠席"
      arrivalTime: arrivalTime ?? '',
      departureTime: departureTime ?? '',
      notes: notes ?? '',
      source: 'sheet-diff',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: !onlyIfMissing }
  );

  return NextResponse.json({ status: onlyIfMissing ? 'inserted' : 'upserted' });
}