// 触らずそのまま追加
export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

export async function GET() {
  const env = process.env.SHEETS_SYNC_TOKEN || '';
  return NextResponse.json({
    ok: true,
    // 値は出さず、長さと先頭数文字だけ返す（安全のため）
    hasEnv: !!env,
    envLen: env.length,
    envHead: env.slice(0, 3),
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV, // 'production' | 'preview' | 'development'
  });
}