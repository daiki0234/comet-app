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
  Timestamp 
} from 'firebase/firestore';

// ★ 1. 型定義 (事業所マスタ仕様)
interface Facility {
  id: string;
  code: string;        // 事業所番号 (必須)
  name: string;        // 事業所名 (必須)
  phone: string;       // 電話番号
  fax: string;         // FAX番号
  contactPerson: string; // 担当
  updatedAt: Timestamp | null;
}

// タイムスタンプをフォーマットする関数 (Turn 72 と同じ)
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
  
  // ★ 2. "新規登録" フォーム用の State (5項目)
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fax, setFax] = useState('');
  const [contactPerson, setContactPerson] = useState('');

  // ★ 3. "編集モーダル" 用の State (5項目)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItemToEdit, setCurrentItemToEdit] = useState<Facility | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editFax, setEditFax] = useState('');
  const [editContactPerson, setEditContactPerson] = useState('');

  // ★ 4. コレクション参照を "facilities" に変更
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

  useEffect(() => {
    fetchData();
  }, []);

  // "新規登録" フォームのクリア
  const resetForm = () => {
    setCode('');
    setName('');
    setPhone('');
    setFax('');
    setContactPerson('');
  };

  // "新規登録" フォームの保存処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // ★ 5. 必須チェック (code と name)
    if (!code || !name) {
      alert('事業所番号と事業所名は必須です。');
      return;
    }

    const data = { 
      code, name, phone, fax, contactPerson,
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

  // 削除処理 (変更なし)
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
    // ★ 6. 編集モーダルに5項目セット
    setEditCode(item.code);
    setEditName(item.name);
    setEditPhone(item.phone || ''); // null/undefined 対策
    setEditFax(item.fax || '');
    setEditContactPerson(item.contactPerson || '');
    setIsEditModalOpen(true);
  };

  // "編集モーダル" の更新処理
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    // ★ 7. 必須チェック (editCode と editName)
    if (!editCode || !editName || !currentItemToEdit) return;

    const data = {
      code: editCode,
      name: editName,
      phone: editPhone,
      fax: editFax,
      contactPerson: editContactPerson,
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'facilities', currentItemToEdit.id), data);
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
      {/* 1. "新規登録" フォーム (UIを5項目に変更) */}
      <form onSubmit={handleSave} className="p-4 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">
          新規登録
        </h3>
        
        {/* 必須項目（番号・名前） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">事業所番号 <span className="text-red-500">*</span></label>
            <input 
              type="text" value={code} onChange={(e) => setCode(e.target.value)} 
              className="p-2 border border-gray-300 rounded-md w-full" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">事業所名 <span className="text-red-500">*</span></label>
            <input 
              type="text" value={name} onChange={(e) => setName(e.target.value)} 
              className="p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
        </div>

        {/* 任意項目（電話・FAX・担当） */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
            <input 
              type="text" value={phone} onChange={(e) => setPhone(e.target.value)} 
              className="p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">FAX番号</label>
            <input 
              type="text" value={fax} onChange={(e) => setFax(e.target.value)} 
              className="p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">担当</label>
            <input 
              type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} 
              className="p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2">
          <button type="button" onClick={resetForm} className="...">クリア</button>
          <button type="submit" className="...">登録</button>
        </div>
      </form>

      {/* 2. 登録済みリスト (UIを5項目+日時に変更) */}
      <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg">
        {loading ? <p className="p-4">データを読み込んでいます...</p> : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="py-3 px-4 ...">事業所番号</th>
                <th className="py-3 px-4 ...">事業所名</th>
                <th className="py-3 px-4 ...">電話番号</th>
                <th className="py-3 px-4 ...">FAX番号</th>
                <th className="py-3 px-4 ...">担当</th>
                <th className="py-3 px-4 ...">更新日時</th>
                <th className="py-3 px-4 ...">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map(item => (
                <tr key={item.id}>
                  <td className="py-3 px-4 ...">{item.code}</td>
                  <td className="py-3 px-4 ...">{item.name}</td>
                  <td className="py-3 px-4 ...">{item.phone}</td>
                  <td className="py-3 px-4 ...">{item.fax}</td>
                  <td className="py-3 px-4 ...">{item.contactPerson}</td>
                  <td className="py-3 px-4 ...">{formatTimestamp(item.updatedAt)}</td>
                  <td className="py-3 px-4 ...">
                    <button onClick={() => handleEdit(item)} className="...">編集</button>
                    <button onClick={() => handleDelete(item.id)} className="...">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ★ 8. "編集モーダル" (UIを5項目に変更) */}
      {isEditModalOpen && currentItemToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
          <form onSubmit={handleUpdate} className="relative z-[201] bg-white p-6 rounded-lg shadow-xl w-full max-w-lg"> {/* 横幅をlgに拡大 */}
            <h3 className="text-xl font-semibold mb-4 text-gray-800">
              事業所の編集
            </h3>
            
            {/* 必須項目（番号・名前） */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">事業所番号 <span className="text-red-500">*</span></label>
                <input type="text" value={editCode} onChange={(e) => setEditCode(e.target.value)} className="p-2 border rounded-md w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">事業所名 <span className="text-red-500">*</span></label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="p-2 border rounded-md w-full" />
              </div>
            </div>

            {/* 任意項目（電話・FAX・担当） */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="p-2 border rounded-md w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAX番号</label>
                <input type="text" value={editFax} onChange={(e) => setEditFax(e.target.value)} className="p-2 border rounded-md w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当</label>
                <input type="text" value={editContactPerson} onChange={(e) => setEditContactPerson(e.target.value)} className="p-2 border rounded-md w-full" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="...">キャンセル</button>
              <button type="submit" className="...">更新</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}