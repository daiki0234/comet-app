"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

// --- 型定義 ---

// 5領域の定数
const FIVE_DOMAINS = [
  '健康・生活',
  '運動・感覚',
  '認知・行動',
  '言語・コミュニケーション',
  '人間関係・社会性'
] as const;

type DomainType = typeof FIVE_DOMAINS[number];

// 週間トレーニング項目（子）
type WeeklyItem = {
  id: string; // 一意のID（UUID等）
  name: string;
};

// トレーニングテーマ（親）
type TrainingTheme = {
  id: string;
  name: string; // 例：リズム能力
  domain: DomainType; // 例：運動・感覚
  weeklyItems: WeeklyItem[]; // 子供のリストを配列で持つ
};

export default function TrainingManager() {
  const [themes, setThemes] = useState<TrainingTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);

  // フォーム用ステート
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeDomain, setNewThemeDomain] = useState<DomainType>('健康・生活');
  const [newItemName, setNewItemName] = useState('');

  // --- データ取得 ---
  const fetchThemes = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'trainingThemes'));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // weeklyItemsが無い場合のフォールバック
        weeklyItems: doc.data().weeklyItems || [] 
      })) as TrainingTheme[];
      
      setThemes(data);
    } catch (error) {
      console.error(error);
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThemes();
  }, []);

  // --- テーマ（親）の操作 ---

  const handleAddTheme = async () => {
    if (!newThemeName.trim()) return toast.error("テーマ名を入力してください");

    try {
      await addDoc(collection(db, 'trainingThemes'), {
        name: newThemeName,
        domain: newThemeDomain,
        weeklyItems: [], // 初期は空
        createdAt: serverTimestamp(),
      });
      toast.success("テーマを追加しました");
      setNewThemeName('');
      fetchThemes();
    } catch (e) {
      console.error(e);
      toast.error("追加に失敗しました");
    }
  };

  const handleDeleteTheme = async (id: string) => {
    if (!confirm("このテーマと紐づく週間トレーニング設定を削除しますか？")) return;
    try {
      await deleteDoc(doc(db, 'trainingThemes', id));
      toast.success("削除しました");
      if (selectedThemeId === id) setSelectedThemeId(null);
      fetchThemes();
    } catch (e) {
      console.error(e);
      toast.error("削除に失敗しました");
    }
  };

  // --- 週間トレーニング項目（子）の操作 ---

  const handleAddItem = async () => {
    if (!selectedThemeId) return;
    if (!newItemName.trim()) return toast.error("トレーニング名を入力してください");

    const targetTheme = themes.find(t => t.id === selectedThemeId);
    if (!targetTheme) return;

    // 新しいアイテムオブジェクト
    const newItem: WeeklyItem = {
      id: crypto.randomUUID(), // ランダムID生成
      name: newItemName
    };

    const updatedItems = [...targetTheme.weeklyItems, newItem];

    try {
      await updateDoc(doc(db, 'trainingThemes', selectedThemeId), {
        weeklyItems: updatedItems,
        updatedAt: serverTimestamp()
      });
      
      // ローカルstateも更新（再取得までのラグを埋めるため）
      setThemes(prev => prev.map(t => 
        t.id === selectedThemeId ? { ...t, weeklyItems: updatedItems } : t
      ));
      
      setNewItemName('');
      toast.success("週間トレーニング候補を追加しました");
    } catch (e) {
      console.error(e);
      toast.error("追加に失敗しました");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!selectedThemeId) return;
    if (!confirm("このトレーニング項目を削除しますか？")) return;

    const targetTheme = themes.find(t => t.id === selectedThemeId);
    if (!targetTheme) return;

    const updatedItems = targetTheme.weeklyItems.filter(i => i.id !== itemId);

    try {
      await updateDoc(doc(db, 'trainingThemes', selectedThemeId), {
        weeklyItems: updatedItems,
        updatedAt: serverTimestamp()
      });

      setThemes(prev => prev.map(t => 
        t.id === selectedThemeId ? { ...t, weeklyItems: updatedItems } : t
      ));
      toast.success("削除しました");
    } catch (e) {
      console.error(e);
      toast.error("削除に失敗しました");
    }
  };

  // 選択中のテーマデータ
  const selectedTheme = themes.find(t => t.id === selectedThemeId);

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-250px)] min-h-[500px]">
      
      {/* 左カラム：テーマ一覧（親） */}
      <div className="w-full md:w-1/3 flex flex-col border-r pr-0 md:pr-6">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="bg-blue-100 text-blue-600 p-1 rounded">1</span>
          テーマ設定
        </h3>
        
        {/* 新規登録フォーム */}
        <div className="bg-gray-50 p-4 rounded-lg mb-4 space-y-3 border border-gray-200">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">5領域区分</label>
            <select 
              value={newThemeDomain}
              onChange={(e) => setNewThemeDomain(e.target.value as DomainType)}
              className="w-full p-2 border rounded text-sm bg-white"
            >
              {FIVE_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">テーマ名</label>
            <input 
              type="text" 
              value={newThemeName}
              onChange={(e) => setNewThemeName(e.target.value)}
              placeholder="例: リズム能力"
              className="w-full p-2 border rounded text-sm"
            />
          </div>
          <button 
            onClick={handleAddTheme}
            className="w-full bg-blue-600 text-white py-2 rounded text-sm font-bold hover:bg-blue-700 transition-colors"
          >
            テーマを追加
          </button>
        </div>

        {/* リスト表示 */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {themes.map(theme => (
            <div 
              key={theme.id}
              onClick={() => setSelectedThemeId(theme.id)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedThemeId === theme.id 
                  ? 'bg-blue-50 border-blue-500 shadow-sm' 
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-blue-600 font-bold mb-1">{theme.domain}</div>
                  <div className="font-bold text-gray-800">{theme.name}</div>
                  <div className="text-xs text-gray-400 mt-1">項目数: {theme.weeklyItems.length}</div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteTheme(theme.id); }}
                  className="text-gray-400 hover:text-red-500 p-1"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {themes.length === 0 && !loading && (
            <div className="text-center text-gray-400 text-sm py-4">登録なし</div>
          )}
        </div>
      </div>

      {/* 右カラム：週間トレーニング項目（子） */}
      <div className="w-full md:w-2/3 flex flex-col pl-0 md:pl-2">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="bg-green-100 text-green-600 p-1 rounded">2</span>
          週間トレーニング候補
        </h3>

        {selectedTheme ? (
          <>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 mb-4 rounded-r">
              <span className="text-xs text-gray-500 block">選択中のテーマ</span>
              <span className="font-bold text-lg text-blue-800">{selectedTheme.name}</span>
              <span className="ml-2 text-sm text-blue-600">({selectedTheme.domain})</span>
            </div>

            {/* アイテム追加フォーム */}
            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="週間トレーニング名を入力 (例: 音楽に合わせてストップ＆ゴー)"
                className="flex-1 p-2 border rounded text-sm"
              />
              <button 
                onClick={handleAddItem}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-green-700 whitespace-nowrap"
              >
                追加
              </button>
            </div>

            {/* アイテムリスト */}
            <div className="flex-1 overflow-y-auto bg-white border rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 border-b">
                  <tr>
                    <th className="p-3">トレーニング名</th>
                    <th className="p-3 w-16 text-center">削除</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedTheme.weeklyItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-700">{item.name}</td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {selectedTheme.weeklyItems.length === 0 && (
                    <tr>
                      <td colSpan={2} className="p-8 text-center text-gray-400">
                        登録された項目はありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-gray-400">左側からテーマを選択してください</p>
          </div>
        )}
      </div>
    </div>
  );
}