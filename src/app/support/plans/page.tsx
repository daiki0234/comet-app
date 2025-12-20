"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, orderBy, doc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { SupportPlan } from '@/types/plan';
import { UserData } from '@/types/billing';

export default function PlanListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<(SupportPlan & { userName: string })[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  
  // 検索用ステート
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPlans, setFilteredPlans] = useState<(SupportPlan & { userName: string })[]>([]);
  
  // 候補表示用
  const [showSuggestions, setShowSuggestions] = useState(false);

  // データ取得
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. 利用者マスタ取得
        const usersSnap = await getDocs(collection(db, 'users'));
        const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
        setUsers(usersData);

        // 2. 計画書データ取得
        const plansRef = collection(db, 'supportPlans');
        const q = query(plansRef, orderBy('createdAt', 'desc')); // 新しい順
        const plansSnap = await getDocs(q);
        
        // 計画書に利用者名を結合
        const plansData = plansSnap.docs.map(d => {
          const data = d.data() as SupportPlan;
          const user = usersData.find(u => u.id === data.userId);
          const userName = user ? `${user.lastName} ${user.firstName}` : '不明な利用者';
          
          return {
            id: d.id,
            ...data,
            userName
          };
        });

        setPlans(plansData);
        setFilteredPlans(plansData);
      } catch (e) {
        console.error(e);
        toast.error("データの読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 検索フィルタリング処理
  useEffect(() => {
    if (!searchTerm) {
      setFilteredPlans(plans);
      return;
    }
    const lowerTerm = searchTerm.toLowerCase();
    const filtered = plans.filter(p => 
      p.userName.toLowerCase().includes(lowerTerm)
    );
    setFilteredPlans(filtered);
  }, [searchTerm, plans]);

  // 新規作成ハンドラ
  const handleCreateNew = () => {
    // ディレクトリ構成に合わせてパスを変更
    router.push('/support/plans/new');
  };

  // 削除ハンドラ（仮）
  const handleDelete = async (planId: string) => {
    if (!confirm("本当にこの計画書を削除しますか？")) return;
    try {
      await deleteDoc(doc(db, 'supportPlans', planId));
      setPlans(prev => prev.filter(p => p.id !== planId));
      toast.success("削除しました");
    } catch (e) {
      toast.error("削除失敗");
    }
  };

  // 検索候補のクリック
  const handleSelectUser = (userName: string) => {
    setSearchTerm(userName);
    setShowSuggestions(false);
  };

  return (
    <AppLayout pageTitle="個別支援計画管理">
      <div className="space-y-6">
        
        {/* コントロールパネル */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            
            {/* 検索窓 (候補表示機能付き) */}
            <div className="relative w-full md:w-96">
              <label className="block text-sm font-bold text-gray-700 mb-1">利用者検索</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="利用者名を入力..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  // onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // リンククリック対応のため遅延
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 pl-10"
                />
                <svg className="absolute left-3 top-2.5 text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                
                {/* 候補リスト */}
                {showSuggestions && searchTerm && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                    {users.filter(u => `${u.lastName} ${u.firstName}`.includes(searchTerm)).map(u => (
                      <div 
                        key={u.id}
                        onClick={() => handleSelectUser(`${u.lastName} ${u.firstName}`)}
                        className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                      >
                        {u.lastName} {u.firstName}
                      </div>
                    ))}
                    {users.filter(u => `${u.lastName} ${u.firstName}`.includes(searchTerm)).length === 0 && (
                      <div className="px-4 py-2 text-gray-400 text-sm">該当なし</div>
                    )}
                    {/* 閉じるためのオーバーレイ的な要素 */}
                    <div className="border-t p-1 text-center">
                       <button onClick={() => setShowSuggestions(false)} className="text-xs text-blue-500">閉じる</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 新規作成ボタン */}
            <button 
              onClick={handleCreateNew}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg shadow-md flex items-center gap-2 transition-transform active:scale-95"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              新規計画作成
            </button>
          </div>
        </div>

        {/* 計画一覧テーブル */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
              <tr>
                <th className="px-6 py-3">利用者名</th>
                <th className="px-6 py-3 text-center">状態</th>
                <th className="px-6 py-3">計画期間</th>
                <th className="px-6 py-3">作成日</th>
                <th className="px-6 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">読み込み中...</td></tr>
              ) : filteredPlans.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">計画書が見つかりません</td></tr>
              ) : (
                filteredPlans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-bold text-gray-800">
                      {plan.userName}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        plan.status === '本番' 
                          ? 'bg-green-100 text-green-800 border border-green-200' 
                          : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                      }`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {plan.periodStart} 〜 {plan.periodEnd}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {plan.createdAt?.toDate().toLocaleDateString('ja-JP') || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-3">
                        <Link 
                          // ディレクトリ構成に合わせてパスを変更
                          href={`/support/plans/${plan.id}`}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold text-xs border border-blue-200 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          編集
                        </Link>
                        <button 
                          onClick={() => toast("PDF出力機能は編集中ページで実装します")}
                          className="flex items-center gap-1 text-gray-600 hover:text-gray-800 font-bold text-xs border border-gray-200 bg-gray-50 px-3 py-1.5 rounded hover:bg-gray-100 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                          PDF
                        </button>
                        <button 
                          onClick={() => handleDelete(plan.id)}
                          className="text-red-400 hover:text-red-600 p-1"
                          title="削除"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </td>
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