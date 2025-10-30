// src/app/page.tsx

"use client";

import React, { useState, useEffect } from "react";
import { auth } from "@/lib/firebase/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { useRouter } from "next/navigation";

// GoogleアイコンのSVGをコンポーネントとして定義
const GoogleIcon = () => (
  <svg
    className="h-5 w-5"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid"
    viewBox="0 0 256 262"
  >
    <path
      fill="#4285F4"
      d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.117.189-38.755 30.023-.512 39.215c29.9-27.548 46.99-68.997 46.99-113.845z"
    />
    <path
      fill="#34A853"
      d="M130.55 261.1c36.817 0 67.9-12.112 90.54-32.894l-39.215-39.739c-12.112 8.169-27.756 13.116-45.39 13.116-34.522 0-63.824-22.773-74.269-54.25l-39.3 30.58c21.6 42.602 66.594 71.5 117.584 71.5z"
    />
    <path
      fill="#FBBC05"
      d="M56.281 156.37c-2.756-8.169-4.125-16.891-4.125-26.074s1.369-17.905 4.125-26.074l-39.3-30.58C6.34 83.996 0 106.19 0 130.3s6.34 46.304 16.981 65.37l39.3-30.58z"
    />
    <path
      fill="#EB4335"
      d="M130.55 50.479c24.514 0 41.05 10.582 50.479 19.438l34.469-34.469C198.397 11.897 167.202 0 130.55 0 79.56 0 34.566 28.898 16.981 70.934l39.3 30.58c10.445-31.477 39.747-54.25 74.269-54.25z"
    />
  </svg>
);

export default function Home() {
  // ログイン処理中のローディング状態を管理
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // ログイン済みの場合はダッシュボードへ遷移
        router.push("/dashboard");
      }
      // 未ログインの場合は何もせず、このログイン画面を表示し続ける
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async () => {
    setIsLoading(true); // ログイン処理開始
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // 成功した場合、上記のonAuthStateChangedが検知してリダイレクト処理を行う
    } catch (error) {
      console.error("ログインエラー:", error);
      setIsLoading(false); // エラーが発生した場合のみローディングを解除
    }
  };

  return (
    // 画面全体を中央寄せにし、背景色を設定
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      {/* ログインカード */}
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <div className="text-center">
          {/* テキストベースのロゴ */}
          <h1 className="text-5xl font-extrabold text-indigo-600">Comet</h1>
          <p className="mt-2 text-xl font-semibold text-gray-700">
            ログイン
          </p>
        </div>

        {/* ログインボタン */}
        <div className="mt-8">
          <button
            onClick={handleLogin}
            disabled={isLoading} // ローディング中はボタンを無効化
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-lg font-medium text-gray-700 shadow-sm transition-all duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              // ローディングスピナー
              <svg
                className="h-5 w-5 animate-spin text-indigo-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            ) : (
              // Googleアイコン
              <GoogleIcon />
            )}
            <span>
              {isLoading ? "処理中..." : "Googleアカウントでログイン"}
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}