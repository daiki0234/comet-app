import * as admin from 'firebase-admin';

// 環境変数を取得
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

// まだ初期化されておらず、かつ環境変数が揃っている場合のみ初期化
if (!admin.apps.length) {
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        // 改行コードの修正
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    // 環境変数がない場合は警告だけ出して、クラッシュさせない（ビルドを通すため）
    console.warn("⚠️ Firebase Admin SDKの環境変数が設定されていません。AI分析機能は動作しません。");
  }
}

// 初期化できていればFirestoreインスタンスを、できていなければダミーを返す
export const adminDb = admin.apps.length 
  ? admin.firestore() 
  : ({} as FirebaseFirestore.Firestore);