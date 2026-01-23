import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin'; 

const pad2 = (n: number) => n.toString().padStart(2, "0");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { year, month, staffName } = body; 
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not found" }, { status: 500 });
    }

    if (!year || !month) {
      return NextResponse.json({ error: "year または month が不足しています" }, { status: 400 });
    }

    // 対象月の範囲
    const startStr = `${year}-${pad2(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate(); 
    const endStr = `${year}-${pad2(month)}-${lastDay}`;

    const recordsRef = adminDb.collection('attendanceRecords');
    
    // 1. その月の「欠席」データを取得
    const snapshot = await recordsRef
      .where('usageStatus', '==', '欠席')
      .where('date', '>=', startStr)
      .where('date', '<=', endStr)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ message: "対象データなし", count: 0 });
    }

    // 2. 処理対象データの選定
    const targets = snapshot.docs.filter(doc => !doc.data().aiAdvice);
    const staffOnlyTargets = snapshot.docs.filter(doc => doc.data().aiAdvice && !doc.data().staffName && staffName);

    if (targets.length === 0) {
      if (staffOnlyTargets.length > 0 && staffName) {
        const batch = adminDb.batch();
        staffOnlyTargets.forEach(doc => {
          batch.update(doc.ref, { staffName: staffName });
        });
        await batch.commit();
        return NextResponse.json({ message: "担当者名のみ更新しました", count: staffOnlyTargets.length });
      }
      return NextResponse.json({ message: "AI作成が必要なデータはありませんでした", count: 0 });
    }

    // 3. AI生成用のコンテキストデータを準備
    // ★修正: Firestoreの読み取り制限（Quota）を回避するため、
    // 「過去の履歴(history)」を取得する処理を削除し、今回の連絡内容のみで生成させます。
    console.log(`[Batch] Preparing data for ${targets.length} records...`);
    
    const promptData = targets.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.userName,
        date: data.date,
        note: data.notes || '（連絡なし）',
        // history: ... ← 削除（これがFirestoreのエラー原因）
      };
    });

    // 4. Geminiへの一括リクエスト
    // モデル: gemini-flash-latest
    const MODEL_NAME = 'gemini-flash-latest';
    
    const systemPrompt = `
    あなたは放課後等デイサービスの専門スタッフです。
    提供された複数の欠席連絡データに対し、それぞれ適切な「相談援助内容（対応記録）」を一括で作成してください。

    【出力形式】
    JSON形式で出力してください。
    キーを「データのID」、値を「作成した相談内容」にしてください。
    例: { "doc_id_1": "相談内容...", "doc_id_2": "相談内容..." }

    【作成ルール】
    1. 保護者の連絡内容から、状況や心理を分析すること。
    2. オウム返しは禁止。専門的な所見と今後の支援提案を含めること。
    3. 各150〜200文字程度の日本語で記述すること。
    4. 文末は「〜とお伝えした。」「〜とお話した。」「〜していく。」「〜を増やしていく。」のいずれかで統一すること。
    `;

    const userPrompt = `
    以下のデータを処理してください。
    
    ${JSON.stringify(promptData, null, 2)}
    `;

    console.log(`[Batch] Requesting Gemini (${MODEL_NAME}) for ${targets.length} items...`);

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

    if (!response.ok) {
      const err = await response.json();
      console.error("[Batch] Gemini API Error:", err);
      if (response.status === 429) throw new Error("AI利用枠超過(429)");
      throw new Error(`AI API Error: ${response.status}`);
    }

    const aiRes = await response.json();
    const rawText = aiRes.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    let generatedMap: Record<string, string> = {};
    try {
      generatedMap = JSON.parse(rawText);
    } catch (e) {
      console.error("[Batch] JSON Parse Error", rawText);
      throw new Error("AIの応答を解析できませんでした");
    }

    // 5. Firestoreへの一括書き込み
    const batch = adminDb.batch();
    let updateCount = 0;

    targets.forEach(docSnap => {
      const advice = generatedMap[docSnap.id];
      if (advice) {
        const updateData: any = { aiAdvice: advice };
        if (!docSnap.data().staffName && staffName) {
          updateData.staffName = staffName;
        }
        batch.update(docSnap.ref, updateData);
        updateCount++;
      }
    });

    staffOnlyTargets.forEach(docSnap => {
      if (!generatedMap[docSnap.id]) {
        batch.update(docSnap.ref, { staffName: staffName });
        updateCount++;
      }
    });

    await batch.commit();

    console.log(`[Batch] Completed. Updated ${updateCount} records.`);
    return NextResponse.json({ message: "完了", count: updateCount });

  } catch (error: any) {
    console.error("Batch Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}