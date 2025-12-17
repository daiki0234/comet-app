// ▼ タイムアウト対策（60秒）
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin'; 

// Gemini呼び出し関数
async function callGemini(prompt: string) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return "（APIキー未設定のため生成不可）";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    
    if (!response.ok) {
        const errorDetail = await response.text();
        console.error("Gemini API Error Detail:", errorDetail);
        throw new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "AI生成失敗";
  } catch (e) {
    console.error("Gemini Call Error:", e);
    return "AI接続エラー";
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { year, month, staffName } = body;

    console.log(`[Batch] Start: ${year}-${month}`);

    // 日付範囲 (YYYY-MM-DD)
    const y = year;
    const m = month.toString().padStart(2, '0');
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-31`;

    console.log(`[Batch] Querying 'attendanceRecords' from ${startDate} to ${endDate}`);

    const recordsRef = adminDb.collection('attendanceRecords');
    const snapshot = await recordsRef
      .where('usageStatus', '==', '欠席')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    console.log(`[Batch] Hit count: ${snapshot.size}`);

    if (snapshot.empty) {
      return NextResponse.json({ count: 0, message: "対象データなし" });
    }

    let updateCount = 0;

    // AI生成処理ループ
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // 既にAIアドバイスがある場合はスキップ
      if (data.aiAdvice && data.staffName) {
        continue;
      }

      // ★★★ 修正: プロンプトを省略せず、詳細な指示を適用 ★★★
      const promptInputPart = `[入力] 欠席理由：${data.reason || 'なし'} / 連絡内容：${data.notes || 'なし'}`;

      const prompt = `
[役割] あなたは児童発達支援の専門スタッフです。
${promptInputPart}
[厳格な指示]
1. 上記の「入力」は欠席連絡です。この内容から本人の状況や心理を分析してください。
2. 「入力」のオウム返しや単語の定義・翻訳は絶対に禁止します。
3. 分析に基づき、「相談内容」として専門的な所見と今後の支援提案を作成してください。
4. 回答は必ず日本語で、150文字から200文字の範囲に収めてください。
5. 文末は「〜とお伝えした。」「〜とお話した。」「〜していく。」「〜を増やしていく。」のいずれかの形式で必ず終えてください。
[タスク] 上記の5つの厳格な指示をすべて守り、「相談内容」を作成してください。
      `;

      // AI生成
      const aiAdvice = data.aiAdvice || await callGemini(prompt);
      const staff = data.staffName || staffName || '担当者';

      // 更新
      await doc.ref.update({
        aiAdvice: aiAdvice,
        staffName: staff,
        updatedAt: new Date(), 
      });

      updateCount++;
    }

    console.log(`[Batch] Updated count: ${updateCount}`);
    return NextResponse.json({ count: updateCount });

  } catch (error: any) {
    console.error("[Batch] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}