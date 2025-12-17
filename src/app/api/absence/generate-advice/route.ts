// ▼▼▼ 1. Vercelのタイムアウトを60秒に延長（必須！） ▼▼▼
export const maxDuration = 60; 
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin'; 

async function callGemini(prompt: string) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error("API Key not found: GEMINI_API_KEYが設定されていません");

  // もし gemini-2.0-flash でエラーになる場合は gemini-1.5-flash に変えてみてください
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "生成エラー";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, date, currentNote } = body;

    if (!userId || !date) {
      return NextResponse.json({ error: "userId または date が不足しています" }, { status: 400 });
    }

    // Admin SDK でクエリ
    const recordsRef = adminDb.collection('attendanceRecords');
    const snapshot = await recordsRef
      .where('userId', '==', userId)
      .where('usageStatus', '==', '欠席')
      .where('date', '<', date) // 過去分
      .orderBy('date', 'desc')
      .limit(5)
      .get();
    
    const pastAdvices = snapshot.docs
      .map(doc => doc.data().aiAdvice)
      .filter(txt => txt)
      .reverse()
      .join(" / ");

    let promptInputPart = "";
    if (pastAdvices.length > 0) {
      promptInputPart = `[入力] 過去の相談内容：${pastAdvices} / 今回の連絡内容：${currentNote || ''}`;
    } else {
      promptInputPart = `[入力] ${currentNote || ''}`;
    }

    const prompt = `
[役割] あなたは児童発達支援の専門スタッフです。
${promptInputPart}
[厳格な指示]
1. 上記の「入力」は欠席連絡（および過去の経緯）です。この内容から本人の状況や心理を分析してください。
2. 「入力」のオウム返しや単語の定義・翻訳は絶対に禁止します。
3. 分析に基づき、「相談内容」として専門的な所見と今後の支援提案を作成してください。
4. 回答は必ず日本語で、100文字から150文字の範囲に収めてください。
5. 文末は「〜とお伝えした。」「〜とお話した。」「〜していく。」「〜を増やしていく。」のいずれかの形式で必ず終えてください。
[タスク] 上記の5つの厳格な指示をすべて守り、「相談内容」を作成してください。
    `;

    const advice = await callGemini(prompt);
    return NextResponse.json({ advice });

  } catch (error: any) {
    console.error("AI Generation Error:", error);
    // クライアントに詳しいエラーを返す（デバッグ用）
    return NextResponse.json({ error: `生成に失敗しました: ${error.message}` }, { status: 500 });
  }
}