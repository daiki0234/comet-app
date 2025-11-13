// src/components/masters/SchoolManager.tsx

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
  Timestamp 
} from 'firebase/firestore';

// ★ 1. 学校区分の型
const schoolTypes = ["保育所", "小学校", "中学校", "高等学校"] as const;
type SchoolType = typeof schoolTypes[number];

// ★ 2. 型定義 (学校マスタ仕様)
interface School {
  id: string;
  name: string;        // 学校名 (必須)
  type: SchoolType;    // 区分
  phone: string;       // 電話番号
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

export default function SchoolManager() {
  const [items, setItems] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ★ 3. "新規登録" フォーム用の State
  const [name, setName] = useState('');
  const [type, setType] = useState<SchoolType>(schoolTypes[0]); // デフォルトは "保育所"
  const [phone, setPhone] = useState('');

  // ★ 4. "編集モーダル" 用の State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItemToEdit, setCurrentItemToEdit] = useState<School | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<SchoolType>(schoolTypes[0]);
  const [editPhone, setEditPhone] = useState('');

  // ★ 5. コレクション参照を "schools" に変更
  const colRef = collection(db, 'schools');

  const fetchData = async () => {
    setLoading(true);
    const snapshot = await getDocs(colRef);
    const data = snapshot.docs.map(d => ({ 
      id: d.id, 
      ...(d.data() as Omit<School, 'id'>) 
    }));
    // 更新日時でソート
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
    setName('');
    setType(schoolTypes[0]);
    setPhone('');
  };

  // "新規登録" フォームの保存処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // ★ 6. 必須チェック (name のみ)
    if (!name) {
      alert('学校名は必須です。');
      return;
    }

    const data = { 
      name, type, phone,
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
      await deleteDoc(doc(db, 'schools', id));
      await fetchData();
    } catch (err) {
      alert('削除に失敗しました。');
    }
  };

  // "編集ボタン" の処理
  const handleEdit = (item: School) => {
    setCurrentItemToEdit(item);
    // ★ 7. 編集モーダルに3項目セット
    setEditName(item.name);
    setEditType(item.type || schoolTypes[0]); // データが不正な場合も考慮
    setEditPhone(item.phone || '');
    setIsEditModalOpen(true);
  };

  // "編集モーダル" の更新処理
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    // ★ 8. 必須チェック (editName のみ)
    if (!editName || !currentItemToEdit) return;

    const data = {
      name: editName,
      type: editType,
      phone: editPhone,
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'schools', currentItemToEdit.id), data);
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
      {/* 1. "新規登録" フォーム (UIを3項目に変更) */}
      <form onSubmit={handleSave} className="p-4 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">
          新規登録
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">学校名 <span className="text-red-500">*</span></label>
            <input 
              type="text" value={name} onChange={(e) => setName(e.target.value)} 
              className="p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
          <div className="mb-4">
            {/* ★ 9. プルダウン（Select）に変更 */}
            <label className="block text-sm font-medium text-gray-700 mb-1">区分</label>
            <select 
              value={type} 
              onChange={(e) => setType(e.target.value as SchoolType)}
              className="p-2 border border-gray-300 rounded-md w-full bg-white"
            >
              {schoolTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
            <input 
              type="text" value={phone} onChange={(e) => setPhone(e.target.value)} 
              className="p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2">
          <button type="button" onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">クリア</button>
          <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">登録</button>
        </div>
      </form>

      {/* 2. 登録済みリスト (UIを3項目に変更) */}
      <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg">
        {loading ? <p className="p-4">データを読み込んでいます...</p> : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              {/* ★ 10. 一覧表示（3項目） */}
              <tr>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">学校名</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">区分</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map(item => (
                <tr key={item.id}>
                  {/* ★ 10. 一覧表示（3項目） */}
                  <td className="py-3 px-4 text-sm text-gray-700">{item.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{item.type}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 space-x-2">
                    <button onClick={() => handleEdit(item)} className="text-blue-500 hover:underline text-sm">編集</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:underline text-sm">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. "編集モーダル" (UIを3項目に変更) */}
      {isEditModalOpen && currentItemToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
          <form onSubmit={handleUpdate} className="relative z-[201] bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">
              学校の編集
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="mb-4 md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">学校名 <span className="text-red-500">*</span></label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="p-2 border rounded-md w-full" />
              </div>
              <div className="mb-4 md:col-span-1">
                {/* ★ 9. プルダウン（Select）に変更 */}
                <label className="block text-sm font-medium text-gray-700 mb-1">区分</label>
                <select 
                  value={editType} 
                  onChange={(e) => setEditType(e.target.value as SchoolType)}
                  className="p-2 border border-gray-300 rounded-md w-full bg-white"
                >
                  {schoolTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="mb-4 md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="p-2 border rounded-md w-full" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">キャンセル</button>
              <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">更新</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}