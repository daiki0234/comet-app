// src/lib/firebase/firebase.ts

// 必要な機能をFirebaseからインポートします
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // ← この行があるか確認

// あなたのWebアプリのFirebase設定
const firebaseConfig = {
  apiKey: "AIzaSyAR34nmkVIMVzUGn9BIhlwXIXRuYoOMjvA",
  authDomain: "comet-bd1c1.firebaseapp.com",
  projectId: "comet-bd1c1",
  storageBucket: "comet-bd1c1.firebasestorage.app",
  messagingSenderId: "474882659524",
  appId: "1:474882659524:web:f61b2377d63bc95c1a2591"
};

// Firebaseを初期化
const app = initializeApp(firebaseConfig);

// 他のファイルから使えるように、データベースと認証機能をエクスポートします
export const db = getFirestore(app);
export const auth = getAuth(app); // ← この行が重要です！