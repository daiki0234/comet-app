// 以前お渡ししたコードと同じですが、念のため再掲します
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { UserData } from '@/types/billing';

export default function EditRecordPage({ params }: { params: { userId: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const monthStr = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const userId = params.userId;

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  
  type EditRecord = {
    docId?: string;
    date: string;
    usageStatus: '放課後' | '休校日' | '欠席' | '';
    arrivalTime: string;
    departureTime: string;
  };
  const [records, setRecords] = useState<Record<string, EditRecord>>({});

  const [year, m] = monthStr.split('-');
  const daysInMonth = new Date(Number(year), Number(m), 0).getDate();
  const dateList = Array.from({ length: 31 }, (_, i) => i + 1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', userId));
        if (!userSnap.exists()) { toast.error("利用者不明"); router.back(); return; }
        setUser({ id: userSnap.id, ...userSnap.data() } as UserData);

        const q = query(collection(db, 'attendanceRecords'), where('userId', '==', userId), where('month', '==', monthStr));
        const snap = await getDocs(q);
        const recMap: Record<string, EditRecord> = {};
        snap.forEach(d => {
          const data = d.data();
          recMap[data.date] = {
            docId: d.id, date: data.date, usageStatus: data.usageStatus || '',
            arrivalTime: data.arrivalTime || '', departureTime: data.departureTime || '',
          };
        });
        setRecords(recMap);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    fetchData();
  }, [userId, monthStr]);

  const handleChange = (date: string, field: keyof EditRecord, value: string) => {
    setRecords(prev => ({
      ...prev,
      [date]: { ...prev[date], date, [field]: value }
    }));
  };

  const handleSave = async () => {
    const toastId = toast.loading("保存中...");
    try {
      const promises = Object.values(records).map(async (rec) => {
        if (!rec.usageStatus && !rec.arrivalTime && !rec.departureTime) return;
        if (rec.docId) {
          await updateDoc(doc(db, 'attendanceRecords', rec.docId), {
            usageStatus: rec.usageStatus, arrivalTime: rec.arrivalTime, departureTime: rec.departureTime, updatedAt: new Date()
          });
        } else {
          const newId = `${rec.date}_${userId}`;
          await setDoc(doc(db, 'attendanceRecords', newId), {
            userId, date: rec.date, month: monthStr, usageStatus: rec.usageStatus,
            arrivalTime: rec.arrivalTime, departureTime: rec.departureTime, createdAt: new Date()
          }, { merge: true });
        }
      });
      await Promise.all(promises);
      toast.success("保存しました", { id: toastId });
      router.back();
    } catch (e) { toast.error("保存失敗", { id: toastId }); }
  };

  if (loading || !user) return <div className="p-8 text-center">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <div className="bg-white border-b sticky top-0 z-20 px-4 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-black">&larr; 戻る</button>
          <h1 className="font-bold text-lg">{user.lastName} {user.firstName} さんの実績修正</h1>
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-bold">{year}年{m}月</span>
        </div>
        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold shadow">保存して戻る</button>
      </div>
      <div className="max-w-[210mm] mx-auto mt-8 bg-white shadow-lg p-8">
         <div className="text-center font-bold border-b-2 border-black mb-4 pb-2">放課後等デイサービス提供実績記録票（編集モード）</div>
         <div className="grid grid-cols-2 gap-4 text-xs mb-4">
            <div className="border p-2">受給者証番号: <span className="font-mono font-bold text-base ml-2">{user.jukyushaNo}</span></div>
            <div className="border p-2">児童氏名: <span className="font-bold text-base ml-2">{user.lastName} {user.firstName}</span></div>
         </div>
         <table className="w-full border-collapse border border-black text-sm">
            <thead>
               <tr className="bg-gray-100">
                  <th className="border border-black p-1 w-12">日付</th>
                  <th className="border border-black p-1 w-10">曜</th>
                  <th className="border border-black p-1">サービス提供の状況</th>
                  <th className="border border-black p-1 w-24">開始時間</th>
                  <th className="border border-black p-1 w-24">終了時間</th>
               </tr>
            </thead>
            <tbody>
               {dateList.map(day => {
                  if (day > daysInMonth) return null;
                  const dateStr = `${year}-${m}-${String(day).padStart(2, '0')}`;
                  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(Number(year), Number(m)-1, day).getDay()];
                  const rec = records[dateStr] || {};
                  const isSun = wd === '日';
                  return (
                     <tr key={day} className="hover:bg-blue-50">
                        <td className="border border-black text-center py-1">{day}</td>
                        <td className={`border border-black text-center font-bold ${isSun ? 'text-red-600' : ''}`}>{wd}</td>
                        <td className="border border-black p-1">
                           <select value={rec.usageStatus || ''} onChange={(e) => handleChange(dateStr, 'usageStatus', e.target.value as any)} className="w-full border-none bg-transparent outline-none cursor-pointer focus:ring-2 focus:ring-blue-400 rounded">
                              <option value="">-</option>
                              <option value="放課後">授業終了後</option>
                              <option value="休校日">休業日</option>
                              <option value="欠席">欠席時対応</option>
                           </select>
                        </td>
                        <td className="border border-black p-1 text-center"><input type="time" value={rec.arrivalTime || ''} onChange={(e) => handleChange(dateStr, 'arrivalTime', e.target.value)} className="w-full text-center outline-none focus:bg-yellow-50" /></td>
                        <td className="border border-black p-1 text-center"><input type="time" value={rec.departureTime || ''} onChange={(e) => handleChange(dateStr, 'departureTime', e.target.value)} className="w-full text-center outline-none focus:bg-yellow-50" /></td>
                     </tr>
                  );
               })}
            </tbody>
         </table>
      </div>
    </div>
  );
}