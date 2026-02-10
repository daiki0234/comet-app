import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin'; 

const pad2 = (n: number) => n.toString().padStart(2, "0");

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { year, month, staffName } = body; 
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) return NextResponse.json({ error: "API Key not found" }, { status: 500 });
    if (!year || !month) return NextResponse.json({ error: "year/month不足" }, { status: 400 });

    const startStr = `${year}-${pad2(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate(); 
    const endStr = `${year}-${pad2(month)}-${lastDay}`;

    const recordsRef = adminDb.collection('attendanceRecords');
    const snapshot = await recordsRef
      .where('usageStatus', '==', '欠席')
      .where('date', '>=', startStr)
      .where('date', '<=', endStr)
      .get();

    if (snapshot.empty) return NextResponse.json({ message: "対象なし", count: 0 });

    const targets = snapshot.docs.filter(doc => !doc.data().aiAdvice);
    const staffOnlyTargets = snapshot.docs.filter(doc => doc.data().aiAdvice && !doc.data().staffName && staffName);

    if (targets.length === 0) {
      if (staffOnlyTargets.length > 0 && staffName) {
        const batch = adminDb.batch();
        staffOnlyTargets.forEach(doc => batch.update(doc.ref, { staffName }));
        await batch.commit();
        return NextResponse.json({ message: "担当者名のみ更新", count: staffOnlyTargets.length });
      }
      return NextResponse.json({ message: "AI作成対象なし", count: 0 });
    }

    // 5件ずつ分割
    const chunks = chunkArray(targets, 5); 
    const MODEL_NAME = 'gemini-2.5-flash';
    
    let totalUpdated = 0;
    const batchWriter = adminDb.batch();

    console.log(`[Batch] Total ${targets.length} items. Processing in ${chunks.length} chunks.`);

    for (const [index, chunk] of chunks.entries()) {
      // -------------------------------------------------------
      // ★リトライロジック開始
      // -------------------------------------------------------
      let attempt = 0;
      let success = false;
      const MAX_RETRIES = 3; // 最大3回までやり直す

      while (attempt < MAX_RETRIES && !success) {
        try {
          console.log(`[Batch] Chunk ${index + 1}/${chunks.length} (Attempt ${attempt + 1})...`);

          const promptData = chunk.map((docSnap) => ({
            id: docSnap.id,
            name: docSnap.data().userName,
            date: docSnap.data().date,
            note: docSnap.data().notes || '（連絡なし）',
          }));

          const systemPrompt = `
          あなたは放課後等デイサービスの専門スタッフです。
          提供された欠席連絡に対し、適切な「相談援助内容（対応記録）」を作成してください。
          【出力形式】
          JSON形式。キーは「データのID」、値は「相談内容」。
          【作成ルール】
          1. 連絡内容から状況・心理を分析。
          2. オウム返し禁止。専門的所見と支援提案を含める。
          3. 各150〜200文字程度の日本語。
          4. 文末は「〜とお伝えした。」「〜とお話した。」「〜していく。」「〜を増やしていく。」等で統一。
          `;

          const userPrompt = `以下のデータを処理:\n${JSON.stringify(promptData, null, 2)}`;

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt + "\n" + userPrompt }] }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 8192,
                  response_mime_type: "application/json"
                }
              })
            }
          );

          // ★ 429エラー（連打しすぎ）の場合
          if (response.status === 429) {
            console.warn(`[Batch] 429 Too Many Requests. Cooling down...`);
            // 1回目なら10秒、2回目なら20秒待つ（ペナルティ待機）
            await sleep(10000 * (attempt + 1)); 
            attempt++;
            continue; // whileループの先頭に戻って再挑戦
          }

          if (!response.ok) {
            console.error(`[Batch] API Error: ${response.status}`);
            break; // 429以外のエラーは諦めて次のチャンクへ
          }

          // 成功時
          const aiRes = await response.json();
          const rawText = aiRes.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
          const generatedMap = JSON.parse(rawText);

          chunk.forEach(docSnap => {
            const advice = generatedMap[docSnap.id];
            if (advice) {
              const updateData: any = { aiAdvice: advice };
              if (!docSnap.data().staffName && staffName) updateData.staffName = staffName;
              batchWriter.update(docSnap.ref, updateData);
              totalUpdated++;
            }
          });

          success = true; // whileループを抜ける

        } catch (err) {
          console.error(`[Batch] Attempt ${attempt + 1} Failed:`, err);
          attempt++;
          if (attempt < MAX_RETRIES) await sleep(5000); // ネットワークエラー等は5秒待つ
        }
      }
      // -------------------------------------------------------
      // ★リトライロジック終了
      // -------------------------------------------------------

      // 通常時の待機（安全のため2秒に延長）
      if (index < chunks.length - 1) await sleep(2000); 
    }

    // 担当者名のみ更新分
    staffOnlyTargets.forEach(docSnap => {
      batchWriter.update(docSnap.ref, { staffName });
      totalUpdated++;
    });

    if (totalUpdated > 0) {
        await batchWriter.commit();
    }

    console.log(`[Batch] Completed. Updated approx ${totalUpdated} records.`);
    return NextResponse.json({ message: "完了", count: totalUpdated });

  } catch (error: any) {
    console.error("Batch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}