// src/app/attendance/AttendanceClient.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import Link from "next/link";
import { db } from "@/lib/firebase/firebase";
import {
   collection,
   addDoc,
   getDocs,
   query,
   where,
   updateDoc,
   doc,
   documentId,
 } from "firebase/firestore";

// JSTのyyyy-mm-ddキー
const jstDateKey = (d: Date = new Date()) => {
  const tzDate = new Date(d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, "0");
  const day = String(tzDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// 10件ずつ分割（where(documentId(), 'in', ...) の Firestore 制限対策）
const chunk = <T,>(arr: T[], size = 10) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ✅ ブラウザ依存のQRスキャナは ssr:false で動的ロード
// 🚫 export しないこと！（const だけ）
const QrCodeScanner = dynamic(
  () => import('@/components/QrCodeScanner'),
  { ssr: false, loading: () => <div className="p-4 text-sm text-gray-500">スキャナ初期化中…</div> }
);

// 型定義
type User = { id: string; lastName: string; firstName: string; };
type AttendanceRecord = {
  id: string; userId: string; userName:string; date: string; month: string;
  usageStatus: '放課後' | '休校日' | '欠席';
  arrivalTime?: string; departureTime?: string; notes?: string;
};

// 既存：画面の「表示用」日付にはそのまま使ってOK（テーブルの viewDate など）
const toDateString = (date: Date) => {
  const jst = new Date(date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const d = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`; // ← Firestoreの形式 "2025-10-21" と一致
};

// 置き換え：安定化した QR スキャナ
//import React, { memo, useEffect, useRef } from "react";

//const qrcodeRegionId = "html5-qrcode-scanner-region";

export default function AttendancePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [todaysScheduledUsers, setTodaysScheduledUsers] = useState<User[]>([]);
  const [scanResult, setScanResult] = useState('スキャン待機中...');
  const [absentUserId, setAbsentUserId] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ★★★ データ取得ロジックを修正 ★★★
  const fetchData = useCallback(async () => {
    // 1. 全利用者リストを最初に取得
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
    setUsers(usersData);

    // 2. 表示中日付の出欠記録を取得
    const dateStr = toDateString(viewDate);
    const q = query(collection(db, "attendanceRecords"), where("date", "==", dateStr));
    const attendanceSnapshot = await getDocs(q);
    const records = attendanceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AttendanceRecord[];
    records.sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));
    setAttendanceRecords(records);

    // 3. 今日の利用予定者リストを作成
    const todayStr = toDateString(new Date());
const eventsQuery = query(collection(db, "events"), where("date", "==", todayStr));
const eventsSnapshot = await getDocs(eventsQuery);
const scheduledUserIds = new Set(eventsSnapshot.docs.map(doc => doc.data().userId));

    // 4. 今日の出欠記録も取得して、すでに来所済みのユーザーを把握
    const todayRecordsQuery = query(collection(db, "attendanceRecords"), where("date", "==", todayStr));
    const todayRecordsSnapshot = await getDocs(todayRecordsQuery);
    const attendedUserIds = new Set(todayRecordsSnapshot.docs.map(doc => doc.data().userId));

    // 5. 予定があり、かつ、まだ出欠記録がない利用者のみをプルダウン用に抽出
    const scheduledForToday = usersData.filter(user => 
      scheduledUserIds.has(user.id) && !attendedUserIds.has(user.id)
    );
    setTodaysScheduledUsers(scheduledForToday);

  }, [viewDate]);

useEffect(() => {
  loadTodaysScheduledUsers();
}, []);

useEffect(() => {
  fetchData();
}, [fetchData, viewDate]);
  
  const handleScanSuccess = useCallback(async (result: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const loadingToast = toast.loading('QRコードを処理中です...');

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
        toast.success(`${userName}さん、ようこそ！`, { id: loadingToast });
      } else if (type === '帰所') {
        if (attendanceSnapshot.empty) { throw new Error("来所記録がありません"); }
        const recordDoc = attendanceSnapshot.docs[0];
        await updateDoc(doc(db, "attendanceRecords", recordDoc.id), { departureTime: currentTime });
        toast.success(`${userName}さん、お疲れ様でした！`, { id: loadingToast });
      }
      await fetchData();
    } catch (error: any) {
      toast.error(`エラー: ${error.message}`, { id: loadingToast });
    } finally {
      setTimeout(() => setIsProcessing(false), 2000); // 2秒のクールダウン
    }
  }, [isProcessing, fetchData]);

  const handleScanFailure = (error: string) => {
    // console.warn(`QR error = ${error}`);
  };

const handleAddAbsence = async () => {
    if (!absentUserId) { return toast.error('利用者を選択してください。'); }
    const user = users.find(u => u.id === absentUserId);
    if (!user) return;

    const absenceDate = toDateString(new Date()); // 本日の日付で登録
    
    const loadingToast = toast.loading('欠席情報を登録中です...');
    try {
      const targetMonth = absenceDate.substring(0, 7);
      const absenceQuery = query(collection(db, "attendanceRecords"), where("userId", "==", absentUserId), where("month", "==", targetMonth), where("usageStatus", "==", "欠席"));
      const absenceSnapshot = await getDocs(absenceQuery);
      const absenceCount = absenceSnapshot.size;

      if (absenceCount >= 4) {
        throw new Error(`${user.lastName} ${user.firstName}さんは、この月の欠席回数が上限の4回に達しています。`);
      }

      // このチェックはhandleScanと共通
      const q = query(collection(db, "attendanceRecords"), where("userId", "==", absentUserId), where("date", "==", absenceDate));
      const existingSnapshot = await getDocs(q);
      if (!existingSnapshot.empty) {
        throw new Error(`${absenceDate} に ${user.lastName} ${user.firstName} さんの記録は既にあります。`);
      }

      const newAbsenceCount = absenceCount + 1;
      const notesWithCount = `[欠席(${newAbsenceCount})] ${absenceReason}`;
      await addDoc(collection(db, "attendanceRecords"), {
        userId: user.id,
        userName: `${user.lastName} ${user.firstName}`,
        date: absenceDate,
        month: targetMonth,
        usageStatus: '欠席',
        notes: notesWithCount,
      });
      
      toast.success(`${user.lastName} ${user.firstName} さんを欠席として登録しました。`, { id: loadingToast });
      await fetchData(); // リストを再取得
      setAbsentUserId('');
      setAbsenceReason('');
    } catch (error: any) {
      toast.error(error.message, { id: loadingToast });
    }
  };


  const handleOpenEditModal = (record: AttendanceRecord) => { setEditingRecord(record); setIsEditModalOpen(true); };
  const handleUpdateRecord = async () => {
    if (!editingRecord) return;
    const loadingToast = toast.loading('記録を更新中です...');
    try {
      const dataToUpdate = {
        usageStatus: editingRecord.usageStatus,
        arrivalTime: editingRecord.arrivalTime || '',
        departureTime: editingRecord.departureTime || '',
        notes: editingRecord.notes || '',
      };
      const recordRef = doc(db, 'attendanceRecords', editingRecord.id);
      await updateDoc(recordRef, dataToUpdate);
      toast.success('記録を正常に更新しました。', { id: loadingToast });
      setIsEditModalOpen(false);
      await fetchData();
    } catch(error) {
      toast.error('記録の更新に失敗しました。', { id: loadingToast });
    }
  };

  const getUsageStatusSymbol = (status: '放課後' | '休校日' | '欠席') => {
    if (status === '放課後') return '◯';
    if (status === '休校日') return '◎';
    return status;
  };

  // 関数として追加：今日の予定から利用者を引く
const loadTodaysScheduledUsers = async () => {
  const today = jstDateKey(new Date());

  // ① 今日の「利用予定」イベントを取得
  // コレクション名はあなたの環境に合わせてください：
  //   - "userSchedule" を使っているなら ↓ そのまま
  //   - "events" / "schedules" を使っている場合は置き換え
  const scheduleColNames = ["userSchedule", "schedules", "events"] as const;
  let scheduledDocs: any[] = [];

  for (const colName of scheduleColNames) {
    try {
      const qRef = query(
        collection(db, colName),
        where("dateKeyJst", "==", today)
      );
      const snap = await getDocs(qRef);
      if (!snap.empty) {
        scheduledDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        break; // 最初にヒットしたコレクションを採用
      }
    } catch (_e) {
      // 存在しないコレクション名だとここに来ることがあるので握りつぶしOK
    }
  }

  if (scheduledDocs.length === 0) {
    setTodaysScheduledUsers([]);
    return;
  }

  // ② 今日予定の userId をユニーク抽出
  const userIds = Array.from(
    new Set(
      scheduledDocs
        .map((e) => e.userId)
        .filter((v) => typeof v === "string" && v.length > 0)
    )
  );

  if (userIds.length === 0) {
    setTodaysScheduledUsers([]);
    return;
  }

  // ③ users コレクションから userId でまとめて取得（10件ずつ）
  const usersCol = collection(db, "users");
  const batches = chunk(userIds, 10);
  const users: User[] = [];

  for (const ids of batches) {
    const qRef = query(usersCol, where(documentId(), "in", ids));
    const snap = await getDocs(qRef);
    snap.forEach((d) => {
      const u = { id: d.id, ...(d.data() as any) };
      users.push({
        id: u.id,
        lastName: u.lastName ?? "",
        firstName: u.firstName ?? "",
      } as User);
    });
  }

  // 表示用に苗字→名前で並び替え（任意）
  users.sort((a, b) =>
    `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, "ja")
  );

  setTodaysScheduledUsers(users);
};

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">QRコードスキャン (本日分)</h3>
            <p className="text-center text-gray-600 mb-4">利用者のQRコードをカメラにかざしてください。</p>
            <QrCodeScanner
              onScanSuccess={handleScanSuccess}
              onScanFailure={handleScanFailure}
            />
            <p className="text-sm text-gray-500 mt-4 h-10">スキャン結果: <span className="font-semibold text-gray-700">{scanResult}</span></p>
          </div>
        <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">欠席者登録 (本日分)</h3>
              <Link href="/attendance/register-absence" className="text-xs text-blue-600 hover:underline">別日の登録はこちら</Link>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">利用者</label>
                <select value={absentUserId} onChange={(e) => setAbsentUserId(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm">
                  <option value="">利用予定者を選択</option>
                  {todaysScheduledUsers.map(u =><option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
                </select>
              </div>
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
      <h3 className="text-xl font-bold text-gray-800 mb-6">
        {editingRecord.userName} の記録を編集
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">利用状況</label>
          <select
            value={editingRecord.usageStatus}
            onChange={(e) =>
              setEditingRecord({
                ...editingRecord,
                usageStatus: e.target.value as '放課後' | '休校日' | '欠席',
              })
            }
            className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"
          >
            <option value="放課後">放課後 (◯)</option>
            <option value="休校日">休校日 (◎)</option>
            <option value="欠席">欠席</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">来所時間</label>
          <input
            type="time"
            value={editingRecord.arrivalTime || ''}
            onChange={(e) =>
              setEditingRecord({ ...editingRecord, arrivalTime: e.target.value })
            }
            className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">退所時間</label>
          <input
            type="time"
            value={editingRecord.departureTime || ''}
            onChange={(e) =>
              setEditingRecord({ ...editingRecord, departureTime: e.target.value })
            }
            className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">特記事項</label>
          <textarea
            value={editingRecord.notes || ''}
            onChange={(e) =>
              setEditingRecord({ ...editingRecord, notes: e.target.value })
            }
            rows={3}
            className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"
          ></textarea>
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-6 mt-6 border-t">
        <button
          onClick={() => setIsEditModalOpen(false)}
          className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg"
        >
          キャンセル
        </button>
        <button
          onClick={handleUpdateRecord}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg"
        >
          保存
        </button>
      </div>
    </div>
  </div>
)}
</>
    
  );
}

