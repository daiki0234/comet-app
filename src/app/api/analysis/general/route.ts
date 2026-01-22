import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ overall: 'APIキーがありません。' }, { status: 500 });
    }

    console.log("[API] Debug: Listing available models...");

    // ★「モデル一覧」を取得するAPIを叩く
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error("[API] List Models Error:", err);
      return NextResponse.json({ 
        overall: "モデル一覧の取得に失敗しました。", 
        trends: JSON.stringify(err, null, 2) 
      });
    }

    const data = await response.json();
    
    // 使えるモデルの名前だけを抽出してリスト化
    const availableModels = data.models
      ?.filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => m.name.replace('models/', '')) // "models/gemini-pro" -> "gemini-pro"
      .join('\n');

    console.log("[API] Available Models:", availableModels);

    // 画面の「総評」欄にリストを表示させる
    return NextResponse.json({
      overall: "【診断成功】現在このAPIキーで利用可能なモデル一覧です。",
      trends: availableModels || "利用可能なモデルが見つかりませんでした。",
      dayOfWeek: "このリストにある名前をコードに設定すれば動きます。",
      ranking: "",
      absences: "",
      advice: ""
    });

  } catch (error: any) {
    return NextResponse.json({ 
      overall: '診断エラーが発生しました',
      trends: error.message
    }, { status: 500 });
  }
}