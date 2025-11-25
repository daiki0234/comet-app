import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase'; // または adminDb
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';

// Gemini API呼び出し関数
async function callGemini(prompt: string) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error("API Key not found");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

export async function POST(request: Request) {
  try {
    const { userId, date, currentNote } = await request.json();

    // 1. 過去の相談内容を取得 (TEXTJOINの代わり)
    const historyQuery = query(
      collection(db, 'attendanceRecords'),
      where('userId', '==', userId),
      where('usageStatus', '==', '欠席'),
      where('date', '<', date), // 今回より前の日付
      orderBy('date', 'desc')   // 新しい順にとってくる
    );
    const snapshot = await getDocs(historyQuery);
    
    // 過去の aiAdvice を取得して結合 (直近5件くらいに絞ると精度が良いですが、一旦全部または適量で)
    const pastAdvices = snapshot.docs
      .map(doc => doc.data().aiAdvice)
      .filter(txt => txt) // 空欄は除外
      .reverse() // 古い順に戻す
      .join(" / ");

    // 2. プロンプトの構築 (IF分岐の再現)
    let promptInputPart = "";
    
    if (pastAdvices.length > 0) {
      // 過去ログありパターン
      promptInputPart = `[入力] 過去の相談内容：${pastAdvices} / 今回の連絡内容：${currentNote}`;
    } else {
      // 初回パターン
      promptInputPart = `[入力] ${currentNote}`;
    }

    // 3. 厳格な指示の構築
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

    // 4. 生成実行
    const generatedText = await callGemini(prompt);

    return NextResponse.json({ advice: generatedText });

  } catch (error: any) {
    console.error("AI Generation Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}