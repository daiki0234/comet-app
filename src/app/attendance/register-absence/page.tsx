"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';
import toast from 'react-hot-toast';

type User = { id: string; lastName: string; firstName: string; };

const toDateString = (date: Date) => date.toISOString().split('T')[0];

export default function RegisterAbsencePage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [absentUserId, setAbsentUserId] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [absenceDate, setAbsenceDate] = useState(toDateString(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      setUsers(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[]);
    };
    fetchUsers();
  }, []);

  const handleAddAbsence = async () => {
    if (!absentUserId) { return toast.error('利用者を選択してください。'); }
    const user = users.find(u => u.id === absentUserId);
    if (!user) return;
    
    setIsSubmitting(true);
    const loadingToast = toast.loading('欠席情報を登録中です...');

    try {
      const targetMonth = absenceDate.substring(0, 7);
      const absenceQuery = query(collection(db, "attendanceRecords"), where("userId", "==", absentUserId), where("month", "==", targetMonth), where("usageStatus", "==", "欠席"));
      const absenceSnapshot = await getDocs(absenceQuery);
      const absenceCount = absenceSnapshot.size;

      if (absenceCount >= 4) {
        throw new Error(`${user.lastName} ${user.firstName}さんは、この月の欠席回数が上限の4回に達しています。`);
      }

      const q = query(collection(db, "attendanceRecords"), where("userId", "==", absentUserId), where("date", "==", absenceDate));
      const existingSnapshot = await getDocs(q);
      if (!existingSnapshot.empty) {
        throw new Error(`${absenceDate} に ${user.lastName} ${user.firstName} さんの記録は既にあります。`);
      }

      const newAbsenceCount = absenceCount + 1;
      const notesWithCount = `[欠席(${newAbsenceCount})] ${absenceReason}`;
      await addDoc(collection(db, "attendanceRecords"), {
        userId: user.id,
        userName: `${user.lastName} ${user.firstName}`,
        date: absenceDate,
        month: targetMonth,
        usageStatus: '欠席',
        notes: notesWithCount,
      });
      
      toast.success(`${absenceDate} に ${user.lastName} ${user.firstName} さんを欠席として登録しました。`, { id: loadingToast });
      setAbsentUserId('');
      setAbsenceReason('');
    } catch (error: any) {
      toast.error(error.message, { id: loadingToast });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout pageTitle="別日の欠席登録">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 max-w-2xl mx-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-1">欠席登録</h3>
        <p className="text-sm text-gray-500 mb-6">先日付の欠席連絡などを登録します。</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">日付</label>
            <input type="date" value={absenceDate} onChange={(e) => setAbsenceDate(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">利用者</label>
            <select value={absentUserId} onChange={(e) => setAbsentUserId(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm">
              <option value="">選択してください</option>
              {users.map(user => <option key={user.id} value={user.id}>{user.lastName} {user.firstName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">欠席理由</label>
            <input type="text" value={absenceReason} onChange={(e) => setAbsenceReason(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"/>
          </div>
          <div className="pt-4 flex justify-end">
            <button 
              onClick={handleAddAbsence}
              disabled={isSubmitting}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:bg-gray-400">
              {isSubmitting ? '登録中...' : '登録'}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}