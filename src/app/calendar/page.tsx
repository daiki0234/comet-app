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

// 祝日をGoogle Calendar APIから取得
async function fetchJapaneseHolidays(year: number): Promise<string[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY; // .env.local に用意
  const calendarId = 'ja.japanese%23holiday%40group.v.calendar.google.com';
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
              `?key=${apiKey}&timeMin=${year}-01-01T00:00:00Z&timeMax=${year}-12-31T23:59:59Z`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items) return [];
  return data.items.map((item: any) => item.start.date); // "YYYY-MM-DD"
}

// ===== ここから追記（既存と重複しないように） =====
type ScheduleStatus = '放課後' | '休校日' | 'キャンセル待ち' | '欠席' | '取り消し';

const STATUS_TILE_CLASS: Partial<Record<ScheduleStatus, string>> = {
  放課後: 'bg-green-200',
  休校日: 'bg-orange-200',
};

const STATUS_LABEL: Partial<Record<ScheduleStatus, string>> = {
  放課後: '放課後',
  休校日: '休校日',
};

// ★★★ 変更点③ ★★★
// 「利用者予定管理」タブで、選択中のユーザーの予定を強調表示する色
// (枠線 + 薄い背景で、祝日や土日の文字色と共存させる)
const USER_SCHEDULE_CLASS: Partial<Record<ScheduleStatus, string>> = {
  '放課後': 'bg-blue-100 border-2 border-blue-500',
  '休校日': 'bg-yellow-100 border-2 border-yellow-500',
  'キャンセル待ち': 'bg-gray-200 border-2 border-gray-500',
  '欠席': 'bg-red-100 border-2 border-red-500',
  '取り消し': 'bg-pink-100 border-2 border-pink-500',
};
// ★★★ 変更点③ ここまで ★★★

// 利用者個人の予定（下段）に表示するテキスト色
const USER_SCHEDULE_TEXT_CLASS: Partial<Record<ScheduleStatus, string>> = {
  '放課後': 'text-blue-700',
  '休校日': 'text-yellow-700',
  'キャンセル待ち': 'text-gray-600',
  '欠席': 'text-red-600',
  '取り消し': 'text-pink-600',
};
// ★★★ 追記ここまで ★★★

// 同日複数ある場合の優先度（休校日 > 放課後）
const STATUS_PRIORITY: ScheduleStatus[] = ['休校日', '放課後', 'キャンセル待ち', '欠席', '取り消し'];

// events配列を日付キーごとに集約（dateKeyJst / type / userId を使用）
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
// ===== 追記ここまで =====

// 型定義
type User = { id: string; lastName: string; firstName: string; allergies?: string; serviceHoDay?: string; serviceJihatsu?: string; serviceSoudan?: string; };
type EventData = {
  id: string;
  userId: string;
  date?: any;               // 既存互換（文字列 or Timestamp）
  dateKeyJst?: string;      // ★ 追加：JSTキー "yyyy-MM-dd"
  type: ScheduleStatus; // ★ '放課後' | '休校日' | 'キャンセル待ち' | '欠席' | '取り消し'
};
type Event = EventData & { userName: string; user: User; };
type PseudoRecord = { userName: string; date: string; usageStatus: '放課後' | '休校日' | '欠席'; notes?: string; };
type GroupedUsers = { [serviceName: string]: Event[]; };

type ServiceStatus = '契約なし' | '利用中' | '休止中' | '契約終了';
const toServiceStatus = (v: unknown): ServiceStatus =>
  v === '1' || v === 1 || v === true || v === '利用中' ? '利用中' : '契約なし';

// ServiceRecordSheet の record 型をそのまま拾う
type SheetRecord = React.ComponentProps<typeof ServiceRecordSheet>['record'];
type SheetRecordNonNull = NonNullable<SheetRecord>;

// PseudoRecord | null → RecordData | null に変換
const toSheetRecord = (r: PseudoRecord | null): SheetRecord => {
  if (!r || r.usageStatus == null) return null; // usageStatus が null なら空枠として渡す
  const conv: SheetRecordNonNull = {
    userName: r.userName,
    date: r.date,
    usageStatus: r.usageStatus, // '放課後' | '休校日' | '欠席'
    notes: r.notes ?? "",
  };
  return conv;
};


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
// 以前の toDateString は削除
// ✅ 安全なJST固定の "YYYY-MM-DD" 生成関数
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

export default function CalendarPage() {
  const [activeTab, setActiveTab] = useState('management');
  const [users, setUsers] = useState<User[]>([]);
  const [allEvents, setAllEvents] = useState<EventData[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDateForModal, setSelectedDateForModal] = useState<Date | null>(null);
  const [eventType, setEventType] = useState<ScheduleStatus>('放課後');
  const [isPrinting, setIsPrinting] = useState(false);
  const [allergyModalUser, setAllergyModalUser] = useState<User | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
// ===== 既存のステートの近くに追記 =====
const [events, setEvents] = useState<any[]>([]);

useEffect(() => {
  const y = new Date().getFullYear();
  fetchJapaneseHolidays(y).then(list => setHolidays(new Set(list)));
}, []);
// ===== 追記ここまで =====

// ===== 追記：日付ごとに集約した Map を作成 =====
const eventsMap = useMemo(
  () => buildEventsMap(
    events.map(ev => ({
      dateKeyJst: ev.dateKeyJst as string,
      type: ev.type as ScheduleStatus,
      userId: ev.userId as string,
    }))
  ),
  [events]
);
// ===== 追記ここまで =====

const fetchInitialData = useCallback(async () => {
    try { // ★ try を追加
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

      // ★★★ 正規化ロジック ★★★
      const eventsData = eventsSnapshot.docs.map(doc => {
        const data = doc.data() as any;
        const id = doc.id;
        
        let key = data.dateKeyJst; // 優先度1

        // 優先度2: ドキュメントID
        if (!key && id.includes('_')) {
          const potentialKey = id.split('_')[0];
          if (potentialKey.length === 10 && potentialKey.charAt(4) === '-') {
            key = potentialKey;
          }
        }

        // 優先度3: 古い "date" (Timestamp)
        if (!key && data.date) {
          try {
            const dateObj = data.date.toDate ? data.date.toDate() : new Date(data.date);
            key = toDateString(dateObj);
          } catch (e) {
            console.error("古い日付の変換に失敗:", data.date, e);
          }
        }
        
        return {
          ...(data as EventData),
          id: id,
          dateKeyJst: key,
        };
      });
      // ★★★ 正規化ここまで ★★★

      setAllEvents(eventsData);
      setEvents(eventsData);

    } catch (error) { // ★ catch を追加
      console.error("データの初期読み込みに失敗しました:", error);
      alert("カレンダーデータの読み込みに失敗しました。ページをリロードしてください。");
    }
  }, []); // ← 依存配列は [] のまま

  useEffect(() => {
    fetchInitialData();
  }, []);

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
    // 1. 利用者が選択されているかチェック
    if (!selectedUserId) {
      alert('先に利用者を選択してください。');
      return;
    }

    // 2. モーダルに渡す「選択された日付」をセット
    setSelectedDateForModal(clickedDate);
    
    // 3. 既存の予定があるかチェック
    const dateKey = toDateString(clickedDate);
    const existingEvent = userSchedule.find(event => (event.dateKeyJst ?? event.date) === dateKey);
    
    // 4. モーダルに表示する「予定種別」をセット
    setEventType(existingEvent ? existingEvent.type : '放課後');
    
    // 5. モーダルを開く
    setIsModalOpen(true);
  };

// ★★★ 変更点④：重複登録防止ロジック ★★★
  const handleSaveEvent = async () => {
    if (!selectedUserId || !selectedDateForModal) return;
    const dateKey = toDateString(selectedDateForModal);

    // 4. 重複防止: ドキュメントIDを "date_userId" 形式で固定
    const docId = `${dateKey}_${selectedUserId}`;
    const docRef = doc(db, "events", docId);

    // ★★★ 追加ロジック (ここから) ★★★
    // 保存する前に、古い形式 (auto-id) のドキュメントを探す
    // (固定IDではない、かつ日付が一致するものを探す)
    const legacyEvent = userSchedule.find(
      event => (event.dateKeyJst ?? event.date) === dateKey && event.id !== docId
    );
    // ★★★ 追加ロジック (ここまで) ★★★

    try {
      // 1. 新しい「固定ID」でデータを保存（または上書き）
      await setDoc(docRef, {
        userId: selectedUserId,
        dateKeyJst: dateKey,       // JSTキー
        type: eventType,           // '放課後' | '休校日' | 'キャンセル待ち' ...
        date: serverTimestamp(), // 互換性のために保持（実時刻）
      }, { merge: true }); // 存在すれば更新、なければ作成 (Idempotent)

      // ★★★ 追加ロジック (ここから) ★★★
      // 2. もし古い「自動ID」のデータが見つかったら、それを削除する
      // (これにより、古いデータが重複して残るのを防ぐ)
      if (legacyEvent) {
        await deleteDoc(doc(db, 'events', legacyEvent.id));
      }
      // ★★★ 追加ロジック (ここまで) ★★★

    } catch (error) {
      console.error("イベント保存エラー:", error);
      alert("保存に失敗しました。");
    }
    
    setIsModalOpen(false);
    await fetchInitialData(); // データを再取得してカレンダーに反映
  };

// ★★★ 変更点④：削除ロジックもID形式を統一 ★★★
  const handleDeleteEvent = async () => {
    if (!selectedUserId || !selectedDateForModal) return;
    const dateKey = toDateString(selectedDateForModal);

    // 4. 保存ロジックと合わせ、"date_userId" 形式のIDで削除
    const docId = `${dateKey}_${selectedUserId}`;
    const docRef = doc(db, "events", docId);
    
    // 互換性のため、古い (auto-id) のドキュメントも探す
    const legacyEvent = userSchedule.find(event => (event.dateKeyJst ?? event.date) === dateKey);
    
    try {
      // 新しいID形式 ("date_userId") のドキュメントを削除
      await deleteDoc(docRef);

      // 念のため、古い形式のID (auto-id) があればそれも削除
      if (legacyEvent && legacyEvent.id !== docId) {
        await deleteDoc(doc(db, 'events', legacyEvent.id));
      }

    } catch (error) {
      console.error("イベント削除エラー:", error);
      // ドキュメントが存在しない場合のエラーは無視してもよいため、
      // 致命的なエラー以外はアラートしない
      
      // ★ 型チェックを追加
      let errorCode = null;
      // error が null ではなく、'code' プロパティを持つオブジェクトか確認
      if (typeof error === 'object' && error !== null && 'code' in error) {
        errorCode = (error as { code: string }).code;
      }

      if (errorCode !== 'not-found') {
        alert("削除に失敗しました。");
      }
    }

    setIsModalOpen(false);
    await fetchInitialData();
  };
  // ★★★ 変更点④ ここまで ★★★

  const handlePrintAll = async () => {
    if (dailyScheduledUsers.length === 0) { return alert('印刷する利用予定者がいません。'); }
    if (!selectedDate) { return alert('日付が選択されていません。'); } // 安全対策
    setIsPrinting(true);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'b5' });
    const recordsToPrint: (PseudoRecord | null)[] = dailyScheduledUsers.map(event => ({
      userName: event.userName, date: (event.dateKeyJst ?? ''), usageStatus: event.type as ('放課後' | '休校日'), notes: '',
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
    <ServiceRecordSheet record={toSheetRecord(pair[0])} />
    <ServiceRecordSheet record={toSheetRecord(pair[1])} />
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
    pdf.save(`${jstDateKey(selectedDate)}_サービス提供記録.pdf`);
    setIsPrinting(false);
  };
  const ymdJST = (d: Date) => {
  const j = new Date(d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const y = j.getFullYear();
  const m = String(j.getMonth() + 1).padStart(2, "0");
  const day = String(j.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// ★★★ 修正点： 関数全体を useCallback でメモ化する ★★★
  const scheduleTileClassName = useCallback(({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return undefined;
    const key = ymdJST(date); // 土日祝判定用のキー
    
    const classes: string[] = ['comet-tile'];

    // 1. 祝日を赤文字＆太字
    if (holidays.has(key)) classes.push('text-red-600', 'font-semibold');
    // 2. 日曜＝赤、土曜＝青
    if (date.getDay() === 0) classes.push('text-red-600', 'font-semibold'); // Sun
    if (date.getDay() === 6) classes.push('text-blue-600', 'font-semibold'); // Sat

    // 3. 選択中ユーザーの予定を強調表示 (要望③)
    if (selectedUserId) {
      // (例: "2025-10-30")
      const dateKeyJst = toDateString(date); 
      
      // ★ この userSchedule が最新の状態になる
      const event = userSchedule.find(e => e.dateKeyJst === dateKeyJst);
      
      if (event) {
        const scheduleClass = USER_SCHEDULE_CLASS[event.type as ScheduleStatus];
        if (scheduleClass) {
          const [bg, border1, border2] = scheduleClass.split(' ');
          classes.push(bg, border1, border2);
        }
      }
    }
    return classes.join(' ');
  }, [userSchedule, selectedUserId, holidays]);
// ★★★ 依存配列に userSchedule, selectedUserId, holidays を指定 ★★★

  // 「利用管理」タブ用のタイルコンテンツ（日別合計人数）
  // ★★★ ご要望（11/12）に基づき、内訳表示に修正 ★★★
  const managementTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const key = toDateString(date);
    const day = eventsMap.get(key);
    if (!day) return null; // 予定がなければ何も表示しない

    const counts: Record<ScheduleStatus, number> = {
      放課後: 0, 休校日: 0, キャンセル待ち: 0, 欠席: 0, 取り消し: 0,
    };
    day.items.forEach(it => { counts[it.status] = (counts[it.status] ?? 0) + 1; });

    const houkagoCount = counts['放課後'];
    const kyukouCount = counts['休校日'];
    const waitCount = counts['キャンセル待ち'];
    const kessekiCount = counts['欠席'];
    const torikeshiCount = counts['取り消し'];

    // 0人の項目は表示しない
    const itemsToShow = [
      { label: '放課後', count: houkagoCount, class: 'text-green-700' },
      { label: '休校日', count: kyukouCount, class: 'text-orange-700' },
      { label: 'ｷｬﾝｾﾙ待ち', count: waitCount, class: 'text-gray-600' },
    ];

    // 欠席と取り消し（横並び）
    const kessekiTorikeshi = (kessekiCount > 0 || torikeshiCount > 0) 
      ? <div className="text-red-600">欠:{kessekiCount} 取:{torikeshiCount}</div>
      : null;

    return (
      // pointer-events-none は「利用管理」タブでは必須ではないですが、
      // クリック イベントには影響しないため、そのまま残します。
      <div className="px-1 pb-1 pointer-events-none text-[12px] leading-tight font-medium">
        {itemsToShow.map(item => (
          item.count > 0 ? (
            <div key={item.label} className={item.class}>
              {item.label}: {item.count}人
            </div>
          ) : null
        ))}
        {kessekiTorikeshi}
      </div>
    );
  };

  // ★★★ 以下を追記 ★★★
// 「利用者予定管理」タブ専用のタイルコンテンツ関数
const scheduleTileContent = ({ date, view }: { date: Date; view: string }) => {
  if (view !== 'month') return null;
  const key = toDateString(date);
  const day = eventsMap.get(key);

  // --- 1. 日ごとの全体集計（上段）---
  let totalCountsContent = null;
  if (day) {
    const counts: Record<ScheduleStatus, number> = {
      放課後: 0, 休校日: 0, キャンセル待ち: 0, 欠席: 0, 取り消し: 0,
    };
    day.items.forEach(it => { counts[it.status] = (counts[it.status] ?? 0) + 1; });

    const houkagoCount = counts['放課後'];
    const kyukouCount = counts['休校日'];
    const waitCount = counts['キャンセル待ち'];

    totalCountsContent = (
      <div className="text-[12px] leading-tight text-gray-700">
        {houkagoCount > 0 && <div>放課後: {houkagoCount}人</div>}
        {kyukouCount > 0 && <div>休校日: {kyukouCount}人</div>}
        {waitCount > 0 && <div>ｷｬﾝｾﾙ: {waitCount}人</div>}
      </div>
    );
  }

  // --- 2. 選択中利用者の予定（下段）---
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
// ★★★ 追記ここまで ★★★

const tileClassName = ({ date, view }: { date: Date; view: string }) => {
  if (view !== 'month') return undefined;

  const classes: string[] = ['comet-tile'];
  const key = ymdJST(date);

  // 祝日を赤文字＆太字
  if (holidays.has(key)) classes.push('text-red-600', 'font-semibold');

  // 日曜＝赤、土曜＝青（祝日があれば祝日優先でOK）
  if (date.getDay() === 0) classes.push('text-red-600', 'font-semibold'); // Sun
  if (date.getDay() === 6) classes.push('text-blue-600', 'font-semibold'); // Sat

  // 既存：放課後/休校日の背景（例）
  // if (byDate.get(key)?.some(e => e.status === '休校日')) classes.push('bg-orange-200');
  // if (byDate.get(key)?.some(e => e.status === '放課後')) classes.push('bg-green-200');

  return classes.join(' ');
};

  const tileContent = ({ date: d, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const dateKey = jstDateKey(d);
      const count = eventCounts[dateKey] ?? 0;
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
    // if (user.serviceSoudan === '利用中') {
    //   if (!acc['■相談支援']) acc['■相談支援'] = [];
    //   acc['■相談支援'].push(event);
    // }
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
            <div className="relative z-[201] bg-white p-6 rounded-lg shadow-xl">
              <h3 className="text-lg font-semibold mb-4">{selectedDateForModal.toLocaleDateString()} の予定</h3>
              <select value={eventType} onChange={(e) => setEventType(e.target.value as ScheduleStatus)} className="p-2 border rounded w-full">
                <option value="放課後">放課後</option>
                <option value="休校日">休校日</option>
                <option value="キャンセル待ち">キャンセル待ち</option>
                <option value="欠席">欠席</option>
                <option value="取り消し">取り消し</option>
              </select>
              <div className="mt-6 flex justify-end space-x-3">
                <button onClick={() => setIsModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">キャンセル</button>
                {/* ★ 変更点④：削除ボタンの表示判定を `userSchedule` 基準に変更 */}
                {userSchedule.some(e => (e.dateKeyJst ?? e.date) === jstDateKey(selectedDateForModal)) && 
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
            <div className="grid grid-cols-1 gap-8 items-start">
              <div className="w-full">
                <Calendar className="comet-cal" onChange={(value) => setSelectedDate(value as Date)} value={selectedDate} locale="ja-JP"
                calendarType="hebrew"
                  // ▼ 「利用管理」タブのタイルクラス（背景色）
                  tileClassName={({ date, view }) => {
                    if (view !== 'month') return undefined;
                    // ★ 変更点③：土日祝のクラスも適用
                    const key = ymdJST(date);
                    const classes: string[] = ['comet-tile'];
                    if (holidays.has(key)) classes.push('text-red-600', 'font-semibold');
                    if (date.getDay() === 0) classes.push('text-red-600', 'font-semibold');
                    if (date.getDay() === 6) classes.push('text-blue-600', 'font-semibold');

                    // 予定に基づく背景色
                    const dateKey = toDateString(date);
                    const day = eventsMap.get(dateKey);
                    if (day) {
                      const main = STATUS_PRIORITY.find(s => day.items.some(it => it.status === s));
                      const cls = main ? STATUS_TILE_CLASS[main] : undefined;
                      // 背景色がある場合は文字色を黒に
                      if (cls) classes.push(`!text-black ${cls}`);
                    }
                    return classes.join(' ');
                  }}
                  
                  // ▼ 「利用管理」タブのタイルコンテンツ（日別合計人数）
                  tileContent={managementTileContent} // ★ 関数を共通化
                />
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
              {/* ★ 変更点①： {selectedUserId && ...} の制約を解除 */}
              {/* ★★★ 修正箇所②： Calendar コンポーネント ★★★ */}
              <Calendar 
                className="comet-cal" 
                
                onChange={(value) => {
                  let clickedDate: Date | null = null;
                  
                  // value が配列か (range選択か) を判定
                  if (Array.isArray(value)) {
                    clickedDate = value[0] as Date; 
                  } else {
                    clickedDate = value as Date;
                  }

                  if (!clickedDate) return; 

                  // 1. 日付を青くする (Stateを更新)
                  setSelectedDate(clickedDate); 
                  // 2. ↑で定義した「安全な」関数を呼ぶ
                  handleDateClickForScheduling(clickedDate); 
                }} 
                
                value={selectedDate} 
                locale="ja-JP"
                calendarType="hebrew"
                tileClassName={scheduleTileClassName} 
                
                // tileContentがクリックを妨害しないように
                tileContent={(props) => (
                  <div className="pointer-events-none relative z-0">
                    {scheduleTileContent(props)}
                  </div>
                )}
                // onClickDay は使わない
              />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}