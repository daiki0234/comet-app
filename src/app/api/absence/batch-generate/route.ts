import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin'; 

const pad2 = (n: number) => n.toString().padStart(2, "0");

async function callGemini(prompt: string) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error("API Key not found");

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
    const { year, month } = body;

    console.log(`[Batch] Request received for: ${year}-${month}`); // ★ログ確認用

    if (!year || !month) {
      return NextResponse.json({ error: "year または month が不足しています" }, { status: 400 });
    }

    const startStr = `${year}-${pad2(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate(); 
    const endStr = `${year}-${pad2(month)}-${lastDay}`;

    console.log(`[Batch] Searching range: ${startStr} ~ ${endStr}`); // ★ログ確認用

    const recordsRef = adminDb.collection('attendanceRecords');
    const snapshot = await recordsRef
      .where('usageStatus', '==', '欠席')
      .where('date', '>=', startStr)
      .where('date', '<=', endStr)
      .get();

    console.log(`[Batch] Found documents: ${snapshot.size}`); // ★ログ確認用：ここで0なら検索条件かデータがおかしい

    if (snapshot.empty) {
      return NextResponse.json({ message: "対象データなし", count: 0 });
    }

    let processedCount = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      
      // ▼▼▼ 修正点：スキップ条件をコメントアウト（強制上書きモード） ▼▼▼
      // if (data.aiAdvice) {
      //   console.log(`[Batch] Skipping ${data.userName} (Already exists)`);
      //   continue; 
      // }
      // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

      console.log(`[Batch] Processing: ${data.userName} (${data.date})`);

      // 過去の相談内容を取得
      const historySnap = await recordsRef
        .where('userId', '==', data.userId)
        .where('usageStatus', '==', '欠席')
        .where('date', '<', data.date)
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
        await docSnap.ref.update({ aiAdvice: advice });
        processedCount++;
      } catch (err) {
        console.error(`[Batch] Error processing ${docSnap.id}:`, err);
      }
    }

    return NextResponse.json({ message: "完了", count: processedCount });

  } catch (error: any) {
    console.error("Batch AI Gen Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}