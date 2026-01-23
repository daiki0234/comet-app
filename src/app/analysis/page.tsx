"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ComposedChart, PieChart, Pie, Cell
} from 'recharts';
import toast from 'react-hot-toast';

// --- 型定義 ---
type AttendanceRecord = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  month: string;
  usageStatus: '放課後' | '休校日' | '欠席';
  reason?: string;
};

type CalendarEvent = {
  id: string;
  userId: string;
  dateKeyJst: string; // YYYY-MM-DD
  type: '放課後' | '休校日' | '欠席' | '体験';
};

type User = { id: string; lastName: string; firstName: string; };

type AiSummaryResponse = {
  overall: string;
  trends: string;
  dayOfWeek: string;
  ranking: string;
  absences: string;
};

type AiUserResponse = {
  overall: string;
  trends: string;
  absences: string;
  advice: string;
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];
const toDateInputStr = (d: Date) => d.toISOString().split('T')[0];

const AiCommentBox = ({ title, content, loading }: { title: string, content?: string, loading: boolean }) => {
  if (loading) return <div className="bg-purple-50 h-20 rounded-lg animate-pulse border border-purple-100 mt-4 mx-4" />;
  if (!content) return null;
  return (
    <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl mt-4 mx-4 mb-4 text-sm text-gray-700 leading-relaxed shadow-sm fade-in-up">
      <strong className="block text-purple-700 mb-1 flex items-center">
        <span className="text-lg mr-1">🤖</span> {title}
      </strong>
      {content}
    </div>
  );
};

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<'summary' | 'user' | 'training'>('summary');
  const [loading, setLoading] = useState(false);
  
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  
  const [users, setUsers] = useState<User[]>([]);
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputStr(d);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1); 
    d.setDate(0); 
    return toDateInputStr(d);
  });

  const [selectedUserId, setSelectedUserId] = useState('');

  const [aiSummaryData, setAiSummaryData] = useState<AiSummaryResponse | null>(null);
  const [aiUserData, setAiUserData] = useState<AiUserResponse | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // hasRunSummary, hasRunUser などの自動実行用フラグは削除しました

  // --- 初期データ取得 ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const userSnap = await getDocs(collection(db, 'users'));
        const userList = userSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));
        userList.sort((a, b) => (a.lastName || '').localeCompare((b.lastName || ''), 'ja'));
        setUsers(userList);

        const now = new Date();
        const pastDate = new Date();
        pastDate.setFullYear(now.getFullYear() - 1);
        const pastStr = toDateInputStr(pastDate);
        
        const futureDate = new Date();
        futureDate.setMonth(now.getMonth() + 3);
        const futureStr = toDateInputStr(futureDate);

        const recQuery = query(
          collection(db, 'attendanceRecords'),
          where('date', '>=', pastStr),
          orderBy('date', 'asc')
        );
        const recSnap = await getDocs(recQuery);
        const recs = recSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
        setAllRecords(recs);

        const evtQuery = query(
          collection(db, 'events'),
          where('dateKeyJst', '>=', pastStr),
          where('dateKeyJst', '<=', futureStr)
        );
        const evtSnap = await getDocs(evtQuery);
        const evts = evtSnap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent));
        setAllEvents(evts);

      } catch (e) {
        console.error(e);
        toast.error("データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- AI実行関数 (手動トリガー用) ---
  const handleRunAI = async (type: 'summary' | 'user', contextData: any) => {
    if (isAiLoading) return; // 連打防止
    
    if (!contextData || (type === 'summary' && contextData.totalCount === 0) || (type === 'user' && contextData.totalVisits === 0)) {
      toast.error("分析対象のデータがありません");
      return;
    }

    setIsAiLoading(true);
    const loadingId = toast.loading("AIが分析中... (30秒ほどかかります)");

    try {
      let context = {};
      if (type === 'summary') {
        context = {
          monthly: contextData.monthlyChartData.map((d:any) => ({
            month: d.month,
            actual: d.houkago + d.kyuko,
            forecast: d.forecast,
            absence: d.absence,
            rate: d.rate
          })),
          dayOfWeek: contextData.dayOfWeekData,
          usageRank: contextData.usageRankingData,
          reasons: contextData.absenceChartData
        };
      } else {
        context = {
          name: contextData.user?.lastName,
          monthly: contextData.monthlyChartData,
          reasons: contextData.reasonChartData
        };
      }

      const res = await fetch('/api/analysis/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: JSON.stringify(context), type })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || data.overall || "AI分析エラー");
      }
      
      if (type === 'summary') setAiSummaryData(data);
      else setAiUserData(data);

      toast.success("分析が完了しました", { id: loadingId });

    } catch (e: any) {
      console.error(e);
      toast.error(`分析失敗: ${e.message}`, { id: loadingId });
    } finally {
      setIsAiLoading(false);
    }
  };

  // ==========================================
  // ① サマリー分析ロジック
  // ==========================================
  const summaryData = useMemo(() => {
    if (allRecords.length === 0) return null;
    const todayStr = toDateInputStr(new Date());

    const filteredRecords = allRecords.filter(r => r.date >= startDate && r.date <= endDate);
    const filteredEvents = allEvents.filter(e => e.dateKeyJst >= startDate && e.dateKeyJst <= endDate && e.dateKeyJst >= todayStr);

    const monthlyStats: Record<string, { month: string; houkago: number; kyuko: number; absence: number; forecast: number }> = {};
    
    filteredRecords.forEach(rec => {
      const m = rec.month;
      if (!m) return;
      if (!monthlyStats[m]) monthlyStats[m] = { month: m, houkago: 0, kyuko: 0, absence: 0, forecast: 0 };
      if (rec.usageStatus === '放課後') monthlyStats[m].houkago++;
      else if (rec.usageStatus === '休校日') monthlyStats[m].kyuko++;
      else if (rec.usageStatus === '欠席') monthlyStats[m].absence++;
    });

    filteredEvents.forEach(evt => {
      const m = evt.dateKeyJst.slice(0, 7);
      if (!monthlyStats[m]) monthlyStats[m] = { month: m, houkago: 0, kyuko: 0, absence: 0, forecast: 0 };
      if (evt.type === '放課後' || evt.type === '休校日') {
        monthlyStats[m].forecast++;
      }
    });

    const monthlyChartData = Object.values(monthlyStats)
      .sort((a, b) => (a.month || '').localeCompare((b.month || '')))
      .map(d => {
        const total = d.houkago + d.kyuko + d.absence + d.forecast;
        const usage = d.houkago + d.kyuko + d.forecast;
        const rate = total > 0 ? Math.round((usage / total) * 100) : 0;
        return { ...d, rate };
      });

    const dayStats = [0, 1, 2, 3, 4, 5, 6].map(i => ({ dayIndex: i, name: ['日', '月', '火', '水', '木', '金', '土'][i], total: 0, absence: 0 }));
    filteredRecords.forEach(rec => {
      const d = new Date(rec.date);
      const dayIndex = d.getDay();
      dayStats[dayIndex].total++;
      if (rec.usageStatus === '欠席') dayStats[dayIndex].absence++;
    });
    const dayOfWeekData = dayStats.map(d => ({
      name: d.name,
      rate: d.total > 0 ? Math.round((d.absence / d.total) * 100) : 0,
      count: d.absence
    }));

    const usageRanking: Record<string, number> = {};
    const absenceRanking: Record<string, number> = {};
    filteredRecords.forEach(rec => {
      if (!rec.userName) return;
      if (rec.usageStatus === '欠席') absenceRanking[rec.userName] = (absenceRanking[rec.userName] || 0) + 1;
      else usageRanking[rec.userName] = (usageRanking[rec.userName] || 0) + 1;
    });

    const usageRankingData = Object.entries(usageRanking).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const absenceRankingData = Object.entries(absenceRanking).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

    const absenceReasonStats: Record<string, number> = {};
    filteredRecords.forEach(rec => {
      if (rec.usageStatus === '欠席') {
        const r = rec.reason || '不明・その他';
        absenceReasonStats[r] = (absenceReasonStats[r] || 0) + 1;
      }
    });
    const absenceChartData = Object.entries(absenceReasonStats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    return { monthlyChartData, dayOfWeekData, usageRankingData, absenceRankingData, absenceChartData, totalCount: filteredRecords.length + filteredEvents.length };
  }, [allRecords, allEvents, startDate, endDate]);


  // ==========================================
  // ② ユーザー分析ロジック
  // ==========================================
  const userData = useMemo(() => {
    if (!selectedUserId || allRecords.length === 0) return null;

    const myRecords = allRecords.filter(r => r.userId === selectedUserId);
    const todayStr = toDateInputStr(new Date());
    const myEvents = allEvents.filter(e => e.userId === selectedUserId && e.dateKeyJst >= todayStr);

    const user = users.find(u => u.id === selectedUserId);
    
    const monthlyStats: Record<string, { month: string; usage: number; absence: number; forecast: number }> = {};
    
    myRecords.forEach(rec => {
      if (!rec.month) return;
      if (!monthlyStats[rec.month]) monthlyStats[rec.month] = { month: rec.month, usage: 0, absence: 0, forecast: 0 };
      if (rec.usageStatus === '欠席') monthlyStats[rec.month].absence++;
      else monthlyStats[rec.month].usage++;
    });

    myEvents.forEach(evt => {
      const m = evt.dateKeyJst.slice(0, 7);
      if (!monthlyStats[m]) monthlyStats[m] = { month: m, usage: 0, absence: 0, forecast: 0 };
      if (evt.type === '放課後' || evt.type === '休校日') {
        monthlyStats[m].forecast++;
      }
    });

    const monthlyChartData = Object.values(monthlyStats).sort((a, b) => (a.month || '').localeCompare((b.month || '')));

    const reasonStats: Record<string, number> = {};
    myRecords.forEach(rec => {
      if (rec.usageStatus === '欠席') {
        const r = rec.reason || 'その他';
        reasonStats[r] = (reasonStats[r] || 0) + 1;
      }
    });
    const reasonChartData = Object.entries(reasonStats).map(([name, value]) => ({ name, value }));

    return { user, monthlyChartData, reasonChartData, totalVisits: myRecords.length + myEvents.length };
  }, [selectedUserId, allRecords, allEvents, users]);


  // ★修正: 自動実行useEffectを削除し、データ変更時に結果をリセットする処理のみ残す
  useEffect(() => { setAiSummaryData(null); }, [startDate, endDate]);
  useEffect(() => { setAiUserData(null); }, [selectedUserId]);


  return (
    <AppLayout pageTitle="AI分析">
      <div className="flex flex-col h-full space-y-6">
        
        {/* タブ */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
          {['summary', 'user', 'training'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'summary' ? 'サマリー分析' : tab === 'user' ? 'ユーザー分析' : 'トレーニング分析'}
            </button>
          ))}
        </div>

        {/* ① サマリー分析 */}
        {activeTab === 'summary' && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            {/* 期間指定 & AIボタン */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 bg-white p-4 rounded-xl shadow-sm border border-gray-200 w-fit">
                <span className="text-sm font-bold text-gray-600">期間指定:</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border p-2 rounded-md text-sm" />
                <span className="text-gray-400">~</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border p-2 rounded-md text-sm" />
              </div>

              {/* ★ 追加: AI実行ボタン */}
              <button
                onClick={() => handleRunAI('summary', summaryData)}
                disabled={isAiLoading || !summaryData || summaryData.totalCount === 0}
                className={`flex items-center gap-2 px-6 py-4 rounded-xl font-bold text-white shadow-md transition-all ${
                  isAiLoading || !summaryData || summaryData.totalCount === 0
                    ? 'bg-purple-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:scale-105 active:scale-95'
                }`}
              >
                {isAiLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>分析中...</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl">🤖</span>
                    <span>AI分析を実行する</span>
                  </>
                )}
              </button>
            </div>

            {/* 総評 (ボタンを押すまでは表示されない) */}
            <AiCommentBox title="全体総評・予実分析" content={aiSummaryData?.overall} loading={isAiLoading} />

            {summaryData && summaryData.totalCount > 0 ? (
              <>
                {/* 1. 月別推移 (予実) */}
                <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
                  <h3 className="text-gray-600 font-bold mb-4">月別 着地予想（実績 ＋ 予定）</h3>
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={summaryData.monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{fontSize: 12}} />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" unit="%" />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="houkago" name="放課後(実)" stackId="a" fill="#3B82F6" />
                        <Bar yAxisId="left" dataKey="kyuko" name="休校日(実)" stackId="a" fill="#F59E0B" />
                        <Bar yAxisId="left" dataKey="forecast" name="利用予定(未)" stackId="a" fill="#93C5FD"  />
                        <Bar yAxisId="left" dataKey="absence" name="欠席" stackId="a" fill="#EF4444" />
                        <Line yAxisId="right" type="monotone" dataKey="rate" name="稼働率(見込)" stroke="#10B981" strokeWidth={3} dot={{r:4}} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <AiCommentBox title="推移・着地予測" content={aiSummaryData?.trends} loading={isAiLoading} />
                </div>

                {/* 2. 曜日別 */}
                <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
                  <h3 className="text-gray-600 font-bold mb-4">曜日別 欠席率 (%)</h3>
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summaryData.dayOfWeekData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" />
                        <YAxis unit="%" />
                        <Tooltip />
                        <Bar dataKey="rate" name="欠席率" fill="#EF4444" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#666', fontSize: 12 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <AiCommentBox title="曜日傾向" content={aiSummaryData?.dayOfWeek} loading={isAiLoading} />
                </div>

                {/* 3. ランキング */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
                    <h3 className="text-gray-600 font-bold mb-4">利用回数 TOP10</h3>
                    <div className="w-full h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={summaryData.usageRankingData} margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11}} />
                          <Tooltip />
                          <Bar dataKey="count" name="回数" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
                    <h3 className="text-gray-600 font-bold mb-4">欠席回数 TOP10</h3>
                    <div className="w-full h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={summaryData.absenceRankingData} margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11}} />
                          <Tooltip />
                          <Bar dataKey="count" name="欠席回数" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <AiCommentBox title="利用者分析" content={aiSummaryData?.ranking} loading={isAiLoading} />

                {/* 4. 欠席理由 */}
                <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
                  <h3 className="text-gray-600 font-bold mb-4">欠席理由の内訳</h3>
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={summaryData.absenceChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          fill="#8884d8"
                          paddingAngle={2}
                          dataKey="value"
                          label={({name, percent}) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                        >
                          {summaryData.absenceChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <AiCommentBox title="欠席理由分析" content={aiSummaryData?.absences} loading={isAiLoading} />
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                指定された期間のデータがありません
              </div>
            )}
          </div>
        )}

        {/* ② ユーザー分析 */}
        {activeTab === 'user' && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 w-full max-w-md bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <span className="text-sm font-bold text-gray-600">利用者選択:</span>
                <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="p-2 border rounded-md text-sm flex-1">
                  <option value="">選択してください</option>
                  {users.map(u => (<option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>))}
                </select>
              </div>

              {/* ★ 追加: AI実行ボタン（ユーザー分析用） */}
              <button
                onClick={() => handleRunAI('user', userData)}
                disabled={isAiLoading || !userData || userData.totalVisits === 0}
                className={`flex items-center gap-2 px-6 py-4 rounded-xl font-bold text-white shadow-md transition-all ${
                  isAiLoading || !userData || userData.totalVisits === 0
                    ? 'bg-purple-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:scale-105 active:scale-95'
                }`}
              >
                {isAiLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>分析中...</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl">🤖</span>
                    <span>AI分析を実行する</span>
                  </>
                )}
              </button>
            </div>

            <AiCommentBox title="全体評価" content={aiUserData?.overall} loading={isAiLoading} />

            {userData ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                  <h3 className="text-gray-600 font-bold mb-4">利用推移（予定含む）</h3>
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={userData.monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{fontSize: 10}} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="usage" name="実績" stroke="#3B82F6" strokeWidth={2} />
                        <Line type="monotone" dataKey="forecast" name="予定" stroke="#93C5FD" strokeWidth={2} strokeDasharray="5 5" />
                        <Line type="monotone" dataKey="absence" name="欠席" stroke="#EF4444" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <AiCommentBox title="推移分析" content={aiUserData?.trends} loading={isAiLoading} />
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                  <h3 className="text-gray-600 font-bold mb-4">欠席理由</h3>
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={userData.reasonChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          fill="#8884d8"
                          paddingAngle={5}
                          dataKey="value"
                          label={({name}) => name}
                        >
                          {userData.reasonChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <AiCommentBox title="欠席傾向" content={aiUserData?.absences} loading={isAiLoading} />
                </div>
                
                <div className="col-span-1 lg:col-span-2">
                   <AiCommentBox title="スタッフへのアドバイス" content={aiUserData?.advice} loading={isAiLoading} />
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-300">利用者を選択すると分析データが表示されます</div>
            )}
          </div>
        )}

        {/* ③ トレーニング分析 */}
        {activeTab === 'training' && (
          <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 text-gray-400">
            <span className="text-6xl mb-4">🚧</span>
            <h2 className="text-xl font-bold">トレーニング分析は準備中です</h2>
          </div>
        )}
      </div>
    </AppLayout>
  );
}