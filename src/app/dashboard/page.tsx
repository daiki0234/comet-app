"use client";

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

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
  weather: string;
  userCount: number;
  events: string[];
};

type PreviousDayData = {
  dateStr: string; // YYYY/MM/DD
  countHoukago: number;
  countKyuko: number;
  countAbsence: number;
  records: {
    id: string;
    userName: string;
    status: string;
    time?: string; // 10:00 - 17:00
    reason?: string; // 欠席理由
  }[];
};

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
          <p className="text-green-600 text-sm">記録漏れや欠席回数超過はありません。</p>
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
const TodayPanel = ({ summary }: { summary: TodaySummary }) => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 h-full flex flex-col justify-between">
      <div>
        <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-4">本日の状況</h3>
        <div className="flex items-end justify-between mb-4">
          <p className="text-3xl font-extrabold text-gray-800">{summary.date}</p>
          <p className="text-gray-500 text-sm font-medium bg-gray-100 px-2 py-1 rounded">天気: {summary.weather}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center mb-4">
          <p className="text-xs text-blue-400 font-bold mb-1">利用予定</p>
          <p className="text-4xl font-bold text-blue-600">{summary.userCount}<span className="text-lg text-blue-400 ml-1">名</span></p>
        </div>
      </div>
      
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400 mb-2 font-bold">今日の予定・イベント</p>
        {summary.events.length > 0 ? (
          <ul className="space-y-2">
            {summary.events.map((ev, i) => (
              <li key={i} className="flex items-start text-sm text-gray-700">
                <span className="inline-block w-2 h-2 bg-blue-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                {ev}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 italic">特になし</p>
        )}
      </div>
    </div>
  );
};

// --- コンポーネント: 前回の利用実績 ---
const PreviousDayPanel = ({ data, loading }: { data: PreviousDayData | null, loading: boolean }) => {
  if (loading) return <div className="bg-white h-full p-6 rounded-2xl shadow-ios border border-gray-200 animate-pulse" />;
  if (!data) return <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 text-gray-400">履歴なし</div>;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 h-full flex flex-col">
      <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-3">
        前回の実績 <span className="text-gray-800 ml-2 text-base normal-case">({data.dateStr})</span>
      </h3>

      {/* 数字情報 */}
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

      {/* リスト (スクロール) */}
      <div className="flex-1 overflow-y-auto max-h-[250px] border-t border-gray-100 pt-2 space-y-2 pr-1 custom-scrollbar">
        {data.records.map((rec) => (
          <div key={rec.id} className="text-sm flex justify-between items-start border-b border-gray-50 pb-2 last:border-0">
            <span className="font-bold text-gray-700 w-24 truncate">{rec.userName}</span>
            <span className="text-right flex-1 ml-2">
              {rec.status === '欠席' ? (
                <span className="text-red-500 text-xs bg-red-50 px-2 py-0.5 rounded">{rec.reason || '理由なし'}</span>
              ) : (
                <span className="text-gray-600 font-mono text-xs">{rec.time}</span>
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
          <span className="text-xs font-bold text-center">{menu.title}</span>
        </Link>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [todaySummary, setTodaySummary] = useState<TodaySummary>({
    date: '', weather: '-', userCount: 0, events: []
  });
  const [prevDayData, setPrevDayData] = useState<PreviousDayData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        // JST日付
        const todayJst = new Date(now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
        const y = todayJst.getFullYear();
        const mStr = String(todayJst.getMonth() + 1).padStart(2, '0');
        const dStr = String(todayJst.getDate()).padStart(2, '0');
        const todayStr = `${y}-${mStr}-${dStr}`;

        // ==========================================
        // 1. アラート収集
        // ==========================================
        const alertList: AlertItem[] = [];

        // A. 欠席回数上限チェック
        const absQuery = query(
          collection(db, 'attendanceRecords'),
          where('month', '==', currentMonth),
          where('usageStatus', '==', '欠席')
        );
        const absSnap = await getDocs(absQuery);
        const counts: Record<string, { name: string; count: number }> = {};
        absSnap.forEach(doc => {
          const d = doc.data();
          if (!counts[d.userId]) counts[d.userId] = { name: d.userName, count: 0 };
          counts[d.userId].count++;
        });
        Object.entries(counts).forEach(([uid, data]) => {
          if (data.count >= 4) {
            alertList.push({
              id: `abs-${uid}`,
              type: 'ABSENCE_LIMIT',
              message: `${data.name} さんの欠席が上限(4回)に達しました`,
              detail: `${data.count}回`,
              link: '/absence-management'
            });
          }
        });

        // B. 記録漏れチェック (今月分で、今日以前の日付、かつ欠席じゃないのに時間が空)
        const recordQuery = query(
          collection(db, 'attendanceRecords'),
          where('month', '==', currentMonth),
          where('date', '<', todayStr) // 今日は除外
        );
        const recordSnap = await getDocs(recordQuery);
        recordSnap.forEach(doc => {
          const d = doc.data();
          if (d.usageStatus !== '欠席') {
            if (!d.arrivalTime || !d.departureTime) {
              alertList.push({
                id: `miss-${doc.id}`,
                type: 'MISSING_RECORD',
                message: `${d.date} ${d.userName} さんの記録漏れ`,
                detail: !d.arrivalTime ? '来所時間なし' : '退所時間なし',
                link: '/attendance' // 修正画面へ飛ばせればベスト
              });
            }
          }
        });

        setAlerts(alertList);

        // ==========================================
        // 2. 本日の情報
        // ==========================================
        // 予定人数
        const eventQuery = query(
          collection(db, 'events'),
          where('dateKeyJst', '==', todayStr)
        );
        const eventSnap = await getDocs(eventQuery);
        let userCount = 0;
        eventSnap.forEach(doc => {
          const type = doc.data().type;
          if (type === '放課後' || type === '休校日') userCount++;
        });

        // 天気
        let weather = '-';
        try {
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=34.6937&longitude=135.5023&daily=weather_code&timezone=Asia%2FTokyo&start_date=${todayStr}&end_date=${todayStr}`);
          const wData = await res.json();
          if (wData.daily && wData.daily.weather_code) {
            const code = wData.daily.weather_code[0];
            if (code === 0) weather = '晴';
            else if (code <= 3) weather = '曇';
            else if (code <= 67) weather = '雨';
            else weather = 'その他';
          }
        } catch(e) {}

        setTodaySummary({
          date: `${mStr}/${dStr}`,
          weather,
          userCount,
          events: [] 
        });

        // ==========================================
        // 3. 前回の利用実績 (昨日以前で最新のデータ)
        // ==========================================
        // 最新の日付を1つ探す
        const prevDateQuery = query(
          collection(db, 'attendanceRecords'),
          where('date', '<', todayStr),
          orderBy('date', 'desc'),
          limit(1)
        );
        const prevDateSnap = await getDocs(prevDateQuery);
        
        if (!prevDateSnap.empty) {
          const targetDateStr = prevDateSnap.docs[0].data().date; // "2025-11-30" など
          
          // その日の全データを取得
          const prevRecordsQuery = query(
            collection(db, 'attendanceRecords'),
            where('date', '==', targetDateStr)
          );
          const prevRecordsSnap = await getDocs(prevRecordsQuery);
          
          const recordsData = prevRecordsSnap.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              userName: d.userName,
              status: d.usageStatus,
              time: d.arrivalTime && d.departureTime ? `${d.arrivalTime}-${d.departureTime}` : d.arrivalTime || '時間未定',
              reason: d.reason || d.notes // 欠席理由
            };
          });

          // 名前順ソート
          recordsData.sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));

          // 集計
          let cHoukago = 0, cKyuko = 0, cAbsence = 0;
          recordsData.forEach(r => {
            if (r.status === '放課後') cHoukago++;
            else if (r.status === '休校日') cKyuko++;
            else if (r.status === '欠席') cAbsence++;
          });

          setPrevDayData({
            dateStr: targetDateStr,
            countHoukago: cHoukago,
            countKyuko: cKyuko,
            countAbsence: cAbsence,
            records: recordsData
          });
        } else {
          setPrevDayData(null);
        }

      } catch (e) {
        console.error("Dashboard Fetch error:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <AppLayout pageTitle="ダッシュボード">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* 1. アラートパネル (最重要) */}
        <AlertPanel alerts={alerts} loading={loading} />

        {/* 2. 状況パネル (2カラム) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-auto lg:h-[400px]">
          {/* 左: 本日 */}
          <div className="h-full">
            <TodayPanel summary={todaySummary} />
          </div>
          {/* 右: 前回の実績 */}
          <div className="h-full">
            <PreviousDayPanel data={prevDayData} loading={loading} />
          </div>
        </div>

        {/* 3. クイックアクセス (下部・横いっぱい) */}
        <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
          <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-4">業務メニュー</h3>
          <QuickAccess />
        </div>

      </div>
    </AppLayout>
  );
}