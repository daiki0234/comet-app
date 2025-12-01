"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

// --- 設定 ---
// ★★★ ここを必ず書き換えてください ★★★
const CALENDAR_ID = 'k_maeda@kantsu.com'; // ← ここにGoogleカレンダーのID (メールアドレス)

// 頂いたAPIキー
const GOOGLE_API_KEY = 'AIzaSyCpc02bopjWKtUVOSPU1Ly0DPaEC3TEabY';
// const OWM_API_KEY = 'e22a39282400f4f4567dbb411aa67a91'; // ※今回は過去天気対応のためOpen-Meteoを使用します

// 大阪の座標 (天気用)
const LAT = 34.6937;
const LON = 135.5023;

type JournalRow = {
  date: Date;
  dateStr: string;
  dayOfWeek: string;
  weather: string;
  googleEvents: string[];
  userNames: string;
  countHoukago: number;
  countKyuko: number;
  countAbsence: number;
  staffNames: string;
};

const pad2 = (n: number) => n.toString().padStart(2, "0");

// --- 天気コード変換 (Open-Meteo用) ---
const getWeatherLabel = (code: number) => {
  if (code === 0) return '晴';
  if (code >= 1 && code <= 3) return '晴/曇';
  if (code >= 45 && code <= 48) return '霧';
  if (code >= 51 && code <= 67) return '雨';
  if (code >= 71 && code <= 77) return '雪';
  if (code >= 80 && code <= 82) return '雨';
  if (code >= 95) return '雷雨';
  return '-';
};

export default function BusinessJournalPage() {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);
  const [journalData, setJournalData] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(false);

  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - i), []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  useEffect(() => {
    fetchJournalData();
  }, [currentYear, currentMonth]);

  // --- Googleカレンダー取得 ---
  const fetchGoogleEvents = async (startStr: string, endStr: string) => {
    try {
      const timeMin = new Date(startStr).toISOString();
      const timeMax = new Date(new Date(endStr).setHours(23, 59, 59)).toISOString();
      
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events` +
                  `?key=${GOOGLE_API_KEY}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (!data.items) {
        console.warn("Google Calendar API Error:", data);
        return {};
      }

      // 日付ごとにイベント名をまとめる
      const eventsByDate: Record<string, string[]> = {};
      data.items.forEach((item: any) => {
        // "dateTime" (時間指定あり) または "date" (終日) を取得
        const start = item.start.dateTime || item.start.date;
        const dateKey = start.substring(0, 10); // YYYY-MM-DD
        if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
        eventsByDate[dateKey].push(item.summary);
      });
      
      return eventsByDate;
    } catch (e) {
      console.error("Google Calendar Fetch Error:", e);
      return {};
    }
  };

  // --- 天気取得 (Open-Meteo: 過去天気も無料) ---
  const fetchWeatherHistory = async (startStr: string, endStr: string) => {
    try {
      // Open-Meteo Archive API
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}&start_date=${startStr}&end_date=${endStr}&daily=weather_code&timezone=Asia%2FTokyo`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.daily) return {};

      const weatherByDate: Record<string, string> = {};
      data.daily.time.forEach((t: string, i: number) => {
        const code = data.daily.weather_code[i];
        weatherByDate[t] = getWeatherLabel(code);
      });
      return weatherByDate;
    } catch (e) {
      console.error("Weather Fetch Error:", e);
      return {};
    }
  };

  const fetchJournalData = async () => {
    setLoading(true);
    try {
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const startStr = `${currentYear}-${pad2(currentMonth)}-01`;
      const endStr = `${currentYear}-${pad2(currentMonth)}-${pad2(daysInMonth)}`;

      // 並行してデータ取得 (Firestore, GoogleCal, Weather)
      const [snap, googleEventsMap, weatherMap] = await Promise.all([
        getDocs(query(
          collection(db, 'attendanceRecords'),
          where('date', '>=', startStr),
          where('date', '<=', endStr)
        )),
        fetchGoogleEvents(startStr, endStr),
        // 未来の日付だとArchive APIはエラーになることがあるが、try-catch済み
        fetchWeatherHistory(startStr, endStr) 
      ]);

      const allRecords = snap.docs.map(doc => doc.data());
      const rows: JournalRow[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${currentYear}-${pad2(currentMonth)}-${pad2(d)}`;
        const dateObj = new Date(currentYear, currentMonth - 1, d);
        const dayOfWeek = format(dateObj, 'E', { locale: ja });

        // レコード集計
        const dayRecords = allRecords.filter(r => r.date === dateKey);
        let countHoukago = 0, countKyuko = 0, countAbsence = 0;
        const names: string[] = [];

        dayRecords.sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));
        dayRecords.forEach(r => {
          if (r.usageStatus === '放課後') { countHoukago++; names.push(r.userName); }
          else if (r.usageStatus === '休校日') { countKyuko++; names.push(r.userName); }
          else if (r.usageStatus === '欠席') { countAbsence++; names.push(`${r.userName}(加算)`); }
        });

        rows.push({
          date: dateObj,
          dateStr: dateKey,
          dayOfWeek,
          weather: weatherMap[dateKey] || '-', // 天気
          googleEvents: googleEventsMap[dateKey] || [], // カレンダー
          userNames: names.join('、'),
          countHoukago,
          countKyuko,
          countAbsence,
          staffNames: '', 
        });
      }

      setJournalData(rows);

    } catch (error) {
      console.error(error);
      alert("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout pageTitle="業務日誌">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 h-full flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <select value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))} className="p-2 border rounded-md">
              {years.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            <select value={currentMonth} onChange={(e) => setCurrentMonth(Number(e.target.value))} className="p-2 border rounded-md">
              {months.map(m => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>
          <button onClick={fetchJournalData} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">更新</button>
          
          {/* 注意書き */}
          {CALENDAR_ID === 'k_maeda@kantsu.com' && (
            <span className="text-red-500 text-xs font-bold bg-red-100 px-2 py-1 rounded">
              ※コード内のCALENDAR_IDを設定してください
            </span>
          )}
        </div>

        {/* テーブル */}
        <div className="flex-1 overflow-auto border rounded-lg">
          <table className="min-w-full text-sm text-left border-collapse whitespace-nowrap">
            <thead className="bg-gray-100 sticky top-0 z-10 text-xs text-gray-700 uppercase font-bold">
              <tr>
                <th className="border p-2 w-12 text-center">日</th>
                <th className="border p-2 w-10 text-center">曜</th>
                <th className="border p-2 min-w-[200px]">予定 (Google)</th>
                <th className="border p-2 w-16 text-center">天気</th>
                <th className="border p-2 min-w-[300px]">利用者名</th>
                <th className="border p-2 w-10 text-center bg-blue-50">放</th>
                <th className="border p-2 w-10 text-center bg-orange-50">休</th>
                <th className="border p-2 w-10 text-center bg-red-50">欠</th>
                <th className="border p-2 w-24">職員</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={9} className="p-10 text-center">読み込み中...</td></tr>
              ) : (
                journalData.map((row) => (
                  <tr key={row.dateStr} className="hover:bg-gray-50">
                    <td className="border p-2 text-center">{row.date.getDate()}</td>
                    <td className={`border p-2 text-center font-bold
                      ${row.dayOfWeek === '土' ? 'text-blue-600' : ''}
                      ${row.dayOfWeek === '日' ? 'text-red-600' : ''}
                    `}>
                      {row.dayOfWeek}
                    </td>
                    <td className="border p-2 text-gray-600 text-xs whitespace-normal">
                      {row.googleEvents.map((ev, i) => (
                        <div key={i} className="mb-1 border-b border-dotted last:border-0 pb-1">{ev}</div>
                      ))}
                    </td>
                    <td className="border p-2 text-center">
                      {row.weather}
                    </td>
                    <td className="border p-2 text-xs leading-relaxed whitespace-normal">
                      {row.userNames}
                    </td>
                    <td className="border p-2 text-center bg-blue-50 font-semibold">{row.countHoukago || ''}</td>
                    <td className="border p-2 text-center bg-orange-50 font-semibold">{row.countKyuko || ''}</td>
                    <td className="border p-2 text-center bg-red-50 font-semibold">{row.countAbsence || ''}</td>
                    <td className="border p-2"></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}