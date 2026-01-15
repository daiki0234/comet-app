// src/lib/firebase/firebase.ts

// 必要な機能をFirebaseからインポートします
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // ← この行があるか確認
import { getStorage } from "firebase/storage"; // ★追加: Storageをインポート

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
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // ★追加: Storageのインスタンス化

// エクスポート
export { auth, db, storage }; // ★追加: storage をエクスポートに含める