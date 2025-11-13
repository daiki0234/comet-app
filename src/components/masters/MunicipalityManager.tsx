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
  serverTimestamp, // ★ 1. サーバー時刻のインポート
  Timestamp         // ★ 2. 型のインポート
} from 'firebase/firestore';

// 市町村データの型定義 (updatedAt を追加)
interface Municipality {
  id: string;
  name: string; // 支給市町村名
  code: string; // 支給市町村番号
  updatedAt: Timestamp | null; // ★ 3. 登録・更新日時
}

// ★ 4. タイムスタンプをフォーマットする関数 (yyyy/mm/dd hh:mm)
const formatTimestamp = (timestamp: Timestamp | null): string => {
  if (!timestamp) return '---';
  try {
    const d = timestamp.toDate(); // TimestampをDateオブジェクトに変換
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
  
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const colRef = collection(db, 'municipalities');

  const fetchData = async () => {
    setLoading(true);
    const snapshot = await getDocs(colRef);
    const data = snapshot.docs.map(d => ({ 
      id: d.id, 
      ...(d.data() as Omit<Municipality, 'id'>) 
    }));
    // ★ 5. 日時(updatedAt)で並べ替え（降順）
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

  const resetForm = () => {
    setEditId(null);
    setName('');
    setCode('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) {
      alert('市町村名と番号の両方を入力してください。');
      return;
    }

    // ★ 6. 保存データに updatedAt を追加
    const data = { 
      name, 
      code,
      updatedAt: serverTimestamp() // 常にサーバー時刻で更新
    };

    try {
      if (editId) {
        await setDoc(doc(db, 'municipalities', editId), data);
      } else {
        await addDoc(colRef, data);
      }
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
      await deleteDoc(doc(db, 'municipalities', id));
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('削除に失敗しました。');
    }
  };

  const handleEdit = (item: Municipality) => {
    setEditId(item.id);
    setName(item.name);
    setCode(item.code);
  };

  // ★ 7. レイアウト修正 (フォームが上、リストが下)
  return (
    <div className="grid grid-cols-1 gap-8">
      {/* 1. 登録・編集フォーム */}
      <form onSubmit={handleSave} className="p-4 border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">
          {editId ? '支給市町村の編集' : '新規登録'}
        </h3>
        
        {/* ★ 8. 番号と名前を横並びにする (md: 以上で) */}
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
            {editId ? '更新' : '登録'}
          </button>
        </div>
      </form>

      {/* 2. 登録済みリスト (フォームの下) */}
      <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg">
        {loading ? <p className="p-4">データを読み込んでいます...</p> : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {/* ★ 9. テーブルカラムの順序変更 */}
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
                  {/* ★ 10. フォーマット関数で日時を表示 */}
                  <td className="py-3 px-4 text-sm text-gray-700">{formatTimestamp(item.updatedAt)}</td>
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
    </div>
  );
}