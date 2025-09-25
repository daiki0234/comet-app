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
import { useRouter } from "next/navigation"; // useRouterをインポート

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter(); // routerを初期化

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // ログイン済みの場合はダッシュボードへ遷移
        router.push("/dashboard");
      } else {
        // 未ログインの状態をセット
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("ログインエラー:", error);
    }
  };

  return (
    <main style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
    }}>
      <div>
        <h1>Comet ログイン</h1>
        <button onClick={handleLogin} style={{
          width: '100%',
          padding: '10px',
          fontSize: '16px'
        }}>
          Googleアカウントでログイン
        </button>
      </div>
    </main>
  );
}