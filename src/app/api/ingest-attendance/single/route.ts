// src/app/api/ingest-attendance/single/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/firebaseAdmin'; // Admin SDK 初期化済み

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-comet-secret');
  if (!secret || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const onlyIfMissing =
    req.headers.get('x-only-if-missing') === '1' ||
    req.nextUrl.searchParams.get('onlyIfMissing') === '1';

  const body = await req.json();
  const { date, userName } = body || {};
  if (!date || !userName) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  // 同一キー（date + userName）で存在チェック
  const q = await db
    .collection('attendanceRecords')
    .where('date', '==', date)
    .where('userName', '==', userName)
    .limit(1)
    .get();

  if (!q.empty) {
    if (onlyIfMissing) {
      return NextResponse.json({ status: 'skipped' }); // 既存ならスキップ
    }
    await q.docs[0].ref.set(
      {
        ...body,
        month: body.month ?? String(date).slice(0, 7),
      },
      { merge: true }
    );
    return NextResponse.json({ status: 'updated' });
  }

  // なければ新規追加
  await db.collection('attendanceRecords').add({
    ...body,
    month: body.month ?? String(date).slice(0, 7),
  });
  return NextResponse.json({ status: 'inserted' });
}
