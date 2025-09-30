import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      throw new Error("GEMINI_API_KEY is not set.");
    }

    // Google AIのモデル一覧を取得する公式URL
    const LIST_MODELS_URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

    const response = await fetch(LIST_MODELS_URL);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error.message);
    }

    // 'generateContent' をサポートしているモデルだけをフィルタリングして表示
    const supportedModels = data.models.filter((model: any) =>
      model.supportedGenerationMethods.includes("generateContent")
    );

    return NextResponse.json({ supportedModels });

  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to list models: ${error}` }, { status: 500 });
  }
}