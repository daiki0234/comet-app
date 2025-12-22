"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

// ロールの型定義
type Role = "admin" | "user";

// ★追加: 役職の型定義
type JobTitle = "" | "child_dev_manager" | "facility_manager";

// データ型定義
interface AdminUser {
  id: string; // Email
  name: string;
  role: Role;
  jobTitle?: JobTitle; // ★追加
  updatedAt: any;
}

export default function AdminManager() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  // フォーム用
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [jobTitle, setJobTitle] = useState<JobTitle>(''); // ★追加
  const [editId, setEditId] = useState<string | null>(null);

  // データ取得
  const fetchData = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'admins'));
      const data = snapshot.docs.map(d => {
        const dData = d.data();
        return { 
          id: d.id, 
          name: dData.name,
          role: dData.role,
          updatedAt: dData.updatedAt,
          jobTitle: dData.jobTitle || '' // ★既存データに無い場合の対応
        } as AdminUser;
      });
      setItems(data);
    } catch (error) {
      console.error("取得エラー:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // リセット
  const resetForm = () => { 
    setEditId(null); 
    setEmail(''); 
    setName(''); 
    setRole('user'); 
    setJobTitle(''); // ★追加
  };

  // 保存 (新規・更新)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return alert('必須項目を入力してください');
    
    const docId = editId || email; 

    try {
      await setDoc(doc(db, 'admins', docId), {
        name, 
        role,
        jobTitle, // ★追加
        updatedAt: new Date() 
      }, { merge: true });
      
      resetForm(); 
      fetchData();
      alert('保存しました');
    } catch (err) { 
      console.error(err);
      alert('保存に失敗しました'); 
    }
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm(`本当に削除しますか？\n対象: ${id}\n\n※このユーザーはログインできなくなります。`)) return;
    try {
      await deleteDoc(doc(db, 'admins', id));
      fetchData();
    } catch (err) {
      alert('削除に失敗しました');
    }
  };

  // 編集モードへ
  const handleEdit = (item: AdminUser) => {
    setEditId(item.id); 
    setEmail(item.id); 
    setName(item.name); 
    setRole(item.role);
    setJobTitle(item.jobTitle || ''); // ★追加
  };

  // ★追加: 役職ラベル表示ヘルパー
  const getJobTitleLabel = (key: string | undefined) => {
    if (key === 'child_dev_manager') return '児発管'; // 略称で表示
    if (key === 'facility_manager') return '施設長';
    return null;
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      {/* 登録フォーム */}
      <form onSubmit={handleSave} className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-gray-800">
          {editId ? '職員情報の編集' : '新規職員の登録'}
        </h3>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Googleメールアドレス (ID)</label>
          <input 
            type="email" 
            value={email} 
            onChange={e=>setEmail(e.target.value)} 
            disabled={!!editId} 
            className={`w-full p-2 border rounded-md ${editId ? 'bg-gray-100 text-gray-500' : 'bg-white border-gray-300'}`}
            placeholder="staff@kantsu.com"
            required 
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">氏名</label>
          <input 
            type="text" 
            value={name} 
            onChange={e=>setName(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-md" 
            required 
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* 権限設定 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">システム権限</label>
            <select 
              value={role} 
              onChange={e=>setRole(e.target.value as Role)} 
              className="w-full p-2 border border-gray-300 rounded-md bg-white"
            >
              <option value="user">一般ユーザー</option>
              <option value="admin">管理者</option>
            </select>
          </div>

          {/* ★追加: 役職設定 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">役職・資格</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="jobTitle" 
                  value="" 
                  checked={jobTitle === ''} 
                  onChange={() => setJobTitle('')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">指定なし</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="jobTitle" 
                  value="child_dev_manager" 
                  checked={jobTitle === 'child_dev_manager'} 
                  onChange={() => setJobTitle('child_dev_manager')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-bold text-orange-600">児童発達支援管理責任者</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="jobTitle" 
                  value="facility_manager" 
                  checked={jobTitle === 'facility_manager'} 
                  onChange={() => setJobTitle('facility_manager')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-bold text-green-600">施設長</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4 border-t pt-4">
          <button type="button" onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg">
            クリア
          </button>
          <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-bold">
            {editId ? '更新する' : '登録する'}
          </button>
        </div>
      </form>

      {/* 一覧リスト */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名 / Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">役職・資格</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">システム権限</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map(it => {
              const jobLabel = getJobTitleLabel(it.jobTitle);
              return (
                <tr key={it.id}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-bold text-gray-900">{it.name}</div>
                    <div className="text-xs text-gray-500">{it.id}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {/* ★追加: 役職表示 */}
                    {jobLabel ? (
                      <span className={`px-2 py-1 rounded-md text-xs font-bold border ${
                        it.jobTitle === 'child_dev_manager' 
                          ? 'bg-orange-50 text-orange-700 border-orange-200' 
                          : 'bg-green-50 text-green-700 border-green-200'
                      }`}>
                        {jobLabel}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${it.role==='admin'?'bg-purple-100 text-purple-800':'bg-gray-100 text-gray-800'}`}>
                      {it.role === 'admin' ? '管理者' : '一般'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm space-x-2">
                    <button onClick={()=>handleEdit(it)} className="text-blue-600 hover:text-blue-900 font-medium">編集</button>
                    <button onClick={()=>handleDelete(it.id)} className="text-red-600 hover:text-red-900 font-medium">削除</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && !loading && (
          <div className="p-4 text-center text-gray-500">データがありません</div>
        )}
      </div>
    </div>
  );
}