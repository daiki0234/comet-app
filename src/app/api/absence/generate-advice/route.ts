import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';

// Gemini API呼び出し関数 (共通)
async function callGemini(prompt: string) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error("API Key not found");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "生成エラー";
}

export async function POST(request: Request) {
  try {
    const { targetDate } = await request.json(); // 例: "2025-11-25"

    // 1. その日の「欠席」データを取得
    const recordsQuery = query(
      collection(db, 'attendanceRecords'),
      where('date', '==', targetDate),
      where('usageStatus', '==', '欠席')
    );
    const snapshot = await getDocs(recordsQuery);

    if (snapshot.empty) {
      return NextResponse.json({ message: "対象データなし", count: 0 });
    }

    let processedCount = 0;

    // 2. 1件ずつ処理 (Promise.allで並列処理も可能ですが、順序と安定性重視でループ処理します)
    for (const recordDoc of snapshot.docs) {
      const data = recordDoc.data();
      
      // すでにAIアドバイスがある場合はスキップ (上書きしたい場合はこのifを外す)
      if (data.aiAdvice) continue; 

      // 過去の相談内容を取得 (コンテキスト生成)
      const historyQuery = query(
        collection(db, 'attendanceRecords'),
        where('userId', '==', data.userId),
        where('usageStatus', '==', '欠席'),
        where('date', '<', targetDate),
        orderBy('date', 'desc')
      );
      const historySnap = await getDocs(historyQuery);
      const pastAdvices = historySnap.docs
        .map(d => d.data().aiAdvice)
        .filter(t => t)
        .reverse()
        .join(" / ");

      // プロンプト作成
      let promptInputPart = "";
      if (pastAdvices.length > 0) {
        promptInputPart = `[入力] 過去の相談内容：${pastAdvices} / 今回の連絡内容：${data.notes || ''}`;
      } else {
        promptInputPart = `[入力] ${data.notes || ''}`;
      }

      const prompt = `
[役割] あなたは児童発達支援・放課後等デイサービスの専門スタッフです。
${promptInputPart}
[厳格な指示]
1. 上記の「入力」は欠席連絡（および過去の経緯）です。この内容から本人の状況や心理を分析してください。
2. 「入力」のオウム返しや単語の定義・翻訳は絶対に禁止します。
3. 分析に基づき、「相談内容」として専門的な所見と今後の支援提案を作成してください。
4. 回答は必ず日本語で、150文字から200文字の範囲に収めてください。
5. 文末は「〜とお伝えした。」「〜とお話した。」「〜していく。」「〜を増やしていく。」のいずれかの形式で必ず終えてください。
[タスク] 上記の5つの厳格な指示をすべて守り、「相談内容」を作成してください。
      `;

      // AI生成実行
      const advice = await callGemini(prompt);

      // Firestore更新
      await updateDoc(doc(db, 'attendanceRecords', recordDoc.id), {
        aiAdvice: advice
      });

      processedCount++;
    }

    return NextResponse.json({ message: "完了", count: processedCount });

  } catch (error: any) {
    console.error("Batch AI Gen Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}