"use client";

import React, { useState, useEffect, useMemo } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import toast from "react-hot-toast";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";

/* --------------------------
   型・定数
--------------------------- */
type ScheduleStatus =
  | "放課後"
  | "休校日"
  | "キャンセル待ち"
  | "欠席"
  | "取り消し";

type EventData = {
  id: string;
  userId: string;
  userName: string;
  date: string; // yyyy-mm-dd
  usageStatus: ScheduleStatus;
};

// 背景色設定
const STATUS_TILE_CLASS: Partial<Record<ScheduleStatus, string>> = {
  放課後: "bg-green-200",
  休校日: "bg-orange-200",
};

// ラベル設定
const STATUS_LABEL: Partial<Record<ScheduleStatus, string>> = {
  放課後: "放課後",
  休校日: "休校日",
};

// 表示優先度
const STATUS_PRIORITY: ScheduleStatus[] = [
  "休校日",
  "放課後",
  "キャンセル待ち",
  "欠席",
  "取り消し",
];

// JST形式
const toDateString = (date: Date) => {
  const jst = new Date(date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const d = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// 日付ごとにまとめる
function buildEventsMap(
  events: Array<{ date: string; status: ScheduleStatus; userId: string }>
) {
  const map = new Map<string, { date: string; items: { userId: string; status: ScheduleStatus }[] }>();
  for (const ev of events) {
    if (!map.has(ev.date)) map.set(ev.date, { date: ev.date, items: [] });
    map.get(ev.date)!.items.push({ userId: ev.userId, status: ev.status });
  }
  return map;
}

/* --------------------------
   コンポーネント本体
--------------------------- */
export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [usageStatus, setUsageStatus] = useState<ScheduleStatus>("放課後");
  const [userName, setUserName] = useState("");
  const [events, setEvents] = useState<EventData[]>([]);

  // Firestoreから予定を取得
  const fetchEvents = async () => {
    try {
      const q = query(collection(db, "events"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      })) as EventData[];
      setEvents(data);
    } catch (err) {
      console.error(err);
      toast.error("予定データの取得に失敗しました");
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // 日付ごとに集約
  const eventsMap = useMemo(
    () =>
      buildEventsMap(
        events.map((ev) => ({
          date: ev.date,
          userId: ev.userId,
          status: ev.usageStatus as ScheduleStatus,
        }))
      ),
    [events]
  );

  // 新しい予定を登録
  const handleAddEvent = async () => {
    const dateKey = toDateString(selectedDate);
    if (!userName) return toast.error("利用者名を入力してください");

    try {
      await addDoc(collection(db, "events"), {
        userId: userName,
        userName,
        date: dateKey,
        usageStatus,
      });
      toast.success(`${dateKey} に ${usageStatus} を登録しました`);
      fetchEvents();
    } catch (err) {
      console.error(err);
      toast.error("登録に失敗しました");
    }
  };

  /* --------------------------
     JSX
  --------------------------- */
  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">利用者予定カレンダー</h2>

      {/* カレンダー */}
      <Calendar
        onChange={(value) => setSelectedDate(value as Date)}
        value={selectedDate}
        locale="ja-JP"
        // ▼ 放課後=緑 / 休校日=オレンジ（文字は黒）
        tileClassName={({ date, view }) => {
          if (view !== "month") return undefined;
          const key = toDateString(date);
          const day = eventsMap.get(key);
          if (!day) return undefined;
          const main = STATUS_PRIORITY.find((s) =>
            day.items.some((it) => it.status === s)
          );
          const cls = main ? STATUS_TILE_CLASS[main] : undefined;
          return cls ? `!text-black ${cls}` : undefined;
        }}
        // ▼ 日付下の「放課後」「休校日」＋人数内訳
        tileContent={({ date, view }) => {
          if (view !== "month") return null;
          const key = toDateString(date);
          const day = eventsMap.get(key);
          if (!day) return null;

          // カウント
          const counts: Record<ScheduleStatus, number> = {
            放課後: 0,
            休校日: 0,
            キャンセル待ち: 0,
            欠席: 0,
            取り消し: 0,
          };
          day.items.forEach(
            (it) => (counts[it.status] = (counts[it.status] ?? 0) + 1)
          );

          const main = STATUS_PRIORITY.find((s) =>
            day.items.some((it) => it.status === s)
          );
          const mainLabel =
            main && STATUS_LABEL[main] ? (
              <div className="mt-1 text-[10px] leading-[10px] font-semibold text-black">
                {STATUS_LABEL[main]}
              </div>
            ) : null;

          const totalYotei = counts["放課後"] + counts["休校日"];
          const wait = counts["キャンセル待ち"];
          const kesseki = counts["欠席"];
          const torikeshi = counts["取り消し"];
          const secondLineNeeded = wait + kesseki + torikeshi > 0;

          return (
            <div className="px-1 pb-1">
              {mainLabel}
              <div className="mt-0.5 text-[10px] leading-[10px] text-gray-700">
                予定：{totalYotei}人
              </div>
              {secondLineNeeded && (
                <div className="mt-0.5 text-[10px] leading-[10px] text-gray-600">
                  W:{wait} 欠:{kesseki} 取:{torikeshi}
                </div>
              )}
            </div>
          );
        }}
      />

      {/* 予定登録フォーム */}
      <div className="bg-white p-4 rounded-2xl shadow-ios border border-gray-200 space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">予定を登録</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            日付
          </label>
          <input
            type="text"
            value={toDateString(selectedDate)}
            readOnly
            className="w-full h-10 px-3 border border-gray-300 rounded-lg bg-gray-100 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            利用者名
          </label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="例：山田 太郎"
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            利用区分
          </label>
          <select
            value={usageStatus}
            onChange={(e) => setUsageStatus(e.target.value as ScheduleStatus)}
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm"
          >
            <option value="放課後">放課後</option>
            <option value="休校日">休校日</option>
            <option value="キャンセル待ち">キャンセル待ち</option>
            <option value="欠席">欠席</option>
            <option value="取り消し">取り消し</option>
          </select>
        </div>

        <button
          onClick={handleAddEvent}
          className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
        >
          登録
        </button>
      </div>
    </div>
  );
}