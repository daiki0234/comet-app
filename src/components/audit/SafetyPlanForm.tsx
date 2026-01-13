"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { SafetyPlan, MonthlyPlan, ManualEntry } from '@/types/audit';

interface Props {
  initialData?: SafetyPlan;
  isEdit?: boolean;
}

// デフォルトのマニュアル項目
const DEFAULT_MANUALS = [
  '事業継続計画書（BCP）',
  '感染症発生時におけるBCP',
  '災害時マニュアル',
  '119番対応時マニュアル',
  '虐待防止マニュアル',
  '身体拘束適正化マニュアル'
];

export const SafetyPlanForm: React.FC<Props> = ({ initialData, isEdit = false }) => {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // 初期値設定
  const [formData, setFormData] = useState<SafetyPlan>(initialData || {
    fiscalYear: new Date().getFullYear() + 1, // 来年度
    facilityName: 'ハッピーテラス俊徳道教室',
    safetyChecks: Array.from({ length: 12 }, (_, i) => ({ month: i + 1 > 9 ? i - 8 : i + 4, content: '' })), // 4月始まり
    manuals: DEFAULT_MANUALS.map((name, i) => ({ 
      id: `manual-${i}`, category: name, creationDate: '', reviewDate: '適宜', location: '事務所' 
    })),
    childGuidance: '',
    parentGuidance: '',
    drills: Array.from({ length: 12 }, (_, i) => ({ month: i + 1 > 9 ? i - 8 : i + 4, content: '', subContent: '' })),
    drillParticipants: '',
    staffTraining: '',
    externalTraining: '',
    recurrencePrevention: '',
    otherMeasures: '',
    createdAt: null,
    updatedAt: null,
  });

  // 月順ソート用 (4,5,6...12,1,2,3)
  const sortedMonths = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

  // 入力ハンドラ
  const handleChange = (field: keyof SafetyPlan, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // 月次データ更新 (安全点検 / 訓練)
  const handleMonthlyChange = (
    type: 'safetyChecks' | 'drills',
    month: number,
    field: 'content' | 'subContent',
    value: string
  ) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].map(item => item.month === month ? { ...item, [field]: value } : item)
    }));
  };

  // マニュアル更新
  const handleManualChange = (index: number, field: keyof ManualEntry, value: string) => {
    const newManuals = [...formData.manuals];
    newManuals[index] = { ...newManuals[index], [field]: value };
    setFormData(prev => ({ ...prev, manuals: newManuals }));
  };

  // 保存処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fiscalYear) return toast.error("年度を入力してください");

    try {
      setSubmitting(true);
      const dataToSave = {
        ...formData,
        updatedAt: serverTimestamp(),
      };

      if (isEdit && initialData?.id) {
        await updateDoc(doc(db, 'safetyPlans', initialData.id), dataToSave);
        toast.success("更新しました");
      } else {
        await addDoc(collection(db, 'safetyPlans'), {
          ...dataToSave,
          createdAt: serverTimestamp(),
        });
        toast.success("作成しました");
      }
      router.push('/audit/plans/safety');
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 pb-20">
      
      {/* ヘッダー情報 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex gap-4 items-center">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">対象年度 (令和)</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-bold">令和</span>
              <input 
                type="number" 
                value={formData.fiscalYear - 2018} // 西暦→令和変換(簡易)
                onChange={(e) => setFormData({...formData, fiscalYear: parseInt(e.target.value) + 2018})}
                className="w-20 border p-2 rounded text-center font-bold"
              />
              <span className="text-gray-600 font-bold">年度 安全計画</span>
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-bold text-gray-700 mb-1">事業所名</label>
            <input 
              type="text" 
              value={formData.facilityName}
              onChange={(e) => handleChange('facilityName', e.target.value)}
              className="w-full border p-2 rounded"
            />
          </div>
        </div>
      </div>

      {/* 1. 安全点検 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg text-gray-800 border-l-4 border-blue-500 pl-3 mb-4">1. 安全点検</h3>
        
        {/* 月次点検 */}
        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-700 mb-2">（１）施設・設備の安全点検（重点点検箇所）</label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedMonths.map(month => {
              const item = formData.safetyChecks.find(c => c.month === month) || { month, content: '' };
              return (
                <div key={month} className="border rounded p-2 bg-gray-50">
                  <div className="text-xs font-bold text-gray-500 mb-1">{month}月</div>
                  <textarea 
                    value={item.content}
                    onChange={(e) => handleMonthlyChange('safetyChecks', month, 'content', e.target.value)}
                    className="w-full border p-1 rounded text-sm h-16 resize-none focus:bg-white"
                    placeholder="点検箇所を入力"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* マニュアル */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">（２）マニュアルの策定・共有</label>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border text-left">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2 w-1/3">分野</th>
                  <th className="border p-2">策定時期</th>
                  <th className="border p-2">見直し予定</th>
                  <th className="border p-2">保管場所</th>
                </tr>
              </thead>
              <tbody>
                {formData.manuals.map((manual, index) => (
                  <tr key={index}>
                    <td className="border p-2 bg-gray-50">{manual.category}</td>
                    <td className="border p-2"><input type="text" value={manual.creationDate} onChange={(e) => handleManualChange(index, 'creationDate', e.target.value)} className="w-full p-1 border rounded" placeholder="R6.3.12" /></td>
                    <td className="border p-2"><input type="text" value={manual.reviewDate} onChange={(e) => handleManualChange(index, 'reviewDate', e.target.value)} className="w-full p-1 border rounded" /></td>
                    <td className="border p-2"><input type="text" value={manual.location} onChange={(e) => handleManualChange(index, 'location', e.target.value)} className="w-full p-1 border rounded" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 2. 安全指導 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg text-gray-800 border-l-4 border-green-500 pl-3 mb-4">2. 児童・保護者に対する安全指導</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">（１）児童への安全指導</label>
          <textarea 
            value={formData.childGuidance}
            onChange={(e) => handleChange('childGuidance', e.target.value)}
            className="w-full border p-3 rounded h-24"
            placeholder="例：通所経路の安全確認、避難訓練の実施など"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">（２）保護者への説明・共有</label>
          <textarea 
            value={formData.parentGuidance}
            onChange={(e) => handleChange('parentGuidance', e.target.value)}
            className="w-full border p-3 rounded h-24"
            placeholder="例：安全計画の掲示、保護者会での周知など"
          />
        </div>
      </div>

      {/* 3. 訓練・研修 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg text-gray-800 border-l-4 border-orange-500 pl-3 mb-4">3. 訓練・研修</h3>
        
        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-700 mb-2">（１）訓練のテーマ・取組</label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedMonths.map(month => {
              const item = formData.drills.find(c => c.month === month) || { month, content: '', subContent: '' };
              return (
                <div key={month} className="border rounded p-2 bg-orange-50">
                  <div className="text-xs font-bold text-orange-800 mb-1">{month}月</div>
                  <input 
                    type="text"
                    value={item.content}
                    onChange={(e) => handleMonthlyChange('drills', month, 'content', e.target.value)}
                    className="w-full border p-1 rounded text-sm mb-1"
                    placeholder="避難訓練（地震等）"
                  />
                  <input 
                    type="text"
                    value={item.subContent}
                    onChange={(e) => handleMonthlyChange('drills', month, 'subContent', e.target.value)}
                    className="w-full border p-1 rounded text-xs bg-white/50"
                    placeholder="その他（通報等）"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">（２）訓練参加予定者</label>
            <input type="text" value={formData.drillParticipants} onChange={(e) => handleChange('drillParticipants', e.target.value)} className="w-full border p-2 rounded" placeholder="管理者、児童指導員" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">（３）職員への研修・講習</label>
            <textarea value={formData.staffTraining} onChange={(e) => handleChange('staffTraining', e.target.value)} className="w-full border p-2 rounded h-20" placeholder="虐待防止研修会、身体拘束研修会など" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">（４）行政等が実施する訓練・講習スケジュール</label>
            <textarea value={formData.externalTraining} onChange={(e) => handleChange('externalTraining', e.target.value)} className="w-full border p-2 rounded h-20" placeholder="自治体主催の研修など" />
          </div>
        </div>
      </div>

      {/* 4. その他 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg text-gray-800 border-l-4 border-gray-500 pl-3 mb-4">4. 再発防止策・その他</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">再発防止策の徹底（ヒヤリハット等）</label>
          <textarea value={formData.recurrencePrevention} onChange={(e) => handleChange('recurrencePrevention', e.target.value)} className="w-full border p-2 rounded h-20" />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">その他の安全確保に向けた取組</label>
          <textarea value={formData.otherMeasures} onChange={(e) => handleChange('otherMeasures', e.target.value)} className="w-full border p-2 rounded h-20" />
        </div>
      </div>

      {/* アクションボタン */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 flex justify-end gap-4 z-10 shadow-lg">
        <button type="button" onClick={() => router.back()} className="px-6 py-2 bg-gray-100 rounded hover:bg-gray-200 font-bold text-gray-600">キャンセル</button>
        <button type="submit" disabled={submitting} className="px-8 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-md disabled:bg-gray-400">
          {submitting ? '保存中...' : (isEdit ? '更新する' : '作成する')}
        </button>
      </div>

    </form>
  );
};