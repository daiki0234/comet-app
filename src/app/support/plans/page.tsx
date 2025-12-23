"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { SupportPlan } from '@/types/plan';
import { UserData } from '@/types/billing'; // UserDataの型定義
import toast from 'react-hot-toast';
import { PlanPDFDownloadButton } from '@/components/pdf/PlanPDFDownloadButton'; // PDFボタン

export default function PlanListPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<SupportPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // PDF生成に必要な追加データ
  const [usersMap, setUsersMap] = useState<Record<string, UserData>>({});
  const [managerName, setManagerName] = useState('');

  // データ取得
  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. 計画書一覧を取得
      const plansQ = query(collection(db, 'supportPlans'), orderBy('createdAt', 'desc'));
      const plansSnap = await getDocs(plansQ);
      const plansData = plansSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SupportPlan[];

      // 2. 利用者マスタを取得 (PDFに必要な詳細情報のため)
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersObj: Record<string, UserData> = {};
      usersSnap.docs.forEach(doc => {
        usersObj[doc.id] = { id: doc.id, ...doc.data() } as UserData;
      });

      // 3. 職員マスタから児発管の名前を取得
      const adminsSnap = await getDocs(collection(db, 'admins'));
      const adminDocs = adminsSnap.docs.map(d => d.data());
      const manager = adminDocs.find((d: any) => d.jobTitle === 'child_dev_manager');
      const mgrName = manager && manager.name ? manager.name : '';

      // ステート更新
      setPlans(plansData);
      setUsersMap(usersObj);
      setManagerName(mgrName);

    } catch (error) {
      console.error("取得エラー:", error);
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 削除処理
  const handleDelete = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'supportPlans', id));
      toast.success('計画書を削除しました');
      fetchData(); // リストを再取得
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
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">作成者</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {plans.map((plan) => {
                // この計画書の利用者データを特定
                const targetUser = usersMap[plan.userId] || null;

                return (
                  <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900">{plan.userName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {plan.author}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-3">
                        
                        {/* ★追加: PDF作成ボタン (利用者データがある場合のみ表示) */}
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