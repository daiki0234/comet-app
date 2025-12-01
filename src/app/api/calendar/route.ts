import { NextResponse } from 'next/server';
import ical from 'node-ical';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timeMinStr = searchParams.get('timeMin');
  const timeMaxStr = searchParams.get('timeMax');

  console.log(`[API] Calendar request received: ${timeMinStr} ~ ${timeMaxStr}`);

  if (!timeMinStr || !timeMaxStr) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  // 環境変数を取得
  let icalUrl = process.env.GOOGLE_ICAL_URL || '';

  // ★★★ 修正: URLの自動補正ロジック ★★★
  // 1. 余分な空白を削除
  icalUrl = icalUrl.trim();
  // 2. 余分なクォーテーションを削除 (もし含まれていれば)
  icalUrl = icalUrl.replace(/^["']|["']$/g, '');
  // 3. webcal:// を https:// に置換
  if (icalUrl.startsWith('webcal://')) {
    icalUrl = icalUrl.replace('webcal://', 'https://');
  }

  // URLチェック
  if (!icalUrl || !icalUrl.startsWith('http')) {
    console.error(`[API] Invalid URL format: ${icalUrl}`);
    return NextResponse.json({ error: 'Invalid ICAL URL format. Check .env.local' }, { status: 500 });
  }

  try {
    console.log(`[API] Fetching from URL: ${icalUrl.substring(0, 30)}...`); // ログ確認用
    
    const res = await fetch(icalUrl, { cache: 'no-store' });
    
    if (!res.ok) {
      console.error(`[API] Fetch failed. Status: ${res.status} ${res.statusText}`);
      throw new Error(`Failed to fetch iCal data: ${res.status}`);
    }

    const icsText = await res.text();
    console.log(`[API] Downloaded ${icsText.length} bytes.`);

    if (!icsText || icsText.length === 0) {
      throw new Error("Downloaded ICS data is empty");
    }

    const data = ical.sync.parseICS(icsText);
    const entries = Object.values(data);
    console.log(`[API] Parsed ${entries.length} entries.`);

    const timeMin = new Date(timeMinStr);
    const timeMax = new Date(timeMaxStr);
    const items: any[] = [];

    for (const event of entries) {
      if (event.type !== 'VEVENT') continue;
      if (!event.start || !event.end) continue;

      const start = new Date(event.start);
      const end = new Date(event.end);

      if (start < timeMax && end > timeMin) {
        const isAllDay = event.datetype === 'date';

        items.push({
          summary: event.summary,
          start: {
            [isAllDay ? 'date' : 'dateTime']: start.toISOString().substring(0, isAllDay ? 10 : 19)
          },
          end: {
            [isAllDay ? 'date' : 'dateTime']: end.toISOString().substring(0, isAllDay ? 10 : 19)
          }
        });
      }
    }

    items.sort((a, b) => {
      const aTime = a.start.date || a.start.dateTime;
      const bTime = b.start.date || b.start.dateTime;
      return aTime.localeCompare(bTime);
    });

    console.log(`[API] Returning ${items.length} matched events.`);
    return NextResponse.json({ items });

  } catch (error: any) {
    console.error('[API] Critical Error:', error);
    return NextResponse.json({ error: error.message || 'Unknown Server Error' }, { status: 500 });
  }
}