"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, doc, getDoc, setDoc, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

// --- 型定義 ---

// スケジュール行のデータ型
type ScheduleItem = {
  id: string;
  theme: string;      // テーマ
  content: string;    // 日程・トレーニングする能力・詳細
};

// 5領域それぞれのデータ
type DomainSchedules = {
  physical: ScheduleItem[];       // 運動・感覚 (身体スキル)
  cognitive: ScheduleItem[];      // 認知・行動 (学習・生活・社会性)
  health: ScheduleItem[];         // 健康・生活
  language: ScheduleItem[];       // 言語・コミュニケーション
  social: ScheduleItem[];         // 人間関係・社会性
};

// 全体のデータ構造
type FiveDomainPlan = {
  serviceType: 'afterSchool' | 'childDev'; // 放デイ or 児発
  year: number; // 年度
  
  // 基本情報
  createdAt: string;
  philosophy: string;   // 法人理念
  policy: string;       // 支援方針
  hours: string;        // 営業時間
  transport: string;    // 送迎有無

  // 支援内容テキスト
  supportContentTarget: string; // 本人支援の内容と5領域の関係性
  supportContentFamily: string; // 家族支援
  supportContentTransition: string; // 移行支援
  supportContentCommunity: string;  // 地域支援
  supportContentStaff: string;      // 職員の質向上
  supportContentEvents: string;     // 主な行事

  // 5領域スケジュール
  schedules: DomainSchedules;
};

// マスタデータの型（トレーニングマスタ）
type TrainingMasterItem = {
  id: string;
  category: string; // 5領域の分類など
  theme: string;
  content?: string;
};

// --- 初期値 ---
const INITIAL_SCHEDULES: DomainSchedules = {
  physical: [],
  cognitive: [],
  health: [],
  language: [],
  social: [],
};

const INITIAL_PLAN: FiveDomainPlan = {
  serviceType: 'afterSchool',
  year: new Date().getFullYear(),
  createdAt: new Date().toISOString().slice(0, 10),
  philosophy: '',
  policy: '',
  hours: '',
  transport: '無し',
  supportContentTarget: '',
  supportContentFamily: '',
  supportContentTransition: '',
  supportContentCommunity: '',
  supportContentStaff: '',
  supportContentEvents: '',
  schedules: INITIAL_SCHEDULES,
};

export default function FiveDomainsPage() {
  const [activeTab, setActiveTab] = useState<'afterSchool' | 'childDev'>('afterSchool');
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<FiveDomainPlan>(INITIAL_PLAN);
  
  // マスタデータ
  const [masterTrainings, setMasterTrainings] = useState<TrainingMasterItem[]>([]);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [targetField, setTargetField] = useState<{ domain: keyof DomainSchedules, index: number } | null>(null);

  useEffect(() => {
    fetchData();
    fetchMasterData();
  }, [activeTab]);

  // データの取得
  const fetchData = async () => {
    setLoading(true);
    try {
      // IDは年度とサービス種別で固定 (例: 2025_afterSchool)
      const currentYear = new Date().getFullYear(); 
      // ※本格運用では年度選択が必要ですが、今回は今年度固定とします
      const docId = `${currentYear}_${activeTab}`;
      
      const docRef = doc(db, 'fiveDomainPlans', docId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        setPlan(snap.data() as FiveDomainPlan);
      } else {
        // データがない場合は初期値 (サービス種別だけ合わせる)
        setPlan({ ...INITIAL_PLAN, serviceType: activeTab });
      }
    } catch (e) {
      console.error(e);
      toast.error("データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // マスタデータの取得 (serviceMastersコレクションなどを想定)
  const fetchMasterData = async () => {
    try {
      // ※実際のマスタ構造に合わせて調整してください。
      // ここでは 'trainingMaster' コレクションがある、または 'serviceMasters' 内にあると仮定してダミーデータをセットするか取得します
      const snap = await getDocs(collection(db, 'trainingMaster'));
      if (!snap.empty) {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as TrainingMasterItem[];
        setMasterTrainings(data);
      } else {
        // マスタがない場合のダミーデータ（テスト用）
        setMasterTrainings([
          { id: '1', category: '運動・感覚', theme: 'サーキットトレーニング', content: 'バランス感覚の育成' },
          { id: '2', category: '認知・行動', theme: 'ビジョントレーニング', content: '眼球運動' },
          { id: '3', category: '健康・生活', theme: '手洗い・うがい', content: '衛生管理' },
          { id: '4', category: '言語・コミュ', theme: 'SST（あいさつ）', content: '適切な声の大きさ' },
          { id: '5', category: '人間関係', theme: '集団遊び', content: 'ルールを守る' },
        ]);
      }
    } catch (e) {
      console.error("マスタ取得エラー", e);
    }
  };

  // 保存処理
  const handleSave = async () => {
    if (!confirm("入力内容を保存しますか？")) return;
    try {
      const docId = `${plan.year}_${activeTab}`;
      await setDoc(doc(db, 'fiveDomainPlans', docId), plan);
      toast.success("保存しました");
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    }
  };

  // 入力ハンドラ
  const handleChange = (field: keyof FiveDomainPlan, value: any) => {
    setPlan(prev => ({ ...prev, [field]: value }));
  };

  // スケジュール行の操作
  const addScheduleRow = (domain: keyof DomainSchedules) => {
    setPlan(prev => ({
      ...prev,
      schedules: {
        ...prev.schedules,
        [domain]: [
          ...prev.schedules[domain],
          { id: crypto.randomUUID(), theme: '', content: '' }
        ]
      }
    }));
  };

  const removeScheduleRow = (domain: keyof DomainSchedules, index: number) => {
    setPlan(prev => {
      const newList = [...prev.schedules[domain]];
      newList.splice(index, 1);
      return {
        ...prev,
        schedules: { ...prev.schedules, [domain]: newList }
      };
    });
  };

  const updateScheduleRow = (domain: keyof DomainSchedules, index: number, field: keyof ScheduleItem, value: string) => {
    setPlan(prev => {
      const newList = [...prev.schedules[domain]];
      newList[index] = { ...newList[index], [field]: value };
      return {
        ...prev,
        schedules: { ...prev.schedules, [domain]: newList }
      };
    });
  };

  // マスタから選択
  const openMasterModal = (domain: keyof DomainSchedules, index: number) => {
    setTargetField({ domain, index });
    setIsMasterModalOpen(true);
  };

  const selectMasterItem = (item: TrainingMasterItem) => {
    if (targetField) {
      updateScheduleRow(targetField.domain, targetField.index, 'theme', item.theme);
      // 内容も自動入力したい場合はここに追加: 
      // updateScheduleRow(targetField.domain, targetField.index, 'content', item.content || '');
      toast.success(`テーマ「${item.theme}」を反映しました`);
      setIsMasterModalOpen(false);
      setTargetField(null);
    }
  };

  if (loading) return <AppLayout pageTitle="読み込み中..."><div className="p-8 text-center">データを読み込んでいます...</div></AppLayout>;

  return (
    <AppLayout pageTitle="5領域プログラム作成">
      <div className="space-y-6 pb-24">
        
        {/* タブ切り替え */}
        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex gap-2">
          <button
            onClick={() => setActiveTab('afterSchool')}
            className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-colors ${
              activeTab === 'afterSchool' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
          >
            放課後等デイサービス
          </button>
          <button
            onClick={() => setActiveTab('childDev')}
            className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-colors ${
              activeTab === 'childDev' 
                ? 'bg-orange-500 text-white shadow-md' 
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
          >
            児童発達支援
          </button>
        </div>

        {/* 警告メッセージ (放デイ以外を選択時など) */}
        {activeTab === 'childDev' && (
          <div className="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-lg text-sm">
            ※現在は「放課後等デイサービス」の内容をベースにしています。児童発達支援用の様式に合わせて項目を調整する必要があります。
          </div>
        )}

        {/* --- 1. 基本情報 --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 border-l-4 border-blue-500 pl-3 mb-6">事業所基本情報</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">作成年月日</label>
              <input type="date" value={plan.createdAt} onChange={(e) => handleChange('createdAt', e.target.value)} className="w-full border p-2 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">送迎実施の有無</label>
              <select value={plan.transport} onChange={(e) => handleChange('transport', e.target.value)} className="w-full border p-2 rounded-lg">
                <option value="無し">無し</option>
                <option value="有り">有り</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">法人理念</label>
              <textarea value={plan.philosophy} onChange={(e) => handleChange('philosophy', e.target.value)} className="w-full border p-2 rounded-lg h-24" placeholder="社会に出ていける大人を目指す..." />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">支援方針</label>
              <textarea value={plan.policy} onChange={(e) => handleChange('policy', e.target.value)} className="w-full border p-2 rounded-lg h-24" placeholder="・子どもは必ず成長するという信念..." />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">営業時間</label>
              <textarea value={plan.hours} onChange={(e) => handleChange('hours', e.target.value)} className="w-full border p-2 rounded-lg h-24" placeholder="授業終了後:13時~20時..." />
            </div>
          </div>
        </div>

        {/* --- 2. 支援内容 --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 border-l-4 border-blue-500 pl-3 mb-6">支援内容</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TextAreaField label="本人支援の内容と5領域の関係性" value={plan.supportContentTarget} onChange={(val:string) => handleChange('supportContentTarget', val)} />
            <TextAreaField label="家族支援の内容" value={plan.supportContentFamily} onChange={(val:string) => handleChange('supportContentFamily', val)} />
            <TextAreaField label="移行支援の内容" value={plan.supportContentTransition} onChange={(val:string) => handleChange('supportContentTransition', val)} />
            <TextAreaField label="地域支援・地域連携の内容" value={plan.supportContentCommunity} onChange={(val:string) => handleChange('supportContentCommunity', val)} />
            <TextAreaField label="職員の質の向上に資する取り組み" value={plan.supportContentStaff} onChange={(val:string) => handleChange('supportContentStaff', val)} />
            <TextAreaField label="主な行事等" value={plan.supportContentEvents} onChange={(val:string) => handleChange('supportContentEvents', val)} />
          </div>
        </div>

        {/* --- 3. 5領域スケジュール --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 border-l-4 border-blue-500 pl-3 mb-6">5領域 支援内容スケジュール</h3>
          
          <div className="space-y-8">
            <ScheduleSection 
              title="① 運動・感覚 (身体スキル)" 
              description="身体と認知の発達を促すトレーニング等"
              items={plan.schedules.physical}
              onAdd={() => addScheduleRow('physical')}
              onRemove={(idx) => removeScheduleRow('physical', idx)}
              onUpdate={(idx, field, val) => updateScheduleRow('physical', idx, field, val)}
              onOpenMaster={(idx) => openMasterModal('physical', idx)}
            />
            
            <ScheduleSection 
              title="② 認知・行動 (学習・生活・社会性)" 
              description="学習・生活・社会性に関する総合的なソーシャルスキル等"
              items={plan.schedules.cognitive}
              onAdd={() => addScheduleRow('cognitive')}
              onRemove={(idx) => removeScheduleRow('cognitive', idx)}
              onUpdate={(idx, field, val) => updateScheduleRow('cognitive', idx, field, val)}
              onOpenMaster={(idx) => openMasterModal('cognitive', idx)}
            />

            <ScheduleSection 
              title="③ 健康・生活" 
              description="身辺自立、家事、地域生活など"
              items={plan.schedules.health}
              onAdd={() => addScheduleRow('health')}
              onRemove={(idx) => removeScheduleRow('health', idx)}
              onUpdate={(idx, field, val) => updateScheduleRow('health', idx, field, val)}
              onOpenMaster={(idx) => openMasterModal('health', idx)}
            />

            <ScheduleSection 
              title="④ 言語・コミュニケーション" 
              description="聞く・話す、読む・書くなど"
              items={plan.schedules.language}
              onAdd={() => addScheduleRow('language')}
              onRemove={(idx) => removeScheduleRow('language', idx)}
              onUpdate={(idx, field, val) => updateScheduleRow('language', idx, field, val)}
              onOpenMaster={(idx) => openMasterModal('language', idx)}
            />

            <ScheduleSection 
              title="⑤ 人間関係・社会性" 
              description="対人関係、集団参加など"
              items={plan.schedules.social}
              onAdd={() => addScheduleRow('social')}
              onRemove={(idx) => removeScheduleRow('social', idx)}
              onUpdate={(idx, field, val) => updateScheduleRow('social', idx, field, val)}
              onOpenMaster={(idx) => openMasterModal('social', idx)}
            />
          </div>
        </div>

        {/* フッターアクション */}
        <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 flex justify-end gap-4 z-20 shadow-lg">
          <button onClick={() => window.print()} className="px-6 py-2 bg-gray-100 rounded hover:bg-gray-200 font-bold text-gray-600">
            PDFプレビュー(印刷)
          </button>
          <button onClick={handleSave} className="px-8 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-md">
            保存する
          </button>
        </div>

      </div>

      {/* マスタ選択モーダル */}
      {isMasterModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">トレーニングマスタから選択</h3>
              <button onClick={() => setIsMasterModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-sm text-gray-500 mb-4">適用したいテーマを選択してください。</p>
              
              {masterTrainings.length === 0 ? (
                <div className="text-center text-gray-400 py-8">マスタデータがありません</div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {masterTrainings.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectMasterItem(item)}
                      className="text-left p-3 border rounded hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-800">{item.theme}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{item.category}</span>
                      </div>
                      {item.content && <p className="text-xs text-gray-500 mt-1">{item.content}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button onClick={() => setIsMasterModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm font-bold">キャンセル</button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}

// --- サブコンポーネント ---

function TextAreaField({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) {
  return (
    <div className="flex flex-col h-full">
      <label className="text-sm font-bold text-gray-700 mb-2 bg-gray-100 p-2 rounded w-fit">{label}</label>
      <textarea 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className="flex-1 w-full border border-gray-300 p-3 rounded-lg min-h-[120px] focus:ring-2 focus:ring-blue-500 outline-none"
      />
    </div>
  );
}

function ScheduleSection({ title, description, items, onAdd, onRemove, onUpdate, onOpenMaster }: any) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h4 className="font-bold text-gray-800">{title}</h4>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <button onClick={onAdd} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center gap-1">
          + 行を追加
        </button>
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-4">データがありません。「行を追加」ボタンを押してください。</div>
        ) : (
          <div className="space-y-3">
            {items.map((item: ScheduleItem, idx: number) => (
              <div key={item.id} className="flex gap-4 items-start bg-white p-3 border rounded-lg shadow-sm">
                <div className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full text-xs font-bold flex-shrink-0">
                  {idx + 1}
                </div>
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* テーマ入力エリア (マスタ選択ボタン付き) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-500">テーマ</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={item.theme} 
                        onChange={(e) => onUpdate(idx, 'theme', e.target.value)}
                        className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="テーマを入力"
                      />
                      <button 
                        onClick={() => onOpenMaster(idx)}
                        className="bg-orange-50 text-orange-600 border border-orange-200 px-2 rounded text-xs hover:bg-orange-100 whitespace-nowrap"
                        title="マスタから引用"
                      >
                        マスタ
                      </button>
                    </div>
                  </div>

                  {/* 日程・内容入力エリア */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-500">日程・内容等</label>
                    <textarea 
                      value={item.content} 
                      onChange={(e) => onUpdate(idx, 'content', e.target.value)}
                      className="w-full border p-2 rounded text-sm h-20 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="例: 4月, 11月 / 状況変化に応じて..."
                    />
                  </div>
                </div>

                <button 
                  onClick={() => onRemove(idx)}
                  className="text-gray-400 hover:text-red-500 p-1"
                  title="削除"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}