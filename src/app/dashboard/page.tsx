"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/Layout';
import Chart from 'chart.js/auto';

// 各種チャートのインスタンスを保持するための型定義
type ChartInstances = {
  overall?: Chart;
  highAbsence?: Chart;
  weeklyAbsence?: Chart;
  monthlyTrend?: Chart;
  absenceReason?: Chart;
};

export default function DashboardPage() {
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false); // 初期表示時はローディングしない
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzed, setIsAnalyzed] = useState(false); // 分析が実行されたかを管理

  // 日付フィルター用のstate
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Chart.jsのインスタンスを管理するためのref
  const chartRefs = useRef<ChartInstances>({});
  
  // 日付の初期値を設定
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
    // 初期ロードではデータ取得は行わない
  }, []);

  // データ取得関数
  const fetchData = async (start: string, end: string) => {
    setIsLoading(true);
    setError(null);
    setIsAnalyzed(true); // 分析ボタンが押されたことを記録
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to fetch analysis data');
      }
      const data = await response.json();
      setAnalysisData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  // フィルターボタンの処理
  const handleFilterClick = () => {
    fetchData(startDate, endDate);
  };

  // リセットボタンの処理
  const handleResetClick = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const newEndDate = today.toISOString().split('T')[0];
    const newStartDate = thirtyDaysAgo.toISOString().split('T')[0];
    setEndDate(newEndDate);
    setStartDate(newStartDate);
    // リセット時は分析結果をクリアする（任意）
    setAnalysisData(null);
    setIsAnalyzed(false);
    setError(null);
  };

  // グラフ描画ロジック
  useEffect(() => {
    if (!analysisData) return;

    const chartOptions = {
        plugins: { tooltip: { backgroundColor: 'rgba(0,0,0,0.7)', titleFont: { size: 14 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 4 }, legend: { labels: { font: { family: "'Inter', 'Noto Sans JP', sans-serif", size: 12 }, color: '#333' } } }, maintainAspectRatio: false, responsive: true
    };

    const drawChart = (canvasId: string, chartConfig: any, chartKey: keyof ChartInstances) => {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) return;
        if (chartRefs.current[chartKey]) {
            chartRefs.current[chartKey]?.destroy();
        }
        chartRefs.current[chartKey] = new Chart(canvas, chartConfig);
    };

    // 各チャートの描画
    drawChart('overallAttendanceChart', { type: 'doughnut', data: { labels: ['出席', '欠席', '体験'], datasets: [{ data: analysisData.summary.chartData, backgroundColor: ['#576CBC', '#F94C66', '#A5D7E8'], borderColor: '#f0f4f8', borderWidth: 5 }] }, options: { ...chartOptions, cutout: '70%', plugins: { ...chartOptions.plugins, legend: { ...chartOptions.plugins.legend, position: 'bottom' } } } }, 'overall');
    drawChart('highAbsenceChart', { type: 'bar', data: { labels: analysisData.individual.highAbsence.map((i:any) => i.name), datasets: [{ label: '欠席率 (%)', data: analysisData.individual.highAbsence.map((i:any) => i.rate), backgroundColor: '#F94C66', borderRadius: 5 }] }, options: { ...chartOptions, indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { display: false }, ticks: { callback: (v:any) => v + '%' } }, y: { grid: { display: false } } }, plugins: { ...chartOptions.plugins, legend: { display: false } } } }, 'highAbsence');
    drawChart('weeklyAbsenceRateChart', { type: 'bar', data: { labels: ['月', '火', '水', '木', '金', '土'], datasets: [{ label: '欠席率 (%)', data: analysisData.trends.weeklyAbsenceRate, backgroundColor: ['#FFC107', '#A5D7E8', '#576CBC', '#A5D7E8', '#F94C66', '#A5D7E8'], borderRadius: 5 }] }, options: { ...chartOptions, scales: { y: { beginAtZero: true, grid: { color: '#e9e9e9' }, ticks: { callback: (v:any) => v + '%' } }, x: { grid: { display: false } } }, plugins: { ...chartOptions.plugins, legend: { display: false } } } }, 'weeklyAbsence');
    drawChart('monthlyTrendChart', { type: 'bar', data: { labels: analysisData.trends.monthlyLabels, datasets: [ { type: 'bar', label: '合計活動回数', data: analysisData.trends.monthlyTotalData, backgroundColor: '#A5D7E8', yAxisID: 'y', borderRadius: 5 }, { type: 'line', label: '欠席率 (%)', data: analysisData.trends.monthlyAbsenceRateData, borderColor: '#F94C66', tension: 0.2, yAxisID: 'y1' } ] }, options: { ...chartOptions, scales: { x: {}, y: { type: 'linear', display: true, position: 'left', title: { display: true, text: '合計活動回数' } }, y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: '欠席率 (%)' }, grid: { drawOnChartArea: false } } }, plugins: { ...chartOptions.plugins, legend: { ...chartOptions.plugins.legend, position: 'bottom' } } } }, 'monthlyTrend');
    drawChart('absenceReasonChart', { type: 'doughnut', data: { labels: analysisData.absenceAnalysis.reasonBreakdown.labels, datasets: [{ label: '欠席回数', data: analysisData.absenceAnalysis.reasonBreakdown.data, backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'] }] }, options: { ...chartOptions, cutout: '50%', plugins: { ...chartOptions.plugins, legend: { ...chartOptions.plugins.legend, position: 'right' } } } }, 'absenceReason');
    
  }, [analysisData]);

  return (
    <AppLayout pageTitle="ダッシュボード">
      {/* --- ▼▼▼ 元々あった「ようこそ」セクション (ここは変更なし) ▼▼▼ --- */}
      <div className="bg-white p-6 sm:p-8 rounded-ios shadow-ios border border-ios-gray-200 mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">ようこそ Comet へ！</h2>
        <p className="text-gray-600 leading-relaxed max-w-2xl">
          日々の業務を効率化し、利用者様と向き合う大切な時間を増やすために。
          Cometは、あなたの業務をシンプルで直感的なものに変えるお手伝いをします。
        </p>
        <div className="mt-8">
          <Link href="/attendance">
            <button className="bg-ios-blue hover:bg-blue-600 text-white font-bold py-3 px-5 rounded-ios shadow-sm hover:shadow-md transition-all transform hover:scale-105">
              今日の出欠記録を始める
            </button>
          </Link>
        </div>
      </div>
      {/* --- ▲▲▲ 「ようこそ」セクションここまで ▲▲▲ --- */}
      
      {/* --- ▼▼▼ ここからAI分析ダッシュボード ▼▼▼ --- */}
      <div className="container mx-auto" style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}>
        {isLoading && (
          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex flex-col items-center justify-center z-50">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
            <p className="text-white text-lg font-semibold">AIがデータを分析中...</p>
          </div>
        )}

        {/* フィルターセクション */}
        <section className="mb-6 bg-white rounded-ios shadow-ios border border-ios-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="md:col-span-1">
                    <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">開始日</label>
                    <input type="date" id="start-date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                </div>
                <div className="md:col-span-1">
                    <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">終了日</label>
                    <input type="date" id="end-date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-2">
                    <button onClick={handleFilterClick} disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300">この期間で分析</button>
                    <button onClick={handleResetClick} disabled={isLoading} className="w-full bg-gray-500 text-white font-bold py-2.5 px-4 rounded-md hover:bg-gray-600 disabled:bg-gray-300">リセット</button>
                </div>
            </div>
        </section>

        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg" role="alert"><p className="font-bold">エラー</p><p>{error}</p></div>}
        
        {/* 分析結果が表示されるエリア */}
        {isAnalyzed && !isLoading && analysisData && (
            <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* (省略... AIダッシュボードのメインコンテンツ部分は変更なし) */}
                {/* 左側のカラム */}
                <div className="lg:col-span-2 space-y-6">
                    {/* 個人別パフォーマンス */}
                    <section className="bg-white rounded-ios shadow-ios border border-ios-gray-200 p-6">
                      <h2 className="text-2xl font-bold text-[#19376D] mb-4">2. 個人別パフォーマンス分析</h2>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                          <div>
                              <h3 className="text-lg font-bold text-[#C23373] mb-2">📉 欠席が多い個人</h3>
                              <div className="relative w-full h-96"><canvas id="highAbsenceChart"></canvas></div>
                          </div>
                          <div>
                              <h3 className="text-lg font-bold text-[#0E8388] mb-4">✅ 高出席率メンバー</h3>
                              <div className="space-y-4">
                                {analysisData.individual.mvp && (
                                  <div className="bg-amber-100 border-l-4 border-amber-400 p-3 rounded-r-lg">
                                    <p className="font-bold text-amber-800">👑 MVP</p>
                                    <p className="text-xl font-bold text-gray-800">{analysisData.individual.mvp.name}さん</p>
                                    <p className="text-sm text-gray-600">{`出席${analysisData.individual.mvp.attended}回 / 欠席${analysisData.individual.mvp.absent}回 (欠席率 約${analysisData.individual.mvp.rate}%)`}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="font-semibold text-gray-800 mb-2">🏆 欠席ゼロのメンバー</p>
                                  <div className="flex flex-wrap gap-2 text-sm">
                                    {analysisData.individual.zeroAbsence?.length > 0 ? analysisData.individual.zeroAbsence.map((name:string) => (
                                      <span key={name} className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full font-medium">{name}</span>
                                    )) : <span className="text-gray-500">該当者なし</span>}
                                  </div>
                                </div>
                                {analysisData.individual.noteworthy && (
                                  <div className="bg-sky-100 border-l-4 border-sky-400 p-3 rounded-r-lg">
                                    <p className="font-bold text-sky-800">🌟 特筆すべき点</p>
                                    <p className="text-lg font-bold text-gray-800">{analysisData.individual.noteworthy.name}さん</p>
                                    <p className="text-sm text-gray-600">体験のみで、その後の出席はありません。</p>
                                  </div>
                                )}
                              </div>
                          </div>
                      </div>
                    </section>

                    {/* 欠席者と理由の詳細 */}
                    <section className="bg-white rounded-ios shadow-ios border border-ios-gray-200 p-6">
                      <h2 className="text-2xl font-bold text-[#19376D] mb-4">2.5. 欠席者と理由の詳細</h2>
                      <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-r-lg mb-4">
                        <p className="font-bold text-blue-800">🤖 AIによる傾向サマリー</p>
                        <div className="text-sm text-blue-700 whitespace-pre-line">
                          {Array.isArray(analysisData.absenceCrossReference.summary) && analysisData.absenceCrossReference.summary.map((item:any, index:number) => (
                            <div key={index} className="mt-2">
                               <strong className="text-gray-900">{item.name}さん:</strong>
                               <p className="pl-2 text-gray-700">{item.pattern}</p>
                               <p className="pl-2 text-blue-600 font-semibold"><strong>提案:</strong> {item.suggestion}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                        {analysisData.absenceCrossReference.details?.length > 0 ? analysisData.absenceCrossReference.details.map((item:any, index:number) => (
                          <div key={index} className="p-3 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                              <p className="font-bold text-gray-800">{item.name}</p>
                              <p className="text-xs text-gray-500">{item.date}</p>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">理由： {item.reason}</p>
                          </div>
                        )) : <p className="text-center text-gray-500 p-4">該当する欠席記録はありません。</p>}
                      </div>
                    </section>

                    {/* 曜日・月別の傾向分析 */}
                    <section className="bg-white rounded-ios shadow-ios border border-ios-gray-200 p-6">
                      <h2 className="text-2xl font-bold text-[#19376D] mb-4">3. 曜日・月別の傾向分析</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div>
                              <h3 className="text-lg font-bold mb-2">🗓️ 曜日別 欠席率</h3>
                              <div className="relative w-full h-80"><canvas id="weeklyAbsenceRateChart"></canvas></div>
                              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                                <p className="font-semibold text-gray-700">💡 AI提案</p>
                                <p className="text-xs text-gray-600">{analysisData.trendSuggestions.weeklySuggestion}</p>
                              </div>
                          </div>
                          <div>
                              <h3 className="text-lg font-bold mb-2">📈 月別 活動量と欠席率</h3>
                              <div className="relative w-full h-80"><canvas id="monthlyTrendChart"></canvas></div>
                              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                                <p className="font-semibold text-gray-700">💡 AI提案</p>
                                <p className="text-xs text-gray-600">{analysisData.trendSuggestions.monthlySuggestion}</p>
                              </div>
                          </div>
                      </div>
                    </section>
                </div>

                {/* 右側のカラム */}
                <div className="lg:col-span-1 space-y-6">
                    {/* 全体サマリー */}
                    <section className="bg-white rounded-ios shadow-ios border border-ios-gray-200 p-6">
                        <h2 className="text-2xl font-bold text-[#19376D] mb-4">1. 全体サマリー</h2>
                        <div className="relative w-full h-64 mb-4"><canvas id="overallAttendanceChart"></canvas></div>
                        <div className="text-center">
                          <p className="text-lg text-gray-500">総活動回数</p>
                          <p className="text-4xl font-bold text-[#19376D] mb-4">{analysisData.summary.totalActivities}回</p>
                          <p className="text-lg text-gray-500">全体の出席率</p>
                          <p className="text-5xl font-extrabold text-[#576CBC]">{analysisData.summary.overallAttendanceRate}%</p>
                        </div>
                    </section>
                    
                    {/* 欠席理由の分析 */}
                    <section className="bg-white rounded-ios shadow-ios border border-ios-gray-200 p-6">
                      <h2 className="text-2xl font-bold text-[#FF6384] mb-4">4. 欠席理由の分析</h2>
                      <div className="relative w-full h-64 mb-4"><canvas id="absenceReasonChart"></canvas></div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="font-semibold text-gray-700">💡 AI提案</p>
                        <p className="text-xs text-gray-600">{analysisData.absenceAnalysis.suggestion}</p>
                      </div>
                    </section>

                    {/* 総合的な洞察 */}
                    <section className="bg-gradient-to-br from-[#19376D] to-[#0B2447] text-white rounded-ios shadow-ios border border-ios-gray-200 p-6">
                        <h2 className="text-2xl font-bold text-center mb-4 text-[#FBE4D8]">5. 総合的な洞察と改善提案</h2>
                        <div className="space-y-3 text-sm">
                          {analysisData.aiInsights?.map((insight: any, index: number) => (
                            <div key={index} className="bg-white/10 p-4 rounded-lg">
                              <h4 className="font-bold mb-1 text-white">{insight.title}</h4>
                              <p className="opacity-90 whitespace-pre-line">{insight.description}</p>
                            </div>
                          ))}
                        </div>
                    </section>
                </div>
            </main>
        )}

      </div>
    </AppLayout>
  );
}