// src/app/api/calendar/route.ts
import { NextResponse } from 'next/server';
import ical from 'node-ical';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timeMinStr = searchParams.get('timeMin');
  const timeMaxStr = searchParams.get('timeMax');

  if (!timeMinStr || !timeMaxStr) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const icalUrl = process.env.GOOGLE_ICAL_URL;
  if (!icalUrl) {
    return NextResponse.json({ error: 'ICAL URL not configured' }, { status: 500 });
  }

  try {
    // 1. iCalデータを取得・解析
    const data = await ical.async.fromURL(icalUrl);
    
    // 2. 期間内のイベントをフィルタリング
    const timeMin = new Date(timeMinStr);
    const timeMax = new Date(timeMaxStr);
    const items: any[] = [];

    for (const k in data) {
      const event = data[k];
      if (event.type !== 'VEVENT') continue;

      // 日付型の変換 (iCalの日付は特殊な場合があるため)
      const start = new Date(event.start);
      const end = new Date(event.end);

      // 範囲チェック (イベントの開始または終了が、指定期間に被っているか)
      // シンプルに「開始時間が期間内」または「終了時間が期間内」または「期間を内包している」
      if (start < timeMax && end > timeMin) {
        // 終日イベントの場合の調整
        // iCalの終日イベントは datetype: 'date' を持つことが多い
        const isAllDay = event.datetype === 'date';

        items.push({
          summary: event.summary,
          start: {
            // 終日ならYYYY-MM-DD、時間ありならISO文字列
            [isAllDay ? 'date' : 'dateTime']: start.toISOString().substring(0, isAllDay ? 10 : 19)
          },
          end: {
            [isAllDay ? 'date' : 'dateTime']: end.toISOString().substring(0, isAllDay ? 10 : 19)
          }
        });
      }
    }

    // 日付順にソート
    items.sort((a, b) => {
      const aTime = a.start.date || a.start.dateTime;
      const bTime = b.start.date || b.start.dateTime;
      return aTime.localeCompare(bTime);
    });

    return NextResponse.json({ items });

  } catch (error: any) {
    console.error('iCal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}