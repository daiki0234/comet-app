"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<'summary' | 'user' | 'training'>('summary');
  const [loading, setLoading] = useState(false);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  // フィルター用
  const [rangeMonths, setRangeMonths] = useState(6); // 過去nヶ月
  const [selectedUserId, setSelectedUserId] = useState('');

  // AIコメント
  const [aiComment, setAiComment] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- 初期データ取得 ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. ユーザー一覧
        const userSnap = await getDocs(collection(db, 'users'));
        const userList = userSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));
        
        // ★ 修正: lastNameがない場合のエラー回避 (|| '' を追加)
        userList.sort((a, b) => (a.lastName || '').localeCompare((b.lastName || ''), 'ja'));
        
        setUsers(userList);

        // 2. 出欠データ (過去1年分くらい一括取得しておく)
        const now = new Date();
        const pastDate = new Date();
        pastDate.setFullYear(now.getFullYear() - 1);
        const pastStr = pastDate.toISOString().split('T')[0];

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

    // A. 月別推移 (過去 nヶ月)
    const monthlyStats: Record<string, { month: string; houkago: number; kyuko: number; absence: number }> = {};
    
    const now = new Date();
    const targetDate = new Date();
    targetDate.setMonth(now.getMonth() - rangeMonths);
    const targetStr = targetDate.toISOString().slice(0, 7); // YYYY-MM

    allRecords.forEach(rec => {
      if (rec.month < targetStr) return;
      
      if (!monthlyStats[rec.month]) {
        monthlyStats[rec.month] = { month: rec.month, houkago: 0, kyuko: 0, absence: 0 };
      }
      if (rec.usageStatus === '放課後') monthlyStats[rec.month].houkago++;
      else if (rec.usageStatus === '休校日') monthlyStats[rec.month].kyuko++;
      else if (rec.usageStatus === '欠席') monthlyStats[rec.month].absence++;
    });

    // ★ 修正: ソート時のエラー回避 (|| '' を追加)
    const monthlyChartData = Object.values(monthlyStats).sort((a, b) => (a.month || '').localeCompare((b.month || '')));

    // B. 曜日別欠席数
    const dayOfWeekStats: Record<string, number> = { 'Sun':0, 'Mon':0, 'Tue':0, 'Wed':0, 'Thu':0, 'Fri':0, 'Sat':0 };
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNamesJP = ['日', '月', '火', '水', '木', '金', '土'];

    allRecords.forEach(rec => {
      if (rec.month < targetStr) return;
      if (rec.usageStatus === '欠席') {
        const d = new Date(rec.date);
        const dayName = dayLabels[d.getDay()];
        if (dayOfWeekStats[dayName] !== undefined) {
          dayOfWeekStats[dayName]++;
        }
      }
    });

    const dayChartData = dayLabels.map((day, i) => ({
      name: dayNamesJP[i],
      count: dayOfWeekStats[day]
    }));

    return { monthlyChartData, dayChartData };
  }, [allRecords, rangeMonths]);


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
    // ★ 修正: ソート時のエラー回避
    const monthlyChartData = Object.values(monthlyStats).sort((a, b) => (a.month || '').localeCompare((b.month || '')));

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
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-600">期間:</span>
                <select 
                  value={rangeMonths} 
                  onChange={(e) => setRangeMonths(Number(e.target.value))}
                  className="p-2 border rounded-md text-sm"
                >
                  <option value={3}>過去3ヶ月</option>
                  <option value={6}>過去6ヶ月</option>
                  <option value={12}>過去1年</option>
                </select>
              </div>
              <button 
                onClick={() => handleRunAI('summary', summaryData)}
                disabled={isAiLoading || !summaryData}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md transition-transform active:scale-95 disabled:bg-gray-300"
              >
                {isAiLoading ? 'AI思考中...' : '✨ AI分析を実行'}
              </button>
            </div>

            {/* グラフエリア */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 月別推移 */}
              <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                <h3 className="text-gray-600 font-bold mb-4">月別コマ数推移</h3>
                {/* ★ 修正: コンテナに明示的な高さを指定 */}
                <div className="flex-1 w-full min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summaryData?.monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{fontSize: 10}} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="houkago" name="放課後" stackId="a" fill="#3B82F6" radius={[0, 0, 4, 4]} />
                      <Bar dataKey="kyuko" name="休校日" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 曜日別欠席 */}
              <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                <h3 className="text-gray-600 font-bold mb-4">曜日別 欠席回数</h3>
                {/* ★ 修正: コンテナに明示的な高さを指定 */}
                <div className="flex-1 w-full min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summaryData?.dayChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" name="欠席数" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* AIコメント表示エリア */}
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

            {userData ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 利用推移 */}
                  <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 flex flex-col">
                    <h3 className="text-gray-600 font-bold mb-4">{userData.user?.lastName}さんの利用推移</h3>
                    {/* ★ 修正: コンテナに明示的な高さを指定 */}
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
                    {/* ★ 修正: コンテナに明示的な高さを指定 */}
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
                            label
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