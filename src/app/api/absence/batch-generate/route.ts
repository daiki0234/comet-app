// src/app/api/absence/batch-generate/route.ts

import { NextResponse } from 'next/server';
// ★ 管理者権限(adminDb)を使用
import { adminDb } from '@/lib/firebase/admin'; 

// 2桁埋めヘルパー
const pad2 = (n: number) => n.toString().padStart(2, "0");

async function callGemini(prompt: string) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error("API Key not found");

  // モデルは安定版の 1.5-flash を使用
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  const data = await response.json();
  
  if (data.error) {
    if (data.error.code === 429 || data.error.status === 'RESOURCE_EXHAUSTED') {
      throw new Error("AI利用枠超過");
    }
    throw new Error(data.error.message || "AI生成エラー");
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || "生成エラー";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // ★ 変更点: targetDate ではなく year, month を受け取る
    const { year, month } = body;

    if (!year || !month) {
      return NextResponse.json({ error: "year または month が不足しています" }, { status: 400 });
    }

    // 月の範囲を計算 (例: 2025-11-01 〜 2025-11-30)
    const startStr = `${year}-${pad2(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate(); // 月の最終日を取得
    const endStr = `${year}-${pad2(month)}-${lastDay}`;

    const recordsRef = adminDb.collection('attendanceRecords');

    // ★ 変更点: その月の「欠席」データを範囲検索
    const snapshot = await recordsRef
      .where('usageStatus', '==', '欠席')
      .where('date', '>=', startStr)
      .where('date', '<=', endStr)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ message: "対象データなし", count: 0 });
    }

    let processedCount = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      
      // 既にAIアドバイスがある場合はスキップ (無駄な消費を防ぐため)
      if (data.aiAdvice) continue; 

      // 過去の相談内容を取得
      const historySnap = await recordsRef
        .where('userId', '==', data.userId)
        .where('usageStatus', '==', '欠席')
        .where('date', '<', data.date) // その欠席日より前
        .orderBy('date', 'desc')
        .limit(5)
        .get();

      const pastAdvices = historySnap.docs
        .map(d => d.data().aiAdvice)
        .filter(t => t)
        .reverse()
        .join(" / ");

      let promptInputPart = "";
      if (pastAdvices.length > 0) {
        promptInputPart = `[入力] 過去の相談内容：${pastAdvices} / 今回の連絡内容：${data.notes || ''}`;
      } else {
        promptInputPart = `[入力] ${data.notes || ''}`;
      }

      const prompt = `
[役割] あなたは児童発達支援の専門スタッフです。
${promptInputPart}
[厳格な指示]
1. 上記の「入力」は欠席連絡（および過去の経緯）です。この内容から本人の状況や心理を分析してください。
2. 「入力」のオウム返しや単語の定義・翻訳は絶対に禁止します。
3. 分析に基づき、「相談内容」として専門的な所見と今後の支援提案を作成してください。
4. 回答は必ず日本語で、150文字から200文字の範囲に収めてください。
5. 文末は「〜とお伝えした。」「〜とお話した。」「〜していく。」「〜を増やしていく。」のいずれかの形式で必ず終えてください。
[タスク] 上記の5つの厳格な指示をすべて守り、「相談内容」を作成してください。
      `;

      try {
        const advice = await callGemini(prompt);
        // Firestore更新
        await docSnap.ref.update({ aiAdvice: advice });
        processedCount++;
      } catch (err) {
        console.error(`Error processing ${docSnap.id}:`, err);
        // 1件エラーが出ても他は続ける
      }
    }

    return NextResponse.json({ message: "完了", count: processedCount });

  } catch (error: any) {
    console.error("Batch AI Gen Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}