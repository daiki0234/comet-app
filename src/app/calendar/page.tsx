// src/app/calendar/page.tsx (PDF Generation Fix)

"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, doc, setDoc, addDoc, serverTimestamp, updateDoc ,deleteDoc } from 'firebase/firestore';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { AppLayout } from '@/components/Layout';
import { ServiceRecordSheet } from '@/components/ServiceRecordSheet';
import { createRoot } from 'react-dom/client';


// 型定義
type User = { id: string; lastName: string; firstName: string; allergies?: string; serviceHoDay?: string; serviceJihatsu?: string; serviceSoudan?: string; };
type EventData = {
  id: string;
  userId: string;
  date?: any;               // 既存互換（文字列 or Timestamp）
  dateKeyJst?: string;      // ★ 追加：JSTキー "yyyy-MM-dd"
  type: '放課後' | '休校日';
};
type Event = EventData & { userName: string; user: User; };
type PseudoRecord = { userName: string; date: string; usageStatus: '放課後' | '休校日' | '欠席' ; notes?: string; };
type GroupedUsers = { [serviceName: string]: Event[]; };

// --- JSTユーティリティ（保存・照合兼用） ---
const pad2 = (n: number) => n.toString().padStart(2, "0");

/** 入力が Date / "yyyy-MM-dd" / "yyyy/MM/dd" / ISO / 未指定 でも JSTキーを返す */
const jstDateKey = (src?: string | Date): string => {
  let d: Date;
  if (!src) {
    d = new Date();
  } else if (src instanceof Date) {
    d = src;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(src)) {
    const [y, m, dd] = src.split("-").map(Number);
    d = new Date(Date.UTC(y, m - 1, dd, 0, 0, 0));
  } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(src)) {
    const [y, m, dd] = src.split("/").map(Number);
    d = new Date(Date.UTC(y, m - 1, dd, 0, 0, 0));
  } else {
    d = new Date(src);
  }
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
};

/** 既存の画面表示用（日付文字列） */
const toDateString = (date: Date) => date.toISOString().split('T')[0];

export default function CalendarPage() {
  const [activeTab, setActiveTab] = useState('management');
  const [users, setUsers] = useState<User[]>([]);
  const [allEvents, setAllEvents] = useState<EventData[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDateForModal, setSelectedDateForModal] = useState<Date | null>(null);
  const [eventType, setEventType] = useState<'放課後' | '休校日'>('放課後');
  const [isPrinting, setIsPrinting] = useState(false);
  const [allergyModalUser, setAllergyModalUser] = useState<User | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const fetchInitialData = useCallback(async () => {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
    setUsers(usersData);
    
    const eventsSnapshot = await getDocs(collection(db, "events"));
    const eventsData = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as EventData[];
    setAllEvents(eventsData);
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const dailyScheduledUsers = useMemo(() => {
    if (!selectedDate || users.length === 0) return [];
    const dateKey = jstDateKey(selectedDate!);
    return allEvents
        .filter(event => (event.dateKeyJst ?? event.date) === dateKey)
        .map(event => {
          const user = users.find(u => u.id === event.userId);
          return { ...event, userName: user ? `${user.lastName} ${user.firstName}` : '不明', user: user! };
        })
        .filter(e => e.user);
  }, [selectedDate, users, allEvents]);

  const userSchedule = useMemo(() => {
    return allEvents.filter(event => event.userId === selectedUserId);
  }, [selectedUserId, allEvents]);

  const eventCounts = useMemo(() => {
    return allEvents.reduce((acc, event) => {
      const key = (event.dateKeyJst ?? event.date) as string;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as { [date: string]: number });
  }, [allEvents]);

  const handleDateClickForScheduling = (clickedDate: Date) => {
    if (!selectedUserId) { alert('先に利用者を選択してください。'); return; }
    setSelectedDateForModal(clickedDate);
const dateKey = jstDateKey(clickedDate);
const existingEvent = userSchedule.find(event => (event.dateKeyJst ?? event.date) === dateKey);
    setEventType(existingEvent ? existingEvent.type : '放課後');
    setIsModalOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!selectedUserId || !selectedDateForModal) return;
    const dateKey = jstDateKey(selectedDateForModal);
const existingEvent = userSchedule.find(event => (event.dateKeyJst ?? event.date) === dateKey);

if (existingEvent) {
  await setDoc(
    doc(db, "events", existingEvent.id),
    { type: eventType, dateKeyJst: dateKey },     // ★ JSTキーも補正保存
    { merge: true }
  );
} else {
  await addDoc(collection(db, 'events'), {
    userId: selectedUserId,
    dateKeyJst: dateKey,                          // ★ JSTキーで保存（本丸）
    date: serverTimestamp(),                      // 実時刻も別フィールドで保持（任意）
    type: eventType
  });
}
    setIsModalOpen(false);
    await fetchInitialData();
  };

  const handleDeleteEvent = async () => {
    if (!selectedUserId || !selectedDateForModal) return;
    const dateKey = jstDateKey(selectedDateForModal);
const existingEvent = userSchedule.find(event => (event.dateKeyJst ?? event.date) === dateKey);
    if (existingEvent) {
      await deleteDoc(doc(db, 'events', existingEvent.id));
    }
    setIsModalOpen(false);
    await fetchInitialData();
  };

  const handlePrintAll = async () => {
    if (dailyScheduledUsers.length === 0) { return alert('印刷する利用予定者がいません。'); }
    if (!selectedDate) { return alert('日付が選択されていません。'); } // 安全対策
    setIsPrinting(true);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'b5' });
    const recordsToPrint: (PseudoRecord | null)[] = dailyScheduledUsers.map(event => ({
      userName: event.userName, date: event.date, usageStatus: event.type as ('放課後' | '休校日'), notes: '',
    }));
    if (recordsToPrint.length % 2 !== 0) {
      recordsToPrint.push(null);
    }
    const userPairs: (PseudoRecord | null)[][] = [];
    for (let i = 0; i < recordsToPrint.length; i += 2) {
      userPairs.push([recordsToPrint[i], recordsToPrint[i+1]]);
    }

    for (let i = 0; i < userPairs.length; i++) {
      const pair = userPairs[i];
      const tempDiv = document.createElement('div');
      tempDiv.style.width = '182mm';
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-2000px';
      document.body.appendChild(tempDiv);
      
      const root = createRoot(tempDiv);
      root.render(
        <React.StrictMode>
          <ServiceRecordSheet record={pair[0]} />
          <ServiceRecordSheet record={pair[1]} />
        </React.StrictMode>
      );
      await new Promise(r => setTimeout(r, 500)); 

      try {
        const canvas = await html2canvas(tempDiv, { scale: 3 });
        if (i > 0) { pdf.addPage(); }
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      } catch (e) {
        console.error("PDF生成中にエラーが発生しました:", e);
        alert("PDFの生成に失敗しました。");
      }
      
      root.unmount();
      document.body.removeChild(tempDiv);
    }

    // ★★★ エラー箇所を修正 ★★★
    pdf.save(`${toDateString(selectedDate)}_サービス提供記録.pdf`);
    setIsPrinting(false);
  };
  
  const tileClassName = ({ date: d, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const dateKey = jstDateKey(d);
      if (userSchedule.some(event => (event.dateKeyJst ?? event.date) === dateKey)) {
        return 'scheduled-day';
      }
    }
    return null;
  };

  const tileContent = ({ date: d, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const dateStr = toDateString(d);
      const count = eventCounts[dateStr];
      if (count > 0) {
        return <p className="text-xs text-gray-600 m-0 mt-1 text-center">{`予定:${count}人`}</p>;
      }
    }
    return null;
  };

  const groupedUsers = useMemo(() => dailyScheduledUsers.reduce((acc, event) => {
    const user = event.user;
    if (user.serviceHoDay === '利用中') {
      if (!acc['■放課後等デイサービス']) acc['■放課後等デイサービス'] = [];
      acc['■放課後等デイサービス'].push(event);
    }
    if (user.serviceJihatsu === '利用中') {
      if (!acc['■児童発達支援']) acc['■児童発達支援'] = [];
      acc['■児童発達支援'].push(event);
    }
    if (user.serviceSoudan === '利用中') {
      if (!acc['■相談支援']) acc['■相談支援'] = [];
      acc['■相談支援'].push(event);
    }
    return acc;
  }, {} as GroupedUsers), [dailyScheduledUsers]);

  async function backfillDateKeyJst() {
  const snap = await getDocs(collection(db, "events"));
  for (const d of snap.docs) {
    const data = d.data() as any;
    if (!data.dateKeyJst) {
      const key = jstDateKey(data.date); // dateが文字列/ISO/TimestampでもOK（上の関数で正規化）
      if (key) await updateDoc(doc(db, "events", d.id), { dateKeyJst: key });
    }
  }
  alert("dateKeyJst を補完しました");
}
  
  return (
    <AppLayout pageTitle="カレンダー・予定管理">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button onClick={() => setActiveTab('management')} className={`py-3 px-4 text-sm font-medium ${activeTab === 'management' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>利用管理</button>
          <button onClick={() => setActiveTab('schedule')} className={`py-3 px-4 text-sm font-medium ${activeTab === 'schedule' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>利用者予定管理</button>
        </div>
        
        {isModalOpen && selectedDateForModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl">
              <h3 className="text-lg font-semibold mb-4">{selectedDateForModal.toLocaleDateString()} の予定</h3>
              <select value={eventType} onChange={(e) => setEventType(e.target.value as '放課後' | '休校日')} className="p-2 border rounded w-full">
                <option value="放課後">放課後</option>
                <option value="休校日">休校日</option>
              </select>
              <div className="mt-6 flex justify-end space-x-3">
                <button onClick={() => setIsModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">キャンセル</button>
                {userSchedule.some(e => e.date === selectedDateForModal.toISOString().split('T')[0]) && 
                  <button onClick={handleDeleteEvent} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded">削除</button>
                }
                <button onClick={handleSaveEvent} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">保存</button>
              </div>
            </div>
          </div>
        )}

        {allergyModalUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={() => setAllergyModalUser(null)}>
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-4">{allergyModalUser.lastName} {allergyModalUser.firstName} さんのアレルギー・持病情報</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{allergyModalUser.allergies}</p>
              <div className="mt-6 text-right">
                <button onClick={() => setAllergyModalUser(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">閉じる</button>
              </div>
            </div>
          </div>
        )}
        <div className="mt-6">
          {activeTab === 'management' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              <div className="w-full">
                <Calendar onChange={(value) => setSelectedDate(value as Date)} value={selectedDate} locale="ja-JP" tileContent={tileContent} />
              </div>
              <div className="flex-1">
                {selectedDate ? (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-semibold text-gray-800">{selectedDate.toLocaleDateString()} の利用予定者</h2>
                      <button onClick={handlePrintAll} disabled={dailyScheduledUsers.length === 0 || isPrinting} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400">
                        {isPrinting ? 'PDF生成中...' : 'まとめて印刷'}
                      </button>
                    </div>
                    <div className="space-y-4">
                      {Object.keys(groupedUsers).length > 0 ? (
                        Object.entries(groupedUsers).map(([serviceName, usersInService]) => (
                          <div key={serviceName}>
                            <h4 className="font-bold text-gray-700">{serviceName}</h4>
                            <ul className="list-disc list-inside ml-4 mt-2 text-gray-600 space-y-1">
                              {usersInService.map(event => (
                                <li key={event.id}>
                                  {event.userName}
                                  {event.user.allergies && (
                                    <button onClick={() => setAllergyModalUser(event.user)} className="ml-2 text-red-500 font-bold text-lg hover:text-red-700 leading-none align-middle">＊</button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500 text-sm">この日の利用予定者はいません。</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 pt-10 h-full flex flex-col justify-center items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 mb-4"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path><path d="m14 16-2 2-2-2"></path></svg>
                    <p>カレンダーの日付を選択して、<br/>その日の利用予定者を表示します。</p>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'schedule' && (
            <div>
              <p className="text-gray-600 mb-4">カレンダーから利用予定日をクリックして登録・編集します。</p>
              <div className="mb-4">
                <label className="mr-2 font-medium">利用者:</label>
                <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="p-2 border border-gray-300 rounded-md">
                  <option value="">選択してください</option>
                  {users.map(user => (<option key={user.id} value={user.id}>{user.lastName} {user.firstName}</option>))}
                </select>
              </div>
              {selectedUserId && <Calendar onClickDay={handleDateClickForScheduling} tileClassName={tileClassName} locale="ja-JP"/>}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}