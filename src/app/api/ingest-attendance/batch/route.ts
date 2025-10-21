// src/app/api/ingest-attendance/batch/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/server/firebaseAdmin";

type IncomingRow = {
  userName: string;            // ★ userId は送らなくてOK（氏名から解決）
  date: string;                // "2025/09/25" など
  usageStatus: string;         // ◯ / ◎ / 欠席(1) / 放課後 / 休校日 / 欠席
  arrivalTime?: string;
  departureTime?: string;
  notes?: string;
};

const toJstKey = (v: string) => {
  const d = new Date(v);
  const j = new Date(d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const y = j.getFullYear();
  const m = String(j.getMonth() + 1).padStart(2, "0");
  const day = String(j.getDate()).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, month: `${y}-${m}` };
};

const toUsage = (v: string): "放課後" | "休校日" | "欠席" => {
  const s = String(v ?? "").trim();
  if (s === "1" || s === "放課後" || s === "◯") return "放課後";
  if (s === "2" || s === "休校日" || s === "◎") return "休校日";
  if (s === "3" || s.includes("欠席") || s === "欠席") return "欠席";
  return "放課後";
};

// 氏名→ userId 解決用（users 全件を一度だけ読む簡易版）
async function buildUserIdMap(db: FirebaseFirestore.Firestore) {
  const snap = await db.collection("users").get();
  const map = new Map<string, string>(); // "姓 名" → userId
  snap.forEach(doc => {
    const u = doc.data() as any;
    const last = String(u.lastName ?? "").trim();
    const first = String(u.firstName ?? "").trim();
    const key = `${last} ${first}`.replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
    if (key) map.set(key, doc.id);
  });
  return map;
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("x-sync-token");
    if (!token || token !== process.env.SHEETS_SYNC_TOKEN) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "array required" }, { status: 400 });
    }

    const db = getDb();
    const userIdMap = await buildUserIdMap(db);

    let batch = db.batch();
    let count = 0, written = 0;

    for (const r of body as IncomingRow[]) {
      if (!r?.userName || !r?.date) continue;

      // userId 解決
      const nameKey = String(r.userName).replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
      const userId = userIdMap.get(nameKey);
      if (!userId) {
        console.warn("[ingest] userId not found for:", r.userName);
        continue; // 見つからないものはスキップ
      }

      const { date, month } = toJstKey(r.date);
      const usageStatus = toUsage(r.usageStatus);
      const ref = db.collection("attendanceRecords").doc(`${date}_${userId}`);

      batch.set(ref, {
        userId,
        userName: r.userName,
        date,                // ← スクショのフィールド名に合わせる
        month,               // ← "YYYY-MM"
        usageStatus,         // 放課後 / 休校日 / 欠席
        arrivalTime: r.arrivalTime ?? "",
        departureTime: r.departureTime ?? "",
        notes: r.notes ?? "",
        source: "sheet-migration",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      count++; written++;
      if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();

    return NextResponse.json({ ok: true, count: written });
  } catch (e: any) {
    console.error("ingest batch error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
