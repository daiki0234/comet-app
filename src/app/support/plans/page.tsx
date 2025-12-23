"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { SupportPlan } from '@/types/plan'; // 修正した型定義をインポート
import toast from 'react-hot-toast';

export default function PlanListPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<SupportPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // データ取得
  const fetchPlans = async () => {
    try {
      setLoading(true);
      // 作成日順などでソート
      const q = query(collection(db, 'supportPlans'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SupportPlan[];
      
      setPlans(data);
    } catch (error) {
      console.error("取得エラー:", error);
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  // 削除処理
  const handleDelete = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'supportPlans', id));
      toast.success('計画書を削除しました');
      fetchPlans(); // リストを再取得
    } catch (error) {
      console.error("削除エラー:", error);
      toast.error('削除に失敗しました');
    }
  };

  return (
    <AppLayout pageTitle="個別支援計画一覧">
      <div className="space-y-6">
        <div className="flex justify-end">
          <button 
            onClick={() => router.push('/support/plans/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            新規作成
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">利用者名</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">作成日</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ステータス</th>
                {/* 以前のエラーにあった期間表示が必要ならヘッダーに追加 */}
                {/* <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">計画期間</th> */}
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">作成者</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold text-gray-900">{plan.userName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">
                      {/* 文字列の日付をそのまま表示、またはDate変換して表示 */}
                      {plan.creationDate ? new Date(plan.creationDate).toLocaleDateString('ja-JP') : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      plan.status === '本番' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {plan.status}
                    </span>
                  </td>
                  
                  {/* もし計画期間を表示するならここに追加 (型定義に追加した periodStart/End を使用) */}
                  {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                     {plan.periodStart || '-'} 〜 {plan.periodEnd || '-'}
                  </td> 
                  */}

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {plan.author}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-3">
                      <button 
                        // ★修正: idがある場合のみ遷移
                        onClick={() => plan.id && router.push(`/support/plans/${plan.id}`)}
                        className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1.5 rounded"
                        title="編集"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                      <button 
                        // ★修正: idがある場合のみ削除関数を実行 (型エラー解消)
                        onClick={() => plan.id && handleDelete(plan.id)}
                        className="text-red-600 hover:text-red-900 bg-red-50 p-1.5 rounded"
                        title="削除"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {plans.length === 0 && !loading && (
             <div className="p-8 text-center text-gray-500">計画書がまだありません</div>
          )}
           
          {loading && (
             <div className="p-8 text-center text-gray-500">読み込み中...</div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}