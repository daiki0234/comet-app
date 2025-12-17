"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  doc, 
  setDoc, 
  deleteDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy 
} from 'firebase/firestore';

// --- 1. 定数定義 ---

const additionNames = [
  "延長支援加算",
  "送迎加算",
  "欠席時対応加算",
  "家族支援加算",
  "上限額管理加算",
  "個別サポート加算",
  "通所自立支援加算",
  "関係機関連携加算",
  "事業所間連携加算",
  "医療連携体制加算",
  "強度行動障害児支援加算",
  "福祉専門職員配置等加算",
  "児童指導員等加配加算",
  "専門的支援体制加算",
  "子育てサポート加算",
  "専門的支援実施加算",
  "自立サポート加算",
] as const;
type AdditionName = typeof additionNames[number];

const additionTargets = ["事業所", "利用者"] as const;
type AdditionTarget = typeof additionTargets[number];

type SystemType = 
  | 'none' | 'extension_1' | 'extension_2' | 'extension_3' 
  | 'absence' | 'transport_1' | 'transport_2' | 'family_1' | 'family_2' 
  | 'independence' | 'upper_limit' | 'individual_1' | 'individual_2';

const SYSTEM_TYPE_OPTIONS: { label: string; value: SystemType }[] = [
  { label: '連携なし (手動)', value: 'none' },
  { label: '延長支援 (1時間未満)', value: 'extension_1' },
  { label: '延長支援 (1-2時間)', value: 'extension_2' },
  { label: '延長支援 (2時間以上)', value: 'extension_3' },
  { label: '欠席時対応加算', value: 'absence' },
  { label: '送迎加算 (I:片道)', value: 'transport_1' },
  { label: '送迎加算 (II:同一敷地)', value: 'transport_2' },
  { label: '家族支援加算 (I:個別)', value: 'family_1' },
  { label: '家族支援加算 (II:グループ)', value: 'family_2' },
  { label: '通所自立支援加算', value: 'independence' },
  { label: '上限額管理加算', value: 'upper_limit' },
  { label: '個別サポート加算 (I)', value: 'individual_1' },
  { label: '個別サポート加算 (II)', value: 'individual_2' },
];

const additionDetailsMap: Partial<Record<AdditionName, readonly string[]>> = {
  "延長支援加算": [
    "延長支援(1時間未満)",
    "延長支援(1時間以上2時間未満)",
    "延長支援(2時間以上)",
  ],
  "送迎加算": [
    "送迎加算(I)（標準・片道）", 
    "送迎加算(II)（同一敷地内・片道）", 
    "送迎加算（重症心身障害児・片道）", 
  ],
  "家族支援加算": [
    "家族支援加算(I)（個別・居宅/対面）",
    "家族支援加算(II)（グループ）",
  ],
  "個別サポート加算": ["個別サポート加算(I)", "個別サポート加算(II)", "個別サポート加算(III)"],
  "関係機関連携加算": ["関係機関連携加算(I)", "関係機関連携加算(II)"],
  "児童指導員等加配加算": ["常勤専従・経験5年以上", "常勤専従・経験5年未満", "その他の従業者"],
};

// ★★★ 自動入力用データ (令和6年4月改定版・標準コード) ★★★
// ※注意: 重症心身障害児施設や特例地域などはコードが異なります。
// ここでは最も一般的な「重心以外」「通常地域」のコードを設定しています。
type AutoFillData = {
  [service in '放課後等デイサービス' | '児童発達支援']?: {
    [key in AdditionName]?: {
      [detail: string]: { code: string; unit: number; system: SystemType; target: AdditionTarget }
    }
  }
};

const AUTO_FILL_DATA: AutoFillData = {
  "放課後等デイサービス": { // 種類コード: 63
    "延長支援加算": {
      "延長支援(1時間未満)": { code: "636601", unit: 61, system: "extension_1", target: "利用者" },
      "延長支援(1時間以上2時間未満)": { code: "636602", unit: 92, system: "extension_2", target: "利用者" },
      "延長支援(2時間以上)": { code: "636603", unit: 123, system: "extension_3", target: "利用者" },
    },
    "送迎加算": {
      "送迎加算(I)（標準・片道）": { code: "635010", unit: 54, system: "transport_1", target: "利用者" },
      "送迎加算(II)（同一敷地内・片道）": { code: "635020", unit: 27, system: "transport_2", target: "利用者" },
    },
    "欠席時対応加算": {
      "": { code: "635495", unit: 94, system: "absence", target: "利用者" } 
    },
    "上限額管理加算": {
      "": { code: "635370", unit: 150, system: "upper_limit", target: "利用者" }
    },
    "家族支援加算": {
      // 635605: 事業所内相談(1時間未満想定)
      "家族支援加算(I)（個別・居宅/対面）": { code: "635605", unit: 250, system: "family_1", target: "利用者" },
      "家族支援加算(II)（グループ）": { code: "635607", unit: 170, system: "family_2", target: "利用者" },
    },
    "通所自立支援加算": {
      "": { code: "635709", unit: 60, system: "independence", target: "利用者" }
    },
    "個別サポート加算": {
      "個別サポート加算(I)": { code: "636762", unit: 100, system: "individual_1", target: "利用者" },
      "個別サポート加算(II)": { code: "636763", unit: 125, system: "individual_2", target: "利用者" },
    }
  },
  "児童発達支援": { // 種類コード: 51
    "延長支援加算": {
      "延長支援(1時間未満)": { code: "516601", unit: 61, system: "extension_1", target: "利用者" },
      "延長支援(1時間以上2時間未満)": { code: "516602", unit: 92, system: "extension_2", target: "利用者" },
      // 児発の延長2時間以上は設定が稀、または区分によるため省略(必要なら追加)
    },
    "送迎加算": {
      "送迎加算(I)（標準・片道）": { code: "515010", unit: 54, system: "transport_1", target: "利用者" },
      "送迎加算(II)（同一敷地内・片道）": { code: "515020", unit: 27, system: "transport_2", target: "利用者" },
    },
    "欠席時対応加算": {
      "": { code: "515495", unit: 94, system: "absence", target: "利用者" }
    },
    "上限額管理加算": {
      "": { code: "515370", unit: 150, system: "upper_limit", target: "利用者" }
    },
    "家族支援加算": {
      "家族支援加算(I)（個別・居宅/対面）": { code: "515605", unit: 250, system: "family_1", target: "利用者" },
    },
    "個別サポート加算": {
      "個別サポート加算(I)": { code: "516762", unit: 100, system: "individual_1", target: "利用者" },
      "個別サポート加算(II)": { code: "516763", unit: 125, system: "individual_2", target: "利用者" },
    }
  }
};


// --- 2. 型定義 ---
interface Addition {
  id: string;
  serviceType: '放課後等デイサービス' | '児童発達支援';
  name: AdditionName;
  details: string;
  serviceCode: string;
  points: number;
  target: AdditionTarget;
  systemType: SystemType;
  updatedAt: Timestamp | null;
}

const formatTimestamp = (timestamp: Timestamp | null): string => {
  if (!timestamp) return '---';
  try {
    const d = timestamp.toDate();
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}/${m}/${day}`;
  } catch (error) { return 'エラー'; }
};

export default function AdditionManager() {
  const [items, setItems] = useState<Addition[]>([]);
  const [loading, setLoading] = useState(true);
  
  // フォーム用 State
  const [serviceType, setServiceType] = useState<'放課後等デイサービス' | '児童発達支援'>('放課後等デイサービス');
  const [name, setName] = useState<AdditionName>(additionNames[0]);
  const [details, setDetails] = useState('');
  const [serviceCode, setServiceCode] = useState('');
  const [points, setPoints] = useState<number>(0);
  const [target, setTarget] = useState<AdditionTarget>(additionTargets[0]);
  const [systemType, setSystemType] = useState<SystemType>('none');

  // 編集モード用 State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItemToEdit, setCurrentItemToEdit] = useState<Addition | null>(null);
  const [editServiceType, setEditServiceType] = useState<'放課後等デイサービス' | '児童発達支援'>('放課後等デイサービス');
  const [editName, setEditName] = useState<AdditionName>(additionNames[0]);
  const [editDetails, setEditDetails] = useState('');
  const [editServiceCode, setEditServiceCode] = useState('');
  const [editPoints, setEditPoints] = useState<number>(0);
  const [editTarget, setEditTarget] = useState<AdditionTarget>(additionTargets[0]);
  const [editSystemType, setEditSystemType] = useState<SystemType>('none');

  const colRef = collection(db, 'additions');

  // 加算内容リストの取得
  const availableDetails = useMemo(() => additionDetailsMap[name] || null, [name]);
  const availableEditDetails = useMemo(() => additionDetailsMap[editName] || null, [editName]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const q = query(colRef, orderBy('updatedAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => {
        const dData = d.data();
        return { 
          id: d.id,
          serviceType: dData.serviceType || '放課後等デイサービス',
          name: dData.name,
          details: dData.details || '',
          serviceCode: dData.serviceCode || '',
          points: dData.points || 0,
          target: dData.target || '事業所',
          systemType: dData.systemType || 'none',
          updatedAt: dData.updatedAt
        } as Addition;
      });
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ★★★ 自動入力ロジック (新規登録用) ★★★
  useEffect(() => {
    const serviceData = AUTO_FILL_DATA[serviceType];
    if (!serviceData) return;

    const additionData = serviceData[name];
    if (!additionData) return;

    // 詳細区分がない加算の場合、キーは空文字としている
    const targetKey = details || ""; 
    const preset = additionData[targetKey];

    if (preset) {
      setServiceCode(preset.code);
      setPoints(preset.unit);
      setSystemType(preset.system);
      setTarget(preset.target);
    } 
  }, [serviceType, name, details]);

  // ★★★ 自動入力ロジック (編集モーダル用) ★★★
  useEffect(() => {
    if (!isEditModalOpen) return;
    const serviceData = AUTO_FILL_DATA[editServiceType];
    if (!serviceData) return;
    const additionData = serviceData[editName];
    if (!additionData) return;
    const targetKey = editDetails || ""; 
    const preset = additionData[targetKey];

    if (preset) {
      setEditServiceCode(preset.code);
      setEditPoints(preset.unit);
      setEditSystemType(preset.system);
      setEditTarget(preset.target);
    }
  }, [editServiceType, editName, editDetails, isEditModalOpen]);


  const resetForm = () => {
    setServiceType('放課後等デイサービス');
    setName(additionNames[0]);
    // 初期選択肢の先頭をセット
    const initialDetails = additionDetailsMap[additionNames[0]]?.[0] || '';
    setDetails(initialDetails);
    setServiceCode('');
    setPoints(0);
    setTarget(additionTargets[0]);
    setSystemType('none');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || points === 0 || !serviceCode) {
      alert('すべての項目（特にサービスコード）を入力してください。');
      return;
    }
    const data = { 
      serviceType, name, details, serviceCode, points, target, systemType,
      updatedAt: serverTimestamp()
    };
    try {
      await addDoc(colRef, data);
      resetForm();
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('保存に失敗しました。');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このデータを本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'additions', id));
      await fetchData();
    } catch (err) {
      alert('削除に失敗しました。');
    }
  };

  const handleEdit = (item: Addition) => {
    setCurrentItemToEdit(item);
    setEditServiceType(item.serviceType);
    setEditName(item.name);
    setEditDetails(item.details);
    setEditServiceCode(item.serviceCode);
    setEditPoints(item.points || 0);
    setEditTarget(item.target || additionTargets[0]);
    setEditSystemType(item.systemType);
    setIsEditModalOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || editPoints === 0 || !currentItemToEdit) return;

    const data = {
      serviceType: editServiceType,
      name: editName,
      details: editDetails,
      serviceCode: editServiceCode,
      points: editPoints,
      target: editTarget,
      systemType: editSystemType,
      updatedAt: serverTimestamp()
    };
    try {
      await setDoc(doc(db, 'additions', currentItemToEdit.id), data);
      setIsEditModalOpen(false);
      setCurrentItemToEdit(null);
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('更新に失敗しました。');
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newName = e.target.value as AdditionName;
    setName(newName);
    const newDetailsList = additionDetailsMap[newName];
    setDetails(newDetailsList ? newDetailsList[0] : ''); 
  };

  const handleEditNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newName = e.target.value as AdditionName;
    setEditName(newName);
    const newDetailsList = additionDetailsMap[newName];
    setEditDetails(newDetailsList ? newDetailsList[0] : '');
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      {/* 1. 新規登録フォーム */}
      <form onSubmit={handleSave} className="p-5 border border-gray-200 rounded-xl bg-gray-50 shadow-sm animate-fadeIn">
        <h3 className="text-lg font-bold mb-4 text-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          新規登録
        </h3>
        
        {/* サービス種別 (Radio) */}
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">サービス種別</label>
          <div className="flex gap-4">
            <label className={`flex items-center gap-2 cursor-pointer p-2 px-4 rounded border transition-colors ${serviceType === '放課後等デイサービス' ? 'bg-blue-100 border-blue-500 text-blue-800' : 'bg-white border-gray-300'}`}>
              <input type="radio" name="serviceType" checked={serviceType === '放課後等デイサービス'} onChange={() => setServiceType('放課後等デイサービス')} className="text-blue-600" />
              放課後等デイサービス
            </label>
            <label className={`flex items-center gap-2 cursor-pointer p-2 px-4 rounded border transition-colors ${serviceType === '児童発達支援' ? 'bg-orange-100 border-orange-500 text-orange-800' : 'bg-white border-gray-300'}`}>
              <input type="radio" name="serviceType" checked={serviceType === '児童発達支援'} onChange={() => setServiceType('児童発達支援')} className="text-orange-600" />
              児童発達支援
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 加算名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">加算名 <span className="text-red-500">*</span></label>
            <select value={name} onChange={handleNameChange} className="p-2 border border-gray-300 rounded-md w-full bg-white focus:ring-2 focus:ring-blue-200 outline-none">
              {additionNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* 加算内容 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">加算内容 <span className="text-red-500">*</span></label>
            {availableDetails ? (
              <select value={details} onChange={(e) => setDetails(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full bg-white focus:ring-2 focus:ring-blue-200 outline-none">
                {availableDetails.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : (
              <input type="text" value={details} onChange={(e) => setDetails(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" placeholder="入力してください" />
            )}
          </div>

          {/* サービスコード */}
          <div>
            <label className="block text-sm font-bold text-blue-700 mb-1">サービスコード (6-7桁) <span className="text-red-500">*</span></label>
            <input type="text" value={serviceCode} onChange={(e) => setServiceCode(e.target.value)} className="p-2 border border-blue-300 rounded-md w-full font-mono bg-blue-50 focus:ring-2 focus:ring-blue-300 outline-none" placeholder="自動入力されます" />
          </div>

          {/* 加算点数 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">単位数 <span className="text-red-500">*</span></label>
            <input type="number" value={points === 0 ? '' : points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className="p-2 border border-gray-300 rounded-md w-full text-right focus:ring-2 focus:ring-blue-200 outline-none" />
          </div>

          {/* システム連携 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">システム自動連携</label>
            <select value={systemType} onChange={(e) => setSystemType(e.target.value as SystemType)} className="p-2 border border-gray-300 rounded-md w-full bg-white text-sm focus:ring-2 focus:ring-blue-200 outline-none">
              {SYSTEM_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          {/* 加算対象 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">加算対象</label>
            <select value={target} onChange={(e) => setTarget(e.target.value as AdditionTarget)} className="p-2 border border-gray-300 rounded-md w-full bg-white focus:ring-2 focus:ring-blue-200 outline-none">
              {additionTargets.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 border-t pt-4">
          <button type="button" onClick={resetForm} className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold py-2 px-6 rounded-lg transition-colors">クリア</button>
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-lg shadow-md transition-all transform hover:scale-[1.02]">登録する</button>
        </div>
      </form>

      {/* 2. 登録済みリスト */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gray-100 px-6 py-3 border-b border-gray-200 font-bold text-gray-700 flex justify-between items-center">
          <span>登録済みマスタ一覧</span>
          <span className="text-xs font-normal text-gray-500 bg-white px-2 py-1 rounded border">{items.length}件</span>
        </div>
        
        {loading ? <p className="p-8 text-center text-gray-500">読み込み中...</p> : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">種別</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">加算名 / 内容</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">コード</th>
                  <th className="py-3 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">単位</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">連携</th>
                  <th className="py-3 px-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 text-sm">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50 transition-colors">
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs border ${item.serviceType === '放課後等デイサービス' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                        {item.serviceType === '放課後等デイサービス' ? '放デイ' : '児発'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-gray-800">{item.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{item.details}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-700">
                      <span className="bg-gray-100 px-2 py-1 rounded border border-gray-200">{item.serviceCode}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-800">
                      {item.points}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {SYSTEM_TYPE_OPTIONS.find(opt => opt.value === item.systemType)?.label ? (
                        <span className="text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100">
                          {SYSTEM_TYPE_OPTIONS.find(opt => opt.value === item.systemType)?.label}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4 text-center space-x-2">
                      <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-900 font-medium hover:underline">編集</button>
                      <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-900 font-medium hover:underline">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. 編集モーダル */}
      {isEditModalOpen && currentItemToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
          <form onSubmit={handleUpdate} className="relative z-[201] bg-white p-6 rounded-xl shadow-2xl w-full max-w-3xl m-4 max-h-[90vh] overflow-y-auto animate-popIn">
            <h3 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">
              加算情報の編集
            </h3>
            
            {/* 編集: サービス種別 */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">サービス種別</label>
              <div className="flex gap-4">
                <label className={`flex items-center gap-2 cursor-pointer p-2 px-3 rounded border ${editServiceType === '放課後等デイサービス' ? 'bg-blue-50 border-blue-500' : ''}`}>
                  <input type="radio" checked={editServiceType === '放課後等デイサービス'} onChange={() => setEditServiceType('放課後等デイサービス')} className="text-blue-600" />
                  放課後等デイサービス
                </label>
                <label className={`flex items-center gap-2 cursor-pointer p-2 px-3 rounded border ${editServiceType === '児童発達支援' ? 'bg-orange-50 border-orange-500' : ''}`}>
                  <input type="radio" checked={editServiceType === '児童発達支援'} onChange={() => setEditServiceType('児童発達支援')} className="text-orange-600" />
                  児童発達支援
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-1">加算名</label>
                <select value={editName} onChange={handleEditNameChange} className="p-2 border rounded w-full bg-white">
                  {additionNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">加算内容</label>
                {availableEditDetails ? (
                  <select value={editDetails} onChange={(e) => setEditDetails(e.target.value)} className="p-2 border rounded w-full bg-white">
                    {availableEditDetails.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                ) : (
                  <input type="text" value={editDetails} onChange={(e) => setEditDetails(e.target.value)} className="p-2 border rounded w-full" />
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-blue-700 mb-1">サービスコード</label>
                <input type="text" value={editServiceCode} onChange={(e) => setEditServiceCode(e.target.value)} className="p-2 border border-blue-300 bg-blue-50 rounded w-full font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">単位数</label>
                <input type="number" value={editPoints} onChange={(e) => setEditPoints(Number(e.target.value) || 0)} className="p-2 border rounded w-full text-right" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">システム連携</label>
                <select value={editSystemType} onChange={(e) => setEditSystemType(e.target.value as SystemType)} className="p-2 border rounded w-full bg-white">
                  {SYSTEM_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">加算対象</label>
                <select value={editTarget} onChange={(e) => setEditTarget(e.target.value as AdditionTarget)} className="p-2 border rounded w-full bg-white">
                  {additionTargets.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">キャンセル</button>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg">更新保存</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}