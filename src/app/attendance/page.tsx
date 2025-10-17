// src/app/attendance/page.tsx
import type { Metadata } from "next";
import { AppLayout } from "@/components/Layout";
import AttendanceClient from "./AttendanceClient"; // ← クライアント側の画面本体

// export const metadata: Metadata = {
//   title: "出欠記録（QRスキャン）｜Comet",
//   description: "QRコードで来所/帰所/欠席を記録します。",
// };

export default function AttendancePage() {
  // ここはサーバーコンポーネント。フックは使わない。
  return (
    <AppLayout pageTitle="出欠記録">
      <AttendanceClient />
      
    </AppLayout>
  );
}