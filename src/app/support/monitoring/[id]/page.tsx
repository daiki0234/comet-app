"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, doc, getDoc, updateDoc, serverTimestamp, query, where, orderBy, limit } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { UserData } from '@/types/billing';
import { SupportPlan } from '@/types/plan';
import { MonitoringRecord } from '@/types/monitoring';
import { MonitoringPDFDownloadButton } from '@/components/pdf/MonitoringPDFDownloadButton';

export default function EditMonitoringPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [staffs, setStaffs] = useState<string[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);

  // UI用ステート (最小化トグル)
  const [isPlanExpanded, setIsPlanExpanded] = useState(true);
  const [isInitiativesExpanded, setIsInitiativesExpanded] = useState(true);

  // フォームデータ
  const [formData, setFormData] = useState({
    creationDate: '',
    periodStart: '',
    periodEnd: '',
    userId: '',
    userName: '',
    author: '',
    initiative1: '', evaluation1: '',
    initiative2: '', evaluation2: '',
    initiative3: '', evaluation3: '',
    shortMessage: '',
  });

  const [activePlan, setActivePlan] = useState<SupportPlan | null>(null);
  const [targetEvals, setTargetEvals] = useState<Record<string, string>>({});

  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        const [uSnap, aSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'admins'))
        ]);
        setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
        setStaffs(aSnap.docs.map(d => d.data().name).filter(Boolean));

        const recordRef = doc(db, 'monitoringRecords', params.id);
        const recordSnap = await getDoc(recordRef);

        if (!recordSnap.exists()) {
          toast.error("データが見つかりません");
          router.push('/support/monitoring');
          return;
        }

        const rData = recordSnap.data() as MonitoringRecord;

        setFormData({
          creationDate: rData.creationDate,
          periodStart: rData.periodStart,
          periodEnd: rData.periodEnd,
          userId: rData.userId,
          userName: rData.userName,
          author: rData.author,
          initiative1: rData.initiative1 || '', evaluation1: rData.evaluation1 || '',
          initiative2: rData.initiative2 || '', evaluation2: rData.evaluation2 || '',
          initiative3: rData.initiative3 || '', evaluation3: rData.evaluation3 || '',
          shortMessage: rData.shortMessage || '',
        });

        const evals: Record<string, string> = {};
        if (rData.targetEvaluations) {
          rData.targetEvaluations.forEach(item => {
            evals[item.targetId] = item.evaluation;
          });
        }
        setTargetEvals(evals);

        // 計画書の取得
        let planToLoad = null;
        if (rData.refPlanId) {
          const planRef = doc(db, 'supportPlans', rData.refPlanId);
          const planSnap = await getDoc(planRef);
          if (planSnap.exists()) {
            planToLoad = { id: planSnap.id, ...planSnap.data() } as SupportPlan;
          }
        }

        if (!planToLoad && rData.userId) {
          const q = query(
            collection(db, 'supportPlans'),
            where('userId', '==', rData.userId),
            where('status', '==', '本番'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            planToLoad = { id: snap.docs[0].id, ...snap.docs[0].data() } as SupportPlan;
          }
        }

        setActivePlan(planToLoad);

      } catch (e) {
        console.error(e);
        toast.error("読み込みエラー");
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, [params.id, router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.author) return toast.error("作成者を選択してください");

    try {
      setSubmitting(true);
      const targetEvaluations = Object.entries(targetEvals).map(([key, val]) => ({
        targetId: key,
        evaluation: val
      }));

      await updateDoc(doc(db, 'monitoringRecords', params.id), {
        ...formData,
        targetEvaluations,
        refPlanId: activePlan?.id || '',
        updatedAt: serverTimestamp(),
      });

      toast.success("更新しました");
      router.push('/support/monitoring');
    } catch (e) {
      console.error(e);
      toast.error("更新に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  // PDF出力用のデータ生成
  const currentUser = users.find(u => u.id === formData.userId) || null;
  const monitoringDataForPDF: MonitoringRecord = {
    ...formData,
    targetEvaluations: Object.entries(targetEvals).map(([key, val]) => ({
      targetId: key,
      evaluation: val
    })),
    refPlanId: activePlan?.id || ''
  };

  if (loading) return <AppLayout pageTitle="読み込み中..."><div className="p-8 text-center">データを取得しています...</div></AppLayout>;

  return (
    <AppLayout pageTitle="モニタリング 編集">
      <form onSubmit={handleUpdate} className="space-y-8 pb-20">
        
        {/* 基本情報 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-700 border-l-4 border-blue-500 pl-2 mb-4">基本情報</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">モニタリング作成日</label>
                <input type="date" required value={formData.creationDate} onChange={e => setFormData({...formData, creationDate: e.target.value})} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">モニタリング期間</label>
                <div className="flex items-center gap-2">
                  <input type="date" value={formData.periodStart} onChange={e => setFormData({...formData, periodStart: e.target.value})} className="w-full border p-2 rounded" />
                  <span>〜</span>
                  <input type="date" value={formData.periodEnd} onChange={e => setFormData({...formData, periodEnd: e.target.value})} className="w-full border p-2 rounded" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">利用者氏名</label>
                <input 
                  type="text" 
                  value={formData.userName} 
                  disabled
                  className="w-full border p-2 rounded bg-gray-100 text-gray-500 cursor-not-allowed" 
                />
                <p className="text-xs text-gray-400 mt-1">※利用者は変更できません</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">作成者</label>
                <select value={formData.author} onChange={e => setFormData({...formData, author: e.target.value})} className="w-full border p-2 rounded bg-white">
                  <option value="">選択してください</option>
                  {staffs.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 個別支援計画の評価 (先に表示) */}
        {activePlan ? (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="font-bold text-gray-700 border-l-4 border-purple-500 pl-2">個別支援計画の評価</h3>
              {/* 最小化ボタン */}
              <button 
                type="button" 
                onClick={() => setIsPlanExpanded(!isPlanExpanded)}
                className="text-gray-500 hover:text-gray-800 p-1 rounded hover:bg-gray-100 transition-colors"
                title={isPlanExpanded ? "最小化" : "展開"}
              >
                {isPlanExpanded ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                )}
              </button>
            </div>
            
            {/* 開閉コンテンツ */}
            {isPlanExpanded && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-purple-50 p-3 rounded border border-purple-100">
                    <label className="block text-xs font-bold text-purple-700 mb-1">長期目標</label>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{activePlan.longTermGoal}</p>
                  </div>
                  <div className="bg-purple-50 p-3 rounded border border-purple-100">
                    <label className="block text-xs font-bold text-purple-700 mb-1">短期目標</label>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{activePlan.shortTermGoal}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="font-bold text-sm text-gray-600 border-b pb-1">支援目標ごとの評価</h4>
                  {activePlan.supportTargets?.sort((a:any,b:any)=>Number(a.displayOrder)-Number(b.displayOrder)).map((target: any, index: number) => (
                    <div key={target.id || index} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between mb-2">
                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">No. {target.displayOrder}</span>
                        <div className="flex gap-2">
                          {target.supportCategories?.map((cat: string) => (
                            <span key={cat} className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded">{cat}</span>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div>
                          <p className="text-xs font-bold text-gray-500">支援目標</p>
                          <p className="text-sm font-bold text-gray-800">{target.goal}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-500">5領域</p>
                          <p className="text-xs text-gray-600">{target.fiveDomains?.join(' / ')}</p>
                        </div>
                      </div>
                      <div className="mb-3">
                        <p className="text-xs font-bold text-gray-500">支援内容</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{target.content}</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-blue-200">
                        <label className="block text-sm font-bold text-blue-600 mb-1">支援目標の評価</label>
                        <textarea 
                          className="w-full border p-2 rounded h-20 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                          placeholder="この目標に対する評価を入力..."
                          value={targetEvals[target.id] || ''}
                          onChange={(e) => setTargetEvals({ ...targetEvals, [target.id]: e.target.value })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-8 text-center bg-gray-50 rounded border text-gray-500">
            参照元の個別支援計画が見つかりません。
          </div>
        )}

        {/* 主な取り組み内容 (後に表示) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h3 className="font-bold text-gray-700 border-l-4 border-green-500 pl-2">主な取り組み内容</h3>
            {/* 最小化ボタン */}
            <button 
              type="button" 
              onClick={() => setIsInitiativesExpanded(!isInitiativesExpanded)}
              className="text-gray-500 hover:text-gray-800 p-1 rounded hover:bg-gray-100 transition-colors"
              title={isInitiativesExpanded ? "最小化" : "展開"}
            >
              {isInitiativesExpanded ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              )}
            </button>
          </div>
          
          {/* 開閉コンテンツ */}
          {isInitiativesExpanded && (
            <div className="space-y-6">
              {[1, 2, 3].map((num) => (
                <div key={num} className="bg-gray-50 p-4 rounded-lg border">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">取り組み内容 {num}</label>
                      <textarea 
                        className="w-full border p-2 rounded h-20 text-sm"
                        // @ts-ignore
                        value={formData[`initiative${num}`]}
                        // @ts-ignore
                        onChange={e => setFormData({...formData, [`initiative${num}`]: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">評価 {num}</label>
                      <textarea 
                        className="w-full border p-2 rounded h-20 text-sm"
                        // @ts-ignore
                        value={formData[`evaluation${num}`]}
                        // @ts-ignore
                        onChange={e => setFormData({...formData, [`evaluation${num}`]: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">短信</label>
                <textarea 
                  className="w-full border p-2 rounded h-24"
                  value={formData.shortMessage}
                  onChange={e => setFormData({...formData, shortMessage: e.target.value})}
                />
              </div>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 flex justify-end gap-4 z-20 shadow-lg">
           {/* PDFボタン */}
           {currentUser && activePlan && (
             <MonitoringPDFDownloadButton 
               monitoring={monitoringDataForPDF} 
               plan={activePlan} 
               user={currentUser} 
             />
           )}

           <button type="button" onClick={() => router.back()} className="px-6 py-2 bg-gray-100 rounded hover:bg-gray-200 font-bold text-gray-600">キャンセル</button>
           <button type="submit" disabled={submitting} className="px-8 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-md disabled:bg-gray-400">
             {submitting ? '保存中...' : '保存する'}
           </button>
        </div>

      </form>
    </AppLayout>
  );
}