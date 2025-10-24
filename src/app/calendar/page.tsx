"use client";

import React, { useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import toast from "react-hot-toast";

type ScheduleStatus = "放課後" | "休校日" | "キャンセル待ち" | "欠席" | "取り消し";

type EventData = {
  id: string;
  userId: string;
  userName: string;
  date: string; // "YYYY-MM-DD"
  usageStatus: ScheduleStatus;
};

// 🔹 色設定
const STATUS_TILE_CLASS: Partial<Record<ScheduleStatus, string>> = {
  放課後: "bg-green-200",
  休校日: "bg-orange-200",
};

// 🔹 ラベル設定（放課後・休校日のみ）
const STATUS_LABEL: Partial<Record<ScheduleStatus, string>> = {
  放課後: "放課後",
  休校日: "休校日",
};

// 🔹 優先順位（休校日 > 放課後）
const STATUS_PRIORITY: ScheduleStatus[] = [
  "休校日",
  "放課後",
  "キャンセル待ち",
  "欠席",
  "取り消し",
];

// 🔹 日付フォーマット
const toDateString = (date: Date) => {
  const jst = new Date(date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const d = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function UserSchedulePage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<EventData[]>([]);
  const [usageStatus, setUsageStatus] = useState<ScheduleStatus>("放課後");
  const [userName, setUserName] = useState("");

  // 🔹 Firestoreから予定取得
  const fetchEvents = async () => {
    try {
      const q = query(collection(db, "events"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      })) as EventData[];
      setEvents(data);
    } catch (e) {
      console.error(e);
      toast.error("予定の取得に失敗しました");
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // 🔹 日付ごとにまとめる
  const eventsMap = useMemo(() => {
    const map = new Map<string, EventData[]>();
    events.forEach((ev) => {
      const key = ev.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    });
    return map;
  }, [events]);

  // 🔹 カレンダーの登録処理
  const handleAddEvent = async () => {
    const dateKey = toDateString(selectedDate);
    if (!userName) return toast.error("利用者名を入力してください");

    try {
      await addDoc(collection(db, "events"), {
        userName,
        userId: userName, // 簡易化：本来は userId 参照
        date: dateKey,
        usageStatus,
      });
      toast.success(`${dateKey} に ${usageStatus} を登録しました`);
      fetchEvents();
    } catch (e) {
      console.error(e);
      toast.error("登録に失敗しました");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">利用予定管理</h2>

      {/* カレンダー */}
      <Calendar
        onChange={(value) => setSelectedDate(value as Date)}
        value={selectedDate}
        locale="ja-JP"
        tileClassName={({ date, view }) => {
          if (view !== "month") return undefined;
          const key = toDateString(date);
          const day = eventsMap.get(key);
          if (!day) return undefined;

          const main = STATUS_PRIORITY.find((s) =>
            day.some((ev) => ev.usageStatus === s)
          );
          const cls = main ? STATUS_TILE_CLASS[main] : undefined;
          return cls ? `!text-black ${cls}` : undefined;
        }}
        tileContent={({ date, view }) => {
          if (view !== "month") return null;
          const key = toDateString(date);
          const day = eventsMap.get(key);
          if (!day) return null;

          const counts: Record<ScheduleStatus, number> = {
            放課後: 0,
            休校日: 0,
            キャンセル待ち: 0,
            欠席: 0,
            取り消し: 0,
          };

          day.forEach((ev) => {
            counts[ev.usageStatus] = (counts[ev.usageStatus] ?? 0) + 1;
          });

          const main = STATUS_PRIORITY.find((s) =>
            day.some((ev) => ev.usageStatus === s)
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
        <h3 className="text-lg font-semibold text-gray-800">予定を追加</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            日付
          </label>
          <input
            type="text"
            value={toDateString(selectedDate)}
            disabled
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm bg-gray-100"
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
            placeholder="例）山田 太郎"
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
          className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
        >
          登録
        </button>
      </div>
    </div>
  );
}