"use client";

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, orderBy, limit, documentId } from 'firebase/firestore';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

// ★ PDF用ライブラリ
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import { ServiceRecordSheet } from '@/components/ServiceRecordSheet';

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

type PlanAlertData = {
  finals: { id: string; userName: string; date: string }[];
  drafts: { id: string; userName: string; date: string }[];
};

// ★ 提供記録用の型定義
type PseudoRecord = { userName: string; date: string; usageStatus: '放課後' | '休校日' | '欠席'; notes?: string; };
type SheetRecord = React.ComponentProps<typeof ServiceRecordSheet>['record'];
type SheetRecordNonNull = NonNullable<SheetRecord>;

const toSheetRecord = (r: PseudoRecord | null): SheetRecord => {
  if (!r || r.usageStatus == null) return null; 
  const conv: SheetRecordNonNull = {
    userName: r.userName,
    date: r.date,
    usageStatus: r.usageStatus, 
    notes: r.notes ?? "",
  };
  return conv;
};

// ヘルパー
const chunkArray = (array: string[], size: number) => {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) chunked.push(array.slice(i, i + size));
  return chunked;
};

const pad2 = (n: number) => n.toString().padStart(2, "0");
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// --- コンポーネント: アラートパネル (欠席・記録漏れ) ---
const AlertPanel = ({ alerts, loading }: { alerts: AlertItem[], loading: boolean }) => {
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
          <p className="text-green-600 text-sm">欠席が4回に達した利用者や記録漏れはありません。</p>
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

// --- コンポーネント: 支援計画アラートパネル ---
const SupportPlanAlertPanel = ({ alerts }: { alerts: PlanAlertData }) => {
  const hasFinals = alerts.finals.length > 0;
  const hasDrafts = alerts.drafts.length > 0;

  if (!hasFinals && !hasDrafts) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        支援計画アラート
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 原案アラート (左) */}
        {hasDrafts && (
          <div className={`${!hasFinals ? 'md:col-span-2' : ''} bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg shadow-sm flex items-start`}>
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 w-full">
              <h3 className="text-sm font-bold text-yellow-800">
                【原案】の作成時期に該当する利用者が{alerts.drafts.length}名います
              </h3>
              <div className="mt-2">
                <Link href="/support/plans" className="text-xs bg-white border border-yellow-300 text-yellow-800 px-3 py-1 rounded hover:bg-yellow-100 transition-colors inline-block">
                  一覧を確認する
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* 本番アラート (右) */}
        {hasFinals && (
          <div className={`${!hasDrafts ? 'md:col-span-2' : ''} bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-start`}>
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 w-full">
              <h3 className="text-sm font-bold text-red-800">
                【本番】の計画作成時期に該当する利用者が{alerts.finals.length}名います
              </h3>
              <div className="mt-2">
                <Link href="/support/plans" className="text-xs bg-white border border-red-300 text-red-800 px-3 py-1 rounded hover:bg-red-100 transition-colors inline-block">
                  一覧を確認する
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- コンポーネント: 本日の状況 ---
const TodayPanel = ({ summary, onPrint }: { summary: TodaySummary, onPrint: () => void }) => {
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
          
          <div className="max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
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

      <div className="flex-1 overflow-y-auto max-h-[300px] border-t border-gray-100 pt-2 space-y-2 pr-1 custom-scrollbar">
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
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [planAlerts, setPlanAlerts] = useState<PlanAlertData>({ finals: [], drafts: [] });
  const [todaySummary, setTodaySummary] = useState<TodaySummary>({
    date: '', dateObj: new Date(), weather: '-', userCount: 0, scheduledUserNames: [], googleEvents: []
  });
  const [prevDayData, setPrevDayData] = useState<PreviousDayData | null>(null);

  useEffect(() => {
    // 1. メインの業務データ取得（並列処理で高速化）
    const fetchMainData = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const todayJst = new Date(now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
        const y = todayJst.getFullYear();
        const mStr = String(todayJst.getMonth() + 1).padStart(2, '0');
        const dStr = String(todayJst.getDate()).padStart(2, '0');
        const todayStr = `${y}-${mStr}-${dStr}`;

        // 並列実行するPromises
        const [absSnap, recordSnap, eventSnap, prevDateSnap, plansSnap] = await Promise.all([
          // 欠席アラート
          getDocs(query(collection(db, 'attendanceRecords'), where('month', '==', currentMonth), where('usageStatus', '==', '欠席'))),
          // 記録漏れアラート
          getDocs(query(collection(db, 'attendanceRecords'), where('month', '==', currentMonth), where('date', '<', todayStr))),
          // 今日のイベント
          getDocs(query(collection(db, 'events'), where('dateKeyJst', '==', todayStr))),
          // 前回の日付
          getDocs(query(collection(db, 'attendanceRecords'), where('date', '<', todayStr), orderBy('date', 'desc'), limit(1))),
          // 支援計画アラート用（全件）
          getDocs(query(collection(db, 'supportPlans'), orderBy('creationDate', 'desc')))
        ]);

        // --- A. 欠席・記録漏れアラート処理 ---
        const alertList: AlertItem[] = [];
        const counts: Record<string, { name: string; count: number }> = {};
        absSnap.forEach(doc => {
          const d = doc.data();
          if (!counts[d.userId]) counts[d.userId] = { name: d.userName, count: 0 };
          counts[d.userId].count++;
        });
        Object.entries(counts).forEach(([uid, data]) => {
          if (data.count >= 4) {
            alertList.push({ id: `abs-${uid}`, type: 'ABSENCE_LIMIT', message: `${data.name} さんの欠席が4回に達しました`, detail: `${data.count}回`, link: '/absence-management' });
          }
        });
        recordSnap.forEach(doc => {
          const d = doc.data();
          if (d.usageStatus !== '欠席' && (!d.arrivalTime || !d.departureTime)) {
            alertList.push({ id: `miss-${doc.id}`, type: 'MISSING_RECORD', message: `${d.date} ${d.userName} さんの記録漏れ`, detail: !d.arrivalTime ? '来所時間なし' : '退所時間なし', link: '/attendance' });
          }
        });
        setAlerts(alertList);

        // --- B. 本日の状況（基本データ） ---
        let userCount = 0;
        const scheduledUsersMap: Record<string, string> = {}; 
        eventSnap.forEach(doc => {
          const d = doc.data();
          if (d.type === '放課後' || d.type === '休校日') {
            userCount++;
            scheduledUsersMap[d.userId] = d.type;
          }
        });

        // ユーザー詳細は別途取得 (これは待つ必要がある)
        let scheduledUserNames: { name: string; service: string }[] = [];
        const scheduledUserIds = Object.keys(scheduledUsersMap);
        if (scheduledUserIds.length > 0) {
          const userChunks = chunkArray(scheduledUserIds, 10);
          const userDocsPromises = userChunks.map(ids => getDocs(query(collection(db, 'users'), where(documentId(), 'in', ids))));
          const userSnapshots = await Promise.all(userDocsPromises);
          userSnapshots.forEach(snap => {
            snap.forEach(doc => { 
              const u = doc.data();
              scheduledUserNames.push({ name: `${u.lastName} ${u.firstName}`, service: scheduledUsersMap[doc.id] });
            });
          });
          scheduledUserNames.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        }
        
        // とりあえず天気・Googleなしでセット
        setTodaySummary({ date: `${mStr}/${dStr}`, dateObj: todayJst, weather: '-', userCount, scheduledUserNames, googleEvents: [] });

        // --- C. 前回の実績 ---
        if (!prevDateSnap.empty) {
          const targetDateStr = prevDateSnap.docs[0].data().date;
          const prevRecordsSnap = await getDocs(query(collection(db, 'attendanceRecords'), where('date', '==', targetDateStr)));
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
          recordsData.forEach(r => { if (r.status === '放課後') cHoukago++; else if (r.status === '休校日') cKyuko++; else if (r.status === '欠席') cAbsence++; });
          setPrevDayData({ dateStr: targetDateStr, countHoukago: cHoukago, countKyuko: cKyuko, countAbsence: cAbsence, records: recordsData });
        } else {
          setPrevDayData(null);
        }

        // --- D. 支援計画アラート ---
        const finals: any[] = [];
        const drafts: any[] = [];
        
        const isPlanAlertTarget = (dateVal: any) => {
          if (!dateVal) return false;
          const d = typeof dateVal === 'string' ? new Date(dateVal) : (dateVal.toDate ? dateVal.toDate() : new Date(dateVal));
          if (isNaN(d.getTime())) return false;
          const createdYear = d.getFullYear();
          const createdMonth = d.getMonth();
          let targetMonth = createdMonth + 6;
          let targetYear = createdYear;
          if (targetMonth > 11) {
            targetYear += Math.floor(targetMonth / 12);
            targetMonth = targetMonth % 12;
          }
          return todayJst.getFullYear() === targetYear && todayJst.getMonth() === targetMonth;
        };

        plansSnap.forEach(doc => {
          const data = doc.data();
          if (isPlanAlertTarget(data.creationDate)) {
            const item = { id: doc.id, userName: data.userName, date: data.creationDate };
            if (data.status === '本番') finals.push(item);
            else if (data.status === '原案') drafts.push(item);
          }
        });
        setPlanAlerts({ finals, drafts });

      } catch (e) {
        console.error("Fetch Error:", e);
      } finally {
        setLoading(false); // ★ここで画面表示！
      }
    };

    // 2. 外部API (天気・Google) は後から非同期で取得してState更新
    const fetchExternalData = async () => {
      const now = new Date();
      const todayJst = new Date(now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
      const y = todayJst.getFullYear();
      const mStr = String(todayJst.getMonth() + 1).padStart(2, '0');
      const dStr = String(todayJst.getDate()).padStart(2, '0');
      const todayStr = `${y}-${mStr}-${dStr}`;

      // Google Calendar
      try {
        const timeMin = new Date(`${todayStr}T00:00:00`).toISOString();
        const timeMax = new Date(`${todayStr}T23:59:59`).toISOString();
        const calRes = await fetch(`/api/calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
        if (calRes.ok) {
          const calData = await calRes.json();
          if (calData.items) {
            const events = calData.items.map((item: any) => item.summary);
            setTodaySummary(prev => ({ ...prev, googleEvents: events }));
          }
        }
      } catch (e) {}

      // Weather
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=34.6937&longitude=135.5023&daily=weather_code&timezone=Asia%2FTokyo&start_date=${todayStr}&end_date=${todayStr}`);
        const wData = await res.json();
        if (wData.daily && wData.daily.weather_code) {
          const code = wData.daily.weather_code[0];
          let weather = 'その他';
          if (code === 0) weather = '晴'; else if (code <= 3) weather = '曇'; else if (code <= 67) weather = '雨';
          setTodaySummary(prev => ({ ...prev, weather }));
        }
      } catch(e) {}
    };

    fetchMainData();
    fetchExternalData(); // 画面表示をブロックせずに実行
  }, []);

  const handlePrintDailySheet = async () => {
    if (todaySummary.scheduledUserNames.length === 0) return toast.error("本日の利用予定者がいません");
    const loadingToast = toast.loading("PDFを生成中...");

    try {
      const recordsToPrint: (PseudoRecord | null)[] = todaySummary.scheduledUserNames.map(u => ({
        userName: u.name,
        date: toDateStr(todaySummary.dateObj),
        usageStatus: u.service as '放課後' | '休校日', 
        notes: '',
      }));

      if (recordsToPrint.length % 2 !== 0) recordsToPrint.push(null);

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'b5' });

      for (let i = 0; i < recordsToPrint.length; i += 2) {
        const pair = [recordsToPrint[i], recordsToPrint[i+1]];
        const tempDiv = document.createElement('div');
        tempDiv.style.width = '182mm';
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-2000px';
        document.body.appendChild(tempDiv);

        const root = createRoot(tempDiv);
        await new Promise<void>((resolve) => {
          root.render(
            <React.StrictMode>
    <ServiceRecordSheet record={toSheetRecord(pair[0])} index={0} />
    <ServiceRecordSheet record={toSheetRecord(pair[1])} index={1} />
  </React.StrictMode>
          );
          setTimeout(resolve, 500);
        });

        const canvas = await html2canvas(tempDiv, { scale: 3 });
        const imgData = canvas.toDataURL('image/png');

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, 'FAST');

        root.unmount();
        document.body.removeChild(tempDiv);
      }

      pdf.save(`サービス提供記録_${toDateStr(todaySummary.dateObj)}.pdf`);
      toast.success("PDFをダウンロードしました", { id: loadingToast });

    } catch (e: any) {
      console.error("PDF Error:", e);
      toast.error(`PDF生成失敗: ${e.message}`, { id: loadingToast });
    }
  };

  return (
    <AppLayout pageTitle="ダッシュボード">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* --- デイリーインフォーメーション --- */}
        <section>
          <h2 className="text-xl font-bold text-gray-700 mb-6 flex items-center gap-2 border-b pb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            デイリーインフォーメーション
          </h2>
          
          <div className="space-y-6">
            <AlertPanel alerts={alerts} loading={loading} />
            
            {(planAlerts.finals.length > 0 || planAlerts.drafts.length > 0) && (
               <SupportPlanAlertPanel alerts={planAlerts} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              <TodayPanel summary={todaySummary} onPrint={handlePrintDailySheet} />
              <PreviousDayPanel data={prevDayData} loading={loading} />
            </div>
          </div>
        </section>

        {/* --- 業務メニュー --- */}
        <section className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
          <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-6 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            業務メニュー
          </h3>
          <QuickAccess />
        </section>

      </div>
    </AppLayout>
  );
}