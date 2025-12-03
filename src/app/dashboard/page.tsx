"use client";

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

// PDF用
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- 型定義 ---
type AlertType = 'ABSENCE_LIMIT' | 'MISSING_RECORD';

type AlertItem = {
  id: string;
  type: AlertType;
  message: string;
  detail?: string;
  link?: string;
};

type TodaySummary = {
  date: string;
  dateObj: Date; 
  weather: string;
  userCount: number;
  scheduledUserNames: { name: string; service: string }[]; 
  googleEvents: string[]; 
};

type PreviousDayData = {
  dateStr: string;
  countHoukago: number;
  countKyuko: number;
  countAbsence: number;
  records: {
    id: string;
    userName: string;
    status: string;
    time?: string;
    reason?: string;
  }[];
};

// フォント読み込みヘルパー
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// --- コンポーネント: アラートパネル ---
const AlertPanel = ({ alerts, loading }: { alerts: AlertItem[], loading: boolean }) => {
  if (loading) return <div className="bg-gray-100 h-24 rounded-xl animate-pulse mb-6" />;

  if (alerts.length === 0) {
    return (
      <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl shadow-sm flex items-center mb-6">
        <div className="p-2 bg-green-100 rounded-full mr-3">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-green-800 font-bold">状況は正常です</h3>
          <p className="text-green-600 text-sm">欠席が4回に達した利用者はいません。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm mb-6">
      <div className="flex items-center mb-3">
        <div className="p-2 bg-red-100 rounded-full mr-3">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-red-800 font-bold text-lg">要確認アラート ({alerts.length}件)</h3>
      </div>
      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li key={alert.id} className="bg-white p-3 rounded border border-red-100 flex justify-between items-center text-sm shadow-sm">
            <div className="flex items-center">
              <span className={`px-2 py-1 rounded text-xs font-bold text-white mr-3 ${alert.type === 'ABSENCE_LIMIT' ? 'bg-orange-500' : 'bg-red-500'}`}>
                {alert.type === 'ABSENCE_LIMIT' ? '欠席上限' : '記録漏れ'}
              </span>
              <span className="text-gray-800 font-medium">{alert.message}</span>
              {alert.detail && <span className="ml-2 text-gray-500 text-xs">({alert.detail})</span>}
            </div>
            {alert.link && (
              <Link href={alert.link} className="text-blue-600 hover:underline text-xs font-bold whitespace-nowrap ml-2">
                確認する &rarr;
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

// --- コンポーネント: 本日の状況 ---
const TodayPanel = ({ summary, onPrint, loading }: { summary: TodaySummary, onPrint: () => void, loading: boolean }) => {
  if (loading) return <div className="bg-white h-full p-6 rounded-2xl shadow-ios border border-gray-200 animate-pulse" />;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 h-full flex flex-col justify-between">
      <div>
        <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-4">本日の状況</h3>
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <p className="text-3xl font-extrabold text-gray-800">{summary.date}</p>
            <button 
              onClick={onPrint}
              title="サービス提供記録PDFを作成"
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </button>
          </div>
          <p className="text-gray-500 text-sm font-medium bg-gray-100 px-2 py-1 rounded">天気: {summary.weather}</p>
        </div>
        
        <div className="bg-blue-50 rounded-xl p-4 mb-4">
          <div className="text-center border-b border-blue-100 pb-2 mb-2">
            <p className="text-xs text-blue-400 font-bold mb-1">利用予定</p>
            <p className="text-4xl font-bold text-blue-600">{summary.userCount}<span className="text-lg text-blue-400 ml-1">名</span></p>
          </div>
          
          <div className="max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
            <p className="text-[10px] text-blue-400 font-bold mb-1 text-center">- 予定者一覧 -</p>
            {summary.scheduledUserNames.length > 0 ? (
              <div className="flex flex-wrap gap-1 justify-center">
                {summary.scheduledUserNames.map((u, i) => (
                  <span key={i} className="text-xs bg-white text-blue-700 px-2 py-1 rounded border border-blue-100 shadow-sm">
                    {u.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-center text-gray-400">なし</p>
            )}
          </div>
        </div>
      </div>
      
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400 mb-2 font-bold">今日の予定・イベント (Google Calendar)</p>
        <div className="max-h-[150px] overflow-y-auto custom-scrollbar">
          {summary.googleEvents.length > 0 ? (
            <ul className="space-y-2">
              {summary.googleEvents.map((ev, i) => (
                <li key={i} className="flex items-start text-sm text-gray-700 bg-gray-50 p-2 rounded">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                  {ev}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 italic">予定はありません</p>
          )}
        </div>
      </div>
    </div>
  );
};

// --- コンポーネント: 前回の利用実績 ---
const PreviousDayPanel = ({ data, loading }: { data: PreviousDayData | null, loading: boolean }) => {
  if (loading) return <div className="bg-white h-full p-6 rounded-2xl shadow-ios border border-gray-200 animate-pulse" />;
  if (!data) return <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 h-full flex items-center justify-center text-gray-400">履歴なし</div>;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 h-full flex flex-col">
      <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-3">
        前回の実績 <span className="text-gray-800 ml-2 text-base normal-case">({data.dateStr})</span>
      </h3>

      <div className="flex gap-2 mb-4 text-xs font-bold text-center">
        <div className="flex-1 bg-blue-50 text-blue-700 py-2 rounded">
          放課後<br/><span className="text-lg">{data.countHoukago}</span>
        </div>
        <div className="flex-1 bg-orange-50 text-orange-700 py-2 rounded">
          休校日<br/><span className="text-lg">{data.countKyuko}</span>
        </div>
        <div className="flex-1 bg-red-50 text-red-700 py-2 rounded">
          欠席<br/><span className="text-lg">{data.countAbsence}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[400px] border-t border-gray-100 pt-2 space-y-2 pr-1 custom-scrollbar">
        {data.records.map((rec) => (
          <div key={rec.id} className="text-sm flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-gray-50 pb-2 last:border-0">
            <div className="flex items-center mb-1 sm:mb-0">
              <span className="font-bold text-gray-700 mr-2">{rec.userName}</span>
              {rec.status !== '欠席' && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  rec.status === '放課後' 
                    ? 'bg-blue-50 text-blue-600 border-blue-200' 
                    : 'bg-orange-50 text-orange-600 border-orange-200'
                }`}>
                  {rec.status}
                </span>
              )}
            </div>
            <span className="text-right text-xs">
              {rec.status === '欠席' ? (
                <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded inline-block">{rec.reason || '理由なし'}</span>
              ) : (
                <span className="text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded inline-block">
                  {rec.time}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- コンポーネント: クイックアクセス ---
const QuickAccess = () => {
  const menus = [
    { title: '出欠記録 (QR)', icon: '📷', href: '/attendance', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { title: '欠席連絡登録', icon: '📞', href: '/attendance/register-absence', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { title: '業務日誌', icon: '📝', href: '/business-journal', color: 'bg-green-50 text-green-700 border-green-200' },
    { title: '欠席管理', icon: '📊', href: '/absence-management', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { title: 'カレンダー', icon: '📅', href: '/calendar', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { title: '利用者管理', icon: '👥', href: '/users', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
      {menus.map((menu) => (
        <Link 
          key={menu.title} 
          href={menu.href}
          className={`
            flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200
            hover:shadow-md hover:-translate-y-1 active:scale-95
            ${menu.color}
          `}
        >
          <span className="text-2xl mb-1">{menu.icon}</span>
          <span className="text-xs font-bold text-center whitespace-nowrap">{menu.title}</span>
        </Link>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const { currentUser } = useAuth();
  
  // 個別のローディング状態を作成
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingToday, setLoadingToday] = useState(true);
  const [loadingPrev, setLoadingPrev] = useState(true);

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [todaySummary, setTodaySummary] = useState<TodaySummary>({
    date: '', dateObj: new Date(), weather: '-', userCount: 0, scheduledUserNames: [], googleEvents: []
  });
  const [prevDayData, setPrevDayData] = useState<PreviousDayData | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const todayJst = new Date(now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
        const y = todayJst.getFullYear();
        const mStr = String(todayJst.getMonth() + 1).padStart(2, '0');
        const dStr = String(todayJst.getDate()).padStart(2, '0');
        const todayStr = `${y}-${mStr}-${dStr}`;

        // 0. まずユーザー辞書を作成 (これを共通利用することで高速化)
        const userSnap = await getDocs(collection(db, 'users'));
        const userMap = new Map<string, { name: string }>();
        userSnap.forEach(doc => {
          const d = doc.data();
          userMap.set(doc.id, { name: `${d.lastName} ${d.firstName}` });
        });

        // 1. アラート取得関数
        const loadAlerts = async () => {
          const alertList: AlertItem[] = [];
          
          // 欠席4回
          const absQuery = query(collection(db, 'attendanceRecords'), where('month', '==', currentMonth), where('usageStatus', '==', '欠席'));
          const absSnap = await getDocs(absQuery);
          const counts: Record<string, number> = {};
          absSnap.forEach(doc => { const d = doc.data(); counts[d.userId] = (counts[d.userId] || 0) + 1; });
          Object.entries(counts).forEach(([uid, count]) => {
            if (count >= 4) {
              const uName = userMap.get(uid)?.name || '不明';
              alertList.push({ id: `abs-${uid}`, type: 'ABSENCE_LIMIT', message: `${uName} さんの欠席が4回に達しました`, detail: `${count}回`, link: '/absence-management' });
            }
          });

          // 記録漏れ
          const recordQuery = query(collection(db, 'attendanceRecords'), where('month', '==', currentMonth), where('date', '<', todayStr));
          const recordSnap = await getDocs(recordQuery);
          recordSnap.forEach(doc => {
            const d = doc.data();
            if (d.usageStatus !== '欠席') {
              if (!d.arrivalTime || !d.departureTime) {
                alertList.push({ id: `miss-${doc.id}`, type: 'MISSING_RECORD', message: `${d.date} ${d.userName} さんの記録漏れ`, detail: !d.arrivalTime ? '来所時間なし' : '退所時間なし', link: '/attendance' });
              }
            }
          });
          setAlerts(alertList);
          setLoadingAlerts(false);
        };

        // 2. 本日の情報取得関数
        const loadToday = async () => {
          const eventQuery = query(collection(db, 'events'), where('dateKeyJst', '==', todayStr));
          const eventSnap = await getDocs(eventQuery);
          
          const scheduledUserNames: { name: string; service: string }[] = [];
          let userCount = 0;

          eventSnap.forEach(doc => {
            const d = doc.data();
            if (d.type === '放課後' || d.type === '休校日') {
              userCount++;
              const uName = userMap.get(d.userId)?.name || '不明';
              scheduledUserNames.push({ name: uName, service: d.type });
            }
          });
          scheduledUserNames.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

          // 並行してAPI等取得
          const [calRes, weatherRes] = await Promise.allSettled([
            fetch(`/api/calendar?timeMin=${encodeURIComponent(`${todayStr}T00:00:00`)}&timeMax=${encodeURIComponent(`${todayStr}T23:59:59`)}`),
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=34.6937&longitude=135.5023&daily=weather_code&timezone=Asia%2FTokyo&start_date=${todayStr}&end_date=${todayStr}`)
          ]);

          let googleEvents: string[] = [];
          if (calRes.status === 'fulfilled' && calRes.value.ok) {
            const data = await calRes.value.json();
            if (data.items) googleEvents = data.items.map((item: any) => item.summary);
          }

          let weather = '-';
          if (weatherRes.status === 'fulfilled' && weatherRes.value.ok) {
            const data = await weatherRes.value.json();
            if (data.daily?.weather_code) {
              const code = data.daily.weather_code[0];
              if (code === 0) weather = '晴'; else if (code <= 3) weather = '曇'; else if (code <= 67) weather = '雨'; else weather = 'その他';
            }
          }

          setTodaySummary({ date: `${mStr}/${dStr}`, dateObj: todayJst, weather, userCount, scheduledUserNames, googleEvents });
          setLoadingToday(false);
        };

        // 3. 前回の実績取得関数
        const loadPrevious = async () => {
          const prevDateQuery = query(collection(db, 'attendanceRecords'), where('date', '<', todayStr), orderBy('date', 'desc'), limit(1));
          const prevDateSnap = await getDocs(prevDateQuery);
          
          if (!prevDateSnap.empty) {
            const targetDateStr = prevDateSnap.docs[0].data().date;
            const prevRecordsQuery = query(collection(db, 'attendanceRecords'), where('date', '==', targetDateStr));
            const prevRecordsSnap = await getDocs(prevRecordsQuery);
            
            const recordsData = prevRecordsSnap.docs.map(doc => {
              const d = doc.data();
              return {
                id: doc.id,
                userName: d.userName,
                status: d.usageStatus,
                time: d.arrivalTime && d.departureTime ? `${d.arrivalTime}-${d.departureTime}` : d.arrivalTime || '時間未定',
                reason: d.reason || d.notes
              };
            });
            recordsData.sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));

            let cHoukago = 0, cKyuko = 0, cAbsence = 0;
            recordsData.forEach(r => {
              if (r.status === '放課後') cHoukago++; else if (r.status === '休校日') cKyuko++; else if (r.status === '欠席') cAbsence++;
            });

            setPrevDayData({ dateStr: targetDateStr, countHoukago: cHoukago, countKyuko: cKyuko, countAbsence: cAbsence, records: recordsData });
          } else {
            setPrevDayData(null);
          }
          setLoadingPrev(false);
        };

        // ★ 並列実行！ (どれか遅くても他は止まらない)
        // ユーザー辞書作成は一瞬なので待機してから、重い処理をヨーイドン
        Promise.all([loadAlerts(), loadToday(), loadPrevious()]);

      } catch (e) {
        console.error("Dashboard Load Error:", e);
        setLoadingAlerts(false); setLoadingToday(false); setLoadingPrev(false);
      }
    };

    loadDashboard();
  }, []);

  const handlePrintDailySheet = async () => {
    if (todaySummary.scheduledUserNames.length === 0) return toast.error("本日の利用予定者がいません");
    const loadingToast = toast.loading("PDFを生成中...");

    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      try {
        const fontUrl = '/fonts/NotoSansJP-Regular.ttf';
        const fontRes = await fetch(fontUrl);
        if (!fontRes.ok) throw new Error("フォントファイルが見つかりません");
        const fontBuffer = await fontRes.arrayBuffer();
        const fontBase64 = arrayBufferToBase64(fontBuffer);

        pdf.addFileToVFS('NotoSansJP.ttf', fontBase64);
        pdf.addFont('NotoSansJP.ttf', 'NotoSansJP', 'normal');
        pdf.addFont('NotoSansJP.ttf', 'NotoSansJP', 'bold');
        pdf.setFont('NotoSansJP');
      } catch (err) {
        console.error("Font error:", err);
      }

      pdf.setFontSize(16);
      const dateStr = todaySummary.dateObj.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
      pdf.text(`サービス提供記録 (${dateStr})`, 105, 15, { align: 'center' });

      const tableBody = todaySummary.scheduledUserNames.map(u => [
        u.name,
        u.service === '放課後' ? '放' : u.service === '休校日' ? '休' : u.service,
        '', '', '', ''  
      ]);

      autoTable(pdf, {
        startY: 25,
        head: [['氏名', '区分', '来所', '退所', '備考', '確認印']],
        body: tableBody,
        styles: { font: 'NotoSansJP', fontSize: 10, cellPadding: 3, lineColor: [0,0,0], lineWidth: 0.1, valign: 'middle' },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 15, halign: 'center' }, 2: { cellWidth: 25 }, 3: { cellWidth: 25 }, 4: { cellWidth: 40 }, 5: { cellWidth: 25 } },
        theme: 'grid',
      });

      pdf.save(`サービス提供記録_${todaySummary.date.replace('/', '-')}.pdf`);
      toast.success("PDFをダウンロードしました", { id: loadingToast });

    } catch (e: any) {
      console.error(e);
      toast.error(`生成失敗: ${e.message}`, { id: loadingToast });
    }
  };

  return (
    <AppLayout pageTitle="ダッシュボード">
      <div className="max-w-6xl mx-auto space-y-6">
        <AlertPanel alerts={alerts} loading={loadingAlerts} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="h-full">
            <TodayPanel summary={todaySummary} onPrint={handlePrintDailySheet} loading={loadingToday} />
          </div>
          <div className="h-full">
            <PreviousDayPanel data={prevDayData} loading={loadingPrev} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
          <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-4">業務メニュー</h3>
          <QuickAccess />
        </div>
      </div>
    </AppLayout>
  );
}