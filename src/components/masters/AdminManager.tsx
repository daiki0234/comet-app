"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

// ★修正: Roleにguestを追加
type Role = "admin" | "user" | "guest";
type JobTitle = "" | "child_dev_manager" | "facility_manager";

interface AdminUser {
  id: string;
  name: string;
  role: Role;
  jobTitle?: JobTitle;
  isEnrolled?: boolean;
  updatedAt: any;
}

export default function AdminManager() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('user'); // デフォルト
  const [jobTitle, setJobTitle] = useState<JobTitle>('');
  const [isEnrolled, setIsEnrolled] = useState(true);
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
          jobTitle: dData.jobTitle || '',
          isEnrolled: dData.isEnrolled !== undefined ? dData.isEnrolled : true
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

  const resetForm = () => { 
    setEditId(null); 
    setEmail(''); 
    setName(''); 
    setRole('user'); 
    setJobTitle('');
    setIsEnrolled(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return alert('必須項目を入力してください');
    
    const docId = editId || email; 

    try {
      await setDoc(doc(db, 'admins', docId), {
        name, 
        role,
        jobTitle,
        isEnrolled,
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

  const handleDelete = async (id: string) => {
    if (!confirm(`本当に削除しますか？\n対象: ${id}`)) return;
    try {
      await deleteDoc(doc(db, 'admins', id));
      fetchData();
    } catch (err) {
      alert('削除に失敗しました');
    }
  };

  const handleEdit = (item: AdminUser) => {
    setEditId(item.id); 
    setEmail(item.id); 
    setName(item.name); 
    setRole(item.role);
    setJobTitle(item.jobTitle || '');
    setIsEnrolled(item.isEnrolled !== false);
  };

  const getJobTitleLabel = (key: string | undefined) => {
    if (key === 'child_dev_manager') return '児発管';
    if (key === 'facility_manager') return '施設長';
    return null;
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      {/* フォーム部分 */}
      <form onSubmit={handleSave} className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-gray-800">
          {editId ? '職員情報の編集' : '新規職員の登録'}
        </h3>
        {/* ...Email, Name入力欄は変更なし... */}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">システム権限</label>
            <select 
              value={role} 
              onChange={e=>setRole(e.target.value as Role)} 
              className="w-full p-2 border border-gray-300 rounded-md bg-white"
            >
              <option value="user">一般ユーザー</option>
              <option value="admin">管理者</option>
              {/* ★追加: ゲスト選択肢 */}
              <option value="guest">ゲスト (機能制限あり)</option>
            </select>
          </div>
          {/* ...役職設定(変更なし)... */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">役職・資格</label>
            <div className="flex flex-col gap-2">
               <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="jobTitle" value="" checked={jobTitle === ''} onChange={() => setJobTitle('')} className="w-4 h-4 text-blue-600"/>
                <span className="text-sm">指定なし</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="jobTitle" value="child_dev_manager" checked={jobTitle === 'child_dev_manager'} onChange={() => setJobTitle('child_dev_manager')} className="w-4 h-4 text-blue-600"/>
                <span className="text-sm font-bold text-orange-600">児童発達支援管理責任者</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="jobTitle" value="facility_manager" checked={jobTitle === 'facility_manager'} onChange={() => setJobTitle('facility_manager')} className="w-4 h-4 text-blue-600"/>
                <span className="text-sm font-bold text-green-600">施設長</span>
              </label>
            </div>
          </div>
        </div>

        {/* ...シフト設定(変更なし)... */}
        <div className="mb-4 pt-4 border-t border-gray-100">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isEnrolled} onChange={(e) => setIsEnrolled(e.target.checked)} className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
            <span className="text-sm font-bold text-gray-700 select-none">シフト管理・運営管理画面に表示する（在籍）</span>
          </label>
        </div>

        <div className="flex justify-end gap-3 mt-4 border-t pt-4">
          <button type="button" onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg">クリア</button>
          <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-bold">{editId ? '更新する' : '登録する'}</button>
        </div>
      </form>

      {/* 一覧リスト */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          {/* ...ヘッダー省略... */}
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名 / Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">役職・資格</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">システム権限</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">シフト表示</th>
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
                    {/* ...役職ラベル(変更なし)... */}
                    {jobLabel ? (
                      <span className={`px-2 py-1 rounded-md text-xs font-bold border ${it.jobTitle === 'child_dev_manager' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{jobLabel}</span>
                    ) : <span className="text-gray-400 text-xs">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {/* ★修正: 権限表示の分岐を追加 */}
                    {it.role === 'admin' && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">管理者</span>}
                    {it.role === 'user' && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">一般</span>}
                    {it.role === 'guest' && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">ゲスト</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                     {it.isEnrolled !== false ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">表示中</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">非表示</span>
                    )}
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
        {items.length === 0 && !loading && <div className="p-4 text-center text-gray-500">データがありません</div>}
      </div>
    </div>
  );
}