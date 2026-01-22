"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { MonitoringRecord } from '@/types/monitoring';
import toast from 'react-hot-toast';
import MonitoringPDFDownloadButton from '@/components/pdf/MonitoringPDFDownloadButton'; // ★追加

export default function MonitoringListPage() {
  const router = useRouter();
  const [records, setRecords] = useState<MonitoringRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // データ取得
  const fetchRecords = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'monitoringRecords'), orderBy('creationDate', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MonitoringRecord[];
      
      setRecords(data);
    } catch (error) {
      console.error("取得エラー:", error);
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // 削除処理
  const handleDelete = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'monitoringRecords', id));
      toast.success('削除しました');
      fetchRecords();
    } catch (error) {
      console.error("削除エラー:", error);
      toast.error('削除に失敗しました');
    }
  };

  return (
    <AppLayout pageTitle="モニタリング一覧">
      <div className="space-y-6">
        <div className="flex justify-end">
          <button 
            onClick={() => router.push('/support/monitoring/new')}
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
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">モニタリング作成日</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">作成者</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.map((rec) => (
                <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                    {rec.userName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {rec.creationDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {rec.author}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-3 items-center">
                      
                      {/* ★追加: PDFボタン (planやuserは内部で取得するので不要) */}
                      <MonitoringPDFDownloadButton monitoring={rec} />

                      <button 
                        onClick={() => rec.id && router.push(`/support/monitoring/${rec.id}`)}
                        className="text-blue-600 hover:text-blue-900 bg-blue-50 p-2 rounded hover:bg-blue-100 transition-colors"
                        title="編集"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                      <button 
                        onClick={() => rec.id && handleDelete(rec.id)}
                        className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded hover:bg-red-100 transition-colors"
                        title="削除"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {records.length === 0 && !loading && (
                <tr><td colSpan={4} className="p-8 text-center text-gray-500">データがありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}