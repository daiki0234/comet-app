"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { UserData } from '@/types/billing';
import { CaseMeeting, CaseMeetingDetail } from '@/types/caseMeeting';
import { CaseMeetingPDFDownloadButton } from '@/components/pdf/CaseMeetingPDFDownloadButton'; // ★追加

interface StaffData {
  id: string;
  name: string;
}

export default function EditCaseMeetingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [users, setUsers] = useState<UserData[]>([]);
  const [staffList, setStaffList] = useState<StaffData[]>([]);

  const [date, setDate] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [rows, setRows] = useState<CaseMeetingDetail[]>([]);

  const [activeSearchRow, setActiveSearchRow] = useState<number | null>(null);

  // 初期データ取得
  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        // マスタ取得
        const [uSnap, aSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'admins'))
        ]);
        setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
        setStaffList(aSnap.docs.map(d => ({ id: d.id, name: d.data().name } as StaffData)));

        // 会議データ取得
        const docRef = doc(db, 'caseMeetings', params.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.error("データが見つかりません");
          router.push('/support/case-meetings');
          return;
        }

        const data = docSnap.data() as CaseMeeting;
        setDate(data.date);
        setSelectedStaffIds(data.staffIds || []);
        setRows(data.details || [{ userId: '', userName: '', content: '' }]);

      } catch (e) {
        console.error(e);
        toast.error("読み込みエラー");
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, [params.id, router]);

  const toggleStaff = (id: string) => {
    setSelectedStaffIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const addRow = () => {
    setRows([...rows, { userId: '', userName: '', content: '' }]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    const newRows = [...rows];
    newRows.splice(index, 1);
    setRows(newRows);
  };

  const updateRow = (index: number, field: keyof CaseMeetingDetail, value: string) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const selectUserForRow = (index: number, user: UserData) => {
    const newRows = [...rows];
    newRows[index].userId = user.id;
    newRows[index].userName = `${user.lastName} ${user.firstName}`;
    setRows(newRows);
    setActiveSearchRow(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStaffIds.length === 0) return toast.error("参加者を選択してください");
    
    const validRows = rows.filter(r => r.userId && r.content);
    if (validRows.length === 0) return toast.error("少なくとも1名の利用者と内容を入力してください");

    try {
      setSubmitting(true);
      
      const selectedStaffNames = staffList
        .filter(s => selectedStaffIds.includes(s.id))
        .map(s => s.name);

      await updateDoc(doc(db, 'caseMeetings', params.id), {
        date,
        staffIds: selectedStaffIds,
        staffNames: selectedStaffNames,
        details: validRows,
        updatedAt: serverTimestamp(),
      });

      toast.success("更新しました");
      router.push('/support/case-meetings');
    } catch (e) {
      console.error(e);
      toast.error("更新に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  // ★PDF用データ生成
  const meetingDataForPDF: CaseMeeting = {
    date,
    staffIds: selectedStaffIds,
    staffNames: staffList.filter(s => selectedStaffIds.includes(s.id)).map(s => s.name),
    details: rows.filter(r => r.userId && r.content)
  };

  if (loading) return <AppLayout pageTitle="読み込み中..."><div className="p-8 text-center">データを取得しています...</div></AppLayout>;

  return (
    <AppLayout pageTitle="ケース担当者会議 編集">
      <form onSubmit={handleUpdate} className="space-y-8 pb-20">
        
        {/* 会議情報 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-700 border-l-4 border-blue-500 pl-2 mb-4">会議概要</h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">会議実施日</label>
              <input 
                type="date" 
                required 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                className="w-full md:w-1/3 border p-2 rounded" 
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">参加者 (複数選択可)</label>
              <div className="flex flex-wrap gap-3">
                {staffList.map(staff => (
                  <label key={staff.id} className={`cursor-pointer px-4 py-2 rounded-full border text-sm transition-colors ${
                    selectedStaffIds.includes(staff.id) 
                      ? 'bg-blue-100 border-blue-500 text-blue-800 font-bold' 
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={selectedStaffIds.includes(staff.id)}
                      onChange={() => toggleStaff(staff.id)}
                    />
                    {staff.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 議事録詳細 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-700 border-l-4 border-green-500 pl-2">検討内容詳細</h3>
            <button 
              type="button"
              onClick={addRow}
              className="text-sm bg-green-50 text-green-700 px-3 py-1 rounded border border-green-200 hover:bg-green-100 font-bold"
            >
              ＋ 行を追加
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-3 border-b min-w-[200px]">利用者</th>
                  <th className="p-3 border-b w-full">変更内容・検討事項</th>
                  <th className="p-3 border-b w-[60px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td className="p-3 align-top">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="名前で検索..."
                          value={row.userName}
                          onChange={(e) => updateRow(index, 'userName', e.target.value)}
                          onFocus={() => setActiveSearchRow(index)}
                          className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                        />
                        {activeSearchRow === index && (
                          <div className="absolute z-10 w-full bg-white border shadow-lg max-h-40 overflow-y-auto mt-1 rounded">
                            {users
                              .filter(u => `${u.lastName} ${u.firstName}`.includes(row.userName))
                              .map(u => (
                                <div 
                                  key={u.id} 
                                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                                  onMouseDown={(e) => { e.preventDefault(); selectUserForRow(index, u); }}
                                >
                                  {u.lastName} {u.firstName}
                                </div>
                              ))
                            }
                            <div className="fixed inset-0 z-[-1]" onClick={() => setActiveSearchRow(null)} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      <textarea
                        value={row.content}
                        onChange={(e) => updateRow(index, 'content', e.target.value)}
                        placeholder="内容を入力してください"
                        className="w-full border p-2 rounded text-sm h-24 focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                      />
                    </td>
                    <td className="p-3 align-top text-center">
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="text-red-400 hover:text-red-600 p-1"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 flex justify-end gap-4 z-20 shadow-lg">
           
           {/* ★追加: PDFボタン */}
           <CaseMeetingPDFDownloadButton meeting={meetingDataForPDF} />

           <button type="button" onClick={() => router.back()} className="px-6 py-2 bg-gray-100 rounded hover:bg-gray-200 font-bold text-gray-600">キャンセル</button>
           <button type="submit" disabled={submitting} className="px-8 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-md disabled:bg-gray-400">
             {submitting ? '保存中...' : '保存する'}
           </button>
        </div>

      </form>
    </AppLayout>
  );
}