import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/server/firebaseAdmin";

type IncomingRow = {
  userId: string;
  userName?: string;
  date: string;                // 例: "2025-10-21" or "2025/10/21"
  usageStatus: string;         // "放課後" | "休校日" | "欠席" | "1"/"2"/"3"
  arrivalTime?: string;        // "15:30"
  departureTime?: string;
  notes?: string;
};

const toJstKey = (v: string) => {
  const d = new Date(v);
  const j = new Date(d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const y = j.getFullYear();
  const m = String(j.getMonth() + 1).padStart(2, "0");
  const day = String(j.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toUsage = (v: string): "放課後" | "休校日" | "欠席" => {
  const s = String(v ?? "").trim();
  if (s === "1" || s === "放課後" || s.toLowerCase() === "after") return "放課後";
  if (s === "2" || s === "休校日" || s.toLowerCase() === "holiday") return "休校日";
  if (s === "3" || s === "欠席" || s.toLowerCase() === "absent") return "欠席";
  // デフォルトは欠席にしない方が安全
  return "放課後";
};

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
    const batch = db.batch();
    let count = 0;

    for (const r of body as IncomingRow[]) {
      if (!r?.userId || !r?.date) continue;
      const dateKeyJst = toJstKey(r.date);
      const usageStatus = toUsage(r.usageStatus);
      const docId = `${dateKeyJst}_${r.userId}`;
      const ref = db.collection("attendance").doc(docId);
      batch.set(
        ref,
        {
          userId: String(r.userId),
          userName: String(r.userName ?? ""),
          dateKeyJst,
          usageStatus,
          arrivalTime: r.arrivalTime ?? "",
          departureTime: r.departureTime ?? "",
          notes: r.notes ?? "",
          source: "sheet-migration",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      count++;
      // Firestore の 500 書き込み/バッチ 上限対策
      if (count % 450 === 0) {
        await batch.commit();
      }
    }
    if (count % 450 !== 0) {
      await batch.commit();
    }

    return NextResponse.json({ ok: true, count });
  } catch (e: any) {
    console.error("ingest batch error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
