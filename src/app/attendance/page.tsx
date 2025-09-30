"use client";

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScannerState ,Html5QrcodeScanType} from 'html5-qrcode';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';
import toast from 'react-hot-toast';
import Link from 'next/link';

// 型定義
type User = { id: string; lastName: string; firstName: string; };
type AttendanceRecord = {
  id: string; userId: string; userName:string; date: string; month: string;
  usageStatus: '放課後' | '休校日' | '欠席';
  arrivalTime?: string; departureTime?: string; notes?: string;
};

// --- JST 日付ユーティリティ（追加） ---
const pad = (n: number) => n.toString().padStart(2, "0");

/** JSTの今日を "yyyy-MM-dd" で返す（保存/照合用） */
const jstTodayDash = () => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC→JST
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  return `${pad(m)}`.length ? `${y}-${pad(m)}-${pad(d)}` : `${y}-${m}-${d}`;
};
/** "yyyy/MM/dd" が必要なコレクション用 */
const jstTodaySlash = () => jstTodayDash().replaceAll("-", "/");

/** Firestore Timestamp 用：JST 今日 00:00:00〜23:59:59 を UTCの瞬間に変換 */
const jstStartEndOfToday = () => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // JST “今日”の年月日を得る
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();

  // ★ここが肝：JSTの 00:00 を UTC に直すには「-9時間」する
  const startUtcMs = Date.UTC(y, m, d, 0, 0, 0) - 9 * 60 * 60 * 1000;         // 前日 15:00:00Z
  const endUtcMs   = Date.UTC(y, m, d, 23, 59, 59, 999) - 9 * 60 * 60 * 1000; // 当日 14:59:59.999Z
  return { start: new Date(startUtcMs), end: new Date(endUtcMs) };
};

// 既存：画面の「表示用」日付にはそのまま使ってOK（テーブルの viewDate など）
const toDateString = (date: Date) => date.toISOString().split('T')[0];

// 置き換え：安定化した QR スキャナ
//import React, { memo, useEffect, useRef } from "react";

const qrcodeRegionId = "html5-qrcode-scanner-region";

export const QrCodeScanner = memo(
  ({ onScanSuccess }: { onScanSuccess: (decodedText: string) => void }) => {
    const scannerRef = useRef<any>(null);
    const onScanSuccessRef = useRef(onScanSuccess);
    useEffect(() => {
      onScanSuccessRef.current = onScanSuccess;
    }, [onScanSuccess]);

    useEffect(() => {
      let canceled = false;

      const boot = async () => {
        try {
          // 1) クライアント側でのみライブラリ読込（SSR回避）
          const mod = await import("html5-qrcode");
          if (canceled) return;

          // 2) 既存UIの残骸を掃除（重複描画防止）
          const region = document.getElementById(qrcodeRegionId);
          if (!region) return;
          region.innerHTML = "";

          // 3) スキャナ初期化
          const scanner = new mod.Html5QrcodeScanner(
            qrcodeRegionId,
            {
              fps: 8,
              qrbox: { width: 260, height: 260 },
              rememberLastUsedCamera: true,
              supportedScanTypes: [mod.Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            },
            /* verbose= */ false
          );

          const success = (decodedText: string) => {
            onScanSuccessRef.current(decodedText);
          };
          const error = (_e: unknown) => {
            // 認識失敗は頻発するのでログ出さない
          };

          // 4) レンダリング開始
          scanner.render(success, error);
          scannerRef.current = scanner;

          // 5) 画面が非表示/ページ離脱なら確実に停止
          const stop = async () => {
            try {
              if (!scannerRef.current) return;
              await scannerRef.current.clear();
            } catch {
              /* noop */
            } finally {
              scannerRef.current = null;
            }
          };

          const onVisibility = () => {
            if (document.hidden) stop();
          };
          const onPageHide = () => stop();
          document.addEventListener("visibilitychange", onVisibility);
          window.addEventListener("pagehide", onPageHide);

          // 6) アンマウント時の後片付け
          return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", onPageHide);
            stop();
          };
        } catch (e) {
          // コンソールにだけ出すと原因追跡しやすい
          console.error("[QR] init failed:", e);
        }
      };

      const cleanupPromise = boot();

      return () => {
        canceled = true;
        // boot() 内で登録したクリーンアップがあれば実行
        if (typeof (cleanupPromise as any) === "function") {
          (cleanupPromise as any)();
        }
        // 念のため停止
        if (scannerRef.current?.clear) {
          scannerRef.current.clear().catch(() => {});
          scannerRef.current = null;
        }
      };
    }, []);

    // 最低限の高さを確保（親のCSS都合で高さ0になるのを防ぐ）
    return (
      <div
        id={qrcodeRegionId}
        style={{ minHeight: 300 }}
        className="w-full"
      />
    );
  }
);
QrCodeScanner.displayName = "QrCodeScanner";

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

    // 3. 今日の利用予定者（JST基準）を取得：Timestamp保存・文字列保存の両方に対応
const { start, end } = jstStartEndOfToday();
const todayDash  = jstTodayDash();   // "yyyy-MM-dd"
const todaySlash = jstTodaySlash();  // "yyyy/MM/dd"

// a) date が Firestore Timestamp の場合（範囲クエリ）
let eventsSnapshot = await (async () => {
  try {
    const qTs = query(
      collection(db, "events"),
      where("date", ">=", start),
      where("date", "<=", end)
    );
    return await getDocs(qTs);
  } catch {
    return { empty: true, docs: [] } as any;
  }
})();

// b) date が 文字列（==）の場合（ダッシュ→ダメならスラッシュ）
if (eventsSnapshot.empty) {
  const s1 = await getDocs(query(collection(db, "events"), where("date", "==", todayDash)));
  eventsSnapshot = s1.empty
    ? await getDocs(query(collection(db, "events"), where("date", "==", todaySlash)))
    : s1;
}

// 参加者抽出（userId 単体 or participants: string[] の両対応）
const idsA = eventsSnapshot.docs
  .map(d => d.data()?.userId)
  .filter((v: any) => typeof v === "string");
const idsB = eventsSnapshot.docs
  .flatMap(d => Array.isArray(d.data()?.participants) ? d.data().participants : [])
  .filter((v: any) => typeof v === "string");

const scheduledUserIds = new Set<string>([...idsA, ...idsB]);

// 4. 今日すでに出欠がある人は除外（attendanceRecords のフォーマットに合わせて）
const todayForAttendance = todayDash; // ← "attendanceRecords.date" が "yyyy/MM/dd" なら todaySlash に変更
const todayRecordsQuery = query(
  collection(db, "attendanceRecords"),
  where("date", "==", todayForAttendance)
);
const todayRecordsSnapshot = await getDocs(todayRecordsQuery);
const alreadyIds = new Set<string>(todayRecordsSnapshot.docs.map(d => d.data()?.userId).filter(Boolean));

// 5. プルダウン候補を確定
const scheduledForToday = usersData
  .filter(u => scheduledUserIds.has(u.id) && !alreadyIds.has(u.id))
  .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, 'ja'));

setTodaysScheduledUsers(scheduledForToday);

// --- デバッグ出力（あとで消せます）
console.debug("[events range check]", {
  jstToday: todayDash,
  startUTC: start.toISOString(),
  endUTC: end.toISOString(),
  eventsDocs: eventsSnapshot.docs.length,
  scheduledIds: scheduledUserIds.size,
  alreadyToday: alreadyIds.size,
  result: scheduledForToday.length,
});

setDebugInfo({
  jstToday: todayDash,
  startUTC: start.toISOString(),
  endUTC: end.toISOString(),
  eventsDocs: eventsSnapshot.docs.length,
  scheduledIds: scheduledUserIds.size,
  alreadyToday: alreadyIds.size,
  result: scheduledForToday.length,
});

  }, [viewDate]);

  useEffect(() => {
    fetchData();
  }, [viewDate, fetchData]); // viewDateが変更されたら再実行
  
  const handleScan = useCallback(async (result: string) => {
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

  const [debugInfo, setDebugInfo] = useState<any>(null);

  return (
    <AppLayout pageTitle="出欠記録">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">QRコードスキャン (本日分)</h3>
            <div className="w-full">
              <QrCodeScanner onScanSuccess={handleScan} />
            </div>
            <p className="text-sm text-gray-500 mt-4 h-10">スキャン結果: <span className="font-semibold text-gray-700">{scanResult}</span></p>
          </div>
          <details className="mt-2 text-xs text-gray-500">
  <summary>debug（クリックで展開）</summary>
  <pre className="whitespace-pre-wrap break-words">
    {debugInfo ? JSON.stringify(debugInfo, null, 2) : "no debug"}
  </pre>
</details>
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
            <h3 className="text-xl font-bold text-gray-800 mb-6">{editingRecord.userName} の記録を編集</h3>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700">利用状況</label><select value={editingRecord.usageStatus} onChange={(e) => setEditingRecord({...editingRecord, usageStatus: e.target.value as '放課後' | '休校日' | '欠席'})} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"><option value="放課後">放課後 (◯)</option><option value="休校日">休校日 (◎)</option><option value="欠席">欠席</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700">来所時間</label><input value={editingRecord.arrivalTime || ''} onChange={(e) => setEditingRecord({...editingRecord, arrivalTime: e.target.value})} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700">退所時間</label><input value={editingRecord.departureTime || ''} onChange={(e) => setEditingRecord({...editingRecord, departureTime: e.target.value})} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700">特記事項</label><textarea value={editingRecord.notes || ''} onChange={(e) => setEditingRecord({...editingRecord, notes: e.target.value})} rows={3} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" /></div>
            </div>
            <div className="flex justify-end space-x-4 pt-6 mt-6 border-t">
              <button onClick={() => setIsEditModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">キャンセル</button>
              <button onClick={handleUpdateRecord} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">保存</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

