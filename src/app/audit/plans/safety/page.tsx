"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { SafetyPlan } from '@/types/audit';
import toast from 'react-hot-toast';

// ★修正: インポート先を lib に変更
import { generateSafetyPlanPdf } from '@/lib/generateSafetyPlanPdf';

export default function SafetyPlanListPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<SafetyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const fetchPlans = async () => {
    try {
      const q = query(collection(db, 'safetyPlans'), orderBy('fiscalYear', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SafetyPlan));
      setPlans(data);
    } catch (e) {
      console.error(e);
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'safetyPlans', id));
      toast.success('削除しました');
      fetchPlans();
    } catch (e) {
      console.error(e);
      toast.error('削除に失敗しました');
    }
  };

  const handleDownloadPdf = async (plan: SafetyPlan) => {
    if (!plan.id) return;
    try {
      setPdfLoadingId(plan.id);
      await generateSafetyPlanPdf(plan);
      toast.success('PDFをダウンロードしました');
    } catch (e) {
      console.error(e);
      toast.error('PDF作成に失敗しました');
    } finally {
      setPdfLoadingId(null);
    }
  };

  return (
    <AppLayout pageTitle="安全計画 管理">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-700">作成済み計画一覧</h2>
          <button 
            onClick={() => router.push('/audit/plans/safety/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700 flex items-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            新規作成
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">年度</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">事業所名</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">作成日</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                    令和{plan.fiscalYear - 2018}年度 ({plan.fiscalYear})
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {plan.facilityName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {plan.createdAt?.toDate().toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => handleDownloadPdf(plan)}
                        disabled={pdfLoadingId === plan.id}
                        className={`px-3 py-1 rounded flex items-center gap-1 ${
                          pdfLoadingId === plan.id 
                            ? 'bg-gray-100 text-gray-400' 
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                        title="PDFをダウンロード"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        {pdfLoadingId === plan.id ? '...' : 'PDF'}
                      </button>
                      <button 
                        onClick={() => router.push(`/audit/plans/safety/${plan.id}`)}
                        className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded"
                      >
                        編集
                      </button>
                      <button 
                        onClick={() => plan.id && handleDelete(plan.id)}
                        className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && !loading && (
                <tr><td colSpan={4} className="p-8 text-center text-gray-500">計画が見つかりません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}