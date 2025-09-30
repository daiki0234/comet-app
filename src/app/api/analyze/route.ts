import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebase/firebase'; // DBへのパス
import { collection, getDocs, query, where } from 'firebase/firestore';

// Gemini APIを呼び出す関数 (GASの getAiAnalysisPackage に相当)
async function callGeminiApi(analysisData: any) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }

   const modelName = 'gemini-2.5-flash';

   const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
  
  // GASと同じプロンプトを使用
  const prompt = `
    あなたが放課後等デイサービスの運営をサポートする超優秀なAIアシスタントです。
    以下の集計データを深く分析し、包括的な分析レポートを生成してください。
    # 分析用データ
    ${JSON.stringify(analysisData)}
    # 指示
    分析結果を、必ず以下のキーを持つ単一のJSONオブジェクトとして出力してください。
    1.  "overallInsights": 総合的な洞察と改善提案を4つ。ポジティブな点、要改善点、注目すべきデータ傾向、長期的な視点をそれぞれ含めてください。各提案は { "title": "...", "description": "..." } の形式。
    2.  "categorizedAbsenceReasons": 欠席理由リストを「体調不良」「学校行事」「家庭の事情」「自己都合」「その他」に分類し、{ "カテゴリ名": 件数 } の形式で集計。
    3.  "trendSuggestions": 曜日別と月別の最も顕著な傾向に基づき、それぞれ50字程度の具体的な提案を生成し、{ "weeklySuggestion": "...", "monthlySuggestion": "..." } の形式で出力。
    4.  "absenceReasonSuggestion": 分類した欠席理由の中で最も多いものについて、50字程度の具体的な改善提案を生成。特に「体調不良」が最多の場合、昨今の感染症対策（換気、消毒など）も踏まえた提案にしてください。
    5.  "absencePatternSummary": 欠席者と理由のリストから、特に注目すべき傾向が見られる利用者を最大3名ピックアップし、それぞれの「名前」「見られる傾向」「推奨される対応策」をオブジェクトの配列として出力。
    # 出力形式 (厳守)
    - 上記の5つのキーを持つ、単一のJSONオブジェクト。
    - "absencePatternSummary" は以下の形式の配列とすること:
      [
        { "name": "利用者A", "pattern": "体調不良による欠席が月に3回発生しています。", "suggestion": "保護者と連携し、生活リズムについてヒアリングする。施設内の衛生管理を再徹底する。" },
        { "name": "利用者B", "pattern": "特定の曜日（金曜日）の欠席が続いています。", "suggestion": "金曜日の活動内容について本人の意向を確認し、参加したくなるような工夫を検討する。" }
      ]
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
  const match = generatedText.match(/{[\s\S]*}/);
  if (!match) {
    throw new Error("No valid JSON object found in the AI response.");
  }
  return JSON.parse(match[0]);
}


// APIのメイン処理 (GASの getAnalyzedData に相当)
export async function POST(request: Request) {
  try {
    const { startDate: startDateString, endDate: endDateString } = await request.json();

    // 1. Firestoreから出欠データを取得
    // ※ 'attendances' は出欠記録が保存されているコレクション名と仮定
    const attendancesRef = collection(db, 'attendances');
    const q = query(attendancesRef, 
        where('date', '>=', startDateString), 
        where('date', '<=', endDateString)
    );
    const querySnapshot = await getDocs(q);

    // GASでのデータ形式に変換
    const allData = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        "日付": data.date, // Firestoreのフィールド名に合わせる
        "利用者名": data.userName, // Firestoreのフィールド名に合わせる
        "利用状況": data.status, // Firestoreのフィールド名に合わせる
        "特記事項": data.notes || '' // Firestoreのフィールド名に合わせる
      };
    });
    
    // ▼▼▼ 以下はGASの getAnalyzedData のロジックをほぼそのまま移植 ▼▼▼

    // --- STEP 1: データ集計と統計分析 ---
    const attendedCount = allData.filter(d => d["利用状況"] === "◎" || d["利用状況"] === "◯").length;
    const absentCount = allData.filter(d => String(d["利用状況"]).startsWith("欠席")).length;
    const trialCount = allData.filter(d => d["利用状況"] === "体験").length;
    const attendanceRate = (attendedCount + absentCount) > 0 ? ((attendedCount / (attendedCount + absentCount)) * 100).toFixed(1) : "0.0";
    
    const summaryData = {
        totalActivities: attendedCount + absentCount + trialCount,
        overallAttendanceRate: attendanceRate,
        chartData: [attendedCount, absentCount, trialCount]
    };

    // (個人分析、傾向分析などのロジックは変更なし)
    const userStats: { [key: string]: { name: string, attended: number, absent: number, trial: number, total: number } } = {};
    allData.forEach(r => {
      const name = r["利用者名"];
      if (!name) return;
      if (!userStats[name]) { userStats[name] = { name: name, attended: 0, absent: 0, trial: 0, total: 0 }; }
      const status = String(r["利用状況"]);
      if (status === "◎" || status === "◯") { userStats[name].attended++; }
      else if (status.startsWith("欠席")) { userStats[name].absent++; }
      else if (status === "体験") { userStats[name].trial++; }
    });
    for (const name in userStats) { userStats[name].total = userStats[name].attended + userStats[name].absent; }
    const userArray = Object.values(userStats);
    const highAbsenceUsers = userArray.filter(u => u.total > 5).map(u => ({ name: u.name, absenceRate: u.total > 0 ? (u.absent / u.total) * 100 : 0 })).filter(u => u.absenceRate > 20).sort((a, b) => b.absenceRate - a.absenceRate).slice(0, 9);
    const mvpCandidate = [...userArray].filter(u => u.total > 0).sort((a, b) => b.total - a.total || a.absent - b.absent);
    const mvp = mvpCandidate.length > 0 ? mvpCandidate[0] : null;
    const zeroAbsenceMembers = userArray.filter(u => u.total > 10 && u.absent === 0).map(u => u.name).slice(0, 10);
    const noteworthyUser = userArray.find(u => u.trial > 0 && u.total === 0);
    const weeklyStats: { [key: string]: { total: number, absent: number } } = ['日', '月', '火', '水', '木', '金', '土'].reduce((acc, day) => ({ ...acc, [day]: { total: 0, absent: 0 } }), {});
    const monthlyStats: { [key: string]: { total: number, absent: number } } = {};
    allData.forEach(r => {
      const date = new Date(r["日付"]);
      if (r["利用者名"] && !isNaN(date.getTime())) {
        const status = String(r["利用状況"]);
        if (status === "◎" || status === "◯" || status.startsWith("欠席")) {
          const dayName = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
          weeklyStats[dayName].total++;
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { total: 0, absent: 0 };
          monthlyStats[monthKey].total++;
          if (status.startsWith("欠席")) { weeklyStats[dayName].absent++; monthlyStats[monthKey].absent++; }
        }
      }
    });
    const chartWeekdays = ['月', '火', '水', '木', '金', '土'];
    const weeklyAbsenceRate = chartWeekdays.map(day => { const stats = weeklyStats[day]; return stats.total > 0 ? parseFloat(((stats.absent / stats.total) * 100).toFixed(1)) : 0; });
    const sortedMonthKeys = Object.keys(monthlyStats).sort();
    const monthlyLabels = sortedMonthKeys.map(key => `${Number(key.split('-')[1])}月`);
    const monthlyTotalData = sortedMonthKeys.map(key => monthlyStats[key].total);
    const monthlyAbsenceRateData = sortedMonthKeys.map(key => { const stats = monthlyStats[key]; return stats.total > 0 ? parseFloat(((stats.absent / stats.total) * 100).toFixed(1)) : 0; });
    const absenceReasons = allData.filter(r => String(r["利用状況"]).startsWith("欠席") && r["特記事項"]).map(r => r["特記事項"]);
    const absenceDetails = allData.filter(r => String(r["利用状況"]).startsWith("欠席") && r["特記事項"] && r["利用者名"]).map(r => ({ name: r["利用者名"], date: new Date(r["日付"]).toLocaleDateString('ja-JP'), reason: r["特記事項"] })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // --- STEP 2: AIへのデータ送信と分析実行 ---
    const dataForAi = {
      summary: summaryData,
      absenceReasonsList: absenceReasons,
      absenceDetailsList: absenceDetails.slice(0, 20),
      trends: { weeklyAbsenceRate, monthlyLabels, monthlyTotalData, monthlyAbsenceRateData }
    };
    const aiPackage = await callGeminiApi(dataForAi);

    // --- STEP 3: フロントエンドに返す最終結果を構築 ---
    const result = {
      summary: summaryData,
      individual: {
        highAbsence: highAbsenceUsers.map(u => ({ name: u.name, rate: parseFloat(u.absenceRate.toFixed(1)) })),
        mvp: mvp ? { name: mvp.name, attended: mvp.attended, absent: mvp.absent, rate: parseFloat((mvp.total > 0 ? (mvp.absent / mvp.total * 100) : 0).toFixed(1)) } : null,
        zeroAbsence: zeroAbsenceMembers,
        noteworthy: noteworthyUser ? { name: noteworthyUser.name } : null
      },
      trends: dataForAi.trends,
      absenceAnalysis: {
        reasonBreakdown: {
          labels: Object.keys(aiPackage.categorizedAbsenceReasons),
          data: Object.values(aiPackage.categorizedAbsenceReasons)
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

    // ▲▲▲ ここまでがGASのロジック移植 ▲▲▲
    
    return NextResponse.json(result);

  } catch (e) {
    console.error("Analysis API error:", e);
    const error = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `データの分析中にエラーが発生しました: ${error}` }, { status: 500 });
  }
}