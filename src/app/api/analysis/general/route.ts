import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// キャッシュ無効化
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // APIキーの取得
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    // キーの状態をログ出力 (セキュリティのため先頭4文字だけ表示)
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

    // Geminiの初期化
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ★★★ 修正: 高速なモデルに変更 (gemini-pro -> gemini-1.5-flash) ★★★
    // これによりタイムアウトを防ぎます
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    let prompt = '';

    if (type === 'summary') {
      prompt = `
      あなたは放課後等デイサービスの経営コンサルタントです。
      以下の事業所データをもとに、簡潔に分析コメントを記述してください（300文字以内）。
      
      【データ】
      ${context}
      
      【出力観点】
      ・稼働率の評価
      ・欠席傾向への対策
      ・スタッフへの労い
      `;
    } else if (type === 'user') {
      prompt = `
      あなたは放課後等デイサービスの児童発達支援管理責任者です。
      以下の利用者データをもとに、支援のヒントを簡潔に記述してください（300文字以内）。
      
      【データ】
      ${context}
      
      【出力観点】
      ・利用の変化
      ・欠席理由（体調/心理）
      ・今後の支援方針
      `;
    }

    console.log(`[API] Requesting Gemini (gemini-1.5-flash)...`);
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log(`[API] Success. Generated ${text.length} chars.`);

    return NextResponse.json({ comment: text });

  } catch (error: any) {
    console.error('[API] Analysis Error Detail:', error);
    return NextResponse.json({ 
      comment: 'AI分析中にエラーが発生しました。時間を置いて再度お試しください。',
      debug: error.message 
    }, { status: 500 });
  }
}