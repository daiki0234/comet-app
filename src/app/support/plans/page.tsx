"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { SupportPlan } from '@/types/plan';
import { UserData } from '@/types/billing';
import toast from 'react-hot-toast';
import { PlanPDFDownloadButton } from '@/components/pdf/PlanPDFDownloadButton';

const ITEMS_PER_PAGE = 10;

export default function PlanListPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<SupportPlan[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 検索・ページネーション用ステート
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // マスタデータ
  const [usersMap, setUsersMap] = useState<Record<string, UserData>>({});
  const [managerName, setManagerName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const q = query(collection(db, 'supportPlans'), orderBy('creationDate', 'desc'));
      const snapshot = await getDocs(q);
      
      const plansData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SupportPlan[];

      setPlans(plansData);

      const [usersSnap, adminsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'admins'))
      ]);

      const usersObj: Record<string, UserData> = {};
      usersSnap.docs.forEach(doc => {
        usersObj[doc.id] = { id: doc.id, ...doc.data() } as UserData;
      });
      setUsersMap(usersObj);

      const adminDocs = adminsSnap.docs.map(d => d.data());
      const manager = adminDocs.find((d: any) => d.jobTitle === 'child_dev_manager');
      setManagerName(manager?.name || '');

    } catch (error) {
      console.error("取得エラー:", error);
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'supportPlans', id));
      toast.success('計画書を削除しました');
      setPlans(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error("削除エラー:", error);
      toast.error('削除に失敗しました');
    }
  };

  // --- フィルタリング & ページネーション処理 ---
  const filteredPlans = useMemo(() => {
    let res = plans;
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase().trim();
      res = res.filter(p => 
        (p.userName && p.userName.toLowerCase().includes(lowerQ)) ||
        (p.author && p.author.toLowerCase().includes(lowerQ))
      );
    }
    return res;
  }, [plans, searchQuery]);

  const paginatedPlans = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPlans.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPlans, currentPage]);

  const totalPages = Math.ceil(filteredPlans.length / ITEMS_PER_PAGE);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  // --- アラート判定ロジック ---
  const isAlertTarget = (dateVal: any) => {
    if (!dateVal) return false;
    const d = typeof dateVal === 'string' ? new Date(dateVal) : (dateVal.toDate ? dateVal.toDate() : new Date(dateVal));
    if (isNaN(d.getTime())) return false;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const createdYear = d.getFullYear();
    const createdMonth = d.getMonth();

    let targetMonth = createdMonth + 6;
    let targetYear = createdYear;
    
    if (targetMonth > 11) {
      targetYear += Math.floor(targetMonth / 12);
      targetMonth = targetMonth % 12;
    }

    return currentYear === targetYear && currentMonth === targetMonth;
  };

  const alertPlans = useMemo(() => {
    const finals: SupportPlan[] = [];
    const drafts: SupportPlan[] = [];

    plans.forEach(plan => {
      if (isAlertTarget(plan.creationDate)) {
        if (plan.status === '本番') {
          finals.push(plan);
        } else if (plan.status === '原案') {
          drafts.push(plan);
        }
      }
    });

    return { finals, drafts };
  }, [plans]);

  const hasFinals = alertPlans.finals.length > 0;
  const hasDrafts = alertPlans.drafts.length > 0;

  return (
    <AppLayout pageTitle="個別支援計画一覧">
      <div className="space-y-6">

        {/* --- アラート表示エリア --- */}
        {(hasFinals || hasDrafts) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 原案プランのアラート (黄色) - 左側 */}
            {hasDrafts && (
              <div className={`${!hasFinals ? 'md:col-span-2' : ''} bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg shadow-sm flex items-start`}>
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 w-full">
                  {/* ★修正箇所: 原案のメッセージ */}
                  <h3 className="text-sm font-bold text-yellow-800">
                    【原案】の作成時期に該当する利用者が{alertPlans.drafts.length}名います
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700 max-h-32 overflow-y-auto">
                    <ul className="list-disc list-inside space-y-1">
                      {alertPlans.drafts.map(plan => (
                        <li key={plan.id}>
                          <span className="font-bold">{plan.userName}</span>
                          <span className="ml-2 text-xs">
                            (作成日: {plan.creationDate ? new Date(plan.creationDate as string).toLocaleDateString() : '-'})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* 本番プランのアラート (赤色) - 右側 */}
            {hasFinals && (
              <div className={`${!hasDrafts ? 'md:col-span-2' : ''} bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-start`}>
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 w-full">
                  {/* ★修正箇所: 本番のメッセージ */}
                  <h3 className="text-sm font-bold text-red-800">
                    【本番】の計画作成時期に該当する利用者が{alertPlans.finals.length}名います
                  </h3>
                  <div className="mt-2 text-sm text-red-700 max-h-32 overflow-y-auto">
                    <ul className="list-disc list-inside space-y-1">
                      {alertPlans.finals.map(plan => (
                        <li key={plan.id}>
                          <span className="font-bold">{plan.userName}</span> 
                          <span className="ml-2 text-xs">
                            (作成日: {plan.creationDate ? new Date(plan.creationDate as string).toLocaleDateString() : '-'})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ヘッダーエリア: 検索窓 & 新規作成ボタン */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="relative w-full md:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="利用者名・作成者で検索..."
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <span className="text-sm text-gray-500 whitespace-nowrap">
              {filteredPlans.length} 件中 {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredPlans.length)} 件表示
            </span>
            <button 
              onClick={() => router.push('/support/plans/new')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2 whitespace-nowrap"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              新規作成
            </button>
          </div>
        </div>

        {/* テーブルエリア */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">利用者名</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">作成日</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ステータス</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">作成者</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPlans.map((plan) => {
                const targetUser = usersMap[plan.userId] || null;
                let dateStr = '-';
                if (plan.creationDate) {
                   const d = typeof plan.creationDate === 'string' ? new Date(plan.creationDate) : (plan.creationDate as any).toDate ? (plan.creationDate as any).toDate() : new Date(plan.creationDate);
                   dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('ja-JP') : '-';
                }
                
                return (
                  <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900">{plan.userName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{dateStr}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        plan.status === '本番' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {plan.author}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-3">
                        {targetUser && (
                          <PlanPDFDownloadButton 
                            plan={plan} 
                            user={targetUser} 
                            managerName={managerName} 
                          />
                        )}
                        <button 
                          onClick={() => plan.id && router.push(`/support/plans/${plan.id}`)}
                          className="text-blue-600 hover:text-blue-900 bg-blue-50 p-2 rounded hover:bg-blue-100 transition-colors"
                          title="編集"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button 
                          onClick={() => plan.id && handleDelete(plan.id)}
                          className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded hover:bg-red-100 transition-colors"
                          title="削除"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {filteredPlans.length === 0 && !loading && (
             <div className="p-12 text-center text-gray-500">
                {searchQuery ? '検索条件に一致する計画書はありません' : '計画書がまだありません'}
             </div>
          )}
          
          {loading && (
             <div className="p-12 text-center text-gray-500">読み込み中...</div>
          )}

          {!loading && totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  前へ
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  次へ
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-center">
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  </button>
                  {[...Array(totalPages)].map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i + 1)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        currentPage === i + 1
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                  </button>
                </nav>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}