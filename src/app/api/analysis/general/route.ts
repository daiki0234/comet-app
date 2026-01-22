import { NextResponse } from 'next/server';

// Edge Runtimeの設定
export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      console.error("[API] Error: API Key is missing.");
      return NextResponse.json({ overall: 'APIキーが設定されていません。' }, { status: 500 });
    }

    const { context, type } = await request.json();
    
    if (!context) {
      return NextResponse.json({ overall: '分析するデータがありません。' }, { status: 400 });
    }

    // 今日の日付
    const now = new Date();
    const todayStr = now.toLocaleDateString('ja-JP'); 

    // ★修正: 診断リストにあった軽量モデルを使用
    const MODEL_NAME = 'gemini-2.0-flash-lite';
    
    console.log(`[API] Requesting Gemini via fetch (${MODEL_NAME})...`);

    let prompt = '';

    if (type === 'summary') {
      prompt = `
      あなたは放課後等デイサービスの熟練した経営コンサルタントです。
      以下の事業所データ（月別推移、曜日別傾向、ランキング、欠席理由）を深く分析し、各セクションごとの洞察をJSON形式で出力してください。

      【前提条件】
      ・本日は「${todayStr}」です。
      ・データには「実績（actual）」と「予定/見込み（forecast）」が含まれています。
      ・当月や未来の月については、「予定（forecast）」の数字をベースに、最終的な着地予想や、稼働率向上のためのアクションを提案してください。

      【分析対象データ】
      ${context}

      【指示】
      以下のキーを持つJSONオブジェクトのみを出力してください（Markdown記法は不要）。
      1. "overall": 全体的な傾向と、経営視点での総評（200文字程度）。「予定」を含めた今後の見通しについても言及すること。
      2. "trends": 「月別コマ数・利用率推移」に対する分析。実績と予定（見込み）の差分や、当月の着地予想、季節変動について（150文字程度）
      3. "dayOfWeek": 「曜日別欠席率」に対する分析。特定の曜日に欠席が集中している理由の仮説と対策（150文字程度）
      4. "ranking": 「利用・欠席ランキング」に対する分析。特定児童への依存度やケアが必要な児童について（150文字程度）
      5. "absences": 「欠席理由の内訳」に対する分析。体調不良や家庭の事情などの傾向と対策（150文字程度）
      `;
    } else if (type === 'user') {
      prompt = `
      あなたは放課後等デイサービスのベテラン児童発達支援管理責任者です。
      以下の利用者データ（利用推移、欠席理由）を深く分析し、個別支援計画や保護者面談に使える助言をJSON形式で出力してください。

      【前提条件】
      ・本日は「${todayStr}」です。
      ・利用推移データには「実績（usage）」と「予定/見込み（forecast）」が含まれています。
      ・当月や未来については、予定通り利用できそうか、あるいは予約が少ないか等の観点も含めて分析してください。

      【分析対象データ】
      ${context}

      【指示】
      以下のキーを持つJSONオブジェクトのみを出力してください（Markdown記法は不要）。
      1. "overall": この利用者の全体的な利用傾向と、現在の安定度（150文字程度）
      2. "trends": 「利用推移」グラフに対する分析。利用頻度の変化や、今後の利用予定（見込み）を踏まえたコメント（100文字程度）
      3. "absences": 「欠席理由」に対する分析。体調面・心理面の傾向や、保護者へのヒアリング事項（150文字程度）
      4. "advice": スタッフへの具体的な支援アドバイス（100文字程度）
      `;
    }

    // APIリクエスト
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2000,
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[API] Gemini API Error:", JSON.stringify(errorData, null, 2));
      
      // エラー詳細
      const status = errorData.error?.status || response.statusText;
      const msg = errorData.error?.message || "Unknown Error";
      
      // 429 Quota Exceeded の場合
      if (response.status === 429) {
         throw new Error(`AIの利用上限(Quota)を超えました。しばらく待つか、課金設定を確認してください。`);
      }
      throw new Error(`Gemini API Error (${status}): ${msg}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // JSONパース処理
    let jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    try {
      const jsonResponse = JSON.parse(jsonStr);
      console.log(`[API] Success. JSON parsed.`);
      return NextResponse.json(jsonResponse);
    } catch (e) {
      console.error("JSON Parse Error:", jsonStr);
      return NextResponse.json({ 
        overall: "AIからの応答はありましたが、データの形式変換に失敗しました。",
        trends: text,
        dayOfWeek: "",
        ranking: "",
        absences: "",
        advice: ""
      }); 
    }

  } catch (error: any) {
    console.error('[API] Analysis Error Detail:', error);
    return NextResponse.json({ 
      overall: 'AI分析中にエラーが発生しました。',
      trends: error.message || 'Unknown Error',
    }, { status: 500 });
  }
}