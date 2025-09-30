"use client";

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
// Html5QrcodeScannerの直接インポートはQrCodeScanner.tsxに移動したため、この行は不要になります
// import { Html5QrcodeScanner, Html5QrcodeScannerState ,Html5QrcodeScanType} from 'html5-qrcode';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';
import toast from 'react-hot-toast';

// ▼▼▼【変更点】ここからQrCodeScannerの定義を削除し、代わりに下の1行を追加 ▼▼▼
import { QrCodeScanner } from '@/components/QrCodeScanner';

// 型定義
type User = { id: string; lastName: string; firstName: string; };
type AttendanceRecord = {
  id: string; userId: string; userName:string; date: string; month: string;
  usageStatus: '放課後' | '休校日' | '欠席';
  arrivalTime?: string; departureTime?: string; notes?: string;
};

// --- JST 日付ユーティリティ ---
const pad = (n: number) => n.toString().padStart(2, "0");

const jstTodayDash = () => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  return `${y}-${pad(m)}-${pad(d)}`;
};
const jstNowTime = () => {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const h = jst.getUTCHours();
    const m = jst.getUTCMinutes();
    return `${pad(h)}:${pad(m)}`;
};
const jstTodayDisplay = () => {
  const today = new Date();
  const month = today.getMonth() + 1;
  const date = today.getDate();
  const day = ["日", "月", "火", "水", "木", "金", "土"][today.getDay()];
  return `${month}月${date}日 (${day})`;
};

// --- ここからがページの本体 ---
export default function AttendancePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [unrecordedUsers, setUnrecordedUsers] = useState<User[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Partial<AttendanceRecord>>({});
  const [isScannerVisible, setScannerVisible] = useState(false);
  const [absenceReason, setAbsenceReason] = useState('');
  const [selectedAbsenceUser, setSelectedAbsenceUser] = useState<string>('');

  const fetchUsersAndRecords = useCallback(async () => {
    try {
      const usersCollectionRef = collection(db, 'users');
      const userSnapshot = await getDocs(usersCollectionRef);
      const usersData = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
      setUsers(usersData);

      const today = jstTodayDash();
      const recordsCollectionRef = collection(db, 'attendances');
      const q = query(recordsCollectionRef, where("date", "==", today));
      const recordSnapshot = await getDocs(q);
      const recordsData = recordSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AttendanceRecord[];
      setAttendanceRecords(recordsData);

      const recordedUserIds = new Set(recordsData.map(r => r.userId));
      const unrecorded = usersData.filter(u => !recordedUserIds.has(u.id));
      setUnrecordedUsers(unrecorded);

    } catch (error) {
      console.error("Error fetching data: ", error);
      toast.error('データの取得に失敗しました。');
    }
  }, []);

  useEffect(() => {
    fetchUsersAndRecords();
  }, [fetchUsersAndRecords]);
  
  const handleScanSuccess = useCallback(async (decodedText: string) => {
    setScannerVisible(false);
    toast.success(`QRコードを読み取りました: ${decodedText}`);
    try {
      const today = jstTodayDash();
      const currentTime = jstNowTime();
      const user = users.find(u => u.id === decodedText);
      if (!user) {
        toast.error('該当する利用者が見つかりません。');
        return;
      }
      const userName = `${user.lastName} ${user.firstName}`;
      const existingRecord = attendanceRecords.find(r => r.userId === decodedText);
      if (existingRecord) {
        if (existingRecord.arrivalTime && !existingRecord.departureTime) {
          const recordRef = doc(db, 'attendances', existingRecord.id);
          await updateDoc(recordRef, { departureTime: currentTime });
          toast.success(`${userName}さんが退所しました。`);
        } else {
          toast('すでに来所・退所記録があります。');
        }
      } else {
        await addDoc(collection(db, 'attendances'), {
          userId: decodedText, userName, date: today, month: today.substring(0, 7),
          usageStatus: '放課後', arrivalTime: currentTime,
        });
        toast.success(`${userName}さんが来所しました。`);
      }
      fetchUsersAndRecords();
    } catch (error)
      console.error("Error processing QR code: ", error);
      toast.error('QRコードの処理中にエラーが発生しました。');
    }
  }, [users, attendanceRecords, fetchUsersAndRecords]);

  const handleScanFailure = (error: string) => {
    // console.warn(`QR error = ${error}`);
  };

  const handleAbsence = async () => {
    if (!selectedAbsenceUser || !absenceReason) {
      toast.error('利用者と欠席理由を選択してください。');
      return;
    }
    try {
      const today = jstTodayDash();
      const user = users.find(u => u.id === selectedAbsenceUser);
      if (!user) return;
      
      const userName = `${user.lastName} ${user.firstName}`;

      await addDoc(collection(db, 'attendances'), {
        userId: selectedAbsenceUser, userName, date: today, month: today.substring(0, 7),
        usageStatus: '欠席', notes: absenceReason,
      });
      toast.success(`${userName}さんを欠席として記録しました。`);
      setSelectedAbsenceUser('');
      setAbsenceReason('');
      fetchUsersAndRecords();

    } catch (error) {
      console.error("Error recording absence: ", error);
      toast.error('欠席記録の登録に失敗しました。');
    }
  };
  
  const openEditModal = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setIsEditModalOpen(true);
  };
  
  const handleUpdateRecord = async () => {
    if (!editingRecord.id) return;
    try {
      const recordRef = doc(db, 'attendances', editingRecord.id);
      await updateDoc(recordRef, editingRecord);
      toast.success('記録を更新しました。');
      setIsEditModalOpen(false);
      fetchUsersAndRecords();
    } catch (error) {
      console.error("Error updating record: ", error);
      toast.error('記録の更新に失敗しました。');
    }
  };

  return (
    <AppLayout pageTitle="出欠記録">
      <div className="bg-white p-6 rounded-ios shadow-ios border border-ios-gray-200 mb-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800">{jstTodayDisplay()}</h2>
          <div>
            <button onClick={() => setScannerVisible(prev => !prev)} className="bg-ios-blue text-white font-bold py-2 px-4 rounded-lg mr-2 transition-opacity hover:opacity-80">
              {isScannerVisible ? 'スキャナを閉じる' : 'QRスキャンで記録'}
            </button>
          </div>
        </div>
        
        {isScannerVisible && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-center text-gray-600 mb-4">利用者のQRコードをカメラにかざしてください。</p>
            <QrCodeScanner
              onScanSuccess={handleScanSuccess}
              onScanFailure={handleScanFailure}
            />
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-ios shadow-ios border border-ios-gray-200 mb-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">本日の未記録者</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <select value={selectedAbsenceUser} onChange={(e) => setSelectedAbsenceUser(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md shadow-sm">
            <option value="">利用者を選択</option>
            {unrecordedUsers.map(user => (
              <option key={user.id} value={user.id}>{`${user.lastName} ${user.firstName}`}</option>
            ))}
          </select>
          <select value={absenceReason} onChange={(e) => setAbsenceReason(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md shadow-sm">
            <option value="">欠席理由を選択</option>
            <option value="体調不良">体調不良</option>
            <option value="学校行事">学校行事</option>
            <option value="家庭の事情">家庭の事情</option>
            <option value="自己都合">自己都合</option>
            <option value="その他">その他</option>
          </select>
          <button onClick={handleAbsence} className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg transition-opacity hover:opacity-80 w-full">
            欠席として記録
          </button>
        </div>
      </div>


      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">利用者名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">利用状況</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">来所時間</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">退所時間</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {attendanceRecords.map(record => (
              <tr key={record.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.userName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.usageStatus}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.arrivalTime || '--:--'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.departureTime || '--:--'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button onClick={() => openEditModal(record)} className="text-indigo-600 hover:text-indigo-900">編集</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg">
            <h3 className="text-xl font-bold mb-6">記録を編集</h3>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">利用状況</label>
                <select 
                  value={editingRecord.usageStatus || ''} 
                  onChange={(e) => setEditingRecord({...editingRecord, usageStatus: e.target.value as any})}
                  className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"
                >
                  <option value="放課後">放課後 (◯)</option>
                  <option value="休校日">休校日 (◎)</option>
                  <option value="欠席">欠席</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700">来所時間</label><input value={editingRecord.arrivalTime || ''} onChange={(e) => setEditingRecord({...editingRecord, arrivalTime: e.target.value})} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700">退所時間</label><input value={editingRecord.departureTime || ''} onChange={(e) => setEditingRecord({...editingRecord, departureTime: e.target.value})} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700">特記事項</label><textarea value={editingRecord.notes || ''} onChange={(e) => setEditingRecord({...editingRecord, notes: e.target.value})} rows={3} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
            </div>
            <div className="flex justify-end space-x-4 pt-6 mt-6 border-t">
              <button onClick={() => setIsEditModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">キャンセル</button>
              <button onClick={handleUpdateRecord} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">更新</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}