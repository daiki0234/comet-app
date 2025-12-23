"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, where, orderBy, limit } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { UserData } from '@/types/billing';
import { SupportPlan } from '@/types/plan';
import { MonitoringRecord } from '@/types/monitoring';
import { MonitoringPDFDownloadButton } from '@/components/pdf/MonitoringPDFDownloadButton';

export default function NewMonitoringPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // マスタデータ
  const [users, setUsers] = useState<UserData[]>([]);
  const [staffs, setStaffs] = useState<string[]>([]);
  
  // 検索用
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // UI用ステート (最小化トグル) - デフォルトは開いている状態
  const [isPlanExpanded, setIsPlanExpanded] = useState(true);
  const [isInitiativesExpanded, setIsInitiativesExpanded] = useState(true);

  // フォームデータ
  const [formData, setFormData] = useState({
    creationDate: new Date().toISOString().split('T')[0],
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

  // 取得した計画書データ
  const [activePlan, setActivePlan] = useState<SupportPlan | null>(null);
  
  // 支援目標ごとの評価入力用 { targetId: evaluationText }
  const [targetEvals, setTargetEvals] = useState<Record<string, string>>({});

  // 初期データ取得 (利用者・職員)
  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const [uSnap, aSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'admins'))
        ]);
        setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
        setStaffs(aSnap.docs.map(d => d.data().name).filter(Boolean));
      } catch (e) {
        console.error(e);
        toast.error("マスタデータの読み込みに失敗しました");
      }
    };
    fetchMasters();
  }, []);

  // 利用者選択時の処理 -> 最新の本番計画書を取得
  const handleSelectUser = async (user: UserData) => {
    setFormData({ ...formData, userId: user.id, userName: `${user.lastName} ${user.firstName}` });
    setSearchTerm(`${user.lastName} ${user.firstName}`);
    setShowSuggestions(false);
    setActivePlan(null); // リセット
    setTargetEvals({});  // リセット

    // 最新の本番計画書を取得
    try {
      const q = query(
        collection(db, 'supportPlans'),
        where('userId', '==', user.id),
        where('status', '==', '本番'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const planData = { id: snap.docs[0].id, ...snap.docs[0].data() } as SupportPlan;
        setActivePlan(planData);
        toast.success("最新の個別支援計画を読み込みました");
      } else {
        toast("本番の個別支援計画が見つかりませんでした");
      }
    } catch (e) {
      console.error(e);
      toast.error("計画書の取得に失敗しました");
    }
  };

  // 保存処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.userId) return toast.error("利用者を選択してください");
    if (!formData.author) return toast.error("作成者を選択してください");

    try {
      setSubmitting(true);

      // targetEvals オブジェクトを配列形式に変換
      const targetEvaluations = Object.entries(targetEvals).map(([key, val]) => ({
        targetId: key,
        evaluation: val
      }));

      await addDoc(collection(db, 'monitoringRecords'), {
        ...formData,
        refPlanId: activePlan?.id || '',
        targetEvaluations,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success("登録しました");
      router.push('/support/monitoring');
    } catch (e) {
      console.error(e);
      toast.error("登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  // PDF出力用のデータ生成
  const currentUser = users.find(u => u.id === formData.userId) || null;
  const monitoringDataForPDF: MonitoringRecord = {
    ...formData,
    // id, createdAt等は新規なので無いがPDF生成には不要
    targetEvaluations: Object.entries(targetEvals).map(([key, val]) => ({
      targetId: key,
      evaluation: val
    })),
    refPlanId: activePlan?.id || ''
  };

  return (
    <AppLayout pageTitle="モニタリング 新規作成">
      <form onSubmit={handleSubmit} className="space-y-8 pb-20">
        
        {/* 基本情報 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-700 border-l-4 border-blue-500 pl-2 mb-4">基本情報</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 左列 */}
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

            {/* 右列 */}
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-1">利用者氏名</label>
                <input 
                  type="text" 
                  value={searchTerm} 
                  onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full border p-2 rounded"
                  placeholder="検索..." 
                />
                {showSuggestions && (
                  <div className="absolute z-10 w-full bg-white border shadow-lg max-h-40 overflow-y-auto mt-1 rounded">
                    {users.filter(u => `${u.lastName} ${u.firstName}`.includes(searchTerm)).map(u => (
                      <div key={u.id} onClick={() => handleSelectUser(u)} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">{u.lastName} {u.firstName}</div>
                    ))}
                  </div>
                )}
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

        {/* 利用者が選択されたら表示 */}
        {formData.userId && (
          <>
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
                有効な個別支援計画（本番）が見つかりません。<br/>
                支援計画を作成・確定してからモニタリングを行ってください。
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
          </>
        )}

        <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 flex justify-end gap-4 z-20 shadow-lg">
           {/* PDFボタン: データが揃っている時のみ表示 */}
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