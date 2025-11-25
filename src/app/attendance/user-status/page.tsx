"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, orderBy, addDoc } from 'firebase/firestore'; // ★ addDocを追加
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
  notes?: string; // 特記事項
  userName?: string; // 保存時に必要
}

// Helper関数
const pad2 = (n: number) => n.toString().padStart(2, "0");
const formatDisplayDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
};

export default function UserAttendanceListPage() {
  const now = new Date();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  
  // 選択状態
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 年月選択
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);
  
  // 編集用State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<AttendanceRecord> | null>(null);

  // 検索済みフラグ
  const [hasSearched, setHasSearched] = useState(false);

  // ★★★ 追加: 新規登録モーダル用State ★★★
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [newRecordDate, setNewRecordDate] = useState('');
  const [newRecordStatus, setNewRecordStatus] = useState<RecordStatus>('放課後');
  const [newRecordArrival, setNewRecordArrival] = useState('');
  const [newRecordDeparture, setNewRecordDeparture] = useState('');
  const [newRecordNotes, setNewRecordNotes] = useState('');

  // 検索用State (利用者選択)
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // プルダウンリスト
  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - i), []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  // --- 利用者検索ロジック ---
  const searchMatchedUsers = useMemo(() => {
    const queryText = userSearchQuery.trim();
    if (!queryText) {
      const selectedUser = allUsers.find(u => u.id === selectedUserId);
      return selectedUser ? [selectedUser] : [];
    }
    const lowerQuery = queryText.toLowerCase();
    return allUsers.filter(user => {
      const fullName = `${user.lastName || ''}${user.firstName || ''}`;
      return fullName.toLowerCase().includes(lowerQuery);
    });
  }, [userSearchQuery, allUsers, selectedUserId]);

  // --- データ取得ロジック ---
  const fetchRecords = useCallback(async () => {
    if (!selectedUserId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const dateMin = `${currentYear}-${pad2(currentMonth)}-01`;
      const dateMax = `${currentYear}-${pad2(currentMonth)}-31`;

      const recordsRef = collection(db, "attendanceRecords");
      const q = query(
        recordsRef,
        where("userId", "==", selectedUserId),
        where("date", ">=", dateMin),
        where("date", "<=", dateMax),
        orderBy('date', 'asc')
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<AttendanceRecord, 'id'>),
      })) as AttendanceRecord[];
      
      // 日付順ソート (念のためJSでも)
      setRecords(data.sort((a, b) => a.date.localeCompare(b.date)));
    } catch (error) {
      console.error("出欠記録の取得に失敗:", error);
      // インデックスエラーの可能性が高いため、初回はToastを出さない等の調整も可
      toast.error("出欠記録の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, currentYear, currentMonth]);

  // 全ユーザーリスト取得
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('lastName')));
        const usersData = usersSnap.docs.map(doc => ({ 
          id: doc.id, 
          lastName: doc.data().lastName, 
          firstName: doc.data().firstName 
        })) as User[];
        setAllUsers(usersData);
      } catch (error) {
        console.error("利用者一覧取得エラー:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  // 表示ボタン
  const handleDisplayClick = () => {
    setHasSearched(true);
    fetchRecords();
  };

  // --- 新規登録機能 ---
  const openRegisterModal = () => {
    // デフォルト日付を「選択中の年月」の1日に設定
    setNewRecordDate(`${currentYear}-${pad2(currentMonth)}-01`);
    setNewRecordStatus('放課後');
    setNewRecordArrival('');
    setNewRecordDeparture('');
    setNewRecordNotes('');
    setIsRegisterModalOpen(true);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !newRecordDate) {
      toast.error('日付を入力してください');
      return;
    }

    const targetUser = allUsers.find(u => u.id === selectedUserId);
    if (!targetUser) return;

    const loadingToast = toast.loading('登録中...');
    try {
      const newRecord = {
        userId: selectedUserId,
        userName: `${targetUser.lastName} ${targetUser.firstName}`,
        date: newRecordDate,
        usageStatus: newRecordStatus,
        arrivalTime: newRecordArrival,
        departureTime: newRecordDeparture,
        notes: newRecordNotes,
        // 検索用フィールドがあれば追加 (例: month: '2025-11')
      };

      await addDoc(collection(db, 'attendanceRecords'), newRecord);
      toast.success('出欠記録を登録しました', { id: loadingToast });
      setIsRegisterModalOpen(false);
      fetchRecords(); // リストを更新
    } catch (error) {
      console.error("登録エラー:", error);
      toast.error('登録に失敗しました', { id: loadingToast });
    }
  };

  // --- 編集・削除 ---
  const handleEdit = (record: AttendanceRecord) => { setEditingId(record.id); setEditData({ ...record }); };
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target; setEditData(prev => prev ? { ...prev, [name]: value } : null);
  };
  const handleUpdate = async () => {
    if (!editData || !editingId) return;
    const loadingToast = toast.loading('更新中...');
    try {
      const { id, ...updatePayload } = editData; // IDを除外して更新
      await updateDoc(doc(db, "attendanceRecords", editingId), updatePayload);
      toast.success('更新しました', { id: loadingToast });
      setEditingId(null); setEditData(null);
      fetchRecords();
    } catch (error) {
      console.error("更新エラー:", error); toast.error('更新に失敗しました', { id: loadingToast });
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return;
    const loadingToast = toast.loading('削除中...');
    try {
      await deleteDoc(doc(db, "attendanceRecords", id));
      toast.success('削除しました', { id: loadingToast });
      fetchRecords();
    } catch (error) {
      console.error("削除エラー:", error); toast.error('削除に失敗しました', { id: loadingToast });
    }
  };

  // UIレンダリング
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
          <div className="flex items-center gap-2 relative">
            <label className="font-medium text-gray-700">利用者:</label>
            <input
              type="text"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder={allUsers.length > 0 ? "氏名を入力して検索..." : "利用者なし"}
              disabled={allUsers.length === 0}
              className="p-2 border border-gray-300 rounded-md w-48"
            />
            {userSearchQuery && searchMatchedUsers.length > 0 && (
              <ul className="absolute top-full left-0 z-10 w-full max-h-60 overflow-y-auto bg-white border border-blue-400 rounded-md shadow-lg mt-1">
                {searchMatchedUsers.map(user => (
                  <li 
                    key={user.id} 
                    onClick={() => { setSelectedUserId(user.id); setUserSearchQuery(''); }}
                    className="p-2 cursor-pointer hover:bg-blue-100 text-sm border-b last:border-b-0"
                  >
                    {user.lastName} {user.firstName}
                  </li>
                ))}
              </ul>
            )}
            {selectedUserId && (
              <span className="text-sm text-blue-600 font-semibold absolute top-[-10px] right-0 bg-white px-1 border border-blue-300 rounded-md">
                選択中: {allUsers.find(u => u.id === selectedUserId)?.lastName} {allUsers.find(u => u.id === selectedUserId)?.firstName}
              </span>
            )}
          </div>

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

          <button 
            onClick={handleDisplayClick} 
            disabled={loading || !selectedUserId} 
            className="ml-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400"
          >
            {loading ? '読み込み中' : '表示'}
          </button>

          {/* ★★★ 追加: 新規登録ボタン ★★★ */}
          <button 
            onClick={openRegisterModal}
            disabled={!selectedUserId} // ユーザー選択時のみ有効
            className="ml-2 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新規登録
          </button>
          
          <p className="ml-auto text-sm text-gray-600">
            {records.length} 件
          </p>
        </div>

        {/* 出欠一覧表 */}
        <div className="overflow-x-auto">
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
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">日付</th>
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
                    {/* 日付 (編集モード時は日付も変更可能) */}
                    <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {record.id === editingId && editData ? (
                        <input type="date" name="date" value={editData.date} onChange={handleEditChange} className="p-1 border rounded w-full" />
                      ) : (
                        formatDisplayDate(record.date)
                      )}
                    </td>
                    
                    {/* 状況・時間・特記事項 */}
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

      {/* ★★★ 新規登録モーダル ★★★ */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <form onSubmit={handleRegister} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4 text-gray-800">手動登録</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">日付</label>
                <input type="date" value={newRecordDate} onChange={(e) => setNewRecordDate(e.target.value)} className="mt-1 p-2 w-full border rounded-md" required />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">利用状況</label>
                <select value={newRecordStatus} onChange={(e) => setNewRecordStatus(e.target.value as RecordStatus)} className="mt-1 p-2 w-full border rounded-md">
                  <option value="放課後">放課後</option>
                  <option value="休校日">休校日</option>
                  <option value="欠席">欠席</option>
                  <option value="キャンセル待ち">キャンセル待ち</option>
                  <option value="取り消し">取り消し</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">来所時間</label>
                  <input type="time" value={newRecordArrival} onChange={(e) => setNewRecordArrival(e.target.value)} className="mt-1 p-2 w-full border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">帰所時間</label>
                  <input type="time" value={newRecordDeparture} onChange={(e) => setNewRecordDeparture(e.target.value)} className="mt-1 p-2 w-full border rounded-md" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">特記事項</label>
                <input type="text" value={newRecordNotes} onChange={(e) => setNewRecordNotes(e.target.value)} className="mt-1 p-2 w-full border rounded-md" placeholder="メモなど" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsRegisterModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md text-gray-700 hover:bg-gray-300">キャンセル</button>
              <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-bold">登録する</button>
            </div>
          </form>
        </div>
      )}
    </AppLayout>
  );
}