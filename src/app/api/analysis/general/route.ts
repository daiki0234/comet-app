import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing' }, { status: 500 });
    }

    const { context, type } = await request.json();
    if (!context) {
      return NextResponse.json({ error: 'No context data' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // JSONモードが安定している gemini-1.5-flash を使用
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: { responseMimeType: "application/json" } // JSON出力を強制
    });

    let prompt = '';

    if (type === 'summary') {
      prompt = `
      あなたは放課後等デイサービスの熟練した経営コンサルタントです。
      以下の事業所データ（月別推移、ランキング、欠席理由）を深く分析し、各セクションごとの洞察をJSON形式で出力してください。

      【分析対象データ】
      ${context}

      【指示】
      以下のキーを持つJSONオブジェクトのみを出力してください。
      1. "overall": 全体的な傾向と、経営視点での総評（200文字程度）
      2. "trends": 「月別コマ数・利用率推移」グラフに対する分析。季節変動や稼働率の変化について（150文字程度）
      3. "ranking": 「利用・欠席ランキング」に対する分析。特定児童への依存度やケアが必要な児童について（150文字程度）
      4. "absences": 「欠席理由の内訳」に対する分析。体調不良や家庭の事情などの傾向と対策（150文字程度）
      `;
    } else if (type === 'user') {
      prompt = `
      あなたは放課後等デイサービスのベテラン児童発達支援管理責任者です。
      以下の利用者データ（利用推移、欠席理由）を深く分析し、個別支援計画や保護者面談に使える助言をJSON形式で出力してください。

      【分析対象データ】
      ${context}

      【指示】
      以下のキーを持つJSONオブジェクトのみを出力してください。
      1. "overall": この利用者の全体的な利用傾向と、現在の安定度（150文字程度）
      2. "trends": 「利用推移」グラフに対する分析。利用頻度の変化や波について（100文字程度）
      3. "absences": 「欠席理由」に対する分析。体調面・心理面の傾向や、保護者へのヒアリング事項（150文字程度）
      4. "advice": スタッフへの具体的な支援アドバイス（100文字程度）
      `;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // JSONとしてパースして返す
    // (generationConfigでJSONを指定していますが、念のためテキストとして受け取りパースします)
    try {
      const jsonResponse = JSON.parse(text);
      return NextResponse.json(jsonResponse);
    } catch (e) {
      console.error("JSON Parse Error:", text);
      return NextResponse.json({ 
        overall: "分析データの生成に失敗しました。",
        trends: "再読み込みしてください。",
        ranking: "",
        absences: "" 
      }); // フォールバック
    }

  } catch (error: any) {
    console.error('[API] Analysis Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}