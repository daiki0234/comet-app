// src/components/masters/MunicipalityManager.tsx

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

// 型定義
interface Municipality {
  id: string;
  name: string;
  code: string;
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
    console.error("Timestamp 変換エラー:", error);
    return '日付エラー';
  }
};


export default function MunicipalityManager() {
  const [items, setItems] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  
  // "新規登録" フォーム用の State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  // ★ 1. "編集モーダル" 用の State を追加
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItemToEdit, setCurrentItemToEdit] = useState<Municipality | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');


  const colRef = collection(db, 'municipalities');

  const fetchData = async () => {
    setLoading(true);
    const snapshot = await getDocs(colRef);
    const data = snapshot.docs.map(d => ({ 
      id: d.id, 
      ...(d.data() as Omit<Municipality, 'id'>) 
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
    setName('');
    setCode('');
  };

  // ★ 2. "新規登録" フォームの保存処理 (addDocのみ)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) {
      alert('市町村名と番号の両方を入力してください。');
      return;
    }

    const data = { 
      name, 
      code,
      updatedAt: serverTimestamp()
    };

    try {
      // 新規作成のみ
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
      await deleteDoc(doc(db, 'municipalities', id));
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('削除に失敗しました。');
    }
  };

  // ★ 3. "編集ボタン" の処理 (モーダルを開き、値をセット)
  const handleEdit = (item: Municipality) => {
    setCurrentItemToEdit(item);
    setEditName(item.name);
    setEditCode(item.code);
    setIsEditModalOpen(true); // モーダルを開く
  };

  // ★ 4. "編集モーダル" の更新処理 (setDoc)
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || !editCode || !currentItemToEdit) return;

    const data = {
      name: editName,
      code: editCode,
      updatedAt: serverTimestamp()
    };

    try {
      // setDoc で更新
      await setDoc(doc(db, 'municipalities', currentItemToEdit.id), data);
      setIsEditModalOpen(false); // モーダルを閉じる
      setCurrentItemToEdit(null);
      await fetchData(); // リストを再読み込み
    } catch (err) {
      console.error(err);
      alert('更新に失敗しました。');
    }
  };


  return (
    <div className="grid grid-cols-1 gap-8">
      {/* 1. 登録・編集フォーム (★ "新規登録" 専用に変更) */}
      <form onSubmit={handleSave} className="p-4 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">
          新規登録
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">支給市町村番号</label>
            <input 
              type="text" 
              value={code} 
              onChange={(e) => setCode(e.target.value)} 
              className="p-2 border border-gray-300 rounded-md w-full" 
              placeholder="例: 13101"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">支給市町村名</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="p-2 border border-gray-300 rounded-md w-full"
              placeholder="例: 千代田区"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2">
          <button 
            type="button" 
            onClick={resetForm} 
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded"
          >
            クリア
          </button>
          <button 
            type="submit" 
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
          >
            登録
          </button>
        </div>
      </form>

      {/* 2. 登録済みリスト (変更なし) */}
      <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg">
        {loading ? <p className="p-4">データを読み込んでいます...</p> : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">市町村名</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">市町村番号</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">登録・更新日時</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map(item => (
                <tr key={item.id}>
                  <td className="py-3 px-4 text-sm text-gray-700">{item.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{item.code}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{formatTimestamp(item.updatedAt)}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 space-x-2">
                    {/* "handleEdit" を呼ぶ */}
                    <button onClick={() => handleEdit(item)} className="text-blue-500 hover:underline text-sm">編集</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:underline text-sm">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ★ 5. "編集モーダル" をUIに追加 (カレンダーの z-[200] を流用) */}
      {isEditModalOpen && currentItemToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
          <form 
            onSubmit={handleUpdate} 
            className="relative z-[201] bg-white p-6 rounded-lg shadow-xl w-full max-w-md"
          >
            <h3 className="text-xl font-semibold mb-4 text-gray-800">
              支給市町村の編集
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">支給市町村番号</label>
              <input 
                type="text" 
                value={editCode} 
                onChange={(e) => setEditCode(e.target.value)} 
                className="p-2 border border-gray-300 rounded-md w-full"
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">支給市町村名</label>
              <input 
                type="text" 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)} 
                className="p-2 border border-gray-300 rounded-md w-full"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button 
                type="button" 
                onClick={() => setIsEditModalOpen(false)} 
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded"
              >
                キャンセル
              </button>
              <button 
                type="submit" 
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
              >
                更新
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}