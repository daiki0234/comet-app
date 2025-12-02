"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ★ PDF用ライブラリ
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- 設定 ---
const LAT = 34.6937;
const LON = 135.5023;

type JournalRow = {
  date: Date;
  dateStr: string;
  dayOfWeek: string;
  weather: string;
  googleEventsMeeting: string[];
  googleEventsVisitor: string[];
  googleEventsNote: string[];
  userNames: string;
  countHoukago: number;
  countKyuko: number;
  countAbsence: number;
  staffNames: string;
};

const pad2 = (n: number) => n.toString().padStart(2, "0");

// 天気コード変換
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

// ブラウザでのフォント読み込み用ヘルパー
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

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

  // Googleカレンダー取得 (自社API経由 - iCal)
  const fetchGoogleEvents = async (startStr: string, endStr: string) => {
    try {
      const timeMin = new Date(startStr).toISOString();
      const timeMax = new Date(new Date(endStr).setHours(23, 59, 59)).toISOString();
      
      const url = `/api/calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
      
      const res = await fetch(url);
      if (!res.ok) {
        console.warn("Calendar API Error:", res.status);
        return {};
      }
      const data = await res.json();
      
      if (!data.items) return {};

      const eventsByDate: Record<string, string[]> = {};
      data.items.forEach((item: any) => {
        const startRaw = item.start.dateTime || item.start.date;
        const dateKey = startRaw.substring(0, 10);
        
        if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
        eventsByDate[dateKey].push(item.summary);
      });
      
      return eventsByDate;
    } catch (e) {
      console.error("Calendar Fetch Error:", e);
      return {};
    }
  };

  // 天気取得
  const fetchWeatherHistory = async (startStr: string, endStr: string) => {
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
      
      if (startStr > todayStr) return {};

      let actualEndStr = endStr;
      if (endStr >= todayStr) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        actualEndStr = `${yesterday.getFullYear()}-${pad2(yesterday.getMonth() + 1)}-${pad2(yesterday.getDate())}`;
      }

      if (startStr > actualEndStr) return {};

      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}&start_date=${startStr}&end_date=${actualEndStr}&daily=weather_code&timezone=Asia%2FTokyo`;
      const res = await fetch(url);
      
      if (!res.ok) return {};

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

      const [snap, googleEventsMap, weatherMap] = await Promise.all([
        getDocs(query(
          collection(db, 'attendanceRecords'),
          where('date', '>=', startStr),
          where('date', '<=', endStr)
        )),
        fetchGoogleEvents(startStr, endStr),
        fetchWeatherHistory(startStr, endStr) 
      ]);

      const allRecords = snap.docs.map(doc => doc.data());
      const rows: JournalRow[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${currentYear}-${pad2(currentMonth)}-${pad2(d)}`;
        const dateObj = new Date(currentYear, currentMonth - 1, d);
        const dayOfWeek = format(dateObj, 'E', { locale: ja });

        const dayRecords = allRecords.filter(r => r.date === dateKey);
        let countHoukago = 0, countKyuko = 0, countAbsence = 0;
        const names: string[] = [];

        dayRecords.sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));
        dayRecords.forEach(r => {
          if (r.usageStatus === '放課後') { countHoukago++; names.push(r.userName); }
          else if (r.usageStatus === '休校日') { countKyuko++; names.push(r.userName); }
          else if (r.usageStatus === '欠席') { countAbsence++; names.push(`${r.userName}(加算)`); }
        });

        const rawEvents = googleEventsMap[dateKey] || [];
        const meetingEvents: string[] = [];
        const visitorEvents: string[] = [];
        const noteEvents: string[] = [];

        rawEvents.forEach(evt => {
          if (evt.includes('休み') || evt.includes('休所')) {
            noteEvents.push(evt);
          } else if (
            evt.includes('モニタリング') ||
            evt.includes('㋲') ||
            evt.includes('更新') ||
            evt.includes('相談') ||
            evt.includes('新規')
          ) {
            visitorEvents.push(evt);
          } else {
            meetingEvents.push(evt);
          }
        });

        rows.push({
          date: dateObj,
          dateStr: dateKey,
          dayOfWeek,
          weather: weatherMap[dateKey] || '-', 
          googleEventsMeeting: meetingEvents,
          googleEventsVisitor: visitorEvents,
          googleEventsNote: noteEvents,
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

  // --- ★★★ PDF出力機能 ★★★ ---
  const handlePrintJournal = async () => {
    if (journalData.length === 0) return toast.error("出力するデータがありません");
    const loadingToast = toast.loading("PDFを生成中...");

    try {
      // 1. PDF初期化 (A4 横向き landscape)
      // 横に長い表なので横向きが最適です
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // 2. フォント読み込み (日本語対応)
      try {
        const fontUrl = '/fonts/NotoSansJP-Regular.ttf';
        const fontRes = await fetch(fontUrl);
        if (!fontRes.ok) throw new Error("フォントファイルが見つかりません");
        const fontBuffer = await fontRes.arrayBuffer();
        const fontBase64 = arrayBufferToBase64(fontBuffer);

        pdf.addFileToVFS('NotoSansJP.ttf', fontBase64);
        pdf.addFont('NotoSansJP.ttf', 'NotoSansJP', 'normal');
        pdf.addFont('NotoSansJP.ttf', 'NotoSansJP', 'bold'); // エラー回避用エイリアス
        pdf.setFont('NotoSansJP');
      } catch (err) {
        console.error("Font error:", err);
        toast.error("フォント読み込みに失敗しました", { id: loadingToast });
      }

      // 3. データ作成
      const tableBody = journalData.map(row => [
        format(row.date, 'yyyy/MM/dd'), // ★ 日付を yyyy/MM/dd に変更
        row.dayOfWeek,
        row.googleEventsMeeting.join('\n'),
        row.googleEventsVisitor.join('\n'),
        row.googleEventsNote.join('\n'),
        row.weather,
        row.userNames, // 利用者名 (長い場合は自動折り返し)
        row.countHoukago || '',
        row.countKyuko || '',
        row.countAbsence || '',
        row.staffNames
      ]);

      // 4. タイトル
      pdf.setFontSize(16);
      pdf.text(`業務日誌 (${currentYear}年${currentMonth}月)`, 14, 15);

      // 5. テーブル描画
      autoTable(pdf, {
        startY: 20,
        head: [[
          '日付', '曜', '会議・出張', '来所者', '特記事項', 
          '天気', '利用者名', '放', '休', '欠', '職員'
        ]],
        body: tableBody,
        styles: { 
          font: 'NotoSansJP',
          fontSize: 8, // 少し小さめにしないと入り切らないかも
          cellPadding: 2,
          lineColor: [0, 0, 0],
          lineWidth: 0.1,
          valign: 'top',
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' }, // 日付
          1: { cellWidth: 8, halign: 'center' },  // 曜
          2: { cellWidth: 35 }, // 会議
          3: { cellWidth: 35 }, // 来所
          4: { cellWidth: 30 }, // 特記
          5: { cellWidth: 12, halign: 'center' }, // 天気
          6: { cellWidth: 'auto' }, // 利用者名 (残りの幅を使う)
          7: { cellWidth: 8, halign: 'center' }, // 放
          8: { cellWidth: 8, halign: 'center' }, // 休
          9: { cellWidth: 8, halign: 'center' }, // 欠
          10: { cellWidth: 20 } // 職員
        },
        theme: 'grid',
      });

      // 6. 保存
      pdf.save(`${currentYear}年${currentMonth}月_業務日誌.pdf`);
      toast.success("PDFをダウンロードしました", { id: loadingToast });

    } catch (e: any) {
      console.error(e);
      toast.error(`生成失敗: ${e.message}`, { id: loadingToast });
    }
  };

  return (
    <AppLayout pageTitle="業務日誌">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 h-full flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <select value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))} className="p-2 border rounded-md">
                {years.map(y => <option key={y} value={y}>{y}年</option>)}
              </select>
              <select value={currentMonth} onChange={(e) => setCurrentMonth(Number(e.target.value))} className="p-2 border rounded-md">
                {months.map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
            </div>
            <button onClick={fetchJournalData} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">更新</button>
          </div>

          {/* ★ PDF出力ボタン */}
          <button 
            onClick={handlePrintJournal} 
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            PDF出力
          </button>
        </div>

        {/* テーブル */}
        <div className="flex-1 overflow-auto border rounded-lg">
          <table className="min-w-full text-sm text-left border-collapse whitespace-nowrap">
            <thead className="bg-gray-100 sticky top-0 z-10 text-xs text-gray-700 uppercase font-bold">
              <tr>
                <th className="border p-2 w-24 text-center">日付</th> {/* 幅を広げました */}
                <th className="border p-2 w-10 text-center">曜</th>
                <th className="border p-2 min-w-[120px]">会議・出張</th>
                <th className="border p-2 min-w-[120px]">来所者</th>
                <th className="border p-2 min-w-[120px]">特記事項</th>
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
                <tr><td colSpan={11} className="p-10 text-center">読み込み中...</td></tr>
              ) : (
                journalData.map((row) => (
                  <tr key={row.dateStr} className="hover:bg-gray-50">
                    {/* ★ 日付フォーマット変更 */}
                    <td className="border p-2 text-center">{format(row.date, 'yyyy/MM/dd')}</td>
                    <td className={`border p-2 text-center font-bold
                      ${row.dayOfWeek === '土' ? 'text-blue-600' : ''}
                      ${row.dayOfWeek === '日' ? 'text-red-600' : ''}
                    `}>
                      {row.dayOfWeek}
                    </td>
                    
                    <td className="border p-2 text-gray-600 text-xs whitespace-normal align-top">
                      {row.googleEventsMeeting.map((ev, i) => (
                        <div key={i} className="mb-1 border-b border-dotted last:border-0 pb-1">{ev}</div>
                      ))}
                    </td>
                    
                    <td className="border p-2 text-gray-600 text-xs whitespace-normal align-top">
                      {row.googleEventsVisitor.map((ev, i) => (
                        <div key={i} className="mb-1 border-b border-dotted last:border-0 pb-1">{ev}</div>
                      ))}
                    </td>
                    
                    <td className="border p-2 text-gray-600 text-xs whitespace-normal align-top">
                      {row.googleEventsNote.map((ev, i) => (
                        <div key={i} className="mb-1 border-b border-dotted last:border-0 pb-1">{ev}</div>
                      ))}
                    </td>

                    <td className="border p-2 text-center align-top">
                      {row.weather}
                    </td>
                    <td className="border p-2 text-xs leading-relaxed whitespace-normal align-top">
                      {row.userNames}
                    </td>
                    <td className="border p-2 text-center bg-blue-50 font-semibold align-top">{row.countHoukago}</td>
                    <td className="border p-2 text-center bg-orange-50 font-semibold align-top">{row.countKyuko}</td>
                    <td className="border p-2 text-center bg-red-50 font-semibold align-top">{row.countAbsence}</td>
                    <td className="border p-2 align-top"></td>
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