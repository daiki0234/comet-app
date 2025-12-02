"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
// ★ 修正: LineChart を追加しました
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
  date: string; // YYYY-MM-DD
  month: string;
  usageStatus: '放課後' | '休校日' | '欠席';
  reason?: string; // 欠席理由
};

type User = { id: string; lastName: string; firstName: string; };

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

// 日付操作ヘルパー
const toDateInputStr = (d: Date) => d.toISOString().split('T')[0];

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<'summary' | 'user' | 'training'>('summary');
  const [loading, setLoading] = useState(false);
  
  // データ保持
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  // 期間指定フィルター (デフォルト: 過去30日)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputStr(d);
  });
  const [endDate, setEndDate] = useState(() => toDateInputStr(new Date()));

  // ユーザー選択
  const [selectedUserId, setSelectedUserId] = useState('');

  // AIコメント
  const [aiComment, setAiComment] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- 初期データ取得 (全期間取得し、クライアント側でフィルタリング) ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. ユーザー一覧
        const userSnap = await getDocs(collection(db, 'users'));
        const userList = userSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));
        userList.sort((a, b) => (a.lastName || '').localeCompare((b.lastName || ''), 'ja'));
        setUsers(userList);

        // 2. 出欠データ (過去1年分取得)
        const now = new Date();
        const pastDate = new Date();
        pastDate.setFullYear(now.getFullYear() - 1);
        const pastStr = toDateInputStr(pastDate);

        const q = query(
          collection(db, 'attendanceRecords'),
          where('date', '>=', pastStr),
          orderBy('date', 'asc')
        );
        const snap = await getDocs(q);
        const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
        setAllRecords(recs);

      } catch (e) {
        console.error(e);
        toast.error("データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- AI分析実行 ---
  const handleRunAI = async (type: 'summary' | 'user', contextData: any) => {
    setIsAiLoading(true);
    setAiComment('');
    try {
      const contextStr = JSON.stringify(contextData, null, 2);
      const res = await fetch('/api/analysis/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: contextStr, type })
      });
      const data = await res.json();
      setAiComment(data.comment);
    } catch (e) {
      toast.error("AI分析に失敗しました");
    } finally {
      setIsAiLoading(false);
    }
  };

  // ==========================================
  // ① サマリー分析ロジック
  // ==========================================
  const summaryData = useMemo(() => {
    if (allRecords.length === 0) return null;

    // フィルタリング
    const filtered = allRecords.filter(r => r.date >= startDate && r.date <= endDate);

    // A. 月別推移 & 利用率
    const monthlyStats: Record<string, { month: string; houkago: number; kyuko: number; absence: number }> = {};
    
    filtered.forEach(rec => {
      const m = rec.month;
      if (!monthlyStats[m]) monthlyStats[m] = { month: m, houkago: 0, kyuko: 0, absence: 0 };
      
      if (rec.usageStatus === '放課後') monthlyStats[m].houkago++;
      else if (rec.usageStatus === '休校日') monthlyStats[m].kyuko++;
      else if (rec.usageStatus === '欠席') monthlyStats[m].absence++;
    });

    const monthlyChartData = Object.values(monthlyStats)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(d => {
        const total = d.houkago + d.kyuko + d.absence;
        const usage = d.houkago + d.kyuko;
        const rate = total > 0 ? Math.round((usage / total) * 100) : 0;
        return { ...d, rate };
      });

    // B. 個人別ランキング (利用回数)
    const userRanking: Record<string, number> = {};
    filtered.forEach(rec => {
      if (rec.usageStatus !== '欠席') {
        userRanking[rec.userName] = (userRanking[rec.userName] || 0) + 1;
      }
    });
    // TOP10を抽出
    const rankingChartData = Object.entries(userRanking)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // C. 欠席理由分析
    const absenceReasonStats: Record<string, number> = {};
    filtered.forEach(rec => {
      if (rec.usageStatus === '欠席') {
        const r = rec.reason || '不明・その他';
        absenceReasonStats[r] = (absenceReasonStats[r] || 0) + 1;
      }
    });
    const absenceChartData = Object.entries(absenceReasonStats)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { monthlyChartData, rankingChartData, absenceChartData, totalCount: filtered.length };
  }, [allRecords, startDate, endDate]);


  // ==========================================
  // ② ユーザー分析ロジック
  // ==========================================
  const userData = useMemo(() => {
    if (!selectedUserId || allRecords.length === 0) return null;

    const myRecords = allRecords.filter(r => r.userId === selectedUserId);
    const user = users.find(u => u.id === selectedUserId);
    
    // A. 月別利用推移
    const monthlyStats: Record<string, { month: string; usage: number; absence: number }> = {};
    myRecords.forEach(rec => {
      if (!monthlyStats[rec.month]) monthlyStats[rec.month] = { month: rec.month, usage: 0, absence: 0 };
      if (rec.usageStatus === '欠席') monthlyStats[rec.month].absence++;
      else monthlyStats[rec.month].usage++;
    });
    const monthlyChartData = Object.values(monthlyStats).sort((a, b) => a.month.localeCompare(b.month));

    // B. 欠席理由の内訳
    const reasonStats: Record<string, number> = {};
    myRecords.forEach(rec => {
      if (rec.usageStatus === '欠席') {
        const r = rec.reason || 'その他';
        reasonStats[r] = (reasonStats[r] || 0) + 1;
      }
    });
    const reasonChartData = Object.entries(reasonStats).map(([name, value]) => ({ name, value }));

    return { user, monthlyChartData, reasonChartData, totalVisits: myRecords.filter(r => r.usageStatus !== '欠席').length };
  }, [selectedUserId, allRecords, users]);


  return (
    <AppLayout pageTitle="AI分析">
      <div className="flex flex-col h-full space-y-6">
        
        {/* タブ切り替え */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
          {['summary', 'user', 'training'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab as any); setAiComment(''); }}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'summary' ? 'サマリー分析' : tab === 'user' ? 'ユーザー分析' : 'トレーニング分析'}
            </button>
          ))}
        </div>

        {/* ========================================== */}
        {/* ① サマリー分析画面 */}
        {/* ========================================== */}
        {activeTab === 'summary' && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            {/* フィルター＆AIボタン */}
            <div className="flex flex-wrap justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200 gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-600">期間指定:</span>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                  className="border p-2 rounded-md text-sm" 
                />
                <span className="text-gray-400">~</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                  className="border p-2 rounded-md text-sm" 
                />
              </div>
              <button 
                onClick={() => handleRunAI('summary', summaryData)}
                disabled={isAiLoading || !summaryData || summaryData.totalCount === 0}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md transition-transform active:scale-95 disabled:bg-gray-300"
              >
                {isAiLoading ? 'AI思考中...' : '✨ AI分析を実行'}
              </button>
            </div>

            {/* AIコメント表示エリア (最上部に配置) */}
            {aiComment && (
              <div className="bg-purple-50 border border-purple-200 p-6 rounded-2xl shadow-sm">
                <h3 className="text-purple-800 font-bold mb-2 flex items-center">
                  <span className="text-2xl mr-2">🤖</span> AIコンサルタントからの分析レポート
                </h3>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap bg-white p-4 rounded-xl border border-purple-100">
                  {aiComment}
                </div>
              </div>
            )}

            {summaryData && summaryData.totalCount > 0 ? (
              <>
                {/* 1段目: 月別推移 & 利用率 (複合グラフ) */}
                <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                  <h3 className="text-gray-600 font-bold mb-4">月別コマ数・欠席数・利用率推移</h3>
                  <div className="flex-1 w-full min-h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={summaryData.monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{fontSize: 12}} />
                        <YAxis yAxisId="left" label={{ value: '回数', angle: -90, position: 'insideLeft' }} />
                        <YAxis yAxisId="right" orientation="right" label={{ value: '利用率(%)', angle: 90, position: 'insideRight' }} />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="houkago" name="放課後" stackId="a" fill="#3B82F6" />
                        <Bar yAxisId="left" dataKey="kyuko" name="休校日" stackId="a" fill="#F59E0B" />
                        <Bar yAxisId="left" dataKey="absence" name="欠席" stackId="a" fill="#EF4444" />
                        <Line yAxisId="right" type="monotone" dataKey="rate" name="利用率" stroke="#10B981" strokeWidth={3} dot={{r:4}} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2段目: ランキング & 欠席理由 (2カラム) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 個人別ランキング */}
                  <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                    <h3 className="text-gray-600 font-bold mb-4">利用回数ランキング (TOP10)</h3>
                    <div className="flex-1 w-full min-h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={summaryData.rankingChartData} margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11}} />
                          <Tooltip />
                          <Bar dataKey="count" name="回数" fill="#8884d8" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 欠席理由分析 */}
                  <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                    <h3 className="text-gray-600 font-bold mb-4">欠席理由の内訳</h3>
                    <div className="flex-1 w-full min-h-[250px]">
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
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                指定された期間のデータがありません
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* ② ユーザー分析画面 */}
        {/* ========================================== */}
        {activeTab === 'user' && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-wrap justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200 gap-4">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-sm font-bold text-gray-600">利用者選択:</span>
                <select 
                  value={selectedUserId} 
                  onChange={(e) => { setSelectedUserId(e.target.value); setAiComment(''); }}
                  className="p-2 border rounded-md text-sm flex-1"
                >
                  <option value="">選択してください</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => handleRunAI('user', userData)}
                disabled={isAiLoading || !userData}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md transition-transform active:scale-95 disabled:bg-gray-300"
              >
                {isAiLoading ? 'AI思考中...' : '✨ AI分析を実行'}
              </button>
            </div>

            {/* AIコメントエリア */}
            {aiComment && (
              <div className="bg-purple-50 border border-purple-200 p-6 rounded-2xl shadow-sm">
                <h3 className="text-purple-800 font-bold mb-2 flex items-center">
                  <span className="text-2xl mr-2">🤖</span> AI児発管からのアドバイス
                </h3>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap bg-white p-4 rounded-xl border border-purple-100">
                  {aiComment}
                </div>
              </div>
            )}

            {userData ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 利用推移 */}
                  <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                    <h3 className="text-gray-600 font-bold mb-4">{userData.user?.lastName}さんの利用推移</h3>
                    <div className="flex-1 w-full min-h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={userData.monthlyChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tick={{fontSize: 10}} />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="usage" name="利用回数" stroke="#3B82F6" strokeWidth={2} />
                          <Line type="monotone" dataKey="absence" name="欠席回数" stroke="#EF4444" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 欠席理由の内訳 */}
                  <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                    <h3 className="text-gray-600 font-bold mb-4">欠席理由の内訳</h3>
                    <div className="flex-1 w-full min-h-[250px]">
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
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                利用者を選択すると分析データが表示されます
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* ③ トレーニング分析 (工事中) */}
        {/* ========================================== */}
        {activeTab === 'training' && (
          <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 text-gray-400 animate-in fade-in">
            <span className="text-6xl mb-4">🚧</span>
            <h2 className="text-xl font-bold">トレーニング分析は準備中です</h2>
            <p className="mt-2 text-sm">個別支援計画と連動した成長分析機能を実装予定です。</p>
          </div>
        )}

      </div>
    </AppLayout>
  );
}