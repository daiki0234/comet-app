"use client";

import React, { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/firebase";
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from "firebase/auth";
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
  
  // ローカルステート
  const [isGuestMode, setIsGuestMode] = useState(false); // メールログインモードか否か
  const [isRegister, setIsRegister] = useState(false);   // 新規登録(PW設定)かログインか
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (isLoggedIn && !isUnauthorized) {
      router.push("/dashboard");
    } else if (isUnauthorized) {
      toast.error("このアカウントはアクセス権がありません。", { id: 'auth-error' });
    }
  }, [router, isLoggedIn, isLoading, isUnauthorized]);

  // Googleログイン
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google Login Error:", error);
      toast.error("ログインに失敗しました。");
    }
  };

  // メール/パスワード認証 (ゲスト用)
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (isRegister) {
        // 初回パスワード設定（新規登録扱い）
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success("パスワードを設定しました");
      } else {
        // ログイン
        await signInWithEmailAndPassword(auth, email, password);
        toast.success("ログインしました");
      }
      // 成功後は AuthContext が検知して useEffect でリダイレクト処理
    } catch (error: any) {
      console.error("Email Auth Error:", error);
      let msg = "認証に失敗しました";
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') msg = "メールアドレスまたはパスワードが間違っています";
      if (error.code === 'auth/email-already-in-use') msg = "このメールアドレスは既に登録されています。ログインしてください。";
      if (error.code === 'auth/weak-password') msg = "パスワードは6文字以上で設定してください";
      toast.error(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl text-center">
        <h1 className="text-5xl font-extrabold text-indigo-600 mb-2">Comet</h1>
        <p className="text-xl font-semibold text-gray-700 mb-8">
          {isGuestMode ? (isRegister ? "ゲスト：パスワード設定" : "ゲスト：ログイン") : "ログイン"}
        </p>
        
        {/* 権限エラー表示 */}
        {isUnauthorized && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 rounded-md text-sm border border-red-200">
            アクセス権がありません。<br/>
            入力したアカウントが管理者に登録されているか確認してください。
            <button onClick={() => auth.signOut()} className="block mt-2 mx-auto text-red-800 underline">
              リセット
            </button>
          </div>
        )}

        {/* --- モードA: Googleログイン (デフォルト) --- */}
        {!isGuestMode && (
          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading || authLoading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-lg font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-all"
            >
              {isLoading ? "確認中..." : <><GoogleIcon /> <span>Googleでログイン</span></>}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
              <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">または</span></div>
            </div>

            <button
              onClick={() => setIsGuestMode(true)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
            >
              ゲストアカウント（メール）でログイン
            </button>
          </div>
        )}

        {/* --- モードB: メール/パスワード入力フォーム (ゲスト用) --- */}
        {isGuestMode && (
          <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="guest@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
              <input 
                type="password" 
                required 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="6文字以上"
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || authLoading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow transition-colors disabled:opacity-50"
            >
              {authLoading ? "処理中..." : (isRegister ? "パスワードを設定して登録" : "ログイン")}
            </button>

            <div className="text-center text-sm space-y-2 pt-2">
              <button
                type="button"
                onClick={() => { setIsRegister(!isRegister); }}
                className="text-indigo-600 hover:underline"
              >
                {isRegister ? "すでにパスワードをお持ちの方はこちら" : "初めての方（パスワード設定）はこちら"}
              </button>
              
              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsGuestMode(false)}
                  className="text-gray-500 hover:text-gray-700 text-xs"
                >
                  ← Googleログインに戻る
                </button>
              </div>
            </div>
          </form>
        )}

      </div>
    </main>
  );
}