"use client";

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

// --- 型定義 ---
type AbsenceAlert = {
  userId: string;
  userName: string;
  count: number;
};

type TodaySummary = {
  date: string;
  weather: string;
  userCount: number; // 今日の利用予定人数
  events: string[];  // 今日のイベント
};

// --- コンポーネント: アラートパネル ---
const AlertPanel = ({ alerts, loading }: { alerts: AbsenceAlert[], loading: boolean }) => {
  if (loading) return <div className="bg-gray-100 h-24 rounded-xl animate-pulse" />;

  if (alerts.length === 0) {
    return (
      <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl shadow-sm flex items-center">
        <div className="p-2 bg-green-100 rounded-full mr-3">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-green-800 font-bold">状況は正常です</h3>
          <p className="text-green-600 text-sm">欠席回数上限（4回）に達している利用者はいません。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm">
      <div className="flex items-center mb-3">
        <div className="p-2 bg-red-100 rounded-full mr-3">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-red-800 font-bold text-lg">要確認：欠席回数の上限アラート</h3>
      </div>
      <div className="bg-white rounded-lg border border-red-100 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-red-50">
            <tr>
              <th className="px-4 py-2 text-left text-red-700 font-bold">利用者名</th>
              <th className="px-4 py-2 text-center text-red-700 font-bold">今月の欠席</th>
              <th className="px-4 py-2 text-right text-red-700 font-bold">ステータス</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-100">
            {alerts.map((user) => (
              <tr key={user.userId}>
                <td className="px-4 py-3 font-medium text-gray-800">{user.userName}</td>
                <td className="px-4 py-3 text-center font-bold text-red-600">{user.count}回</td>
                <td className="px-4 py-3 text-right text-xs text-gray-500">振替不可の可能性</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- コンポーネント: 本日の状況 ---
const TodayPanel = ({ summary }: { summary: TodaySummary }) => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
      <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-4">本日の状況</h3>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-3xl font-extrabold text-gray-800">{summary.date}</p>
          <p className="text-gray-500 text-sm mt-1">大阪の天気: {summary.weather}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 mb-1">利用予定</p>
          <p className="text-4xl font-bold text-blue-600">{summary.userCount}<span className="text-lg text-gray-500 ml-1">名</span></p>
        </div>
      </div>
      
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400 mb-2">今日の予定・イベント</p>
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
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
          <span className="text-3xl mb-2">{menu.icon}</span>
          <span className="text-xs font-bold">{menu.title}</span>
        </Link>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AbsenceAlert[]>([]);
  const [todaySummary, setTodaySummary] = useState<TodaySummary>({
    date: '', weather: '-', userCount: 0, events: []
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        // JSTでの今日の日付文字列 (YYYY-MM-DD)
        const todayJst = new Date(now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
        const y = todayJst.getFullYear();
        const m = String(todayJst.getMonth() + 1).padStart(2, '0');
        const d = String(todayJst.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;

        // 1. アラート取得 (欠席4回以上)
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

        const alertList = Object.entries(counts)
          .map(([uid, data]) => ({ userId: uid, userName: data.name, count: data.count }))
          .filter(item => item.count >= 4);
        
        setAlerts(alertList);

        // 2. 本日の利用予定者数 (簡易的にeventsコレクションから取得)
        // ※正確にはカレンダーロジックと同じものが必要ですが、ここでは軽量化のためFirestoreのみ参照
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

        // 3. 今日の天気 (Open-Meteo API)
        let weather = '-';
        try {
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=34.6937&longitude=135.5023&daily=weather_code&timezone=Asia%2FTokyo&start_date=${todayStr}&end_date=${todayStr}`);
          const wData = await res.json();
          if (wData.daily && wData.daily.weather_code) {
            const code = wData.daily.weather_code[0];
            // 簡易コード変換
            if (code === 0) weather = '晴';
            else if (code <= 3) weather = '曇';
            else if (code <= 67) weather = '雨';
            else weather = 'その他';
          }
        } catch(e) {}

        setTodaySummary({
          date: `${m}/${d}`,
          weather,
          userCount,
          events: [] // 必要ならここにお知らせ等を入れる
        });

      } catch (e) {
        console.error("Fetch error:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <AppLayout pageTitle="ダッシュボード">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* 1. 最重要: アラートパネル */}
        <AlertPanel alerts={alerts} loading={loading} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 2. 本日の状況 (左カラム) */}
          <div className="lg:col-span-1">
            <TodayPanel summary={todaySummary} />
          </div>

          {/* 3. クイックアクセス (右カラム・広め) */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
            <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-4">業務メニュー</h3>
            <QuickAccess />
          </div>
        </div>

      </div>
    </AppLayout>
  );
}