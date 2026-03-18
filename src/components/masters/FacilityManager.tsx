// src/components/masters/FacilityManager.tsx

"use client";

import React, { useState, useEffect } from 'react';
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
  where
} from 'firebase/firestore';

// ★ 定数の追加：地域区分と係数のマッピング
const REGION_MAP: Record<string, string> = {
  "一級地": "11.20",
  "二級地": "10.96",
  "三級地": "10.90",
  "四級地": "10.72",
  "五級地": "10.60",
  "六級地": "10.36",
  "七級地": "10.18",
  "その他": "10.00"
};

// ★ 定数の追加：処遇改善加算と割合のマッピング
const ADDITION_MAP: Record<string, string> = {
  "福祉・介護職員等処遇改善加算（Ⅰ）": "13.4%",
  "福祉・介護職員等処遇改善加算（Ⅱ）": "13.1%",
  "福祉・介護職員等処遇改善加算（Ⅲ）": "12.1%",
  "福祉・介護職員等処遇改善加算（Ⅳ）": "9.8%"
};

// ★ 型定義の拡張
interface Facility {
  id: string;
  code: string;
  name: string;
  phone: string;
  fax: string;
  contactPerson: string;
  isOwnFacility?: boolean;
  childDevManager?: string;
  regionCategory?: string;
  regionCoefficient?: string;
  treatmentAddition?: string;
  treatmentAdditionRate?: string;
  updatedAt: Timestamp | null;
}

// タイムスタンプをフォーマットする関数 (yyyy/mm/dd hh:mm)
const formatTimestamp = (timestamp: Timestamp | null): string => {
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

export default function FacilityManager() {
  const [items, setItems] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ★ 児発管のリスト用State
  const [managers, setManagers] = useState<{id: string, name: string}[]>([]);

  // "新規登録" フォーム
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fax, setFax] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  
  // ★ 自事業所用の追加State
  const [isOwnFacility, setIsOwnFacility] = useState(false);
  const [childDevManager, setChildDevManager] = useState('');
  const [regionCategory, setRegionCategory] = useState('');
  const [regionCoefficient, setRegionCoefficient] = useState('');
  const [treatmentAddition, setTreatmentAddition] = useState('');
  const [treatmentAdditionRate, setTreatmentAdditionRate] = useState('');

  // "編集モーダル" 
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItemToEdit, setCurrentItemToEdit] = useState<Facility | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editFax, setEditFax] = useState('');
  const [editContactPerson, setEditContactPerson] = useState('');
  
  // ★ 編集用の自事業所State
  const [editIsOwnFacility, setEditIsOwnFacility] = useState(false);
  const [editChildDevManager, setEditChildDevManager] = useState('');
  const [editRegionCategory, setEditRegionCategory] = useState('');
  const [editRegionCoefficient, setEditRegionCoefficient] = useState('');
  const [editTreatmentAddition, setEditTreatmentAddition] = useState('');
  const [editTreatmentAdditionRate, setEditTreatmentAdditionRate] = useState('');

  const colRef = collection(db, 'facilities');

  const fetchData = async () => {
    setLoading(true);
    const snapshot = await getDocs(colRef);
    const data = snapshot.docs.map(d => ({ 
      id: d.id, 
      ...(d.data() as Omit<Facility, 'id'>) 
    }));
    setItems(data.sort((a, b) => {
      if (a.updatedAt === null) return 1;
      if (b.updatedAt === null) return -1;
      return b.updatedAt.seconds - a.updatedAt.seconds;
    }));
    setLoading(false);
  };

  // ★ 児発管の取得処理を追加
  const fetchManagers = async () => {
    const q = query(collection(db, 'admins'), where('jobTitle', '==', 'child_dev_manager'));
    const snapshot = await getDocs(q);
    const managersData = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || '名前未設定'
    }));
    setManagers(managersData);
  };

  useEffect(() => {
    fetchData();
    fetchManagers();
  }, []);

  // "新規登録" フォームのクリア
  const resetForm = () => {
    setCode('');
    setName('');
    setPhone('');
    setFax('');
    setContactPerson('');
    setIsOwnFacility(false);
    setChildDevManager('');
    setRegionCategory('');
    setRegionCoefficient('');
    setTreatmentAddition('');
    setTreatmentAdditionRate('');
  };

  // "新規登録" フォームの保存処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) {
      alert('事業所番号と事業所名は必須です。');
      return;
    }
    const data = { 
      code, name, phone, fax, contactPerson,
      isOwnFacility,
      childDevManager: isOwnFacility ? childDevManager : '',
      regionCategory: isOwnFacility ? regionCategory : '',
      regionCoefficient: isOwnFacility ? regionCoefficient : '',
      treatmentAddition: isOwnFacility ? treatmentAddition : '',
      treatmentAdditionRate: isOwnFacility ? treatmentAdditionRate : '',
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
      await deleteDoc(doc(db, 'facilities', id));
      await fetchData();
    } catch (err) {
      alert('削除に失敗しました。');
    }
  };

  // "編集ボタン" の処理
  const handleEdit = (item: Facility) => {
    setCurrentItemToEdit(item);
    setEditCode(item.code);
    setEditName(item.name);
    setEditPhone(item.phone || '');
    setEditFax(item.fax || '');
    setEditContactPerson(item.contactPerson || '');
    setEditIsOwnFacility(item.isOwnFacility || false);
    setEditChildDevManager(item.childDevManager || '');
    setEditRegionCategory(item.regionCategory || '');
    setEditRegionCoefficient(item.regionCoefficient || '');
    setEditTreatmentAddition(item.treatmentAddition || '');
    setEditTreatmentAdditionRate(item.treatmentAdditionRate || '');
    setIsEditModalOpen(true);
  };

  // "編集モーダル" の更新処理
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCode || !editName || !currentItemToEdit) return;
    const data = {
      code: editCode,
      name: editName,
      phone: editPhone,
      fax: editFax,
      contactPerson: editContactPerson,
      isOwnFacility: editIsOwnFacility,
      childDevManager: editIsOwnFacility ? editChildDevManager : '',
      regionCategory: editIsOwnFacility ? editRegionCategory : '',
      regionCoefficient: editIsOwnFacility ? editRegionCoefficient : '',
      treatmentAddition: editIsOwnFacility ? editTreatmentAddition : '',
      treatmentAdditionRate: editIsOwnFacility ? editTreatmentAdditionRate : '',
      updatedAt: serverTimestamp()
    };
    try {
      await setDoc(doc(db, 'facilities', currentItemToEdit.id), data, { merge: true });
      setIsEditModalOpen(false);
      setCurrentItemToEdit(null);
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('更新に失敗しました。');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      {/* 1. "新規登録" フォーム */}
      <form onSubmit={handleSave} className="p-4 border border-gray-200 rounded-lg shadow-sm bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800">
            新規登録
          </h3>
          {/* ★ 自事業所チェックボックス */}
          <label className="flex items-center cursor-pointer bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors">
            <input 
              type="checkbox" 
              checked={isOwnFacility} 
              onChange={(e) => setIsOwnFacility(e.target.checked)} 
              className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-bold text-blue-800">自事業所に設定する</span>
          </label>
        </div>
        
        {/* 基本項目 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">事業所番号 <span className="text-red-500">*</span></label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">事業所名 <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">FAX番号</label>
            <input type="text" value={fax} onChange={(e) => setFax(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">担当</label>
            <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
          </div>
        </div>

        {/* ★ 自事業所専用項目 (アコーディオン風に展開) */}
        {isOwnFacility && (
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg animate-fadeIn">
            <h4 className="font-bold text-gray-700 mb-3 border-b border-gray-200 pb-2">自事業所 詳細設定</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* 児発管選択 */}
              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">児童発達支援管理責任者</label>
                <select 
                  value={childDevManager} 
                  onChange={(e) => setChildDevManager(e.target.value)} 
                  className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                >
                  <option value="">選択してください</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* 地域区分と係数 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">地域区分</label>
                <select 
                  value={regionCategory} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setRegionCategory(val);
                    setRegionCoefficient(val ? REGION_MAP[val] : '');
                  }} 
                  className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                >
                  <option value="">選択してください</option>
                  {Object.keys(REGION_MAP).map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">地域係数 (自動入力)</label>
                <input type="text" value={regionCoefficient} readOnly className="p-2 border border-gray-300 rounded-md w-full bg-gray-100 text-gray-600" placeholder="-" />
              </div>

              {/* 処遇改善加算と割合 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">処遇改善加算</label>
                <select 
                  value={treatmentAddition} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setTreatmentAddition(val);
                    setTreatmentAdditionRate(val ? ADDITION_MAP[val] : '');
                  }} 
                  className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                >
                  <option value="">選択してください</option>
                  {Object.keys(ADDITION_MAP).map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">加算率 (自動入力)</label>
                <input type="text" value={treatmentAdditionRate} readOnly className="p-2 border border-gray-300 rounded-md w-full bg-gray-100 text-gray-600" placeholder="-" />
              </div>

            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button type="button" onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded transition-colors">クリア</button>
          <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-colors">登録</button>
        </div>
      </form>

      {/* 2. 登録済みリスト */}
      <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg shadow-sm">
        {loading ? <p className="p-4 text-gray-500">データを読み込んでいます...</p> : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">事業所番号</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">事業所名</th>
                <th className="py-3 px-4 text-center text-xs font-medium text-gray-500 uppercase">自事業所</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">更新日時</th>
                <th className="py-3 px-4 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 text-sm text-gray-700 font-mono">{item.code}</td>
                  <td className="py-3 px-4 text-sm text-gray-800 font-medium">{item.name}</td>
                  <td className="py-3 px-4 text-sm text-center">
                    {item.isOwnFacility ? <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">自事業所</span> : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">{formatTimestamp(item.updatedAt)}</td>
                  <td className="py-3 px-4 text-sm text-center space-x-3">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 font-medium">編集</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 font-medium">削除</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">登録されている事業所がありません。</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. "編集モーダル" */}
      {isEditModalOpen && currentItemToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
          <form onSubmit={handleUpdate} className="relative z-[201] bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">
                事業所の編集
              </h3>
              {/* ★ 編集用の自事業所チェックボックス */}
              <label className="flex items-center cursor-pointer bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={editIsOwnFacility} 
                  onChange={(e) => setEditIsOwnFacility(e.target.checked)} 
                  className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-bold text-blue-800">自事業所に設定する</span>
              </label>
            </div>
            
            {/* 基本項目 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">事業所番号 <span className="text-red-500">*</span></label>
                <input type="text" value={editCode} onChange={(e) => setEditCode(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">事業所名 <span className="text-red-500">*</span></label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAX番号</label>
                <input type="text" value={editFax} onChange={(e) => setEditFax(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当</label>
                <input type="text" value={editContactPerson} onChange={(e) => setEditContactPerson(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" />
              </div>
            </div>

            {/* ★ 編集時の自事業所専用項目 */}
            {editIsOwnFacility && (
              <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="font-bold text-gray-700 mb-3 border-b border-gray-200 pb-2">自事業所 詳細設定</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">児童発達支援管理責任者</label>
                    <select 
                      value={editChildDevManager} 
                      onChange={(e) => setEditChildDevManager(e.target.value)} 
                      className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                    >
                      <option value="">選択してください</option>
                      {managers.map(m => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">地域区分</label>
                    <select 
                      value={editRegionCategory} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditRegionCategory(val);
                        setEditRegionCoefficient(val ? REGION_MAP[val] : '');
                      }} 
                      className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                    >
                      <option value="">選択してください</option>
                      {Object.keys(REGION_MAP).map(key => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">地域係数 (自動入力)</label>
                    <input type="text" value={editRegionCoefficient} readOnly className="p-2 border border-gray-300 rounded-md w-full bg-gray-100 text-gray-600" placeholder="-" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">処遇改善加算</label>
                    <select 
                      value={editTreatmentAddition} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditTreatmentAddition(val);
                        setEditTreatmentAdditionRate(val ? ADDITION_MAP[val] : '');
                      }} 
                      className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                    >
                      <option value="">選択してください</option>
                      {Object.keys(ADDITION_MAP).map(key => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">加算率 (自動入力)</label>
                    <input type="text" value={editTreatmentAdditionRate} readOnly className="p-2 border border-gray-300 rounded-md w-full bg-gray-100 text-gray-600" placeholder="-" />
                  </div>

                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button 
                type="button" 
                onClick={() => setIsEditModalOpen(false)} 
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded transition-colors"
              >
                キャンセル
              </button>
              <button 
                type="submit" 
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded transition-colors shadow-sm"
              >
                更新を保存
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}