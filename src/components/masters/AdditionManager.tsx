// src/components/masters/AdditionManager.tsx

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
  Timestamp 
} from 'firebase/firestore';

// ★ 1. 加算名のリスト (ご提示いただいたリスト)
const additionNames = [
  "子育てサポート加算",
  "個別サポート加算",
  "専門的支援実施加算",
  "関係機関連携加算",
  "家族支援加算",
  "送迎加算",
  "通所自立支援加算",
  "事業所間連携加算",
  "医療連携体制加算",
  "自立サポート加算",
  "強度行動障害児支援加算",
  "福祉専門職員配置等加算",
  "児童指導員等加配加算", // ★ これが分岐する
  "専門的支援体制加算",
] as const;
type AdditionName = typeof additionNames[number];

// ★ 2. 加算対象のリスト
const additionTargets = ["事業所", "利用者"] as const;
type AdditionTarget = typeof additionTargets[number];

// ★ 3. 加算内容の「マッピング（対応表）」 (30行目あたり)
// (ここに、分岐が必要な加算のリストを定義します)
const additionDetailsMap: Partial<Record<AdditionName, readonly string[]>> = {
  
  "個別サポート加算": [
    "個別サポート加算(I)", // ケアニーズの高い児
    "個別サポート加算(II)", // 要保護・要支援児
    "個別サポート加算(III)", // 不登校児
  ],
  
  "関係機関連携加算": [
    "関係機関連携加算(I)", // 計画作成連携
    "関係機関連携加算(II)", // 情報連携
    "関係機関連携加算(III)", // (詳細区分)
    "関係機関連携加算(IV)", // 就労連携
  ],
  
  "家族支援加算": [
    "個別支援（居宅訪問）",
    "個別支援（オンライン）",
    "グループ支援（事業所内）",
  ],
  
  "送迎加算": [
    "送迎加算（標準・片道）", // 54単位
    "送迎加算（重症心身障害児・片道）", // 37単位
    "送迎加算（看護職員同伴・片道）", // +37単位
    "送迎加算（同一敷地内・片道）", // 70%
  ],
  
  "事業所間連携加算": [
    "事業所間連携加算(I)", // 500単位
    "事業所間連携加算(II)", // 150単位
  ],

  "医療連携体制加算": [
    "医療連携体制加算(I)", // 1時間未満
    "医療連携体制加算(II)", // 1時間以上2時間未満
    "医療連携体制加算(III)", // 2時間以上
    "医療連携体制加算(IV)", // (詳細区分)
    "医療連携体制加算(V)", // 4時間以上
    "医療連携体制加算(VI)", // 喀痰吸引等指導
  ],
  
  "強度行動障害児支援加算": [
    "強度行動障害児支援加算(I)", // 200単位
    "強度行動障害児支援加算(II)", // (放デイのみ・新設)
  ],

  "福祉専門職員配置等加算": [
    "福祉専門職員配置等加算(I)", // 15単位
    "福祉専門職員配置等加算(II)", // 10単位
    "福祉専門職員配置等加算(III)", // 6単位
  ],
  
  "児童指導員等加配加算": [
    "常勤専従・経験5年以上",
    "常勤専従・経験5年未満",
    "常勤換算・経験5年以上",
    "常勤換算・経験5年未満",
    "その他の従業者",
  ],

  "専門的支援体制加算": [
    "定員10人以下",
    "定員11人～20人",
    "定員21人以上",
    // (※報酬改定によりさらに細分化されている可能性あり)
  ],
  
  // --- 以下は分岐が不要（テキスト入力）な加算 ---
  // "子育てサポート加算": [],
  // "専門的支援実施加算": [],
  // "通所自立支援加算": [],
  // "自立サポート加算": [],
};

// ★ 4. 型定義
interface Addition {
  id: string;
  name: AdditionName;  // 加算名
  details: string;       // 加算内容 (プルダウンまたは手入力)
  points: number;      // 加算点数
  target: AdditionTarget;// 加算対象
  updatedAt: Timestamp | null;
}

// タイムスタンプをフォーマットする関数 (yyyy/mm/dd hh:mm)
const formatTimestamp = (timestamp: Timestamp | null): string => {
  // ... (Turn 75 と同じ関数のため省略) ...
  if (!timestamp) return '---';
  try {
    const d = timestamp.toDate();
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
  } catch (error) {
    return '日付エラー';
  }
};

export default function AdditionManager() {
  const [items, setItems] = useState<Addition[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ★ 5. "新規登録" フォーム用の State
  const [name, setName] = useState<AdditionName>(additionNames[0]);
  const [details, setDetails] = useState('');
  const [points, setPoints] = useState<number>(0);
  const [target, setTarget] = useState<AdditionTarget>(additionTargets[0]);

  // ★ 6. "編集モーダル" 用の State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItemToEdit, setCurrentItemToEdit] = useState<Addition | null>(null);
  const [editName, setEditName] = useState<AdditionName>(additionNames[0]);
  const [editDetails, setEditDetails] = useState('');
  const [editPoints, setEditPoints] = useState<number>(0);
  const [editTarget, setEditTarget] = useState<AdditionTarget>(additionTargets[0]);

  // ★ 7. コレクション参照を "additions" に変更
  const colRef = collection(db, 'additions');

  // ★ 8. 選択中の「加算名」に対応する「加算内容リスト」を取得
  // (useMemo で、 'name' が変わるたびに再計算)
  const availableDetails = useMemo(() => {
    return additionDetailsMap[name] || null; // マップに存在すればリストを、なければ null を返す
  }, [name]);
  
  // (編集モーダル用)
  const availableEditDetails = useMemo(() => {
    return additionDetailsMap[editName] || null;
  }, [editName]);

  const fetchData = async () => {
    setLoading(true);
    const snapshot = await getDocs(colRef);
    const data = snapshot.docs.map(d => ({ 
      id: d.id, 
      ...(d.data() as Omit<Addition, 'id'>) 
    }));
    setItems(data.sort((a, b) => {
      if (a.updatedAt === null) return 1;
      if (b.updatedAt === null) return -1;
      return b.updatedAt.seconds - a.updatedAt.seconds;
    }));
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // "新規登録" フォームのクリア
  const resetForm = () => {
    setName(additionNames[0]);
    setDetails('');
    setPoints(0);
    setTarget(additionTargets[0]);
  };

  // "新規登録" フォームの保存処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !details || points === 0) {
      alert('すべての項目を正しく入力してください。');
      return;
    }
    const data = { 
      name, details, points, target,
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

  // 削除処理
  const handleDelete = async (id: string) => {
    if (!confirm('このデータを本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'additions', id));
      await fetchData();
    } catch (err) {
      alert('削除に失敗しました。');
    }
  };

  // "編集ボタン" の処理
  const handleEdit = (item: Addition) => {
    setCurrentItemToEdit(item);
    setEditName(item.name);
    setEditDetails(item.details);
    setEditPoints(item.points || 0);
    setEditTarget(item.target || additionTargets[0]);
    setIsEditModalOpen(true);
  };

  // "編集モーダル" の更新処理
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || !editDetails || editPoints === 0 || !currentItemToEdit) return;

    const data = {
      name: editName,
      details: editDetails,
      points: editPoints,
      target: editTarget,
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

  // ★ 9. 「加算名」が変更されたときの処理 (加算内容をリセット)
  const handleNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newName = e.target.value as AdditionName;
    setName(newName);
    // マップに定義されているリストの先頭をセット、なければ空にする
    const newDetailsList = additionDetailsMap[newName];
    setDetails(newDetailsList ? newDetailsList[0] : ''); 
  };
  // (編集モーダル用)
  const handleEditNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newName = e.target.value as AdditionName;
    setEditName(newName);
    const newDetailsList = additionDetailsMap[newName];
    setEditDetails(newDetailsList ? newDetailsList[0] : '');
  };


  return (
    <div className="grid grid-cols-1 gap-8">
      {/* 1. "新規登録" フォーム (UIを4項目に変更) */}
      <form onSubmit={handleSave} className="p-4 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">
          新規登録
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="mb-4 md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">加算名 <span className="text-red-500">*</span></label>
            <select 
              value={name} 
              onChange={handleNameChange} // ★ (9)
              className="p-2 border border-gray-300 rounded-md w-full bg-white"
            >
              {additionNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="mb-4 md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">加算内容 <span className="text-red-500">*</span></label>
            {/* ★ 10. 条件分岐するプルダウン (availableDetails) */}
            {availableDetails ? (
              // マップに定義がある場合 (例: 児童指導員等加配加算)
              <select 
                value={details} 
                onChange={(e) => setDetails(e.target.value)}
                className="p-2 border border-gray-300 rounded-md w-full bg-white"
              >
                {availableDetails.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              // マップに定義がない場合 (例: 子育てサポート加算)
              <input 
                type="text" 
                value={details} 
                onChange={(e) => setDetails(e.target.value)} 
                className="p-2 border border-gray-300 rounded-md w-full"
                placeholder="加算内容を入力 (例: 基本)"
              />
            )}
          </div>
          <div className="mb-4 md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">加算点数 <span className="text-red-500">*</span></label>
            <input 
              type="number" 
              value={points === 0 ? '' : points} 
              onChange={(e) => setPoints(Number(e.target.value) || 0)} 
              className="p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
          <div className="mb-4 md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">加算対象 <span className="text-red-500">*</span></label>
            <select 
              value={target} 
              onChange={(e) => setTarget(e.target.value as AdditionTarget)}
              className="p-2 border border-gray-300 rounded-md w-full bg-white"
            >
              {additionTargets.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2">
          <button type="button" onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">クリア</button>
          <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">登録</button>
        </div>
      </form>

      {/* 2. 登録済みリスト */}
      <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg">
        {loading ? <p className="p-4">データを読み込んでいます...</p> : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="py-3 px-4 ...">加算名</th>
                <th className="py-3 px-4 ...">加算内容</th>
                <th className="py-3 px-4 ...">加算点数</th>
                <th className="py-3 px-4 ...">加算対象</th>
                <th className="py-3 px-4 ...">更新日時</th>
                <th className="py-3 px-4 ...">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map(item => (
                <tr key={item.id}>
                  <td className="py-3 px-4 ...">{item.name}</td>
                  <td className="py-3 px-4 ...">{item.details}</td>
                  <td className="py-3 px-4 ...">{item.points}</td>
                  <td className="py-3 px-4 ...">{item.target}</td>
                  <td className="py-3 px-4 ...">{formatTimestamp(item.updatedAt)}</td>
                  <td className="py-3 px-4 ...">
                    <button onClick={() => handleEdit(item)} className="text-blue-500 ...">編集</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-500 ...">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. "編集モーダル" */}
      {isEditModalOpen && currentItemToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
          <form onSubmit={handleUpdate} className="relative z-[201] bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl"> {/* 横幅を2xlに拡大 */}
            <h3 className="text-xl font-semibold mb-4 text-gray-800">
              加算の編集
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="mb-4 md:col-span-1">
                <label className="block text-sm ...">加算名 <span className="text-red-500">*</span></label>
                <select 
                  value={editName} 
                  onChange={handleEditNameChange} // ★ (9)
                  className="p-2 border rounded-md w-full bg-white"
                >
                  {additionNames.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="mb-4 md:col-span-1">
                <label className="block text-sm ...">加算内容 <span className="text-red-500">*</span></label>
                {/* ★ 10. 条件分岐するプルダウン (availableEditDetails) */}
                {availableEditDetails ? (
                  <select 
                    value={editDetails} 
                    onChange={(e) => setEditDetails(e.target.value)}
                    className="p-2 border rounded-md w-full bg-white"
                  >
                    {availableEditDetails.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type="text" 
                    value={editDetails} 
                    onChange={(e) => setEditDetails(e.target.value)} 
                    className="p-2 border rounded-md w-full"
                  />
                )}
              </div>
              <div className="mb-4 md:col-span-1">
                <label className="block text-sm ...">加算点数 <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  value={editPoints === 0 ? '' : editPoints} 
                  onChange={(e) => setEditPoints(Number(e.target.value) || 0)} 
                  className="p-2 border rounded-md w-full"
                />
              </div>
              <div className="mb-4 md:col-span-1">
                <label className="block text-sm ...">加算対象 <span className="text-red-500">*</span></label>
                <select 
                  value={editTarget} 
                  onChange={(e) => setEditTarget(e.target.value as AdditionTarget)}
                  className="p-2 border rounded-md w-full bg-white"
                >
                  {additionTargets.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="bg-gray-200 ...">キャンセル</button>
              <button type="submit" className="bg-blue-500 ...">更新</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}