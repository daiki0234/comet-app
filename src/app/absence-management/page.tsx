"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext'; // ★追加

// 型定義
type AttendanceRecord = {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  usageStatus: '欠席';
  reason?: string;
  notes?: string;
  staffName?: string;
  aiAdvice?: string; // AIによる相談援助内容
};

export default function AbsenceManagementPage() {
  const { currentUser } = useAuth(); // ★追加: ログインユーザー取得
  
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  
  // AI一括生成用
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [staffName, setStaffName] = useState('');

  // 編集用
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ staffName: '', aiAdvice: '' });

  // ★追加: ログインユーザー名を担当者に自動セット
  useEffect(() => {
    if (currentUser?.displayName) {
      setStaffName(currentUser.displayName);
    }
  }, [currentUser]);

  // データ取得
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const strMonth = month.toString().padStart(2, '0');
      const startStr = `${year}-${strMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endStr = `${year}-${strMonth}-${lastDay}`;

      const q = query(
        collection(db, 'attendanceRecords'),
        where('usageStatus', '==', '欠席'),
        where('date', '>=', startStr),
        where('date', '<=', endStr),
        orderBy('date', 'asc')
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
      setRecords(data);
    } catch (error) {
      console.error(error);
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [year, month]);

  // 削除機能
  const handleDelete = async (id: string, userName: string, date: string) => {
    if (!window.confirm(`${date} の ${userName} さんの記録を削除しますか？\nこの操作は取り消せません。`)) {
      return;
    }

    const toastId = toast.loading('削除中...');
    try {
      await deleteDoc(doc(db, 'attendanceRecords', id));
      toast.success('削除しました', { id: toastId });
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error(error);
      toast.error('削除に失敗しました', { id: toastId });
    }
  };

  // AI一括生成
  const handleBatchGenerate = async () => {
    if (!staffName) return toast.error("担当者名を入力してください");
    if (!window.confirm(`${year}年${month}月の未作成データをAIで一括作成しますか？\n（APIリクエストを節約するため、数分かかる場合があります）`)) return;

    setIsBatchLoading(true);
    const toastId = toast.loading("AIが生成中... (このままお待ちください)");

    try {
      const res = await fetch('/api/absence/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, staffName })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成エラー");

      toast.success(`完了しました！ (${data.count}件更新)`, { id: toastId });
      fetchRecords(); // リロード
    } catch (e: any) {
      console.error(e);
      toast.error(`エラー: ${e.message}`, { id: toastId });
    } finally {
      setIsBatchLoading(false);
    }
  };

  // 編集開始
  const startEdit = (rec: AttendanceRecord) => {
    setEditingId(rec.id);
    setEditForm({ 
      staffName: rec.staffName || '', 
      aiAdvice: rec.aiAdvice || '' 
    });
  };

  // 編集保存
  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updateDoc(doc(db, 'attendanceRecords', editingId), {
        staffName: editForm.staffName,
        aiAdvice: editForm.aiAdvice
      });
      toast.success("更新しました");
      setEditingId(null);
      
      setRecords(prev => prev.map(r => 
        r.id === editingId ? { ...r, ...editForm } : r
      ));
    } catch (e) {
      toast.error("更新失敗");
    }
  };

  return (
    <AppLayout pageTitle="欠席管理・AI相談記録">
      <div className="space-y-6">
        
        {/* コントロールバー */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-2">
            <select 
              value={year} 
              onChange={(e) => setYear(Number(e.target.value))}
              className="border p-2 rounded-md font-bold"
            >
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            <select 
              value={month} 
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border p-2 rounded-md font-bold"
            >
              {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}月</option>)}
            </select>
            <button onClick={fetchRecords} className="text-gray-500 hover:text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
          </div>

          <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-blue-100">
            <span className="text-xs font-bold text-blue-800">AI一括作成:</span>
            {/* ログインユーザー名が自動で入りますが、
              修正したい場合のためにinputは表示したままにしています 
            */}
            <input 
              type="text" 
              placeholder="担当者名" 
              value={staffName} 
              onChange={(e) => setStaffName(e.target.value)}
              className="border p-1 rounded text-sm w-32"
            />
            <button 
              onClick={handleBatchGenerate}
              disabled={isBatchLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-2 rounded-md font-bold disabled:bg-gray-400 transition-all"
            >
              {isBatchLoading ? '生成中...' : '実行'}
            </button>
          </div>
        </div>

        {/* テーブル */}
        <div className="bg-white rounded-xl shadow-ios border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-600">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 w-24">日付</th>
                  <th className="px-4 py-3 w-32">利用者名</th>
                  <th className="px-4 py-3 w-48">欠席理由 / 連絡</th>
                  <th className="px-4 py-3">相談援助内容 (AI生成)</th>
                  <th className="px-4 py-3 w-24">担当者</th>
                  <th className="px-4 py-3 w-20 text-center">操作</th>
                  <th className="px-4 py-3 w-16 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10">読み込み中...</td></tr>
                ) : records.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">データがありません</td></tr>
                ) : (
                  records.map((rec) => (
                    <tr key={rec.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{rec.date}</td>
                      <td className="px-4 py-3 font-bold text-gray-800">{rec.userName}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        <div className="font-bold text-gray-700 mb-1">{rec.reason}</div>
                        {rec.notes}
                      </td>
                      
                      {/* 編集モードか表示モードか */}
                      {editingId === rec.id ? (
                        <>
                          <td className="px-4 py-3">
                            <textarea 
                              className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                              rows={4}
                              value={editForm.aiAdvice}
                              onChange={(e) => setEditForm({...editForm, aiAdvice: e.target.value})}
                            />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <input 
                              type="text" 
                              className="w-full border rounded p-1"
                              value={editForm.staffName}
                              onChange={(e) => setEditForm({...editForm, staffName: e.target.value})}
                            />
                          </td>
                          <td className="px-4 py-3 text-center align-top">
                            <button onClick={saveEdit} className="text-green-600 hover:text-green-800 font-bold block mb-2">保存</button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 text-xs">中止</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 whitespace-pre-wrap leading-relaxed text-gray-700">
                            {rec.aiAdvice ? (
                              rec.aiAdvice
                            ) : (
                              <span className="text-xs text-gray-300 italic">（未作成）</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">{rec.staffName || '-'}</td>
                          <td className="px-4 py-3 text-center">
                            <button 
                              onClick={() => startEdit(rec)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </button>
                          </td>
                        </>
                      )}

                      <td className="px-4 py-3 text-center">
                        <button 
                          onClick={() => handleDelete(rec.id, rec.userName, rec.date)}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded-full hover:bg-red-50"
                          title="削除"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}