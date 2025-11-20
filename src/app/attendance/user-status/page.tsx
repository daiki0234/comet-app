"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  Timestamp 
} from 'firebase/firestore';
import toast, { Toaster } from 'react-hot-toast';

// --- 型定義 ---
type User = { id: string; lastName: string; firstName: string; };
type UsageStatus = '放課後' | '休校日' | '欠席';
// 延長支援加算分類
type Extension = 1 | 2 | 3 | null; 

interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  usageStatus: UsageStatus;
  arrivalTime: string;
  departureTime: string;
  notes: string;
  extension: Extension;
  // FirestoreのTimestamp
  dateTimestamp: Timestamp; 
}

// 編集モーダル用の型
interface EditRecord extends AttendanceRecord {
  // 編集可能なフィールド
}

// --- ユーティリティ関数 ---

// ★ 1. 利用時間から延長加算を計算するロジック (プロジェクト概要から移植)
const calculateExtension = (
  arrivalTime: string, 
  departureTime: string, 
  status: UsageStatus
): { notesExtension: string; extension: Extension } => {
  if (!arrivalTime || !departureTime) {
    return { notesExtension: '', extension: null };
  }

  const arrival = new Date(`2000/01/01 ${arrivalTime}`);
  const departure = new Date(`2000/01/01 ${departureTime}`);
  if (departure <= arrival) return { notesExtension: '', extension: null };

  const durationMs = departure.getTime() - arrival.getTime();
  const durationMinutes = durationMs / (1000 * 60);

  // 加算対象となる基準時間（分）
  const thresholdMinutes = status === '放課後' ? 180 : // 3時間 = 180分
                           status === '休校日' ? 300 : // 5時間 = 300分
                           0; 

  const extensionMinutes = durationMinutes - thresholdMinutes;

  if (extensionMinutes <= 0) {
    return { notesExtension: '', extension: null };
  }

  const hours = Math.floor(extensionMinutes / 60);
  const minutes = Math.floor(extensionMinutes % 60);
  const durationStr = `${hours}時間${minutes}分`;

  let extensionCode: Extension = null;
  if (extensionMinutes >= 120) { // 2時間以上
    extensionCode = 3;
  } else if (extensionMinutes >= 60) { // 1時間〜2時間未満
    extensionCode = 2;
  } else if (extensionMinutes >= 30) { // 30分〜1時間未満
    extensionCode = 1;
  }

  if (extensionCode) {
    return { 
      notesExtension: `${durationStr}（分類${extensionCode}）`, 
      extension: extensionCode 
    };
  }
  
  // 30分未満の延長は加算対象外だが、notesには記録しておくかはお好み
  // 今回は加算対象外の記録は省略
  return { notesExtension: '', extension: null };
};


export default function UserAttendanceStatusPage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // ★ 2. State の定義
  const [users, setUsers] = useState<User[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // 編集モーダル
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EditRecord | null>(null);

  // 年の選択肢 (過去2年〜未来1年)
  const years = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => currentYear - 2 + i);
  }, [currentYear]);
  // 月の選択肢
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);

  // ユーザーリストの取得
  useEffect(() => {
    const fetchUsers = async () => {
      const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('lastName')));
      const usersData = usersSnap.docs.map(d => ({ 
        id: d.id, 
        lastName: d.data().lastName, 
        firstName: d.data().firstName 
      })) as User[];
      setUsers(usersData);
      // 利用者がいれば、最初のユーザーをデフォルトで選択
      if (usersData.length > 0) {
        setSelectedUserId(usersData[0].id);
      }
    };
    fetchUsers();
  }, []);

  // ★ 3. データのフィルタリングと取得
  const fetchRecords = useCallback(async () => {
    if (!selectedUserId) {
      setRecords([]);
      return;
    }

    setLoading(true);
    try {
      const startOfMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      
      // 次の月の1日 (フィルタリング用)
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const endOfMonthExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;


      const recordsRef = collection(db, 'attendanceRecords');
      // ★ クエリの構築: userId + 年月で絞り込み
      const q = query(recordsRef,
        where('userId', '==', selectedUserId),
        where('date', '>=', startOfMonth),
        where('date', '<', endOfMonthExclusive), // 月の範囲でフィルタ
        orderBy('date', 'desc') // 日付の降順
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ 
        id: d.id, 
        dateTimestamp: d.data().dateTimestamp,
        ...(d.data() as Omit<AttendanceRecord, 'id' | 'dateTimestamp'>) 
      })) as AttendanceRecord[];

      setRecords(data);
    } catch (error) {
      console.error("出欠記録の取得に失敗:", error);
      toast.error("出欠記録の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);


  // --- 編集・更新・削除ロジック ---

  // ★ 4. 編集モーダルを開く
  const handleEdit = (record: AttendanceRecord) => {
    setEditingRecord({ ...record });
    setIsEditModalOpen(true);
  };

  // ★ 5. 更新処理
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    
    // 欠席の場合は時間入力をリセット
    const { arrivalTime, departureTime, usageStatus, id } = editingRecord;
    
    if (usageStatus === '欠席') {
      editingRecord.arrivalTime = '';
      editingRecord.departureTime = '';
    }

    // 延長加算の再計算 (放課後/休校日の場合)
    if (usageStatus === '放課後' || usageStatus === '休校日') {
      const { notesExtension, extension } = calculateExtension(
        arrivalTime, 
        departureTime, 
        usageStatus
      );
      // 特記事項に延長情報を追記
      editingRecord.notes = `${editingRecord.notes.split('（分類')[0].trim()} ${notesExtension}`.trim();
      editingRecord.extension = extension;
    } else {
      // 欠席やその他の場合は延長をリセット
      editingRecord.notes = editingRecord.notes.split('（分類')[0].trim();
      editingRecord.extension = null;
    }

    const docRef = doc(db, 'attendanceRecords', id);
    try {
      await updateDoc(docRef, { ...editingRecord });
      toast.success('出欠記録を更新しました');
      setIsEditModalOpen(false);
      await fetchRecords(); // リストを再取得
    } catch (error) {
      console.error("更新エラー:", error);
      toast.error('更新に失敗しました');
    }
  };

  // ★ 6. 削除処理
  const handleDelete = async (id: string) => {
    if (!confirm('この出欠記録を本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'attendanceRecords', id));
      toast.success('出欠記録を削除しました');
      await fetchRecords(); // リストを再取得
    } catch (error) {
      console.error("削除エラー:", error);
      toast.error('削除に失敗しました');
    }
  };

  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!editingRecord) return;
    const { name, value } = e.target;
    setEditingRecord(prev => prev ? { ...prev, [name]: value } : null);
  };
  
  // --- UI レンダリング ---

  return (
    <AppLayout pageTitle="利用者別出欠状況">
      <Toaster />
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        <h2 className="text-xl font-semibold mb-6 text-gray-800">出欠記録の確認と編集</h2>

        {/* フィルタリング UI */}
        <div className="flex flex-wrap items-center space-x-4 mb-6 p-4 bg-gray-50 rounded-lg border">
          <label className="font-medium text-gray-700">利用者:</label>
          <select 
            value={selectedUserId} 
            onChange={(e) => setSelectedUserId(e.target.value)} 
            className="p-2 border rounded-md bg-white"
          >
            <option value="">利用者を選択してください</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.lastName} {user.firstName}</option>
            ))}
          </select>

          <label className="font-medium text-gray-700 ml-4">年:</label>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))} 
            className="p-2 border rounded-md bg-white"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          
          <label className="font-medium text-gray-700 ml-4">月:</label>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(Number(e.target.value))} 
            className="p-2 border rounded-md bg-white"
          >
            {months.map(m => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        </div>

        {/* 一覧表 */}
        <div className="max-h-[70vh] overflow-y-auto border rounded-lg">
          {loading ? (
            <p className="p-4 text-center">出欠記録を読み込み中...</p>
          ) : selectedUserId ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">日付</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">利用状況</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">来所時間</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">帰所時間</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">特記事項</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.length > 0 ? (
                  records.map(record => (
                    <tr key={record.id} className={record.usageStatus === '欠席' ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800">{record.date}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-700">{record.usageStatus}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{record.arrivalTime || '---'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{record.departureTime || '---'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-sm whitespace-normal">{record.notes || '---'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 space-x-2">
                        <button onClick={() => handleEdit(record)} className="text-blue-500 hover:underline text-sm">編集</button>
                        <button onClick={() => handleDelete(record.id)} className="text-red-500 hover:underline text-sm">削除</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      この期間の出欠記録はありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-center text-gray-500">利用者を選択してください。</p>
          )}
        </div>
        
        {/* ★ 7. 編集モーダル UI */}
        {isEditModalOpen && editingRecord && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
            <form onSubmit={handleUpdate} className="relative z-[201] bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">
                {editingRecord.userName} ({editingRecord.date}) の出欠を編集
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">利用状況</label>
                  <select 
                    name="usageStatus" 
                    value={editingRecord.usageStatus} 
                    onChange={handleModalChange} 
                    className="p-2 border rounded-md w-full bg-white"
                  >
                    <option value="放課後">放課後</option>
                    <option value="休校日">休校日</option>
                    <option value="欠席">欠席</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">来所時間</label>
                    <input 
                      type="time" 
                      name="arrivalTime" 
                      value={editingRecord.arrivalTime} 
                      onChange={handleModalChange} 
                      className={`p-2 border rounded-md w-full ${editingRecord.usageStatus === '欠席' ? 'bg-gray-100' : ''}`}
                      disabled={editingRecord.usageStatus === '欠席'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">帰所時間</label>
                    <input 
                      type="time" 
                      name="departureTime" 
                      value={editingRecord.departureTime} 
                      onChange={handleModalChange} 
                      className={`p-2 border rounded-md w-full ${editingRecord.usageStatus === '欠席' ? 'bg-gray-100' : ''}`}
                      disabled={editingRecord.usageStatus === '欠席'}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">特記事項</label>
                  <textarea 
                    name="notes" 
                    value={editingRecord.notes} 
                    onChange={handleModalChange} 
                    rows={3} 
                    className="p-2 border rounded-md w-full"
                  ></textarea>
                  <p className="text-xs text-gray-500 mt-1">※ 延長支援加算情報は自動で追記されます。</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsEditModalOpen(false)} 
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded"
                >
                  キャンセル
                </button>
                <button 
                  type="submit" 
                  className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                >
                  更新
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </AppLayout>
  );
}