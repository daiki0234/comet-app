import { NextResponse } from 'next/server';
// ★ 1. Admin SDKのDBをインポート
import { adminDb } from '@/lib/firebase/admin'; 

// Gemini API関数 (変更なし)
async function callGeminiApi(analysisData: any) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }
  const modelName = 'gemini-2.0-flash'; // (最新モデルにしておきます)
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
  
  const prompt = `
    あなたは放課後等デイサービスの運営をサポートする超優秀なAIアシスタントです。
    以下の集計データを深く分析し、包括的な分析レポートを生成してください。
    # 分析用データ
    ${JSON.stringify(analysisData)}
    # 指示
    分析結果を、必ず以下のキーを持つ単一のJSONオブジェクトとして出力してください。
    1. "overallInsights": 総合的な洞察と改善提案を4つ。{ "title": "...", "description": "..." } の形式。
    2. "categorizedAbsenceReasons": 欠席理由リストを「体調不良」「学校行事」「家庭の事情」「自己都合」「その他」に分類し、{ "カテゴリ名": 件数 } の形式で集計。
    3. "trendSuggestions": { "weeklySuggestion": "...", "monthlySuggestion": "..." } の形式。
    4. "absenceReasonSuggestion": 最多欠席理由への改善提案 (50字程度)。
    5. "absencePatternSummary": 欠席傾向が見られる利用者(最大3名)。[ { "name": "...", "pattern": "...", "suggestion": "..." } ] の形式。
    # 出力形式 (厳守)
    JSONオブジェクトのみを出力してください。Markdownのコードブロックは不要です。
  `;

  const payload = { contents: [{ parts: [{ text: prompt }] }] };
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`API call failed: ${responseText}`);
  }
  
  const jsonResponse = JSON.parse(responseText);
  const generatedText = jsonResponse.candidates[0].content.parts[0].text;
  // JSON部分だけを抽出
  const match = generatedText.match(/{[\s\S]*}/);
  if (!match) {
    throw new Error("No valid JSON object found in the AI response.");
  }
  return JSON.parse(match[0]);
}

// APIのメイン処理
export async function POST(request: Request) {
  try {
    const { startDate, endDate } = await request.json();

    // ★ 2. Firestore Admin SDK でデータ取得
    // コレクション名: 'attendances' -> 'attendanceRecords' (正しい名前に修正)
    const attendancesRef = adminDb.collection('attendanceRecords');
    
    // Admin SDKのクエリ構文
    const snapshot = await attendancesRef
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    // GASでのデータ形式に変換
    const allData = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        "日付": data.date,
        "利用者名": data.userName,
        // フィールド名: status -> usageStatus (正しい名前に修正)
        "利用状況": data.usageStatus, 
        "特記事項": data.notes || ''
      };
    });

    // --- STEP 1: データ集計 (ロジック変更なし) ---
    const attendedCount = allData.filter(d => d["利用状況"] === "放課後" || d["利用状況"] === "休校日").length;
    const absentCount = allData.filter(d => String(d["利用状況"]) === "欠席").length;
    const trialCount = allData.filter(d => d["利用状況"] === "体験").length; // (体験の実装があれば)
    const attendanceRate = (attendedCount + absentCount) > 0 ? ((attendedCount / (attendedCount + absentCount)) * 100).toFixed(1) : "0.0";
    
    const summaryData = {
        totalActivities: attendedCount + absentCount + trialCount,
        overallAttendanceRate: attendanceRate,
        chartData: [attendedCount, absentCount, trialCount]
    };

    // 個人集計
    const userStats: any = {};
    allData.forEach(r => {
      const name = r["利用者名"];
      if (!name) return;
      if (!userStats[name]) { userStats[name] = { name: name, attended: 0, absent: 0, trial: 0, total: 0 }; }
      const status = String(r["利用状況"]);
      if (status === "放課後" || status === "休校日") { userStats[name].attended++; }
      else if (status === "欠席") { userStats[name].absent++; }
    });
    for (const name in userStats) { userStats[name].total = userStats[name].attended + userStats[name].absent; }
    
    const userArray: any[] = Object.values(userStats);
    const highAbsenceUsers = userArray
      .filter(u => u.total > 0)
      .map(u => ({ name: u.name, absenceRate: (u.absent / u.total) * 100 }))
      .filter(u => u.absenceRate > 20)
      .sort((a, b) => b.absenceRate - a.absenceRate)
      .slice(0, 5);

    // 傾向分析 (簡易版)
    const weeklyStats: any = { '日':0, '月':0, '火':0, '水':0, '木':0, '金':0, '土':0 };
    const monthlyStats: any = {};
    
    allData.forEach(r => {
      if (String(r["利用状況"]) === "欠席") {
        const date = new Date(r["日付"]);
        const dayName = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
        weeklyStats[dayName] = (weeklyStats[dayName] || 0) + 1;

        const monthKey = `${date.getMonth() + 1}月`;
        monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + 1;
      }
    });

    const weeklyAbsenceRate = ['月', '火', '水', '木', '金', '土'].map(d => weeklyStats[d]);
    const monthlyLabels = Object.keys(monthlyStats).sort((a,b) => parseInt(a)-parseInt(b));
    const monthlyAbsenceRateData = monthlyLabels.map(m => monthlyStats[m]);
    const monthlyTotalData = monthlyLabels.map(() => 0); // (今回は省略)

    const absenceReasons = allData.filter(r => r["利用状況"] === "欠席" && r["特記事項"]).map(r => r["特記事項"]);
    const absenceDetails = allData
      .filter(r => r["利用状況"] === "欠席")
      .map(r => ({ name: r["利用者名"], date: r["日付"], reason: r["特記事項"] }))
      .slice(0, 20);

    // --- STEP 2: AI分析 ---
    const dataForAi = {
      summary: summaryData,
      absenceReasonsList: absenceReasons,
      absenceDetailsList: absenceDetails,
      trends: { weeklyAbsenceRate, monthlyLabels }
    };
    
    const aiPackage = await callGeminiApi(dataForAi);

    // --- STEP 3: 結果返却 ---
    const result = {
      summary: summaryData,
      individual: {
        highAbsence: highAbsenceUsers.map(u => ({ name: u.name, rate: parseFloat(u.absenceRate.toFixed(1)) })),
        // (MVPなどは省略)
      },
      trends: {
        weeklyAbsenceRate,
        monthlyLabels,
        monthlyTotalData,
        monthlyAbsenceRateData
      },
      absenceAnalysis: {
        reasonBreakdown: {
          labels: Object.keys(aiPackage.categorizedAbsenceReasons || {}),
          data: Object.values(aiPackage.categorizedAbsenceReasons || {})
        },
        suggestion: aiPackage.absenceReasonSuggestion
      },
      trendSuggestions: aiPackage.trendSuggestions,
      absenceCrossReference: {
        details: absenceDetails,
        summary: aiPackage.absencePatternSummary
      },
      aiInsights: aiPackage.overallInsights
    };

    return NextResponse.json(result);

  } catch (e: any) {
    console.error("Analysis API error:", e);
    return NextResponse.json({ error: `データの分析中にエラーが発生しました: ${e.message}` }, { status: 500 });
  }
}