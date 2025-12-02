import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (apiKey) {
      console.log(`[API] API Key loaded: ${apiKey.substring(0, 4)}...`);
    } else {
      console.error("[API] Error: API Key is missing.");
      return NextResponse.json({ comment: 'APIキーが設定されていません。' }, { status: 500 });
    }

    const { context, type } = await request.json();
    
    if (!context) {
      return NextResponse.json({ comment: '分析するデータがありません。' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    let prompt = '';

    if (type === 'summary') {
      prompt = `
      あなたは放課後等デイサービスの熟練した経営コンサルタントです。
      以下の事業所データ（月別推移、曜日別傾向、ランキング、欠席理由）を深く分析し、各セクションごとの洞察をJSON形式で出力してください。

      【分析対象データ】
      ${context}

      【指示】
      以下のキーを持つJSONオブジェクトのみを出力してください（Markdown記法は不要）。
      1. "overall": 全体的な傾向と、経営視点での総評（200文字程度）
      2. "trends": 「月別コマ数・利用率推移」に対する分析。季節変動や稼働率の変化について（150文字程度）
      3. "dayOfWeek": 「曜日別欠席率」に対する分析。特定の曜日に欠席が集中している理由の仮説と対策（150文字程度）
      4. "ranking": 「利用・欠席ランキング」に対する分析。特定児童への依存度やケアが必要な児童について（150文字程度）
      5. "absences": 「欠席理由の内訳」に対する分析。体調不良や家庭の事情などの傾向と対策（150文字程度）
      `;
    } else if (type === 'user') {
      prompt = `
      あなたは放課後等デイサービスのベテラン児童発達支援管理責任者です。
      以下の利用者データ（利用推移、欠席理由）を深く分析し、個別支援計画や保護者面談に使える助言をJSON形式で出力してください。

      【分析対象データ】
      ${context}

      【指示】
      以下のキーを持つJSONオブジェクトのみを出力してください（Markdown記法は不要）。
      1. "overall": この利用者の全体的な利用傾向と、現在の安定度（150文字程度）
      2. "trends": 「利用推移」グラフに対する分析。利用頻度の変化や波について（100文字程度）
      3. "absences": 「欠席理由」に対する分析。体調面・心理面の傾向や、保護者へのヒアリング事項（150文字程度）
      4. "advice": スタッフへの具体的な支援アドバイス（100文字程度）
      `;
    }

    console.log(`[API] Requesting Gemini (gemini-1.5-flash)...`);
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // JSONパース処理 (Markdownの ```json 等が含まれている場合の除去)
    let jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    try {
      const jsonResponse = JSON.parse(jsonStr);
      console.log(`[API] Success. JSON parsed.`);
      return NextResponse.json(jsonResponse);
    } catch (e) {
      console.error("JSON Parse Error:", jsonStr);
      // フォールバック用のJSONを返す
      return NextResponse.json({ 
        overall: "分析データの生成に失敗しました（形式エラー）。",
        trends: "再読み込みしてください。",
        dayOfWeek: "",
        ranking: "",
        absences: "",
        advice: ""
      }); 
    }

  } catch (error: any) {
    console.error('[API] Analysis Error Detail:', error);
    return NextResponse.json({ 
      comment: 'AI分析中にエラーが発生しました。時間を置いて再度お試しください。',
      debug: error.message 
    }, { status: 500 });
  }
}