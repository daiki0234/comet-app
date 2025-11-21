// src/app/layout.tsx

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// ★ 追加: 認証コンテキストとトースト通知
import { AuthProvider } from "@/context/AuthContext"; 
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Comet",
  description: "業務効率化APP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        {/* ★ AuthProvider でアプリ全体を囲む */}
        <AuthProvider>
          {/* ★ トースト通知のコンポーネントを配置 */}
          <Toaster position="top-right" />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}