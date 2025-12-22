"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, orderBy, where, deleteDoc, doc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { UserData } from '@/types/billing';
// import { SupportRecord } from '@/types/record'; // 必要に応じて型定義ファイルをインポート

// 表示件数
const ITEMS_PER_PAGE = 30;

export default function SupportRecordListPage() {
  const router = useRouter();
  
  // --- ステート ---
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]); // 全データ
  const [users, setUsers] = useState<UserData[]>([]);
  
  // フィルタリング条件
  const [filterUser, setFilterUser] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // 今月初日
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(0); // 今月末日
    return d.toISOString().slice(0, 10);
  });

  // ページネーション
  const [currentPage, setCurrentPage] = useState(1);

  // --- データ取得 ---
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. 利用者マスタ取得
      const uSnap = await getDocs(collection(db, 'users'));
      setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));

      // 2. 記録データ取得 (日付でソート)
      // 本来は日付範囲でクエリを絞るべきですが、複合インデックスの手間を省くため
      // 一旦全件(またはある程度)取得してクライアント側でフィルタリングするか、
      // ここではシンプルに「日付順」で取得して、メモリ上でフィルタします。
      // (データ量が増えたら where('date', '>=', startDate) 等を追加してください)
      const q = query(collection(db, 'supportRecords'), orderBy('date', 'desc'));
      const rSnap = await getDocs(q);
      
      const list = rSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setRecords(list);

    } catch (e) {
      console.error(e);
      toast.error("データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- フィルタリング & ページネーション処理 ---
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // 日付フィルタ
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      // 利用者フィルタ
      if (filterUser && r.userId !== filterUser) return false;
      return true;
    });
  }, [records, startDate, endDate, filterUser]);

  // 現在のページに表示するデータ
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecords.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRecords, currentPage]);

  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);

  // --- ハンドラ ---
  const handleDelete = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;
    try {
      await deleteDoc(doc(db, 'supportRecords', id));
      setRecords(prev => prev.filter(r => r.id !== id));
      toast.success("削除しました");
    } catch (e) {
      toast.error("削除失敗");
    }
  };

  return (
    <AppLayout pageTitle="支援記録一覧">
      <div className="space-y-6">
        
        {/* --- 検索フィルター & 新規作成 --- */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
          
          <div className="flex flex-wrap items-end gap-4 w-full md:w-auto">
            {/* 利用者選択 */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-500 mb-1">利用者</label>
              <select 
                value={filterUser} 
                onChange={(e) => { setFilterUser(e.target.value); setCurrentPage(1); }} 
                className="border p-2 rounded text-sm min-w-[150px]"
              >
                <option value="">全ての利用者</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>
                ))}
              </select>
            </div>

            {/* 期間選択 */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-500 mb-1">期間</label>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                  className="border p-2 rounded text-sm" 
                />
                <span className="text-gray-400">〜</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                  className="border p-2 rounded text-sm" 
                />
              </div>
            </div>

            {/* 検索ボタン (実質リセットや再取得用だが、今回はリアルタイムフィルタなので飾りor再取得) */}
            <button 
              onClick={fetchData} 
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded text-sm font-bold flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
              更新
            </button>
          </div>

          {/* 新規作成ボタン */}
          <Link 
            href="/support/records/new"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg shadow-md flex items-center gap-2 transition-transform active:scale-95 whitespace-nowrap"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            新規作成
          </Link>
        </div>

        {/* --- 一覧テーブル --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                <tr>
                  <th className="px-6 py-3">支援日</th>
                  <th className="px-6 py-3">利用者名</th>
                  <th className="px-6 py-3 text-center">利用状況</th>
                  <th className="px-6 py-3 text-center">開始時間</th>
                  <th className="px-6 py-3 text-center">終了時間</th>
                  <th className="px-6 py-3 text-center">算定時間数</th>
                  <th className="px-6 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-500">読み込み中...</td></tr>
                ) : paginatedRecords.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-500">データが見つかりません</td></tr>
                ) : (
                  paginatedRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-bold text-gray-800">
                        {new Date(r.date).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="px-6 py-4">
                        {r.userName}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          r.status === '欠席' ? 'bg-red-100 text-red-700' :
                          r.status === '休校日利用' ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-gray-600">
                        {r.startTime || '-'}
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-gray-600">
                        {r.endTime || '-'}
                      </td>
                      <td className="px-6 py-4 text-center font-bold">
                        {r.duration ? `${r.duration}h` : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <Link 
                            href={`/support/records/${r.id}`}
                            className="bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 font-bold text-xs px-3 py-1.5 rounded transition-colors"
                          >
                            編集
                          </Link>
                          <button 
                            onClick={() => handleDelete(r.id)}
                            className="text-gray-400 hover:text-red-500 p-1"
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
          
          {/* --- ページネーション --- */}
          {totalPages > 1 && (
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    全 <span className="font-medium">{filteredRecords.length}</span> 件中 
                    <span className="font-medium"> {(currentPage - 1) * ITEMS_PER_PAGE + 1} </span> 〜 
                    <span className="font-medium"> {Math.min(currentPage * ITEMS_PER_PAGE, filteredRecords.length)} </span> 件を表示
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${currentPage === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                      <span className="sr-only">前へ</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </button>
                    {/* 簡易的にページ番号を表示 */}
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === i + 1 ? 'z-10 bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${currentPage === totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                      <span className="sr-only">次へ</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}