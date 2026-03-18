// src/components/masters/AdditionManager.tsx

"use client";

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  doc, 
  setDoc, 
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  query,
  orderBy 
} from 'firebase/firestore';

// --- 型定義 ---
interface Addition {
  id: string;
  serviceType: '放課後等デイサービス' | '児童発達支援';
  name: string; // サービス内容として使用
  points: number; // 単位
  serviceCode: string; // コード
  updatedAt: Timestamp | null;
}

export default function AdditionManager() {
  const [items, setItems] = useState<Addition[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // フォーム用 State
  const [serviceType, setServiceType] = useState<'放課後等デイサービス' | '児童発達支援'>('放課後等デイサービス');
  const [name, setName] = useState('');
  const [points, setPoints] = useState<number>(0);
  const [serviceCode, setServiceCode] = useState('');

  // 編集モード用 State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItemToEdit, setCurrentItemToEdit] = useState<Addition | null>(null);
  const [editServiceType, setEditServiceType] = useState<'放課後等デイサービス' | '児童発達支援'>('放課後等デイサービス');
  const [editName, setEditName] = useState('');
  const [editPoints, setEditPoints] = useState<number>(0);
  const [editServiceCode, setEditServiceCode] = useState('');

  const colRef = collection(db, 'additions');

  // データ取得
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
          name: dData.name || '',
          points: dData.points || 0,
          serviceCode: dData.serviceCode || '',
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

  const resetForm = () => {
    setServiceType('放課後等デイサービス');
    setName('');
    setPoints(0);
    setServiceCode('');
  };

  // 個別手動保存
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !serviceCode) {
      alert('サービス内容とコードは必須です。');
      return;
    }
    const data = { 
      serviceType, name, serviceCode, points,
      updatedAt: serverTimestamp()
    };
    try {
      await addDoc(colRef, data);
      resetForm();
      await fetchData();
    } catch (err) {
      alert('保存に失敗しました。');
    }
  };

  // 個別削除
  const handleDelete = async (id: string) => {
    if (!confirm('このデータを本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'additions', id));
      await fetchData();
    } catch (err) {
      alert('削除に失敗しました。');
    }
  };

  // ★全件削除 (リセット用)
  const handleDeleteAll = async () => {
    if (!confirm('【警告】現在登録されている加算マスタを「すべて」削除します。本当によろしいですか？')) return;
    setLoading(true);
    try {
      const snapshot = await getDocs(colRef);
      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => {
        batch.delete(doc(db, 'additions', d.id));
      });
      await batch.commit();
      alert('すべてのデータを削除しました。');
      await fetchData();
    } catch (err) {
      alert('全件削除に失敗しました。');
      setLoading(false);
    }
  };

  // ★CSVインポート処理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      // 1行目に「サービス」という文字が含まれていればヘッダーとみなしてスキップ
      const startIndex = lines[0].includes('サービス') ? 1 : 0;
      
      const batch = writeBatch(db);
      let count = 0;

      for (let i = startIndex; i < lines.length; i++) {
        // ダブルクォーテーションを外してカンマで分割
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        
        if (cols.length >= 4) {
          const docRef = doc(collection(db, 'additions'));
          batch.set(docRef, {
            serviceType: cols[0],
            name: cols[1], // サービス内容
            points: Number(cols[2]) || 0,
            serviceCode: cols[3],
            updatedAt: serverTimestamp()
          });
          count++;
        }
      }

      try {
        await batch.commit();
        alert(`${count}件の加算データを一括インポートしました！`);
        if (fileInputRef.current) fileInputRef.current.value = ''; // inputのリセット
        await fetchData();
      } catch (error) {
        console.error(error);
        alert('インポートに失敗しました。');
      }
    };
    reader.readAsText(file, 'UTF-8'); // UTF-8形式で読み込み
  };

  // 編集開始
  const handleEdit = (item: Addition) => {
    setCurrentItemToEdit(item);
    setEditServiceType(item.serviceType);
    setEditName(item.name);
    setEditServiceCode(item.serviceCode);
    setEditPoints(item.points || 0);
    setIsEditModalOpen(true);
  };

  // 編集保存
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || !currentItemToEdit) return;

    const data = {
      serviceType: editServiceType,
      name: editName,
      serviceCode: editServiceCode,
      points: editPoints,
      updatedAt: serverTimestamp()
    };
    try {
      await setDoc(doc(db, 'additions', currentItemToEdit.id), data);
      setIsEditModalOpen(false);
      setCurrentItemToEdit(null);
      await fetchData();
    } catch (err) {
      alert('更新に失敗しました。');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      
      {/* 1. 一括操作エリア (CSVインポート / 全件削除) */}
      <div className="p-5 border border-blue-200 rounded-xl bg-blue-50 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-blue-800 mb-1">CSV一括登録</h3>
          <p className="text-xs text-blue-600">「サービス種別, サービス内容, 単位, コード」の4列のCSVファイルを選択してください。</p>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer"
          />
          <button 
            onClick={handleDeleteAll} 
            className="bg-red-100 hover:bg-red-200 text-red-700 font-bold py-2 px-4 rounded-lg text-sm whitespace-nowrap border border-red-300 transition-colors"
          >
            全件削除
          </button>
        </div>
      </div>

      {/* 2. 手動登録フォーム */}
      <form onSubmit={handleSave} className="p-5 border border-gray-200 rounded-xl bg-white shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-gray-800">手動登録</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">サービス種別</label>
          <div className="flex gap-4">
            <label className={`flex items-center gap-2 cursor-pointer p-2 px-4 rounded border transition-colors ${serviceType === '放課後等デイサービス' ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-gray-300'}`}>
              <input type="radio" checked={serviceType === '放課後等デイサービス'} onChange={() => setServiceType('放課後等デイサービス')} className="text-blue-600" />
              放課後等デイサービス
            </label>
            <label className={`flex items-center gap-2 cursor-pointer p-2 px-4 rounded border transition-colors ${serviceType === '児童発達支援' ? 'bg-orange-50 border-orange-500 text-orange-800' : 'bg-white border-gray-300'}`}>
              <input type="radio" checked={serviceType === '児童発達支援'} onChange={() => setServiceType('児童発達支援')} className="text-orange-600" />
              児童発達支援
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">サービス内容 <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-200 outline-none" placeholder="例: 欠席時対応加算" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">コード <span className="text-red-500">*</span></label>
            <input type="text" value={serviceCode} onChange={(e) => setServiceCode(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full font-mono bg-gray-50 focus:ring-2 focus:ring-blue-200 outline-none" placeholder="例: 635495" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">単位 <span className="text-red-500">*</span></label>
            <input type="number" value={points === 0 ? '' : points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className="p-2 border border-gray-300 rounded-md w-full text-right focus:ring-2 focus:ring-blue-200 outline-none" placeholder="0" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
          <button type="button" onClick={resetForm} className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold py-2 px-6 rounded-lg transition-colors">クリア</button>
          <button type="submit" className="bg-gray-800 hover:bg-black text-white font-bold py-2 px-8 rounded-lg shadow-sm transition-colors">登録する</button>
        </div>
      </form>

      {/* 3. 登録済みリスト */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 font-bold text-gray-700 flex justify-between items-center">
          <span>登録済みマスタ一覧</span>
          <span className="text-xs font-normal text-gray-500 bg-white px-2 py-1 rounded border">{items.length}件</span>
        </div>
        
        {loading ? <p className="p-8 text-center text-gray-500">読み込み中...</p> : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">種別</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">サービス内容</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">コード</th>
                  <th className="py-3 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">単位</th>
                  <th className="py-3 px-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 text-sm">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs border ${item.serviceType === '放課後等デイサービス' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                        {item.serviceType === '放課後等デイサービス' ? '放デイ' : '児発'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-800">{item.name}</td>
                    <td className="py-3 px-4 font-mono text-gray-600">{item.serviceCode}</td>
                    <td className="py-3 px-4 text-right font-bold text-gray-800">{item.points}</td>
                    <td className="py-3 px-4 text-center space-x-3">
                      <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-900 font-medium">編集</button>
                      <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 font-medium">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. 編集モーダル */}
      {isEditModalOpen && currentItemToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
          <form onSubmit={handleUpdate} className="relative z-[201] bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl m-4 animate-popIn">
            <h3 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">
              加算情報の編集
            </h3>
            
            <div className="mb-4">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">サービス内容</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="p-2 border rounded w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">コード</label>
                <input type="text" value={editServiceCode} onChange={(e) => setEditServiceCode(e.target.value)} className="p-2 border bg-gray-50 rounded w-full font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">単位</label>
                <input type="number" value={editPoints} onChange={(e) => setEditPoints(Number(e.target.value) || 0)} className="p-2 border rounded w-full text-right" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">キャンセル</button>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg">更新を保存</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}