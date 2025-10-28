export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-sync-token') || '';
  const env   = process.env.SHEETS_SYNC_TOKEN || '';
  const body  = await req.text().catch(() => '');
  return NextResponse.json({
    ok: true,
    // GASからのヘッダが届いてるか
    tokenLen: token.length,
    tokenHead: token.slice(0, 3),
    // サーバ側のenvが入ってるか
    envLen: env.length,
    envHead: env.slice(0, 3),
    contentType: req.headers.get('content-type') || '',
    bodySample: body.slice(0, 80), // 先頭だけ
  });
}