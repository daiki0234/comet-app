import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin'; 

const pad2 = (n: number) => n.toString().padStart(2, "0");

// 待機用関数
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// AI生成関数
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
  
  if (data.error) {
    if (data.error.code === 429 || data.error.status === 'RESOURCE_EXHAUSTED') {
      throw new Error("AI利用枠超過");
    }
    throw new Error(data.error.message || "AI生成エラー");
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "生成エラー";
}

// 次回予定の日付フォーマット (YYYY-MM-DD -> 次回M月D日利用予定)
const formatNextVisit = (dateStr: string) => {
  const d = new Date(dateStr);
  return `次回${d.getMonth() + 1}月${d.getDate()}日利用予定`;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { year, month, staffName } = body; // staffNameを受け取る

    console.log(`[Batch] Request: ${year}-${month} by ${staffName}`);

    if (!year || !month) {
      return NextResponse.json({ error: "year または month が不足しています" }, { status: 400 });
    }

    // 対象月の範囲
    const startStr = `${year}-${pad2(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate(); 
    const endStr = `${year}-${pad2(month)}-${lastDay}`;

    const recordsRef = adminDb.collection('attendanceRecords');
    
    // その月の「欠席」データを取得
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
      const updates: any = {}; // 更新する項目をここに溜める
      let aiCalled = false;    // AIを呼んだかどうかのフラグ

      // ---------------------------------------------------
      // 1. AI相談内容の補完
      // ---------------------------------------------------
      if (!data.aiAdvice) {
        console.log(`[Batch] Generating AI for ${data.userName}`);
        
        // 過去ログ取得
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
          updates.aiAdvice = advice;
          aiCalled = true;
        } catch (err) {
          console.error(`[Batch] AI Error for ${docSnap.id}:`, err);
        }
      }

      // ---------------------------------------------------
      // 2. 担当者の補完
      // ---------------------------------------------------
      // 担当者が空の場合、ボタンを押した人の名前を入れる
      if (!data.staffName && staffName) {
        updates.staffName = staffName;
      }

      // ---------------------------------------------------
      // 3. 次回予定の補完
      // ---------------------------------------------------
      // 次回予定が空の場合、出欠記録から「欠席日の翌日以降」を探す
      if (!data.nextVisit) {
        try {
          const nextVisitSnap = await recordsRef
            .where('userId', '==', data.userId)
            .where('date', '>', data.date) // 欠席日より後
            .orderBy('date', 'asc')        // 近い順
            .limit(1)                      // 最初の1件だけ
            .get();

          if (!nextVisitSnap.empty) {
            const nextRecord = nextVisitSnap.docs[0].data();
            // 見つかったらフォーマットしてセット
            updates.nextVisit = formatNextVisit(nextRecord.date);
          }
        } catch (err) {
          console.error(`[Batch] NextVisit Error for ${docSnap.id}:`, err);
          // インデックスエラーが出る可能性があります（userId + date の複合インデックスが必要）
          // ログにURLが出たらクリックして作成してください
        }
      }

      // ---------------------------------------------------
      // 更新実行
      // ---------------------------------------------------
      if (Object.keys(updates).length > 0) {
        await docSnap.ref.update(updates);
        processedCount++;
        
        // AIを使った場合のみ、レート制限回避のために休憩する
        if (aiCalled) {
          await sleep(3000); 
        }
      }
    }

    return NextResponse.json({ message: "完了", count: processedCount });

  } catch (error: any) {
    console.error("Batch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}