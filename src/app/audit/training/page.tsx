"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

// --- 型定義 ---
type MonthlyPlan = {
  id: string;
  year: number;
  month: number;
  topic: string;
  target: string;
  scheduledDate?: string;
};

type TrainingRecord = {
  id: string;
  date: string;
  topic: string;
  content: string;
  participantNames: string[];
  participantCount: number;
  fileName?: string;
  fileUrl?: string;
};

const FISCAL_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

// 日付文字列から年度と月を計算するヘルパー
const getFiscalInfo = (dateStr: string) => {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  // 1~3月は前年度扱い
  const fiscalYear = m < 4 ? y - 1 : y;
  return { fiscalYear, month: m };
};

export default function TrainingManagementPage() {
  const router = useRouter();
  
  const today = new Date();
  const currentFiscalYear = today.getMonth() + 1 < 4 ? today.getFullYear() - 1 : today.getFullYear();

  const [selectedYear, setSelectedYear] = useState(currentFiscalYear);
  const [plans, setPlans] = useState<Record<number, MonthlyPlan>>({});
  const [records, setRecords] = useState<Record<number, TrainingRecord[]>>({});
  const [loading, setLoading] = useState(true);

  // モーダル
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editDate, setEditDate] = useState(''); 

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<TrainingRecord | null>(null);

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // --- 1. 予定データの取得と振り分け ---
      // ★修正: 全件取得してから、日付に基づいて厳密に年度判定を行う
      // (件数が膨大な場合は範囲検索にしますが、研修計画程度なら全件で問題なし)
      const plansRef = collection(db, 'trainingPlans');
      const plansSnap = await getDocs(plansRef);
      
      const plansObj: Record<number, MonthlyPlan> = {};
      
      plansSnap.forEach(doc => {
        const data = doc.data();
        let planYear = data.year;
        let planMonth = data.month;

        // ★重要: 日付(scheduledDate)がある場合は、その日付の実質年度を優先する
        if (data.scheduledDate) {
          const { fiscalYear, month } = getFiscalInfo(data.scheduledDate);
          planYear = fiscalYear;
          // 日付があるなら、その日付の月に表示させるのが自然（本来のmonthとズレていても補正）
          planMonth = month; 
        }

        // 選択中の年度と一致するものだけを表示用ステートに入れる
        if (planYear === selectedYear) {
          plansObj[planMonth] = { id: doc.id, ...data } as MonthlyPlan;
        }
      });
      setPlans(plansObj);


      // --- 2. 実績(記録)データの取得と振り分け ---
      // こちらも同様に日付から厳密に判定
      const recordsRef = collection(db, 'trainingRecords');
      const recordsSnap = await getDocs(recordsRef);

      const recordsObj: Record<number, TrainingRecord[]> = {};
      
      recordsSnap.forEach(doc => {
        const data = doc.data();
        if (!data.date) return;

        const { fiscalYear, month } = getFiscalInfo(data.date);

        if (fiscalYear === selectedYear) {
          if (!recordsObj[month]) recordsObj[month] = [];
          
          recordsObj[month].push({ 
            id: doc.id, 
            date: data.date, 
            topic: data.topic || 'テーマなし',
            content: data.content || '',
            participantNames: data.participantNames || [],
            participantCount: data.participantCount || 0,
            fileName: data.fileName,
            fileUrl: data.fileUrl,
          });
        }
      });
      setRecords(recordsObj);

    } catch (e) {
      console.error(e);
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // --- 予定の操作 ---
  const openPlanModal = (month: number) => {
    setEditingMonth(month);
    // その月のプランを取得（日付補正された場所にあるかもしれないのでplansから探す）
    const plan = plans[month];
    
    setEditTopic(plan?.topic || '');
    setEditDate(plan?.scheduledDate || ''); 
    setIsPlanModalOpen(true);
  };

  const handleSavePlan = async () => {
    if (editingMonth === null) return;
    try {
      // 基本の保存先ID
      let docId = `${selectedYear}-${editingMonth}`;
      let saveYear = selectedYear;
      let saveMonth = editingMonth;

      // ★日付が入力されている場合、その日付に基づいた正しいIDと年度情報を生成する
      if (editDate) {
        const { fiscalYear, month } = getFiscalInfo(editDate);
        saveYear = fiscalYear;
        saveMonth = month;
        // IDも整合性を取るために再生成 (例: 2026-4)
        docId = `${saveYear}-${saveMonth}`;
      }

      const docRef = doc(db, 'trainingPlans', docId);
      const newData = {
        year: saveYear,
        month: saveMonth,
        topic: editTopic,
        scheduledDate: editDate,
        updatedAt: new Date(),
      };

      await setDoc(docRef, newData, { merge: true });
      
      toast.success(`${saveMonth}月の予定を保存しました`);
      setIsPlanModalOpen(false);
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    }
  };

  // --- 記録の操作 ---
  const handleCreateRecord = (month: number) => {
    const plan = plans[month];
    const params = new URLSearchParams();
    
    let targetDate = '';
    if (plan?.scheduledDate) {
      targetDate = plan.scheduledDate;
    } else {
      // デフォルト: その月の1日
      // 年度またぎ(1~3月)を考慮
      const targetYear = month >= 4 ? selectedYear : selectedYear + 1;
      const mStr = String(month).padStart(2, '0');
      targetDate = `${targetYear}-${mStr}-01`;
    }
    
    params.set('date', targetDate);
    if (plan?.topic) params.set('topic', plan.topic);

    router.push(`/audit/training/new?${params.toString()}`);
  };

  const openDetailModal = (record: TrainingRecord) => {
    setSelectedRecord(record);
    setIsDetailModalOpen(true);
  };

  const handleDeleteRecord = async () => {
    if (!selectedRecord) return;
    if (!confirm("本当にこの研修記録を削除しますか？")) return;

    try {
      await deleteDoc(doc(db, 'trainingRecords', selectedRecord.id));
      toast.success("削除しました");
      setIsDetailModalOpen(false);
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error("削除に失敗しました");
    }
  };

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return null;
    }
  };

  return (
    <AppLayout pageTitle="研修管理">
      <div className="space-y-6 pb-24">
        
        {/* 年度切り替え */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedYear(y => y - 1)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">←</button>
            <h2 className="text-xl font-bold text-gray-800">{selectedYear}年度 研修計画表</h2>
            <button onClick={() => setSelectedYear(y => y + 1)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">→</button>
          </div>
          <div className="text-sm text-gray-500 hidden md:block">
            ※必須研修：虐待防止、身体拘束適正化、感染症対策、安全管理、BCP訓練など
          </div>
        </div>

        {/* テーブル */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 w-24">月</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">研修予定 (計画)</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 w-1/3">研修記録 (実績)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {FISCAL_MONTHS.map((month) => {
                const plan = plans[month];
                const monthRecords = records[month] || [];
                const isPlanned = !!plan?.topic;
                const isDone = monthRecords.length > 0;
                const scheduledDateDisplay = formatDateDisplay(plan?.scheduledDate);

                return (
                  <tr key={month} className="hover:bg-gray-50 transition-colors">
                    {/* 月 */}
                    <td className="px-6 py-4 text-sm font-bold text-gray-800 border-r border-gray-100">{month}月</td>

                    {/* 予定 */}
                    <td className="px-6 py-4 align-top relative group">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-h-[40px] text-sm text-gray-800">
                          {isPlanned ? (
                            <div className="flex flex-col gap-1">
                              {scheduledDateDisplay && (
                                <span className="inline-block bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded w-fit">
                                  {scheduledDateDisplay} 予定
                                </span>
                              )}
                              <span className="whitespace-pre-wrap">{plan.topic}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">予定なし</span>
                          )}
                        </div>
                        <button 
                          onClick={() => openPlanModal(month)}
                          className="text-blue-600 p-1 hover:bg-blue-50 rounded"
                          title="予定を編集"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                      </div>
                    </td>

                    {/* 記録 */}
                    <td className="px-6 py-4 align-top border-l border-gray-100 bg-gray-50/30">
                      {isDone ? (
                        <div className="space-y-3">
                          {monthRecords.map(rec => (
                            <button 
                              key={rec.id} 
                              onClick={() => openDetailModal(rec)}
                              className="w-full text-left flex items-center gap-2 bg-white border border-green-200 p-2 rounded shadow-sm hover:shadow-md hover:border-green-300 transition-all"
                            >
                              <span className="text-green-600 flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-500">{new Date(rec.date).toLocaleDateString()}</div>
                                <div className="text-sm font-bold text-gray-800 truncate">{rec.topic}</div>
                              </div>
                            </button>
                          ))}
                          <button onClick={() => handleCreateRecord(month)} className="text-xs text-blue-600 hover:underline mt-2 block px-1">
                            + 追加で記録を作成
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center pt-2">
                          {isPlanned ? (
                            <button
                              onClick={() => handleCreateRecord(month)}
                              className="flex items-center gap-2 text-sm text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                              この予定で記録を作成
                            </button>
                          ) : (
                            <button onClick={() => handleCreateRecord(month)} className="text-sm text-gray-400 hover:text-blue-600 flex items-center gap-1">
                              <span className="text-lg">+</span> 記録のみ作成
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 予定編集モーダル */}
      {isPlanModalOpen && editingMonth !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editingMonth}月の研修予定を編集</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">実施予定日</label>
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">研修テーマ・内容</label>
                <textarea value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="w-full border p-2 rounded-lg h-32 resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setIsPlanModalOpen(false)} className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold">キャンセル</button>
              <button onClick={handleSavePlan} className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-bold shadow-md">保存する</button>
            </div>
          </div>
        </div>
      )}

      {/* 記録詳細モーダル */}
      {isDetailModalOpen && selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* ヘッダー */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">研修記録詳細</p>
                <h3 className="text-xl font-bold text-gray-900">{selectedRecord.topic}</h3>
                <p className="text-sm text-gray-600 mt-1">実施日: {new Date(selectedRecord.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <button onClick={() => setIsDetailModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* コンテンツ */}
            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                  参加者 ({selectedRecord.participantCount}名)
                </h4>
                <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700 leading-relaxed">
                  {selectedRecord.participantNames && selectedRecord.participantNames.length > 0 
                    ? selectedRecord.participantNames.join('、') 
                    : '記録なし'}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  研修内容
                </h4>
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border p-3 rounded-lg min-h-[100px] bg-white">
                  {selectedRecord.content || '(詳細内容なし)'}
                </div>
              </div>

              {selectedRecord.fileName && (
                <div>
                   <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                    添付資料
                  </h4>
                  <a 
                    href={selectedRecord.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 px-3 py-2 rounded-lg text-sm transition-colors border border-blue-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                    {selectedRecord.fileName} を開く
                  </a>
                </div>
              )}
            </div>

            {/* フッターアクション */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-between items-center">
              <button 
                onClick={handleDeleteRecord}
                className="text-red-600 hover:text-red-700 font-bold text-sm flex items-center gap-1 hover:bg-red-50 px-3 py-2 rounded transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                この記録を削除
              </button>
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="bg-gray-800 text-white font-bold py-2 px-6 rounded-lg hover:bg-gray-900 shadow-sm transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}