"use client";

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';

// 型定義
type User = { id: string; lastName: string; firstName: string; };
type AttendanceRecord = {
  id: string; userId: string; userName:string; date: string; month: string;
  usageStatus: '放課後' | '休校日' | '欠席';
  arrivalTime?: string; departureTime?: string; notes?: string;
};

const toDateString = (date: Date) => date.toISOString().split('T')[0];

// ====================================================================
// ★★★ 安定化させたQRスキャナ部品 ★★★
// ====================================================================
const qrcodeRegionId = "html5-qrcode-scanner-region";
const QrCodeScanner = memo(({ onScanSuccess }: { onScanSuccess: (decodedText: string) => void }) => {
  const onScanSuccessRef = useRef(onScanSuccess);
  
  // onScanSuccessが変更されるたびにrefを更新
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  // このuseEffectは、コンポーネントのマウント時に一度だけ実行される
  useEffect(() => {
    const html5QrcodeScanner = new Html5QrcodeScanner(qrcodeRegionId, { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    
    const successCallback = (decodedText: string, decodedResult: any) => {
      onScanSuccessRef.current(decodedText);
    };
    
    const errorCallback = (error: any) => {};

    html5QrcodeScanner.render(successCallback, errorCallback);
    
    return () => {
      html5QrcodeScanner.clear().catch(error => {
        console.error("QRスキャナのクリアに失敗しました", error);
      });
    };
  }, []); // 依存配列を空にすることで、一度しか実行されないようにする

  return <div id={qrcodeRegionId} />;
});
QrCodeScanner.displayName = 'QrCodeScanner';
// ====================================================================


export default function AttendancePage() {
  const [scanResult, setScanResult] = useState('スキャン待機中...');
  const [users, setUsers] = useState<User[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [absentUserId, setAbsentUserId] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [absenceDate, setAbsenceDate] = useState(toDateString(new Date()));
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchData = useCallback(async () => {
    if (users.length === 0) {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      setUsers(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[]);
    }
    const dateStr = toDateString(viewDate);
    const q = query(collection(db, "attendanceRecords"), where("date", "==", dateStr));
    const attendanceSnapshot = await getDocs(q);
    const sortedRecords = (attendanceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AttendanceRecord[])
      .sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));
    setAttendanceRecords(sortedRecords);
  }, [viewDate, users.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const handleScan = useCallback(async (result: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const url = new URL(result);
      const params = new URLSearchParams(url.search);
      const name = params.get('name');
      const statusSymbol = params.get('status');
      const type = params.get('type');
      if (!name || !statusSymbol || !type) { throw new Error("無効なQRコードです"); }
      const [lastName, firstName] = name.split(' ');
      const q = query(collection(db, "users"), where("lastName", "==", lastName), where("firstName", "==", firstName));
      const userSnapshot = await getDocs(q);
      if (userSnapshot.empty) { throw new Error("該当する利用者が登録されていません"); }
      const userDoc = userSnapshot.docs[0];
      const userId = userDoc.id;
      const userName = `${userDoc.data().lastName} ${userDoc.data().firstName}`;
      const currentTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      const usageStatus = statusSymbol === '◯' ? '放課後' : '休校日';
      const todayStr = toDateString(new Date());
      const monthStr = todayStr.substring(0, 7);
      
      setScanResult(`${userName}｜${type}｜${currentTime}`);
      
      const attendanceQuery = query(collection(db, "attendanceRecords"), where("userId", "==", userId), where("date", "==", todayStr));
      const attendanceSnapshot = await getDocs(attendanceQuery);
      
      if (type === '来所') {
        if (!attendanceSnapshot.empty) { throw new Error("既に来所済みです"); }
        await addDoc(collection(db, "attendanceRecords"), { userId, userName, date: todayStr, month: monthStr, usageStatus, arrivalTime: currentTime });
        alert(`${userName}さん、ようこそ！`);
      } else if (type === '帰所') {
        if (attendanceSnapshot.empty) { throw new Error("来所記録がありません"); }
        const recordDoc = attendanceSnapshot.docs[0];
        await updateDoc(doc(db, "attendanceRecords", recordDoc.id), { departureTime: currentTime });
        alert(`${userName}さん、お疲れ様でした！`);
      }
      await fetchData();
    } catch (error: any) {
      alert(`エラー: ${error.message}`);
    } finally {
      setTimeout(() => setIsProcessing(false), 2000);
    }
  }, [isProcessing, fetchData]);

  const handleAddAbsence = async () => {
    if (!absentUserId) { alert('利用者を選択してください。'); return; }
    const user = users.find(u => u.id === absentUserId);
    if (!user) return;
    const targetMonth = absenceDate.substring(0, 7);
    const absenceQuery = query(collection(db, "attendanceRecords"), where("userId", "==", absentUserId), where("month", "==", targetMonth), where("usageStatus", "==", "欠席"));
    const absenceSnapshot = await getDocs(absenceQuery);
    const absenceCount = absenceSnapshot.size;
    if (absenceCount >= 4) { alert(`${user.lastName} ${user.firstName}さんは、この月の欠席回数が上限の4回に達しています。`); return; }
    const q = query(collection(db, "attendanceRecords"), where("userId", "==", absentUserId), where("date", "==", absenceDate));
    const existingSnapshot = await getDocs(q);
    if (!existingSnapshot.empty) { alert(`${absenceDate} に ${user.lastName} ${user.firstName} さんの記録は既にあります。`); return; }
    const newAbsenceCount = absenceCount + 1;
    const notesWithCount = `[欠席(${newAbsenceCount})] ${absenceReason}`;
    await addDoc(collection(db, "attendanceRecords"), { userId: user.id, userName: `${user.lastName} ${user.firstName}`, date: absenceDate, month: targetMonth, usageStatus: '欠席', notes: notesWithCount });
    alert(`${absenceDate} に ${user.lastName} ${user.firstName} さんを欠席として登録しました。`);
    await fetchData();
    setAbsentUserId('');
    setAbsenceReason('');
  };

  const handleOpenEditModal = (record: AttendanceRecord) => { setEditingRecord(record); setIsEditModalOpen(true); };

  const handleUpdateRecord = async () => {
    if (!editingRecord) return;
    const dataToUpdate = {
      usageStatus: editingRecord.usageStatus,
      arrivalTime: editingRecord.arrivalTime || '',
      departureTime: editingRecord.departureTime || '',
      notes: editingRecord.notes || '',
    };
    const recordRef = doc(db, 'attendanceRecords', editingRecord.id);
    await updateDoc(recordRef, dataToUpdate);
    setIsEditModalOpen(false);
    await fetchData();
  };

  const getUsageStatusSymbol = (status: '放課後' | '休校日' | '欠席') => {
    if (status === '放課後') return '◯';
    if (status === '休校日') return '◎';
    return status;
  };

  return (
    <AppLayout pageTitle="出欠記録">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">QRコードスキャン (本日分)</h3>
            <div className="w-full border rounded-lg overflow-hidden">
              <QrCodeScanner onScanSuccess={handleScan} />
            </div>
            <p className="text-sm text-gray-500 mt-4 h-10">スキャン結果: <span className="font-semibold text-gray-700">{scanResult}</span></p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">欠席者登録</h3>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700">日付</label><input type="date" value={absenceDate} onChange={(e) => setAbsenceDate(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700">利用者</label><select value={absentUserId} onChange={(e) => setAbsentUserId(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"><option value="">選択してください</option>{users.map(user => <option key={user.id} value={user.id}>{user.lastName} {user.firstName}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700">欠席理由</label><input type="text" value={absenceReason} onChange={(e) => setAbsenceReason(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"/></div>
              <button onClick={handleAddAbsence} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">登録</button>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
          <div className="flex items-center mb-4">
            <label htmlFor="view-date" className="text-sm font-medium text-gray-700 mr-2">表示する日付: </label>
            <input id="view-date" type="date" value={toDateString(viewDate)} onChange={(e) => setViewDate(new Date(e.target.value))} className="p-2 border border-gray-300 rounded-md shadow-sm"/>
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-4">{viewDate.toLocaleDateString()} の出欠状況</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-6 py-3">利用者名</th>
                  <th className="px-6 py-3 text-center">利用状況</th>
                  <th className="px-6 py-3">来所時間</th>
                  <th className="px-6 py-3">退所時間</th>
                  <th className="px-6 py-3">特記事項</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.map(rec => (
                  <tr key={rec.id} className="bg-white border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                      <span onClick={() => handleOpenEditModal(rec)} className="flex items-center cursor-pointer group">
                        {rec.userName}
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2 text-gray-400 group-hover:text-blue-600 transition-colors"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">{getUsageStatusSymbol(rec.usageStatus)}</td>
                    <td className="px-6 py-4">{rec.arrivalTime}</td>
                    <td className="px-6 py-4">{rec.departureTime}</td>
                    <td className="px-6 py-4">{rec.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg">
            <h3 className="text-xl font-bold text-gray-800 mb-6">{editingRecord.userName} の記録を編集</h3>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700">利用状況</label><select value={editingRecord.usageStatus} onChange={(e) => setEditingRecord({...editingRecord, usageStatus: e.target.value as '放課後' | '休校日' | '欠席'})} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"><option value="放課後">放課後 (◯)</option><option value="休校日">休校日 (◎)</option><option value="欠席">欠席</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700">来所時間</label><input value={editingRecord.arrivalTime || ''} onChange={(e) => setEditingRecord({...editingRecord, arrivalTime: e.target.value})} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700">退所時間</label><input value={editingRecord.departureTime || ''} onChange={(e) => setEditingRecord({...editingRecord, departureTime: e.target.value})} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700">特記事項</label><textarea value={editingRecord.notes || ''} onChange={(e) => setEditingRecord({...editingRecord, notes: e.target.value})} rows={3} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
            </div>
            <div className="flex justify-end space-x-4 pt-6 mt-6 border-t">
              <button onClick={() => setIsEditModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">キャンセル</button>
              <button onClick={handleUpdateRecord} className="bg-blue hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">保存</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

