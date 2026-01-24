import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin'; 

// Gemini呼び出し関数
async function callGemini(prompt: string) {
  const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!API_KEY) throw new Error("API Key not found");

  // ★モデルを修正: 確実に動く 'gemini-flash-latest' を使用
  const MODEL_NAME = 'gemini-flash-latest';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000, // 単発なので短めでOK
        }
      })
    }
  );
  
  if (!response.ok) {
    const errorDetail = await response.text();
    console.error("Gemini API Error Detail:", errorDetail);
    
    if (response.status === 429) {
      throw new Error("AI利用枠が混雑しています(429)。少し時間を空けてください。");
    }
    throw new Error(`Gemini API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function POST(request: Request) {
  try {
    // フロントエンドから送られてくる「1件分のデータ」を受け取る
    const { userId, date, currentNote } = await request.json();

    if (!userId || !date) {
      return NextResponse.json({ error: "必須項目(userId, date)が不足しています" }, { status: 400 });
    }

    // 1. 過去の欠席履歴を取得（直近3件）
    // ※単発実行ならFirestoreの読み取りコストは低いので、精度向上のために履歴を含めます
    const recordsRef = adminDb.collection('attendanceRecords');
    const historySnap = await recordsRef
      .where('userId', '==', userId)
      .where('usageStatus', '==', '欠席')
      .where('date', '<', date) // 今回より前の日付
      .orderBy('date', 'desc')
      .limit(3)
      .get();

    const pastAdvices = historySnap.docs
      .map(d => {
        const dData = d.data();
        return `・${dData.date}: ${dData.notes || 'なし'} (AI助言: ${dData.aiAdvice || 'なし'})`;
      })
      .reverse() // 古い順に戻す
      .join("\n");

    // 2. プロンプト作成
    // 単発生成なので、一括処理より少しリッチなプロンプトにします
    const prompt = `
[役割] あなたは児童発達支援・放課後等デイサービスの専門スタッフです。
保護者からの「欠席連絡」に対し、適切な「相談援助内容（対応記録）」を作成してください。

【過去の経緯（参考）】
${pastAdvices || '（過去の欠席記録なし）'}

【今回の連絡内容】
${currentNote || '（連絡事項なし）'}

[厳格な指示]
1. 上記の「今回の連絡」と「過去の経緯」を統合して状況や心理を分析してください。
2. オウム返しや単語の定義は禁止。専門的な所見と、スタッフとしての支援方針を含めてください。
3. 回答は必ず日本語で、150文字から200文字の範囲に収めてください。
4. 文末は「〜とお伝えした。」「〜とお話した。」「〜していく。」「〜を増やしていく。」のいずれかの形式で必ず終えてください。
5. 余計な前置きやJSON形式は不要です。アドバイスの文章のみを出力してください。
    `;

    // 3. AI生成実行
    console.log(`[SingleGen] Generating advice for user: ${userId}`);
    const advice = await callGemini(prompt);

    // 4. 結果を返す
    // ※ここではDB更新を行わず、生成したテキストをフロントに返します
    // (フロント側で updateDoc を行っているため)
    return NextResponse.json({ advice: advice.trim() });

  } catch (error: any) {
    console.error("[SingleGen] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}