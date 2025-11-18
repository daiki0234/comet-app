// src/app/dashboard/page.tsx

"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/Layout';
import Chart from 'chart.js/auto';

import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import { ServiceRecordSheet } from '@/components/ServiceRecordSheet';

// --- 型定義 ---
type ScheduleStatus = '放課後' | '休校日' | 'キャンセル待ち' | '欠席' | '取り消し';
type ServiceStatus = '契約なし' | '利用中' | '休止中' | '契約終了';

// ★★★ 修正点： User型に必要なプロパティを完全に追加 ★★★
type User = {
  id: string;
  lastName: string;
  firstName: string;
  allergies?: string;
  serviceHoDay?: ServiceStatus;
  serviceJihatsu?: ServiceStatus;
  serviceSoudan?: ServiceStatus;
};

// アラート表示用の型
type AlertItem = {
  id: string;
  date: string;
  userName: string;
  type: 'missing_departure' | 'missing_attendance';
  message: string;
};

// PDF生成用の型
type EventData = {
  id: string; userId: string; dateKeyJst: string; type: ScheduleStatus;
  user?: User; userName?: string;
};
type PseudoRecord = { userName: string; date: string; usageStatus: '放課後' | '休校日' | '欠席'; notes?: string; };
type SheetRecord = React.ComponentProps<typeof ServiceRecordSheet>['record'];
type SheetRecordNonNull = NonNullable<SheetRecord>;

// ユーティリティ関数
const toServiceStatus = (v: unknown): ServiceStatus =>
  v === '1' || v === 1 || v === true || v === '利用中' ? '利用中' : '契約なし';

const pad2 = (n: number) => n.toString().padStart(2, "0");

const jstDateKey = (src?: string | Date): string => {
  let d: Date;
  if (!src) d = new Date();
  else if (src instanceof Date) d = src;
  else d = new Date(src);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
};

const toSheetRecord = (r: PseudoRecord | null): SheetRecord => {
  if (!r || r.usageStatus == null) return null;
  const conv: SheetRecordNonNull = {
    userName: r.userName, date: r.date, usageStatus: r.usageStatus, notes: r.notes ?? "",
  };
  return conv;
};


type ChartInstances = {
  overall?: Chart; highAbsence?: Chart; weeklyAbsence?: Chart; monthlyTrend?: Chart; absenceReason?: Chart;
};

export default function DashboardPage() {
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  
  // アラート情報用State
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const chartRefs = useRef<ChartInstances>({});
  
  // 初期化
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);

    fetchAlerts();
  }, []);

  // アラート取得関数
  const fetchAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const todayStr = jstDateKey(new Date()); 
      const alertList: AlertItem[] = [];

      // 1. ユーザー情報の取得 (名前解決用)
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersMap = new Map<string, string>(); // ID -> "姓 名"
      usersSnap.docs.forEach(d => {
        const data = d.data();
        usersMap.set(d.id, `${data.lastName} ${data.firstName}`);
      });

      // 2. 実績データのチェック (帰所時間未記入)
      const attSnap = await getDocs(collection(db, 'attendanceRecords'));
      const attendanceMap = new Map<string, any>(); // "date_userId" -> record data

      attSnap.docs.forEach(doc => {
        const data = doc.data();
        const recordDate = data.date;
        
        attendanceMap.set(`${recordDate}_${data.userId}`, data);

        if (recordDate >= todayStr) return;

        // 【アラート1】来所あり・帰所なし
        if (data.arrivalTime && !data.departureTime) {
          alertList.push({
            id: `no_dep_${doc.id}`,
            date: recordDate,
            userName: usersMap.get(data.userId) || '不明なユーザー',
            type: 'missing_departure',
            message: '来所記録がありますが、帰所時間が未記入です。'
          });
        }
      });

      // 3. 予定データのチェック (予定あり・実績なし)
      const eventsSnap = await getDocs(collection(db, 'events'));
      
      eventsSnap.docs.forEach(doc => {
        const data = doc.data();
        const eventDate = data.dateKeyJst;

        if (!eventDate || eventDate >= todayStr) return;
        
        if (data.type === '放課後' || data.type === '休校日') {
          const key = `${eventDate}_${data.userId}`;
          const record = attendanceMap.get(key);

          let isMissing = false;
          if (!record) {
            isMissing = true;
          } else {
            const isAbsence = record.usageStatus === '欠席';
            const hasArrival = !!record.arrivalTime;
            if (!hasArrival && !isAbsence) {
              isMissing = true;
            }
          }

          if (isMissing) {
            alertList.push({
              id: `missing_att_${doc.id}`,
              date: eventDate,
              userName: usersMap.get(data.userId) || '不明なユーザー',
              type: 'missing_attendance',
              message: `「${data.type}」の予定ですが、来所記録がありません。`
            });
          }
        }
      });

      alertList.sort((a, b) => (a.date < b.date ? 1 : -1));
      setAlerts(alertList);

    } catch (e) {
      console.error("アラート取得エラー:", e);
    } finally {
      setLoadingAlerts(false);
    }
  };


  // --- PDF印刷機能 ---
  const handlePrintToday = async () => {
    setIsPrinting(true);
    const todayKey = jstDateKey(new Date());
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersMap = new Map<string, User>();
      usersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        // ★ User型に合わせたオブジェクトを作成
        usersMap.set(doc.id, {
          id: doc.id, 
          lastName: data.lastName, 
          firstName: data.firstName, 
          allergies: data.allergies,
          serviceHoDay: toServiceStatus(data.serviceHoDay), 
          serviceJihatsu: toServiceStatus(data.serviceJihatsu), 
          serviceSoudan: toServiceStatus(data.serviceSoudan),
        });
      });

      const eventsQuery = query(collection(db, 'events'), where('dateKeyJst', '==', todayKey));
      const eventsSnapshot = await getDocs(eventsQuery);
      const todaysScheduledUsers: EventData[] = [];
      eventsSnapshot.docs.forEach(doc => {
        const event = doc.data() as Omit<EventData, 'id'>;
        const user = usersMap.get(event.userId);
        if (user && (event.type === '放課後' || event.type === '休校日')) {
          todaysScheduledUsers.push({ id: doc.id, ...event, user: user, userName: `${user.lastName} ${user.firstName}` });
        }
      });

      if (todaysScheduledUsers.length === 0) { alert('本日の利用予定者（放課後・休校日）はいません。'); return; }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'b5' });
      const recordsToPrint: (PseudoRecord | null)[] = todaysScheduledUsers.map(event => ({
        userName: event.userName!, date: event.dateKeyJst, usageStatus: event.type as ('放課後' | '休校日'), notes: '',
      }));
      if (recordsToPrint.length % 2 !== 0) { recordsToPrint.push(null); }
      const userPairs: (PseudoRecord | null)[][] = [];
      for (let i = 0; i < recordsToPrint.length; i += 2) { userPairs.push([recordsToPrint[i], recordsToPrint[i + 1]]); }

      for (let i = 0; i < userPairs.length; i++) {
        const pair = userPairs[i];
        const tempDiv = document.createElement('div');
        tempDiv.style.width = '182mm'; tempDiv.style.position = 'absolute'; tempDiv.style.left = '-2000px';
        document.body.appendChild(tempDiv);
        const root = createRoot(tempDiv);
        root.render(<React.StrictMode><ServiceRecordSheet record={toSheetRecord(pair[0])} /><ServiceRecordSheet record={toSheetRecord(pair[1])} /></React.StrictMode>);
        await new Promise(r => setTimeout(r, 500));
        try {
          const canvas = await html2canvas(tempDiv, { scale: 3 });
          if (i > 0) pdf.addPage();
          const imgData = canvas.toDataURL('image/png');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        } catch (e) { console.error("PDF error:", e); alert("PDF生成エラー"); }
        root.unmount(); document.body.removeChild(tempDiv);
      }
      pdf.save(`${todayKey}_サービス提供記録.pdf`);
    } catch (e) { console.error(e); alert('PDF生成失敗'); } finally { setIsPrinting(false); }
  };

  // --- AI分析データ取得 ---
  const fetchData = async (start: string, end: string) => {
    setIsLoading(true); setError(null); setIsAnalyzed(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: start, endDate: end }),
      });
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.error || 'Failed to fetch'); }
      const data = await response.json();
      setAnalysisData(data);
    } catch (e: any) { setError(e.message); } finally { setIsLoading(false); }
  };
  const handleFilterClick = () => { fetchData(startDate, endDate); };
  const handleResetClick = () => {
    const today = new Date(); const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(today.getDate() - 30);
    setEndDate(today.toISOString().split('T')[0]); setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
    setAnalysisData(null); setIsAnalyzed(false); setError(null);
  };

  // グラフ描画
  useEffect(() => {
    if (!analysisData) return;
    const chartOptions = { plugins: { tooltip: { backgroundColor: 'rgba(0,0,0,0.7)', titleFont: { size: 14 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 4 }, legend: { labels: { font: { family: "'Inter', 'Noto Sans JP', sans-serif", size: 12 }, color: '#333' } } }, maintainAspectRatio: false, responsive: true };
    const drawChart = (canvasId: string, chartConfig: any, chartKey: keyof ChartInstances) => {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) return;
        if (chartRefs.current[chartKey]) { chartRefs.current[chartKey]?.destroy(); }
        chartRefs.current[chartKey] = new Chart(canvas, chartConfig);
    };
    
    drawChart('overallAttendanceChart', { type: 'doughnut', data: { labels: ['出席', '欠席', '体験'], datasets: [{ data: analysisData.summary.chartData, backgroundColor: ['#576CBC', '#F94C66', '#A5D7E8'], borderColor: '#f0f4f8', borderWidth: 5 }] }, options: { ...chartOptions, cutout: '70%', plugins: { ...chartOptions.plugins, legend: { ...chartOptions.plugins.legend, position: 'bottom' } } } }, 'overall');
    drawChart('highAbsenceChart', { type: 'bar', data: { labels: analysisData.individual.highAbsence.map((i:any) => i.name), datasets: [{ label: '欠席率 (%)', data: analysisData.individual.highAbsence.map((i:any) => i.rate), backgroundColor: '#F94C66', borderRadius: 5 }] }, options: { ...chartOptions, indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { display: false }, ticks: { callback: (v:any) => v + '%' } }, y: { grid: { display: false } } }, plugins: { ...chartOptions.plugins, legend: { display: false } } } }, 'highAbsence');
    drawChart('weeklyAbsenceRateChart', { type: 'bar', data: { labels: ['月', '火', '水', '木', '金', '土'], datasets: [{ label: '欠席率 (%)', data: analysisData.trends.weeklyAbsenceRate, backgroundColor: ['#FFC107', '#A5D7E8', '#576CBC', '#A5D7E8', '#F94C66', '#A5D7E8'], borderRadius: 5 }] }, options: { ...chartOptions, scales: { y: { beginAtZero: true, grid: { color: '#e9e9e9' }, ticks: { callback: (v:any) => v + '%' } }, x: { grid: { display: false } } }, plugins: { ...chartOptions.plugins, legend: { display: false } } } }, 'weeklyAbsence');
    drawChart('monthlyTrendChart', { type: 'bar', data: { labels: analysisData.trends.monthlyLabels, datasets: [ { type: 'bar', label: '合計活動回数', data: analysisData.trends.monthlyTotalData, backgroundColor: '#A5D7E8', yAxisID: 'y', borderRadius: 5 }, { type: 'line', label: '欠席率 (%)', data: analysisData.trends.monthlyAbsenceRateData, borderColor: '#F94C66', tension: 0.2, yAxisID: 'y1' } ] }, options: { ...chartOptions, scales: { x: {}, y: { type: 'linear', display: true, position: 'left', title: { display: true, text: '合計活動回N' } }, y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: '欠席率 (%)' }, grid: { drawOnChartArea: false } } }, plugins: { ...chartOptions.plugins, legend: { ...chartOptions.plugins.legend, position: 'bottom' } } } }, 'monthlyTrend');
    drawChart('absenceReasonChart', { type: 'doughnut', data: { labels: analysisData.absenceAnalysis.reasonBreakdown.labels, datasets: [{ label: '欠席回数', data: analysisData.absenceAnalysis.reasonBreakdown.data, backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'] }] }, options: { ...chartOptions, cutout: '50%', plugins: { ...chartOptions.plugins, legend: { ...chartOptions.plugins.legend, position: 'right' } } } }, 'absenceReason');
  }, [analysisData]);

  return (
    <AppLayout pageTitle="ダッシュボード">
      {/* "ようこそ" セクション */}
      <div className="bg-white p-6 sm:p-8 rounded-ios shadow-ios border border-ios-gray-200 mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">ようこそ Comet へ！</h2>
        <p className="text-gray-600 leading-relaxed max-w-2xl">
          日々の業務を効率化し、利用者様と向き合う大切な時間を増やすために。
          Cometは、あなたの業務をシンプルで直感的なものに変えるお手伝いをします。
        </p>
        
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/attendance">
            <button className="bg-ios-blue hover:bg-blue-600 text-white font-bold py-3 px-5 rounded-ios shadow-sm hover:shadow-md transition-all transform hover:scale-105">
              今日の出欠記録を始める
            </button>
          </Link>
          <button onClick={handlePrintToday} disabled={isPrinting} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-5 rounded-ios shadow-sm hover:shadow-md transition-all disabled:bg-gray-400">
            {isPrinting ? 'PDF生成中...' : '今日の提供記録を印刷'}
          </button>
        </div>

        {/* アラート表示エリア */}
        {loadingAlerts ? (
          <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200 text-gray-500 text-sm">
            アラート情報を確認中...
          </div>
        ) : alerts.length > 0 ? (
          <div className="mt-8 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <h3 className="text-md font-bold text-yellow-800 flex items-center mb-3">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              要確認事項 ({alerts.length}件)
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-start p-2 bg-white rounded border border-yellow-100 text-sm">
                  <span className="font-semibold text-gray-700 w-32 shrink-0">{alert.date}</span>
                  <span className="font-bold text-gray-800 w-32 shrink-0 mr-2">{alert.userName}</span>
                  <span className={`flex-1 ${alert.type === 'missing_departure' ? 'text-red-600' : 'text-orange-600'}`}>
                    {alert.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

      </div>
      
      {/* AI分析ダッシュボード */}
      <div className="container mx-auto" style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}>
        {isLoading && (
          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex flex-col items-center justify-center z-50">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
            <p className="text-white text-lg font-semibold">AIがデータを分析中...</p>
          </div>
        )}

        <section className="mb-6 bg-white rounded-ios shadow-ios border border-ios-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="md:col-span-1">
                    <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">開始日</label>
                    <input type="date" id="start-date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                </div>
                <div className="md:col-span-1">
                    <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">終了日</label>
                    <input type="date" id="end-date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-2">
                    <button onClick={handleFilterClick} disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300">この期間で分析</button>
                    <button onClick={handleResetClick} disabled={isLoading} className="w-full bg-gray-500 text-white font-bold py-2.5 px-4 rounded-md hover:bg-gray-600 disabled:bg-gray-300">リセット</button>
                </div>
            </div>
        </section>

        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg" role="alert"><p className="font-bold">エラー</p><p>{error}</p></div>}
        
        {isAnalyzed && !isLoading && analysisData && (
            <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <div className="lg:col-span-1 bg-white p-6 rounded-ios shadow-ios border border-ios-gray-200 flex flex-col"><h3 className="text-lg font-bold text-gray-700 mb-4 border-b pb-2">本日の出欠サマリー</h3><div className="flex-grow relative h-64"><canvas id="overallAttendanceChart"></canvas></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="bg-blue-50 p-2 rounded"><p className="text-xs text-gray-500">出席</p><p className="text-xl font-bold text-blue-600">{analysisData.summary.present}</p></div><div className="bg-red-50 p-2 rounded"><p className="text-xs text-gray-500">欠席</p><p className="text-xl font-bold text-red-600">{analysisData.summary.absent}</p></div><div className="bg-gray-50 p-2 rounded"><p className="text-xs text-gray-500">体験</p><p className="text-xl font-bold text-gray-600">{analysisData.summary.trial}</p></div></div></div>
               <div className="lg:col-span-2 bg-white p-6 rounded-ios shadow-ios border border-ios-gray-200 flex flex-col"><h3 className="text-lg font-bold text-gray-700 mb-4 border-b pb-2">要注意：欠席率が高い利用者</h3><div className="flex-grow relative h-64"><canvas id="highAbsenceChart"></canvas></div><p className="mt-2 text-sm text-gray-500 text-right">※ 上位5名を表示</p></div>
               <div className="lg:col-span-1 bg-white p-6 rounded-ios shadow-ios border border-ios-gray-200 flex flex-col"><h3 className="text-lg font-bold text-gray-700 mb-4 border-b pb-2">曜日別 欠席率トレンド</h3><div className="flex-grow relative h-64"><canvas id="weeklyAbsenceRateChart"></canvas></div></div>
               <div className="lg:col-span-2 bg-white p-6 rounded-ios shadow-ios border border-ios-gray-200 flex flex-col"><h3 className="text-lg font-bold text-gray-700 mb-4 border-b pb-2">月別 活動実績推移</h3><div className="flex-grow relative h-64"><canvas id="monthlyTrendChart"></canvas></div></div>
               <div className="lg:col-span-1 bg-white p-6 rounded-ios shadow-ios border border-ios-gray-200 flex flex-col"><h3 className="text-lg font-bold text-gray-700 mb-4 border-b pb-2">欠席理由の内訳</h3><div className="flex-grow relative h-64"><canvas id="absenceReasonChart"></canvas></div></div>
               <div className="lg:col-span-2 bg-white p-6 rounded-ios shadow-ios border border-ios-gray-200"><h3 className="text-lg font-bold text-gray-700 mb-4 border-b pb-2">AIからの改善提案</h3><ul className="space-y-3">{analysisData.aiSuggestions.map((suggestion:string, i:number) => (<li key={i} className="flex items-start"><span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold mr-3">{i + 1}</span><p className="text-gray-700 text-sm leading-relaxed">{suggestion}</p></li>))}</ul></div>
            </main>
        )}
      </div>
    </AppLayout>
  );
}