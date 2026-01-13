"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import Link from "next/link";
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  deleteDoc, 
  setDoc, getDoc,
  addDoc
} from "firebase/firestore";
import { computeExtension, stripExtensionNote } from '@/lib/attendance/extension';
import { useAutoRecord } from '@/hooks/useAutoRecord';
import { useAuth } from '@/context/AuthContext'; // ★追加: ゲスト判定用

// JSTのyyyy-mm-ddキー
const jstDateKey = (d: Date = new Date()) => {
  const tzDate = new Date(d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, "0");
  const day = String(tzDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const QrCodeScanner = dynamic(
  () => import('@/components/QrCodeScanner'),
  { ssr: false, loading: () => <div className="p-4 text-sm text-gray-500">カメラ起動中...</div> }
);

// ユーザー型定義
type User = { 
  id: string; 
  lastName: string; 
  firstName: string; 
  isFamilySupportEligible: boolean;      
  isIndependenceSupportEligible: boolean; 
  [key: string]: any;
};

// ★追加: スタッフ型定義
type Staff = {
  id: string;
  name: string;
};

type AttendanceRecord = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  month: string;
  usageStatus: '放課後' | '休校日' | '欠席';
  arrivalTime?: string;
  departureTime?: string;
  notes?: string;
  extension?: {
    minutes: number;
    class: 1 | 2 | 3;
    display: string;
  } | null;
  hasFamilySupport?: boolean;        
  hasIndependenceSupport?: boolean; 
  recordedBy?: string; // ★追加: 代理登録者名
};

const toDateString = (date: Date) => {
  const jst = new Date(date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const d = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function AttendancePage() {
  const { createRecord } = useAutoRecord();
  const { isGuest } = useAuth(); // ★追加: ゲスト判定

  const [users, setUsers] = useState<User[]>([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  
  const [monthlyAbsenceCounts, setMonthlyAbsenceCounts] = useState<Record<string, number>>({});
  const [recordAbsenceCounts, setRecordAbsenceCounts] = useState<Record<string, number>>({});

  const [scanResult, setScanResult] = useState('スキャン待機中...');
  const [absentUserId, setAbsentUserId] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  
  const [isProcessingState, setIsProcessingState] = useState(false);
  const isScanningRef = useRef(false);

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [isTabActive, setIsTabActive] = useState(true);

  // ★追加: スタッフ選択用state
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  // ★追加: ゲストの場合、スタッフリストを取得
  useEffect(() => {
    const fetchStaff = async () => {
      if (!isGuest) return;
      try {
        const q = query(collection(db, 'admins'));
        const snap = await getDocs(q);
        const staffs = snap.docs
          .map(d => {
            const data = d.data();
            return { id: d.id, name: data.name, isEnrolled: data.isEnrolled };
          })
          // 在籍フラグが false でない人だけ表示 (undefinedは表示)
          .filter((s: any) => s.isEnrolled !== false)
          .map((s: any) => ({ id: s.id, name: s.name } as Staff));
        
        setStaffList(staffs);
      } catch (e) {
        console.error("スタッフ取得エラー", e);
      }
    };
    fetchStaff();
  }, [isGuest]);

  const fetchData = useCallback(async () => {
    // 1. 全利用者リスト取得 & 加算判定
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const usersData = usersSnapshot.docs.map(doc => {
      const data = doc.data();
      const appliedAdditions = data.appliedAdditions || [];
      const hasAddition = (searchName: string) => {
        if (!Array.isArray(appliedAdditions)) return false;
        return appliedAdditions.some((item: any) => {
          if (item.name && typeof item.name === 'string') {
            return item.name.includes(searchName);
          }
          return false;
        });
      };

      return {
        id: doc.id,
        ...data,
        isFamilySupportEligible: hasAddition('家族支援加算'),
        isIndependenceSupportEligible: hasAddition('通所自立支援加算'),
      };
    }) as User[];

    usersData.sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, 'ja'));
    setUsers(usersData);

    // 2. 表示中日付の出欠記録
    const dateStr = toDateString(viewDate);
    const q = query(collection(db, "attendanceRecords"), where("date", "==", dateStr));
    const attendanceSnapshot = await getDocs(q);
    const records = attendanceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AttendanceRecord[];
    records.sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));
    setAttendanceRecords(records);

    // 3. 今月の欠席集計
    const targetMonth = dateStr.substring(0, 7);
    const monthQuery = query(
      collection(db, 'attendanceRecords'),
      where('month', '==', targetMonth),
      where('usageStatus', '==', '欠席')
    );
    const monthSnap = await getDocs(monthQuery);
    const allMonthAbsences = monthSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));

    const totalCounts: Record<string, number> = {};
    allMonthAbsences.forEach(rec => {
      totalCounts[rec.userId] = (totalCounts[rec.userId] || 0) + 1;
    });
    setMonthlyAbsenceCounts(totalCounts);

    const absentRecordsToday = records.filter(r => r.usageStatus === '欠席');
    if (absentRecordsToday.length > 0) {
      const seqCounts: Record<string, number> = {};
      absentRecordsToday.forEach(target => {
        const myAbsences = allMonthAbsences.filter(a => a.userId === target.userId);
        myAbsences.sort((a, b) => a.date.localeCompare(b.date));
        const index = myAbsences.findIndex(a => a.date === target.date);
        if (index !== -1) {
          seqCounts[target.id] = index + 1;
        }
      });
      setRecordAbsenceCounts(seqCounts);
    } else {
      setRecordAbsenceCounts({});
    }

  }, [viewDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabActive(!document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const searchMatchedUsers = useMemo(() => {
    const queryText = userSearchQuery.trim();
    if (!queryText) return [];
    const lowerQuery = queryText.toLowerCase();
    return users.filter(user => {
      const fullName = `${user.lastName || ''}${user.firstName || ''}`;
      return fullName.toLowerCase().includes(lowerQuery);
    });
  }, [userSearchQuery, users]);
  
  const handleScanSuccess = useCallback(async (result: string) => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setIsProcessingState(true);

    const loadingToast = toast.loading('処理中...');
    const statusFromSymbol = (s: string): '放課後' | '休校日' => (s === '◯' ? '放課後' : '休校日');
    const parseHHMM = (t?: string) => {
      if (!t) return null;
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const hh = Number(m[1]), mm = Number(m[2]);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
      return hh * 60 + mm;
    };
    const calcExtension = (
      usage: '放課後' | '休校日' | '欠席',
      arrival?: string,
      departure?: string
    ): { label: string; grade: '' | '1' | '2' | '3'; minutes: number } => {
      if (usage === '欠席') return { label: '', grade: '', minutes: 0 };
      const a = parseHHMM(arrival), d = parseHHMM(departure);
      if (a == null || d == null) return { label: '', grade: '', minutes: 0 };
      let span = d - a; if (span <= 0) return { label: '', grade: '', minutes: 0 };
      const base = usage === '放課後' ? 180 : 300; 
      const over = span - base; if (over < 30) return { label: '', grade: '', minutes: 0 };
      let grade: '' | '1' | '2' | '3' = over >= 120 ? '3' : over >= 60 ? '2' : '1';
      const hh = Math.floor(over / 60), mm = over % 60;
      const hStr = hh > 0 ? `${hh}時間` : '';
      const label = `${hStr}${mm}分（${grade}）`;
      return { label, grade, minutes: over };
    };

    try {
      let params: URLSearchParams;
      try {
        const urlObj = new URL(result);
        params = new URLSearchParams(urlObj.search);
      } catch (e) {
        const queryString = result.split('?')[1];
        params = new URLSearchParams(queryString);
      }

      const id = params.get('id');
      const name = params.get('name');
      const statusSymbol = params.get('status');
      const type = params.get('type');

      if ((!id && !name) || !statusSymbol || !type) {
        throw new Error('無効なQRコードです');
      }

      let userId = '';
      let userName = '';

      if (id) {
        const userDocRef = doc(db, "users", id);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) throw new Error('利用者IDが見つかりません');
        userId = userSnap.id;
        userName = `${userSnap.data().lastName} ${userSnap.data().firstName}`;
      } else if (name) {
        const targetName = name.replace(/[\s\u3000]+/g, ''); 
        const usersRef = collection(db, "users");
        const userSnapshot = await getDocs(usersRef);
        let foundDoc = null;
        for (const d of userSnapshot.docs) {
          const data = d.data();
          const dbName = `${data.lastName}${data.firstName}`;
          const dbNameClean = dbName.replace(/[\s\u3000]+/g, ''); 
          if (dbNameClean === targetName) {
            foundDoc = d;
            break;
          }
        }
        if (!foundDoc) throw new Error(`利用者未登録: ${name}`);
        userId = foundDoc.id;
        userName = `${foundDoc.data().lastName} ${foundDoc.data().firstName}`;
      }

      const todayStr = toDateString(new Date());
      const monthStr = todayStr.substring(0, 7);
      const currentTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      const usageStatus = statusFromSymbol(statusSymbol);
      const docId = `${todayStr}_${userId}`;
      const recordRef = doc(db, "attendanceRecords", docId);

      setScanResult(`${userName}｜${type}｜${currentTime}`);

      if (type === '来所') {
        const existing = await getDoc(recordRef);
        if (existing.exists() && (existing.data()?.arrivalTime || existing.data()?.usageStatus)) {
          throw new Error("既に来所記録があります");
        }
        await setDoc(recordRef, {
          userId,
          userName,
          date: todayStr,
          month: monthStr,
          usageStatus,
          arrivalTime: currentTime,
          source: "qr-scan",
          updatedAt: new Date(),
        }, { merge: true });

        toast.success(`${userName}さん、ようこそ！`, { id: loadingToast });
      } else if (type === '帰所') {
        const snap = await getDoc(recordRef);
        if (!snap.exists()) throw new Error("来所記録がありません");
        const prev = snap.data() as any;
        const prevUsage: '放課後' | '休校日' | '欠席' = prev?.usageStatus ?? usageStatus;
        const ext = calcExtension(prevUsage, prev?.arrivalTime, currentTime);

        const update: any = {
          departureTime: currentTime,
          updatedAt: new Date(),
        };
        if (ext.label) {
          update.notes = ext.label;
          update.extension = { minutes: ext.minutes, class: Number(ext.grade), display: ext.label }; 
        }

        await setDoc(recordRef, update, { merge: true });
        
        await createRecord({
          date: todayStr,
          userId: userId,
          userName: userName,
          status: prevUsage,
          startTime: prev?.arrivalTime || '',
          endTime: currentTime,
          extensionMinutes: ext.minutes || 0,
        });

        toast.success(`${userName}さん、お疲れ様でした！`, { id: loadingToast });
      } else {
        throw new Error("不明なtypeです");
      }
      await fetchData();
    } catch (error: any) {
      toast.error(`${error.message ?? error}`, { id: loadingToast });
    } finally {
      setTimeout(() => {
        isScanningRef.current = false;
        setIsProcessingState(false);
      }, 2000);
    }
  }, [fetchData, createRecord]);

  const handleScanFailure = (error: string) => {};

  const generateAndSaveAdvice = async (docId: string, userId: string, date: string, notes: string) => {
    const aiToast = toast.loading('AIが相談内容を自動生成中...');
    try {
      const res = await fetch('/api/absence/generate-advice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, date, currentNote: notes })
      });
      const data = await res.json();
      if (data.advice) {
        await updateDoc(doc(db, 'attendanceRecords', docId), { aiAdvice: data.advice });
        toast.success('AI相談内容を保存しました', { id: aiToast });
        fetchData();
      } else { toast.dismiss(aiToast); }
    } catch (e) { toast.error('AI生成失敗', { id: aiToast }); }
  };

  const handleAddAbsence = async () => {
    if (!absentUserId) { return toast.error('利用者を選択してください。'); }
    
    // ★追加: ゲスト時の職員選択バリデーション
    let recordedByName = '';
    if (isGuest) {
      if (!selectedStaffId) {
        return toast.error('担当職員を選択してください。');
      }
      const staff = staffList.find(s => s.id === selectedStaffId);
      if (staff) {
        recordedByName = staff.name;
      }
    }

    const user = users.find(u => u.id === absentUserId);
    if (!user) return;

    const absenceDate = toDateString(new Date()); 
    const loadingToast = toast.loading('欠席情報を登録中です...');
    try {
      const targetMonth = absenceDate.substring(0, 7);
      const absenceQuery = query(
        collection(db, "attendanceRecords"),
        where("userId", "==", absentUserId),
        where("month", "==", targetMonth),
        where("usageStatus", "==", "欠席")
      );
      const absenceSnapshot = await getDocs(absenceQuery);
      const absenceCount = absenceSnapshot.size;

      if (absenceCount >= 4) {
        throw new Error(`${user.lastName} ${user.firstName}さんは、この月の欠席回数が上限の4回に達しています。`);
      }

      const q = query(collection(db, "attendanceRecords"), where("userId", "==", absentUserId), where("date", "==", absenceDate));
      const existingSnapshot = await getDocs(q);
      if (!existingSnapshot.empty) {
        throw new Error(`${absenceDate} に ${user.lastName} ${user.firstName} さんの記録は既にあります。`);
      }

      const newRecord = {
        userId: user.id,
        userName: `${user.lastName} ${user.firstName}`,
        date: absenceDate,
        month: targetMonth,
        usageStatus: '欠席' as const,
        notes: absenceReason,
        // ★追加: 担当者情報（ゲスト入力時）
        recordedBy: recordedByName || null,
      };

      const docRef = await addDoc(collection(db, "attendanceRecords"), newRecord);
      
      await createRecord({
        date: absenceDate,
        userId: user.id,
        userName: `${user.lastName} ${user.firstName}`,
        status: '欠席',
        absenceReason: absenceReason,
      });

      generateAndSaveAdvice(docRef.id, newRecord.userId, newRecord.date, absenceReason);
      
      toast.success(`${user.lastName} ${user.firstName} さんを欠席として登録しました。`, { id: loadingToast });
      await fetchData(); 
      setAbsentUserId('');
      setUserSearchQuery(''); 
      setAbsenceReason('');
      setSelectedStaffId(''); // ★追加: リセット
    } catch (error: any) {
      toast.error(error.message, { id: loadingToast });
    }
  };

  const handleOpenEditModal = (record: AttendanceRecord) => { setEditingRecord(record); setIsEditModalOpen(true); };
  
  const handleUpdateRecord = async () => {
    if (!editingRecord) return;
    const loadingToast = toast.loading('記録を更新中です...');
    try {
      const ext = computeExtension(
        editingRecord.usageStatus,
        editingRecord.arrivalTime,
        editingRecord.departureTime
      );
      let newNotes = stripExtensionNote(editingRecord.notes);
      if (ext) {
        newNotes = newNotes ? `${newNotes} / ${ext.display}` : ext.display;
      }
      const dataToUpdate = {
        usageStatus: editingRecord.usageStatus,
        arrivalTime: editingRecord.arrivalTime || '',
        departureTime: editingRecord.departureTime || '',
        notes: newNotes,
        extension: ext ?? null,
        hasFamilySupport: editingRecord.hasFamilySupport || false,
        hasIndependenceSupport: editingRecord.hasIndependenceSupport || false,
      };
      const recordRef = doc(db, 'attendanceRecords', editingRecord.id);
      await updateDoc(recordRef, dataToUpdate);

      const isPresent = editingRecord.usageStatus === '放課後' || editingRecord.usageStatus === '休校日';
      const isAbsent = editingRecord.usageStatus === '欠席';
      const hasTime = editingRecord.arrivalTime && editingRecord.departureTime;

      if ((isPresent && hasTime) || isAbsent) {
        await createRecord({
          date: editingRecord.date,
          userId: editingRecord.userId,
          userName: editingRecord.userName,
          status: editingRecord.usageStatus,
          startTime: editingRecord.arrivalTime,
          endTime: editingRecord.departureTime,
          extensionMinutes: ext ? ext.minutes : 0,
          absenceReason: isAbsent ? editingRecord.notes : '',
        });
      }

      toast.success('記録を更新しました。', { id: loadingToast });
      setIsEditModalOpen(false);
      await fetchData();
    } catch (error) {
      toast.error('更新に失敗しました。', { id: loadingToast });
    }
  };

  const handleDeleteRecord = async () => {
    if (!editingRecord) return;
    const ok = window.confirm(`${editingRecord.userName}（${editingRecord.date}）の記録を削除します。よろしいですか？`);
    if (!ok) return;
    const loadingToast = toast.loading('記録を削除中です…');
    try {
      const ref = doc(db, 'attendanceRecords', editingRecord.id);
      await deleteDoc(ref);
      toast.success('記録を削除しました。', { id: loadingToast });
      setIsEditModalOpen(false);
      setEditingRecord(null);
      await fetchData();
    } catch (e) {
      toast.error('削除に失敗しました。', { id: loadingToast });
    }
  };

  const getUsageStatusSymbol = (status: '放課後' | '休校日' | '欠席', recordId: string) => {
    if (status === '放課後') return '◯';
    if (status === '休校日') return '◎';
    if (status === '欠席') {
      const count = recordAbsenceCounts[recordId];
      return count ? `欠席（${count}）` : '欠席';
    }
    return status;
  };

  

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* 左カラム */}
        <div className="lg:col-span-1 space-y-4 md:space-y-6">
          <section className="bg-white p-4 md:p-5 rounded-2xl shadow-ios border border-gray-200">
            <h3 className="text-base md:text-lg font-bold text-gray-800 mb-3">QRコードスキャン（本日）</h3>
            <p className="text-sm text-gray-600 mb-3">利用者のQRコードをカメラにかざしてください。</p>
            
            {isTabActive ? (
              <QrCodeScanner onScanSuccess={handleScanSuccess} onScanFailure={handleScanFailure} />
            ) : (
              <div className="h-48 bg-gray-100 flex items-center justify-center text-gray-400 rounded-lg">
                カメラ一時停止中
              </div>
            )}
            
            <p className="text-xs text-gray-500 mt-3 h-10">スキャン結果: <span className="font-semibold text-gray-700">{scanResult}</span></p>
          </section>

          <section className="bg-white p-4 md:p-5 rounded-2xl shadow-ios border border-gray-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base md:text-lg font-bold text-gray-800">欠席者登録</h3>
              <Link href="/attendance/register-absence" className="text-xs text-blue-600 hover:underline">別日はこちら</Link>
            </div>
            <div className="space-y-3">
              
              {/* ★追加: ゲスト用 担当職員選択プルダウン */}
              {isGuest && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    担当職員 <span className="text-xs text-red-500">(必須)</span>
                  </label>
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm bg-blue-50 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">担当者を選択してください</option>
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">利用者</label>
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder={users.length > 0 ? "氏名を入力して検索..." : "読み込み中..."}
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  disabled={!!absentUserId} 
                />

                {!absentUserId && userSearchQuery && searchMatchedUsers.length > 0 && (
                  <ul className="absolute top-full left-0 z-10 w-full max-h-48 overflow-y-auto bg-white border border-blue-400 rounded-md shadow-lg mt-1">
                    {searchMatchedUsers.map(user => {
                      const count = monthlyAbsenceCounts[user.id] || 0;
                      return (
                        <li 
                          key={user.id} 
                          onClick={() => {
                            setAbsentUserId(user.id);
                            setUserSearchQuery(''); 
                          }}
                          className="p-2 cursor-pointer hover:bg-blue-100 text-sm border-b last:border-b-0 flex justify-between items-center"
                        >
                          <span className="font-medium text-gray-800">{user.lastName} {user.firstName}</span>
                          <span className={`font-bold text-xs ${count >= 4 ? 'text-red-600' : 'text-red-500'}`}>
                            欠席: {count}回
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {absentUserId && (
                  <div className="mt-2 flex items-center justify-between bg-blue-50 p-2 rounded border border-blue-200">
                    <span className="text-sm font-bold text-blue-700">
                      選択中: {users.find(u => u.id === absentUserId)?.lastName} {users.find(u => u.id === absentUserId)?.firstName}
                      <span className="ml-2 text-xs text-red-500">
                        (今月欠席: {monthlyAbsenceCounts[absentUserId] || 0}回)
                      </span>
                    </span>
                    <button 
                      onClick={() => {
                        setAbsentUserId('');
                        setUserSearchQuery('');
                      }} 
                      className="text-xs text-gray-500 hover:text-red-600 underline"
                    >
                      解除
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">欠席理由</label>
                <input type="text" value={absenceReason} onChange={(e) => setAbsenceReason(e.target.value)} className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm" />
              </div>
              <button onClick={handleAddAbsence} className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">登録</button>
            </div>
          </section>
        </div>

        {/* 右カラム（一覧） */}
        <section className="lg:col-span-2 bg-white p-4 md:p-5 rounded-2xl shadow-ios border border-gray-200">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <label htmlFor="view-date" className="text-sm font-medium text-gray-700">表示日</label>
            <input id="view-date" type="date" value={toDateString(viewDate)} onChange={(e) => setViewDate(new Date(e.target.value))} className="h-10 px-3 border border-gray-300 rounded-lg text-sm" />
          </div>

          <h3 className="text-base md:text-lg font-bold text-gray-800 mb-3">{viewDate.toLocaleDateString()} の出欠状況</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-700">
              <thead className="text-xs text-gray-600 uppercase bg-gray-50">
                <tr>
                  <th className="px-4 py-2 sticky left-0 bg-gray-50 z-10">利用者名</th>
                  <th className="px-4 py-2 text-center">利用状況</th>
                  <th className="px-4 py-2">来所</th>
                  <th className="px-4 py-2">退所</th>
                  <th className="px-4 py-2">特記事項</th>
                  {/* 必要であればここに「受付」などの列を追加できます */}
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.map(rec => (
                  <tr key={rec.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white z-10">
                      <span onClick={() => handleOpenEditModal(rec)} className="flex items-center cursor-pointer group touch-manipulation">
                        {rec.userName}
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2 text-gray-400 group-hover:text-blue-600 transition-colors">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </span>
                      {/* ★追加: ゲスト入力時の担当者表示（必要であれば） */}
                      {rec.recordedBy && (
                         <div className="text-xs text-gray-400 mt-1">受付: {rec.recordedBy}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={rec.usageStatus === '欠席' ? 'font-bold text-red-600' : ''}>
                        {getUsageStatusSymbol(rec.usageStatus, rec.id)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{rec.arrivalTime}</td>
                    <td className="px-4 py-3">{rec.departureTime}</td>
                    <td className="px-4 py-3">{rec.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg">
             {/* モーダルの中身（変更なし） */}
            <h3 className="text-xl font-bold text-gray-800 mb-6">{editingRecord.userName} の記録を編集</h3>
            <div className="space-y-4">
               {/* ...省略（既存のまま）... */}
               <div>
                <label className="block text-sm font-medium text-gray-700">利用状況</label>
                <select value={editingRecord.usageStatus} onChange={(e) => setEditingRecord({ ...editingRecord, usageStatus: e.target.value as '放課後' | '休校日' | '欠席' })} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm">
                  <option value="放課後">放課後 (◯)</option>
                  <option value="休校日">休校日 (◎)</option>
                  <option value="欠席">欠席</option>
                </select>
              </div>
              {/* ...中略... */}
              <div><label className="block text-sm font-medium text-gray-700 mt-2">特記事項</label><textarea value={editingRecord.notes || ''} onChange={(e) => setEditingRecord({ ...editingRecord, notes: e.target.value })} rows={3} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"></textarea></div>
            </div>
            <div className="flex items-center justify-between pt-6 mt-6 border-t">
              <button onClick={handleDeleteRecord} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg">削除</button>
              <div className="flex gap-3">
                <button onClick={() => setIsEditModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">キャンセル</button>
                <button onClick={handleUpdateRecord} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}