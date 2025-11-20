"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';

// --- 型定義 ---
type RecordStatus = '放課後' | '休校日' | '欠席' | 'キャンセル待ち' | '取り消し';
interface User { id: string; lastName: string; firstName: string; }
interface AttendanceRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  usageStatus: RecordStatus;
  arrivalTime?: string; // HH:MM
  departureTime?: string; // HH:MM
  notes?: string; // 特記事項 (欠席理由や延長支援加算の記録)
  userName: string; // 表示用 (DBにuserNameも保存されていると仮定)
}

// Helper関数
const pad2 = (n: number) => n.toString().padStart(2, "0");
const formatDisplayDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
};

export default function UserAttendanceListPage() {
  const now = new Date();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  
  // ★ 修正点1: デフォルトは何も選択されていない状態
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // デフォルト値は現在の年月に設定
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<AttendanceRecord> | null>(null);

  // ★ 修正点2: 検索が実行されたかどうかの状態
  const [hasSearched, setHasSearched] = useState(false);

  // 年月日のプルダウンリスト生成
  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - i), []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  // --- データ取得ロジック ---
  const fetchRecords = useCallback(async () => {
    if (!selectedUserId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 選択された年月の範囲
      const dateMin = `${currentYear}-${pad2(currentMonth)}-01`;
      const dateMax = `${currentYear}-${pad2(currentMonth)}-31`;

      const recordsRef = collection(db, "attendanceRecords");
      
      // ★ 必須インデックス: userId と date の複合インデックスが必要です
      const q = query(
        recordsRef,
        where("userId", "==", selectedUserId),
        where("date", ">=", dateMin),
        where("date", "<=", dateMax)
        // ここに orderBy('date', 'desc') を追加すると、ソートもDB側で行えて高速になります
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<AttendanceRecord, 'id'>),
      })) as AttendanceRecord[];
      
      // 日付の降順（新しい順）でソート
      setRecords(data.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error("出欠記録の取得に失敗:", error);
      toast.error("出欠記録の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, currentYear, currentMonth]);

  // 全ユーザーリスト取得 (初回マウント時のみ実行)
  useEffect(() => {
    const fetchUsers = async () => {
      const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('lastName')));
      const usersData = usersSnap.docs.map(doc => ({ 
        id: doc.id, 
        lastName: doc.data().lastName, 
        firstName: doc.data().firstName 
      })) as User[];
      setAllUsers(usersData);
      
      // ★ 初回はユーザーを自動選択しない
      if (usersData.length === 0) {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  // ★ 修正点3: ボタンクリックで実行されるハンドラ
  const handleDisplayClick = () => {
    setHasSearched(true); // 検索済みフラグを立てる
    fetchRecords(); // データ取得を実行
  };

  // --- CRUD 操作 (省略) ---
  const handleEdit = (record: AttendanceRecord) => { setEditingId(record.id); setEditData({ ...record }); };
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target; setEditData(prev => prev ? { ...prev, [name]: value } : null);
  };
  const handleUpdate = async () => {
    if (!editData || !editingId) return;
    const loadingToast = toast.loading('更新を保存中...');
    try {
      const { id, userName, ...updatePayload } = editData;
      await updateDoc(doc(db, "attendanceRecords", editingId), updatePayload);
      toast.success('記録を更新しました。', { id: loadingToast });
      setEditingId(null); setEditData(null);
      fetchRecords();
    } catch (error) {
      console.error("更新エラー:", error); toast.error('更新に失敗しました。', { id: loadingToast });
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('この出欠記録を本当に削除しますか？')) return;
    const loadingToast = toast.loading('削除処理中...');
    try {
      await deleteDoc(doc(db, "attendanceRecords", id));
      toast.success('記録を削除しました。', { id: loadingToast });
      fetchRecords();
    } catch (error) {
      console.error("削除エラー:", error); toast.error('削除に失敗しました。', { id: loadingToast });
    }
  };

  // --- UI レンダリング ---
  
  if (loading && allUsers.length === 0) {
    return <AppLayout pageTitle="出欠状況"><div className="text-center p-8">初期データを読み込み中...</div></AppLayout>;
  }

  const selectedUserName = allUsers.find(u => u.id === selectedUserId);
  const pageTitle = selectedUserName ? `${selectedUserName.lastName} ${selectedUserName.firstName}さんの出欠状況` : '利用者別出欠状況';

  return (
    <AppLayout pageTitle={pageTitle}>
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        <h2 className="text-xl font-bold mb-4">出欠記録の確認と編集</h2>

        {/* フィルターエリア */}
        <div className="flex flex-wrap gap-4 items-center mb-6 p-4 bg-gray-50 rounded-lg border">
          {/* 利用者選択 */}
          <div className="flex items-center gap-2">
            <label className="font-medium text-gray-700">利用者:</label>
            <select 
              value={selectedUserId} 
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="p-2 border rounded-md bg-white"
            >
              {/* ★ 修正点4: デフォルトの「利用者を選択」オプションを追加 */}
              <option value="" disabled>利用者を選択</option> 
              {allUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {user.lastName} {user.firstName}
                </option>
              ))}
            </select>
          </div>

          {/* 年月選択 */}
          <div className="flex items-center gap-2">
            <label className="font-medium text-gray-700">年:</label>
            <select value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))} className="p-2 border rounded-md bg-white">
              {years.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="font-medium text-gray-700">月:</label>
            <select value={currentMonth} onChange={(e) => setCurrentMonth(Number(e.target.value))} className="p-2 border rounded-md bg-white">
              {months.map(m => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>

          {/* ★ 修正点5: 表示ボタン */}
          <button 
            onClick={handleDisplayClick} 
            disabled={loading || !selectedUserId} 
            className="ml-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400"
          >
            {loading ? '読み込み中' : '表示'}
          </button>
          
          <p className="ml-auto text-sm text-gray-600">
            {records.length} 件の記録を表示中
          </p>
        </div>

        {/* 出欠一覧表 */}
        <div className="overflow-x-auto">
          {/* ★ 修正点6: 初期状態/ロード中の表示変更 */}
          {(!hasSearched && records.length === 0) ? (
            <p className="text-center py-8 text-gray-500">条件を選択し「表示」ボタンを押してください。</p>
          ) : loading ? (
            <p className="text-center py-8">読み込み中...</p>
          ) : records.length === 0 ? (
            <p className="text-center py-8 text-gray-500">選択された期間に出欠記録はありません。</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">日付</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">利用状況</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">来所時間</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">帰所時間</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">特記事項</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.map(record => (
                  <tr key={record.id}>
                    
                    {/* 日付 */}
                    <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatDisplayDate(record.date)}
                    </td>
                    
                    {/* 状況・時間・特記事項 (インライン編集) */}
                    {record.id === editingId && editData ? (
                      <>
                        <td className="px-3 py-2"><select name="usageStatus" value={editData.usageStatus} onChange={handleEditChange} className="p-1 border rounded w-full"><option>放課後</option><option>休校日</option><option>欠席</option><option>キャンセル待ち</option><option>取り消し</option></select></td>
                        <td className="px-3 py-2"><input type="time" name="arrivalTime" value={editData.arrivalTime || ''} onChange={handleEditChange} className="p-1 border rounded w-full" /></td>
                        <td className="px-3 py-2"><input type="time" name="departureTime" value={editData.departureTime || ''} onChange={handleEditChange} className="p-1 border rounded w-full" /></td>
                        <td className="px-3 py-2"><input type="text" name="notes" value={editData.notes || ''} onChange={handleEditChange} className="p-1 border rounded w-full" /></td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3 text-sm text-gray-700">{record.usageStatus}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{record.arrivalTime || '---'}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{record.departureTime || '---'}</td>
                        <td className="px-3 py-3 text-sm text-gray-700 whitespace-pre-wrap max-w-xs">{record.notes || '---'}</td>
                      </>
                    )}
                    
                    {/* 操作ボタン */}
                    <td className="px-3 py-3 whitespace-nowrap text-sm font-medium space-x-2">
                      {record.id === editingId ? (
                        <div className="flex gap-2">
                          <button onClick={handleUpdate} className="text-green-600 hover:text-green-900">保存</button>
                          <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-700">取消</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => handleEdit(record)} className="text-blue-600 hover:text-blue-900">編集</button>
                          <button onClick={() => handleDelete(record.id)} className="text-red-600 hover:text-red-900">削除</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}