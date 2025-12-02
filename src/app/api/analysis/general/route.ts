import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 以前設定したAPIキーを使用
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export async function POST(request: Request) {
  try {
    const { context, type } = await request.json();

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    let prompt = '';

    if (type === 'summary') {
      prompt = `
      あなたは放課後等デイサービスの経営コンサルタント兼ベテラン管理者です。
      以下の事業所データをもとに、現状の分析と、今後の運営改善に向けた具体的なアドバイスを300文字以内で記述してください。
      
      【データ】
      ${context}
      
      【出力のポイント】
      ・稼働率の傾向（良い点・懸念点）
      ・欠席の傾向とその対策
      ・スタッフへの励まし
      `;
    } else if (type === 'user') {
      prompt = `
      あなたは放課後等デイサービスの児童発達支援管理責任者です。
      以下の特定利用者の利用データをもとに、保護者面談や個別支援計画の作成に役立つ分析コメントを300文字以内で記述してください。
      
      【データ】
      ${context}
      
      【出力のポイント】
      ・利用頻度の変化
      ・欠席理由の傾向（体調面、心理面など）
      ・支援における注意点
      `;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ comment: text });
  } catch (error: any) {
    console.error('AI Analysis Error:', error);
    return NextResponse.json({ comment: 'AI分析の生成に失敗しました。時間をおいて再度お試しください。' }, { status: 500 });
  }
}