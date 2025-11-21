"use client";

import React, { useEffect } from "react";
import { auth } from "@/lib/firebase/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

// GoogleアイコンSVG
const GoogleIcon = () => (
  <svg className="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.275c0-.85-.075-1.675-.215-2.465H12v4.66h6.445c-.28 1.5-1.115 2.775-2.395 3.635v3.015h3.875c2.265-2.09 3.57-5.165 3.57-8.845z" /><path fill="#34A853" d="M12 24c3.24 0 5.955-1.075 7.94-2.96l-3.875-3.015c-1.075.72-2.45 1.145-4.065 1.145-3.135 0-5.79-2.115-6.74-4.96H1.29v3.125C3.365 21.43 7.395 24 12 24z" /><path fill="#FBBC05" d="M5.26 14.21A7.29 7.29 0 0 1 4.93 12c0-.76.135-1.495.375-2.21V6.665H1.29C.47 8.295 0 10.1 0 12c0 1.9.47 3.705 1.29 5.335l3.97-3.125z" /><path fill="#EB4335" d="M12 4.75c1.765 0 3.35.605 4.615 1.81l3.45-3.45C17.955 1.2 15.24 0 12 0 7.395 0 3.365 2.57 1.29 6.665l3.97 3.125C6.21 6.865 8.865 4.75 12 4.75z" /></svg>
);

export default function Home() {
  const router = useRouter();
  const { isLoggedIn, isLoading, isUnauthorized } = useAuth(); 

  useEffect(() => {
    if (isLoading) return;
    if (isLoggedIn) {
      router.push("/dashboard");
    } else if (isUnauthorized) {
      // 未登録ユーザーへの警告のみ表示（登録ボタンは消す）
      toast.error("このアカウントはアクセス権がありません。");
    }
  }, [router, isLoggedIn, isLoading, isUnauthorized]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("ログインエラー:", error);
      toast.error("ログインに失敗しました。");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl text-center">
        <h1 className="text-5xl font-extrabold text-indigo-600 mb-2">Comet</h1>
        <p className="text-xl font-semibold text-gray-700 mb-8">ログイン</p>
        
        {isUnauthorized && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
            アクセス権がありません。<br/>管理者に問い合わせてください。
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-lg font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          {isLoading ? "確認中..." : <><GoogleIcon /> <span>Googleアカウントでログイン</span></>}
        </button>
      </div>
    </main>
  );
}