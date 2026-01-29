"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, doc, setDoc, serverTimestamp, deleteDoc, getDoc, query, where } from 'firebase/firestore';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { AppLayout } from '@/components/Layout';
import { ServiceRecordSheet } from '@/components/ServiceRecordSheet';
import { createRoot } from 'react-dom/client';
import toast from 'react-hot-toast';

// 祝日取得関数
async function fetchJapaneseHolidays(year: number): Promise<string[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY; 
  const calendarId = 'ja.japanese%23holiday%40group.v.calendar.google.com';
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
              `?key=${apiKey}&timeMin=${year}-01-01T00:00:00Z&timeMax=${year}-12-31T23:59:59Z`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items) return [];
    return data.items.map((item: any) => item.start.date);
  } catch (e) {
    console.error("Holiday fetch error:", e);
    return [];
  }
}

type ScheduleStatus = '放課後' | '休校日' | 'キャンセル待ち' | '欠席' | '取り消し';

const STATUS_TILE_CLASS: Partial<Record<ScheduleStatus, string>> = {
  放課後: 'bg-green-200',
  休校日: 'bg-orange-200',
};

const USER_SCHEDULE_CLASS: Partial<Record<ScheduleStatus, string>> = {
  '放課後': 'bg-blue-100 border-2 border-blue-500',
  '休校日': 'bg-yellow-100 border-2 border-yellow-500',
  'キャンセル待ち': 'bg-gray-200 border-2 border-gray-500',
  '欠席': 'bg-red-100 border-2 border-red-500',
  '取り消し': 'bg-pink-100 border-2 border-pink-500',
};

const USER_SCHEDULE_TEXT_CLASS: Partial<Record<ScheduleStatus, string>> = {
  '放課後': 'text-blue-700',
  '休校日': 'text-yellow-700',
  'キャンセル待ち': 'text-gray-600',
  '欠席': 'text-red-600',
  '取り消し': 'text-pink-600',
};

const STATUS_PRIORITY: ScheduleStatus[] = ['休校日', '放課後', 'キャンセル待ち', '欠席', '取り消し'];

function buildEventsMap(
  events: Array<{ dateKeyJst: string; type: ScheduleStatus; userId: string }>
) {
  const map = new Map<string, { date: string; items: { userId: string; status: ScheduleStatus }[] }>();
  for (const ev of events) {
    const key = ev.dateKeyJst;
    if (!map.has(key)) map.set(key, { date: key, items: [] });
    map.get(key)!.items.push({ userId: ev.userId, status: ev.type });
  }
  return map;
}

type User = { id: string; lastName: string; firstName: string; allergies?: string; serviceHoDay?: string; serviceJihatsu?: string; serviceSoudan?: string; };

type EventData = {
  id: string;
  userId: string;
  date?: any;                
  dateKeyJst?: string;      
  type: ScheduleStatus; 
  createdAt?: any;
  updatedAt?: any;
};
type Event = EventData & { userName: string; user: User; };
type PseudoRecord = { userName: string; date: string; usageStatus: '放課後' | '休校日' | '欠席'; notes?: string; };
type GroupedUsers = { [serviceName: string]: Event[]; };

type ServiceStatus = '契約なし' | '利用中' | '休止中' | '契約終了';
const toServiceStatus = (v: unknown): ServiceStatus =>
  v === '1' || v === 1 || v === true || v === '利用中' ? '利用中' : '契約なし';

type SheetRecord = React.ComponentProps<typeof ServiceRecordSheet>['record'];
type SheetRecordNonNull = NonNullable<SheetRecord>;

const toSheetRecord = (r: PseudoRecord | null): SheetRecord => {
  if (!r || r.usageStatus == null) return null; 
  const conv: SheetRecordNonNull = {
    userName: r.userName,
    date: r.date,
    usageStatus: r.usageStatus, 
    notes: r.notes ?? "",
  };
  return conv;
};

const pad2 = (n: number) => n.toString().padStart(2, "0");

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

const toDateString = (date: Date) => {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
};

const formatDateSlash = (val: any) => {
  if (!val) return '-';
  try {
    const d = val.toDate ? val.toDate() : new Date(val);
    if (isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  } catch (e) {
    return '-';
  }
};

export default function CalendarPage() {
  const [activeTab, setActiveTab] = useState('management');
  const [users, setUsers] = useState<User[]>([]);
  const [allEvents, setAllEvents] = useState<EventData[]>([]);
  
  const [businessDays, setBusinessDays] = useState<Record<string, string>>({});

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDateForModal, setSelectedDateForModal] = useState<Date | null>(null);
  const [eventType, setEventType] = useState<ScheduleStatus>('放課後');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPrintingSingle, setIsPrintingSingle] = useState(false);
  
  // アレルギー表示を展開中のユーザーID
  const [expandedAllergyUserId, setExpandedAllergyUserId] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  
  const [activeStartDate, setActiveStartDate] = useState<Date>(new Date());

  const [userSearchQuery, setUserSearchQuery] = useState('');

  const searchMatchedUsers = useMemo(() => {
    const queryText = userSearchQuery.trim();
    if (!queryText) return [];
    
    const lowerQuery = queryText.toLowerCase();
    return users.filter(user => {
      const fullName = `${user.lastName || ''}${user.firstName || ''}`;
      return fullName.toLowerCase().includes(lowerQuery);
    });
  }, [userSearchQuery, users]);

  useEffect(() => {
    const y = new Date().getFullYear();
    fetchJapaneseHolidays(y).then(list => {
      if (list.length > 0) setHolidays(new Set(list));
    });
  }, []);

  const eventsMap = useMemo(
    () => buildEventsMap(
      allEvents.map(ev => ({
        dateKeyJst: ev.dateKeyJst as string,
        type: ev.type as ScheduleStatus,
        userId: ev.userId as string,
      }))
    ),
    [allEvents]
  );

  const fetchInitialData = useCallback(async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersDataRaw = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      const usersData = usersDataRaw.map(u => ({
        ...u,
        serviceHoDay: toServiceStatus(u.serviceHoDay),
        serviceJihatsu: toServiceStatus(u.serviceJihatsu),
        serviceSoudan: toServiceStatus(u.serviceSoudan),
      })) as User[];
      setUsers(usersData);

      const eventsSnapshot = await getDocs(collection(db, "events"));
      const eventsData = eventsSnapshot.docs.map(doc => {
        const data = doc.data() as any;
        let key = data.dateKeyJst; 
        if (!key && doc.id.includes('_')) {
          const potentialKey = doc.id.split('_')[0];
          if (potentialKey.length === 10 && potentialKey.charAt(4) === '-') {
            key = potentialKey;
          }
        }
        if (!key && data.date) {
          try {
            const dateObj = data.date.toDate ? data.date.toDate() : new Date(data.date);
            key = toDateString(dateObj);
          } catch (e) {}
        }
        
        return {
          ...(data as EventData),
          id: doc.id,
          dateKeyJst: key,
        };
      });

      setAllEvents(eventsData);

      const busSnapshot = await getDocs(collection(db, 'businessDays'));
      const busData: Record<string, string> = {};
      busSnapshot.forEach(doc => {
        const d = doc.data();
        busData[d.date] = d.status;
      });
      setBusinessDays(busData);

    } catch (error) {
      console.error("データの初期読み込みに失敗しました:", error);
      alert("カレンダーデータの読み込みに失敗しました。");
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const monthlySummary = useMemo(() => {
    const year = activeStartDate.getFullYear();
    const month = activeStartDate.getMonth() + 1;
    const prefix = `${year}-${pad2(month)}`;

    let totalUnits = 0;
    let totalAbsences = 0;

    allEvents.forEach(ev => {
      if (ev.dateKeyJst && ev.dateKeyJst.startsWith(prefix)) {
        if (ev.type === '放課後' || ev.type === '休校日') {
          totalUnits++;
        } else if (ev.type === '欠席') {
          totalAbsences++;
        }
      }
    });

    return { totalUnits, totalAbsences };
  }, [allEvents, activeStartDate]);

  const onActiveStartDateChange = ({ activeStartDate }: { activeStartDate: Date | null }) => {
    if (activeStartDate) {
      setActiveStartDate(activeStartDate);
    }
  };

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

  const groupedUsers = useMemo(() => {
    const groups: Record<string, typeof dailyScheduledUsers> = {};
    dailyScheduledUsers.forEach(event => {
      const isJihatsu = event.user.serviceJihatsu === '利用中';
      const key = isJihatsu ? '児童発達支援' : '放課後等デイサービス';
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return groups;
  }, [dailyScheduledUsers]);

  const userSchedule = useMemo(() => {
    return allEvents.filter(event => event.userId === selectedUserId);
  }, [selectedUserId, allEvents]);

  const handleQuickStatusChange = async (event: EventData, newStatus: ScheduleStatus) => {
    if (!event.id) return;
    
    setAllEvents(prev => prev.map(ev => 
      ev.id === event.id ? { ...ev, type: newStatus } : ev
    ));

    try {
      const docRef = doc(db, "events", event.id);
      await setDoc(docRef, { 
        type: newStatus,
        updatedAt: serverTimestamp() 
      }, { merge: true });
      toast.success("予定を更新しました");
      fetchInitialData();
    } catch (error) {
      console.error("更新エラー:", error);
      toast.error("更新に失敗しました");
      fetchInitialData();
    }
  };

  const handleDateClickForScheduling = (clickedDate: Date) => {
    const dateKey = toDateString(clickedDate);
    if (businessDays[dateKey] === 'CLOSED') {
      toast.error('休所日のため選択できません');
      return; 
    }

    if (!selectedUserId) {
      alert('先に利用者を選択してください。');
      return;
    }
    setSelectedDateForModal(clickedDate);
    const existingEvent = userSchedule.find(event => (event.dateKeyJst ?? event.date) === dateKey);
    setEventType(existingEvent ? existingEvent.type : '放課後');
    setIsModalOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!selectedUserId || !selectedDateForModal) return;
    const dateKey = toDateString(selectedDateForModal);
    const docId = `${dateKey}_${selectedUserId}`;
    const docRef = doc(db, "events", docId);

    const legacyEvent = userSchedule.find(
      event => (event.dateKeyJst ?? event.date) === dateKey && event.id !== docId
    );

    try {
      const docSnap = await getDoc(docRef);
      const isNew = !docSnap.exists();

      const payload: any = {
        userId: selectedUserId,
        dateKeyJst: dateKey,        
        type: eventType,            
        date: serverTimestamp(), 
        updatedAt: serverTimestamp(),
      };

      if (isNew) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(docRef, payload, { merge: true });

      if (legacyEvent) {
        await deleteDoc(doc(db, 'events', legacyEvent.id));
      }
    } catch (error) {
      alert("保存に失敗しました。");
    }
    setIsModalOpen(false);
    await fetchInitialData(); 
  };

  const handleDeleteEvent = async () => {
    if (!selectedUserId || !selectedDateForModal) return;
    const dateKey = toDateString(selectedDateForModal);
    const docId = `${dateKey}_${selectedUserId}`;
    const docRef = doc(db, "events", docId);
    const legacyEvent = userSchedule.find(event => (event.dateKeyJst ?? event.date) === dateKey);
    try {
      await deleteDoc(docRef);
      if (legacyEvent && legacyEvent.id !== docId) {
        await deleteDoc(doc(db, 'events', legacyEvent.id));
      }
    } catch (error) {}
    setIsModalOpen(false);
    await fetchInitialData();
  };

  const handlePrintSingleRecord = async () => {
    if (!selectedUserId || !selectedDateForModal) return;
    setIsPrintingSingle(true);
    const dateKey = toDateString(selectedDateForModal);
    const user = users.find(u => u.id === selectedUserId);
    if (!user) { setIsPrintingSingle(false); return; }

    try {
      const recordToPrint: PseudoRecord = {
        userName: `${user.lastName} ${user.firstName}`,
        date: dateKey, usageStatus: eventType as any, notes: '',
      };
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'b5' });
      const tempDiv = document.createElement('div');
      tempDiv.style.width = '182mm'; tempDiv.style.position = 'absolute'; tempDiv.style.left = '-2000px';
      document.body.appendChild(tempDiv);
      const root = createRoot(tempDiv);
      root.render(
  <React.StrictMode>
    <ServiceRecordSheet record={toSheetRecord(recordToPrint)} index={0} />
    <ServiceRecordSheet record={null} index={1} />
  </React.StrictMode>
);
      await new Promise(r => setTimeout(r, 500)); 
      const canvas = await html2canvas(tempDiv, { scale: 3 });
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, 'FAST');
      root.unmount(); document.body.removeChild(tempDiv);
      pdf.save(`${dateKey}_${user.lastName}${user.firstName}_サービス提供記録.pdf`);
    } catch (e) { alert("PDF生成失敗"); } finally { setIsPrintingSingle(false); setIsModalOpen(false); }
  };

  const handlePrintAll = async () => {
    if (!selectedDate) return;

    const targetUsers = dailyScheduledUsers.filter(event => 
      event.type === '放課後' || event.type === '休校日'
    );

    if (targetUsers.length === 0) {
      alert('印刷対象（放課後・休校日）の利用者がいません。');
      return;
    }

    setIsPrinting(true);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'b5' });
    
    const records: (PseudoRecord | null)[] = targetUsers.map(event => ({
      userName: event.userName, 
      date: (event.dateKeyJst ?? ''), 
      usageStatus: event.type as any, 
      notes: '',
    }));
    
    if (records.length % 2 !== 0) records.push(null);
    
    for (let i = 0; i < records.length; i += 2) {
      const pair = [records[i], records[i+1]];
      const tempDiv = document.createElement('div');
      tempDiv.style.width = '182mm'; tempDiv.style.position = 'absolute'; tempDiv.style.left = '-2000px';
      document.body.appendChild(tempDiv);
      const root = createRoot(tempDiv);
      
      root.render(
        <React.StrictMode>
    {/* 上段: index 0 (偶数) なので線が出る */}
    <ServiceRecordSheet record={toSheetRecord(pair[0])} index={0} />
    
    {/* 下段: index 1 (奇数) なので線が消える */}
    <ServiceRecordSheet record={toSheetRecord(pair[1])} index={1} />
  </React.StrictMode>
      );
      
      await new Promise(r => setTimeout(r, 500)); 
      if (i > 0) pdf.addPage();
      const canvas = await html2canvas(tempDiv, { scale: 3 });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, 'FAST');
      root.unmount(); document.body.removeChild(tempDiv);
    }
    pdf.save(`${jstDateKey(selectedDate)}_サービス提供記録.pdf`);
    setIsPrinting(false);
  };

  const ymdJST = (d: Date) => {
    const j = new Date(d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
    return `${j.getFullYear()}-${pad2(j.getMonth() + 1)}-${pad2(j.getDate())}`;
  };

  const scheduleTileClassName = useCallback(({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return undefined;
    const key = ymdJST(date);
    const dateKey = toDateString(date);

    // ★ 修正: 休所日のスタイル (グレー背景 + クリック無効)
    if (businessDays[dateKey] === 'CLOSED') {
      return 'bg-gray-400 text-gray-500 pointer-events-none cursor-not-allowed opacity-60 rounded-lg border-2 border-white';
    }

    // ★ 修正: 日付間の余白と角丸 (border-2 border-white, rounded-lg, shadow-sm を追加)
    const classes: string[] = ['comet-tile', 'border-2', 'border-white', 'rounded-lg', 'shadow-sm'];
    
    if (holidays.has(key) || date.getDay() === 0) classes.push('!text-red-600', 'font-semibold'); 
    else if (date.getDay() === 6) classes.push('!text-blue-600', 'font-semibold'); 
    else if (date.getDay() === 5) classes.push('!text-black', 'font-normal'); 

    const day = eventsMap.get(dateKey);
    if (day) {
      const counts: any = {};
      day.items.forEach(it => { counts[it.status] = (counts[it.status] ?? 0) + 1; });
      if ((counts['放課後'] || 0) + (counts['休校日'] || 0) > 14) classes.push('!bg-orange-100', 'font-bold');
      else {
        const main = STATUS_PRIORITY.find(s => day.items.some(it => it.status === s));
        const cls = main ? STATUS_TILE_CLASS[main] : undefined;
        if (cls) classes.push(`!text-black ${cls}`);
      }
    }
    if (selectedUserId) {
      const event = userSchedule.find(e => e.dateKeyJst === dateKey);
      if (event) {
        const scheduleClass = USER_SCHEDULE_CLASS[event.type as ScheduleStatus];
        if (scheduleClass) classes.push(...scheduleClass.split(' '));
      }
    }
    return classes.join(' ');
  }, [userSchedule, selectedUserId, holidays, eventsMap, businessDays]);

  const managementTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const key = toDateString(date);
    const day = eventsMap.get(key);
    if (!day) return null; 

    const counts: Record<ScheduleStatus, number> = { 放課後: 0, 休校日: 0, キャンセル待ち: 0, 欠席: 0, 取り消し: 0 };
    let houkagoHasJihatsu = false, kyukouHasJihatsu = false;

    day.items.forEach(it => { 
      counts[it.status] = (counts[it.status] ?? 0) + 1; 
      const u = users.find(user => user.id === it.userId);
      if (u && (u.serviceJihatsu === '利用中' || u.serviceJihatsu === '1')) {
        if (it.status === '放課後') houkagoHasJihatsu = true;
        else if (it.status === '休校日') kyukouHasJihatsu = true;
      }
    });

    return (
      <div className="px-1 pb-1 pointer-events-none text-[12px] leading-tight font-medium">
        {counts['放課後'] > 0 && <div className="text-green-700">放課後: {counts['放課後']}人 {houkagoHasJihatsu && <span className="ml-1 text-[10px] text-blue-600 font-bold border border-blue-400 rounded px-[2px] bg-white leading-none">児発含</span>}</div>}
        {counts['休校日'] > 0 && <div className="text-orange-700">休校日: {counts['休校日']}人 {kyukouHasJihatsu && <span className="ml-1 text-[10px] text-blue-600 font-bold border border-blue-400 rounded px-[2px] bg-white leading-none">児発含</span>}</div>}
        {counts['キャンセル待ち'] > 0 && <div className="text-gray-600">ｷｬﾝｾﾙ待ち: {counts['キャンセル待ち']}人</div>}
        {(counts['欠席'] > 0 || counts['取り消し'] > 0) && <div className="text-red-600">欠:{counts['欠席']} 取:{counts['取り消し']}</div>}
      </div>
    );
  };

  const scheduleTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const key = toDateString(date);
    const day = eventsMap.get(key);

    let totalCountsContent = null;
    if (day) {
      const counts: Record<ScheduleStatus, number> = {
        放課後: 0, 休校日: 0, キャンセル待ち: 0, 欠席: 0, 取り消し: 0,
      };
      
      let houkagoHasJihatsu = false;
      let kyukouHasJihatsu = false;

      day.items.forEach(it => { 
        counts[it.status] = (counts[it.status] ?? 0) + 1; 
        const u = users.find(user => user.id === it.userId);
        if (u && u.serviceJihatsu === '利用中') {
          if (it.status === '放課後') houkagoHasJihatsu = true;
          else if (it.status === '休校日') kyukouHasJihatsu = true;
        }
      });

      const houkagoCount = counts['放課後'];
      const kyukouCount = counts['休校日'];
      const waitCount = counts['キャンセル待ち'];

      const Badge = () => (
        <span className="ml-1 text-[9px] text-blue-600 font-bold border border-blue-400 rounded px-[1px] bg-white">
          児発含
        </span>
      );

      totalCountsContent = (
        <div className="text-[12px] leading-tight text-gray-700">
          {houkagoCount > 0 && <div className="flex items-center flex-wrap">放課後: {houkagoCount}人 {houkagoHasJihatsu && <Badge />}</div>}
          {kyukouCount > 0 && <div className="flex items-center flex-wrap">休校日: {kyukouCount}人 {kyukouHasJihatsu && <Badge />}</div>}
          {waitCount > 0 && <div>ｷｬﾝｾﾙ: {waitCount}人</div>}
        </div>
      );
    }

    let userStatusContent = null;
    if (selectedUserId) {
      const event = userSchedule.find(e => e.dateKeyJst === key);
      if (event) {
        const textColor = USER_SCHEDULE_TEXT_CLASS[event.type] || 'text-black';
        userStatusContent = (
          <div className={`mt-1 text-[14px] font-bold ${textColor}`}>
            {event.type}
          </div>
        );
      }
    }

    return (
      <div className="px-1 pb-1">
        {totalCountsContent}
        {userStatusContent}
      </div>
    );
  };

  return (
    <AppLayout pageTitle="カレンダー・予定管理">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        <div className="flex border-b border-gray-200 mb-6">
          <button onClick={() => setActiveTab('management')} className={`py-3 px-4 text-sm font-medium ${activeTab === 'management' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>利用管理</button>
          <button onClick={() => setActiveTab('schedule')} className={`py-3 px-4 text-sm font-medium ${activeTab === 'schedule' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>利用者予定管理</button>
        </div>
        
        {/* --- モーダル (汎用) --- */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
            <div className="relative z-[201] bg-white p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto m-4">
              
              {/* 閉じるボタン */}
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                title="閉じる"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* --- 1. 利用管理 (一覧モード) の内容 --- */}
              {activeTab === 'management' && selectedDate && (
                <>
                  <div className="flex justify-between items-center mb-4 pr-8">
                    <h3 className="text-lg font-semibold text-gray-800">{selectedDate.toLocaleDateString()} の利用予定者</h3>
                    <button onClick={handlePrintAll} disabled={dailyScheduledUsers.length === 0 || isPrinting} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 text-sm whitespace-nowrap">
                      {isPrinting ? '作成中...' : 'まとめて印刷'}
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {Object.keys(groupedUsers).length > 0 ? (
                      Object.entries(groupedUsers).map(([serviceName, usersInService]) => (
                        <div key={serviceName}>
                          <h4 className="font-bold text-gray-700 border-l-4 border-blue-500 pl-2 mb-2">{serviceName}</h4>
                          <ul className="space-y-2">
                            {usersInService.map(event => (
                              <li key={event.id} className="flex flex-col bg-gray-50 rounded-lg border border-gray-100 p-2 hover:bg-gray-100 transition-colors">
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center">
                                    <span className="font-medium text-gray-800">{event.userName}</span>
                                    {event.user.allergies && (
                                      // ★ アレルギー展開ボタン
                                      <button 
                                        onClick={() => setExpandedAllergyUserId(expandedAllergyUserId === event.userId ? null : event.userId)}
                                        className={`ml-2 font-bold text-lg leading-none align-middle transition-colors ${expandedAllergyUserId === event.userId ? 'text-red-700' : 'text-red-500 hover:text-red-700'}`}
                                        title="アレルギー情報を表示"
                                      >
                                        ＊
                                      </button>
                                    )}
                                    <div className="flex flex-col ml-4 text-[10px] text-gray-500 leading-tight">
                                      <span>登録日：{formatDateSlash(event.createdAt || event.date)}</span>
                                      <span>更新日：{formatDateSlash(event.updatedAt || event.date)}</span>
                                    </div>
                                  </div>
                                  
                                  <select 
                                    value={event.type} 
                                    onChange={(e) => handleQuickStatusChange(event, e.target.value as ScheduleStatus)}
                                    className={`
                                      ml-3 text-sm font-semibold border rounded p-1 cursor-pointer outline-none focus:ring-2 focus:ring-blue-300
                                      ${USER_SCHEDULE_TEXT_CLASS[event.type as ScheduleStatus]}
                                      bg-white border-gray-300
                                    `}
                                  >
                                    <option value="放課後" className="text-blue-700">放課後</option>
                                    <option value="休校日" className="text-yellow-700">休校日</option>
                                    <option value="キャンセル待ち" className="text-gray-600">キャンセル待ち</option>
                                    <option value="欠席" className="text-red-600">欠席</option>
                                    <option value="取り消し" className="text-pink-600">取り消し</option>
                                  </select>
                                </div>

                                {/* ★ アレルギー情報展開エリア */}
                                {expandedAllergyUserId === event.userId && event.user.allergies && (
                                  <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 animate-fadeIn">
                                    <strong>【アレルギー・持病】</strong><br/>
                                    <span className="whitespace-pre-wrap">{event.user.allergies}</span>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm py-4 text-center">この日の利用予定者はいません。</p>
                    )}
                  </div>
                  <div className="mt-6 text-right">
                    <button onClick={() => setIsModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">閉じる</button>
                  </div>
                </>
              )}

              {/* --- 2. 利用者予定管理 (追加・削除モード) の内容 --- */}
              {activeTab === 'schedule' && selectedDateForModal && (
                <>
                  <h3 className="text-lg font-semibold mb-1">{selectedDateForModal.toLocaleDateString()} の予定</h3>
                  <div className="text-xs text-gray-500 mb-4">
                    {(() => {
                      const evt = userSchedule.find(e => (e.dateKeyJst ?? e.date) === toDateString(selectedDateForModal));
                      if (!evt) return "新規登録";
                      return `登録日: ${formatDateSlash(evt.createdAt || evt.date)} ｜ 更新日: ${formatDateSlash(evt.updatedAt || evt.date)}`;
                    })()}
                  </div>

                  <select value={eventType} onChange={(e) => setEventType(e.target.value as ScheduleStatus)} className="p-2 border rounded w-full">
                    <option value="放課後">放課後</option>
                    <option value="休校日">休校日</option>
                    <option value="キャンセル待ち">キャンセル待ち</option>
                    <option value="欠席">欠席</option>
                    <option value="取り消し">取り消し</option>
                  </select>
                  <div className="mt-6 flex flex-wrap justify-end gap-3">
                    {(eventType === '放課後' || eventType === '休校日') && (
                      <button 
                        onClick={handlePrintSingleRecord} 
                        disabled={isPrintingSingle}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400 mr-auto"
                      >
                        {isPrintingSingle ? '作成中...' : '提供記録作成'}
                      </button>
                    )}
                    <button onClick={() => setIsModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">キャンセル</button>
                    
                    {userSchedule.some(e => e.dateKeyJst === toDateString(selectedDateForModal)) && 
                      <button 
                        onClick={handleDeleteEvent} 
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
                        disabled={isPrintingSingle} 
                      >
                        削除
                      </button>
                    }
                    
                    <button 
                      onClick={handleSaveEvent} 
                      className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                      disabled={isPrintingSingle} 
                    >
                      保存
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div>
          {activeTab === 'management' && (
            <div className="grid grid-cols-1 gap-8 items-start">
              <div className="w-full">
                {/* サマリー表示エリア */}
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-center">
                    <div className="text-sm text-blue-600 font-bold">当月合計コマ数</div>
                    <div className="text-2xl font-bold text-blue-800">{monthlySummary.totalUnits}</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg border border-red-200 text-center">
                    <div className="text-sm text-red-600 font-bold">当月欠席数</div>
                    <div className="text-2xl font-bold text-red-800">{monthlySummary.totalAbsences}</div>
                  </div>
                </div>

                <Calendar 
                  className="comet-cal" 
                  onChange={(value) => {
                    const date = value as Date;
                    const dateKey = toDateString(date);
                    if (businessDays[dateKey] === 'CLOSED') {
                      return; 
                    }
                    setSelectedDate(date);
                    setIsModalOpen(true); 
                  }} 
                  value={selectedDate} 
                  locale="ja-JP"
                  calendarType="hebrew"
                  tileClassName={scheduleTileClassName}
                  tileContent={managementTileContent}
                  onActiveStartDateChange={onActiveStartDateChange}
                />
              </div>
            </div>
          )}
          {activeTab === 'schedule' && (
            <div>
              {/* 利用者予定管理タブ (検索機能付き) */}
              <div className="mb-4 relative">
                <label className="mr-2 font-medium">利用者:</label>
                <div className="inline-block relative">
                  <input type="text" value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} placeholder={users.length > 0 ? "氏名を入力して検索..." : "読み込み中..."} className="p-2 border border-gray-300 rounded-md w-64" />
                  {userSearchQuery && searchMatchedUsers.length > 0 && (
                    <ul className="absolute top-full left-0 z-50 w-full max-h-60 overflow-y-auto bg-white border border-blue-400 rounded-md shadow-lg mt-1">
                      {searchMatchedUsers.map(user => (
                        <li key={user.id} onClick={() => { setSelectedUserId(user.id); setUserSearchQuery(''); }} className="p-2 cursor-pointer hover:bg-blue-100 text-sm border-b last:border-b-0">{user.lastName} {user.firstName}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {selectedUserId && <span className="ml-2 text-blue-600 font-bold">選択中: {users.find(u => u.id === selectedUserId)?.lastName} {users.find(u => u.id === selectedUserId)?.firstName}</span>}
                {selectedUserId && <button onClick={() => setSelectedUserId('')} className="ml-2 text-xs text-gray-500 hover:text-red-500 underline">解除</button>}
              </div>

              <Calendar className="comet-cal" onChange={(value) => { 
                let clickedDate: Date | null = null; 
                if (Array.isArray(value)) { clickedDate = value[0] as Date; } else { clickedDate = value as Date; } 
                if (!clickedDate) return; 
                setSelectedDate(clickedDate); 
                handleDateClickForScheduling(clickedDate); 
              }} value={selectedDate} locale="ja-JP" calendarType="hebrew" tileClassName={scheduleTileClassName} 
              tileContent={(props) => (
                <div className="pointer-events-none relative z-0">
                  {scheduleTileContent(props)}
                </div>
              )}
              />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}