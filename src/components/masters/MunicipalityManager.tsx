// src/components/masters/MunicipalityManager.tsx

"use client";
import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';

interface Municipality {
  id: string;
  name: string; // 支給市町村名
  code: string; // 支給市町村番号
}

export default function MunicipalityManager() {
  const [items, setItems] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  // ★「municipalities」コレクションへの "参照" を定義
  const colRef = collection(db, 'municipalities');

  // データ取得
  const fetchData = async () => {
    setLoading(true);
    const snapshot = await getDocs(colRef); // データを読み込む
    const data = snapshot.docs.map(d => ({ 
      id: d.id, 
      ...(d.data() as Omit<Municipality, 'id'>) 
    }));
    setItems(data.sort((a, b) => a.code.localeCompare(b.code)));
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

  // ★★★ これが最重要 ★★★
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) return;
    const data = { name, code };

    try {
      if (editId) {
        // 更新
        await setDoc(doc(db, 'municipalities', editId), data);
      } else {
        // ★★★ 新規作成 ★★★
        // Firebaseコンソールに 'municipalities' が無くても、
        // この addDoc が実行された瞬間に "自動で作成" されます！
        await addDoc(colRef, data);
      }
      resetForm();
      await fetchData(); // リストを再読み込み
    } catch (err) {
      console.error(err);
      alert('保存に失敗しました。');
    }
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'municipalities', id));
      await fetchData();
    } catch (err) {
      alert('削除に失敗しました。');
    }
  };

  // 編集
  const handleEdit = (item: Municipality) => {
    setEditId(item.id);
    setName(item.name);
    setCode(item.code);
  };

  // --- ここから下はUI（フォームとテーブル）---
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* 1. 登録・編集フォーム */}
      <form onSubmit={handleSave} className="p-4 border rounded-lg">
        <h3 className="text-xl font-semibold mb-4">
          {editId ? '支給市町村の編集' : '新規登録'}
        </h3>
        {/* 市町村番号 Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">支給市町村番号</label>
          <input 
            type="text" value={code} onChange={(e) => setCode(e.target.value)} 
            className="p-2 border rounded-md w-full" 
          />
        </div>
        {/* 市町村名 Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">支給市町村名</label>
          <input 
            type="text" value={name} onChange={(e) => setName(e.target.value)} 
            className="p-2 border rounded-md w-full"
          />
        </div>
        {/* ボタン */}
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={resetForm} className="...">クリア</button>
          <button type="submit" className="...">
            {editId ? '更新' : '登録'}
          </button>
        </div>
      </form>

      {/* 2. 登録済みリスト (省略) */}
      <div className="max-h-[60vh] overflow-y-auto">
        {loading ? <p>読み込み中...</p> : (
          <table className="min-w-full divide-y">
            {/* ... テーブルのヘッダ ... */}
            <tbody className="divide-y">
              {items.map(item => (
                <tr key={item.id}>
                  <td className="py-3 px-4">{item.code}</td>
                  <td className="py-3 px-4">{item.name}</td>
                  <td className="py-3 px-4">
                    <button onClick={() => handleEdit(item)} className="...">編集</button>
                    <button onClick={() => handleDelete(item.id)} className="...">削除</button>
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