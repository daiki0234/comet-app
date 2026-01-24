// src/app/api/absence/generate-advice/route.ts

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin'; 

// ★単発実行なので、ここでは過去履歴を取得してもAPI制限の心配はありません
// AIに「文脈」を理解させるため、過去3件の履歴を取得します。

export async function POST(request: Request) {
  try {
    const { userId, date, currentNote } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) return NextResponse.json({ error: "API Key not found" }, { status: 500 });
    if (!userId || !date) return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });

    const recordsRef = adminDb.collection('attendanceRecords');

    // 1. 過去の欠席履歴を取得（直近3件）
    // ※これにより「連続欠席」や「頻繁な体調不良」などをAIが察知できます
    const historySnap = await recordsRef
      .where('userId', '==', userId)
      .where('usageStatus', '==', '欠席')
      .where('date', '<', date) // 今回より前の日付
      .orderBy('date', 'desc')
      .limit(3)
      .get();

    const pastAdvices = historySnap.docs
      .map(d => {
        const data = d.data();
        return `・${data.date}: ${data.notes || 'なし'} (AI助言: ${data.aiAdvice || 'なし'})`;
      })
      .reverse() // 古い順に戻す
      .join("\n");

    // 2. プロンプト作成
    const systemPrompt = `
    あなたは児童発達支援・放課後等デイサービスの専門スタッフです。
    保護者からの「欠席連絡」に対し、適切な「相談援助内容（対応記録）」を作成してください。
    
    【過去の経緯】
    ${pastAdvices || '（過去の欠席記録なし）'}

    【今回の連絡内容】
    ${currentNote || '（連絡事項なし）'}

    【作成ルール】
    1. 上記の「今回の連絡」と「過去の経緯」を統合して状況を分析すること。
    2. オウム返しは禁止。専門的な所見と、スタッフとしてどう関わるか（支援方針）を含めること。
    3. 150〜200文字程度の日本語で記述すること。
    4. 文末は「〜とお伝えした。」「〜とお話した。」「〜していく。」「〜を増やしていく。」のいずれかで統一すること。
    5. JSONなどの形式ではなく、**アドバイスの文章のみ**をプレーンテキストで出力してください。
    `;

    // 3. Gemini呼び出し (gemini-flash-latest)
    const MODEL_NAME = 'gemini-flash-latest';
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000, 
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error("[SingleGen] Gemini API Error:", err);
      if (response.status === 429) {
        throw new Error("AI利用枠が一時的に混雑しています。後ほどバッチ処理をお試しください。");
      }
      throw new Error(`AI API Error: ${response.status}`);
    }

    const aiRes = await response.json();
    const adviceText = aiRes.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // 余計な改行などをトリム
    return NextResponse.json({ advice: adviceText.trim() });

  } catch (error: any) {
    console.error("[SingleGen] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}