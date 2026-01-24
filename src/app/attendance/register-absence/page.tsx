"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { useAutoRecord } from '@/hooks/useAutoRecord';

type User = { id: string; lastName: string; firstName: string; };

// ★追加: スタッフ型定義
type Staff = { id: string; name: string; };

const toDateString = (date: Date) => date.toISOString().split('T')[0];

const determineAbsenceCategory = (text: string): string => {
  if (!text) return 'その他';
    if (text.includes('体調不良') || text.includes('熱') || text.includes('頭痛') || text.includes('風邪') || text.includes('痛')  || text.includes('インフル') || text.includes('病院')) return '体調不良';
  else if (text.includes('用事') || text.includes('親戚') || text.includes('家族') || text.includes('家庭') || text.includes('私用')) return '私用';
  else if (text.includes('クラブ') || text.includes('大会') || text.includes('練習試合') || text.includes('運動会') || text.includes('部活')) return '学校行事';
  else return 'その他';
};

export default function RegisterAbsencePage() {
  const router = useRouter();
  const { currentUser, isGuest } = useAuth(); // ★追加: isGuest
  const { createRecord } = useAutoRecord();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // フォーム用State
  const [absentUserId, setAbsentUserId] = useState('');
  const [absenceDate, setAbsenceDate] = useState(toDateString(new Date()));
  const [notes, setNotes] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 検索用State
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // 欠席回数管理用State (Key: userId, Value: 回数)
  const [absenceCounts, setAbsenceCounts] = useState<Record<string, number>>({});

  // ★追加: スタッフ選択用
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  // ★追加: ゲストの場合、スタッフリストを取得
  useEffect(() => {
    const fetchStaff = async () => {
      if (!isGuest) return;
      try {
        const q = query(collection(db, 'admins'));
        const snap = await getDocs(q);
        const staffs = snap.docs
          .map(d => {
            const data = d.data();
            return { id: d.id, name: data.name, isEnrolled: data.isEnrolled };
          })
          .filter((s: any) => s.isEnrolled !== false)
          .map((s: any) => ({ id: s.id, name: s.name } as Staff));
        
        setStaffList(staffs);
      } catch (e) {
        console.error("スタッフ取得エラー", e);
      }
    };
    fetchStaff();
  }, [isGuest]);

  // 1. ユーザー一覧取得
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, 'users'), orderBy('lastName'));
        const usersSnapshot = await getDocs(q);
        setUsers(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[]);
      } catch (e) {
        console.error(e);
        toast.error("利用者情報の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  // 2. 日付が変わったら、その月の欠席回数を全ユーザー分集計する
  useEffect(() => {
    const fetchMonthlyAbsences = async () => {
      if (!absenceDate) return;
      try {
        const targetMonth = absenceDate.substring(0, 7); // "YYYY-MM"
        
        const q = query(
          collection(db, 'attendanceRecords'),
          where('month', '==', targetMonth),
          where('usageStatus', '==', '欠席')
        );
        const snapshot = await getDocs(q);

        const counts: Record<string, number> = {};
        snapshot.docs.forEach(doc => {
          const uid = doc.data().userId;
          counts[uid] = (counts[uid] || 0) + 1;
        });
        
        setAbsenceCounts(counts);
      } catch (e) {
        console.error("欠席回数の取得に失敗", e);
      }
    };

    fetchMonthlyAbsences();
  }, [absenceDate]);

  // 検索ロジック
  const searchMatchedUsers = useMemo(() => {
    const queryText = userSearchQuery.trim();
    if (!queryText) return [];
    
    const lowerQuery = queryText.toLowerCase();
    return users.filter(user => {
      const fullName = `${user.lastName || ''}${user.firstName || ''}`;
      return fullName.toLowerCase().includes(lowerQuery);
    });
  }, [userSearchQuery, users]);

  // AI生成関数
  const generateAndSaveAdvice = async (docId: string, userId: string, date: string, notes: string) => {
    const aiToast = toast.loading('AIが相談内容を自動生成中...');
    try {
      const res = await fetch('/api/absence/generate-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, date, currentNote: notes })
      });
      const data = await res.json();
      if (data.advice) {
        const docRef = doc(db, 'attendanceRecords', docId);
        await updateDoc(docRef, { aiAdvice: data.advice });
        toast.success('AI相談内容を保存しました', { id: aiToast });
      } else {
        toast.dismiss(aiToast);
      }
    } catch (e) {
      console.error("AI Generation Error:", e);
      toast.error('AI生成に失敗しました（後で一括作成できます）', { id: aiToast });
    }
  };

  const handleAddAbsence = async () => {
    if (!absentUserId) { return toast.error('利用者を選択してください。'); }
    
    // ★追加: ゲストの場合の担当者チェック & 名前決定
    let staffName = currentUser?.displayName || '担当者';
    if (isGuest) {
      if (!selectedStaffId) {
        return toast.error('担当職員を選択してください。');
      }
      const staff = staffList.find(s => s.id === selectedStaffId);
      if (staff) {
        staffName = staff.name; // 選択された名前で上書き
      }
    }

    const user = users.find(u => u.id === absentUserId);
    if (!user) return;
    
    setIsSubmitting(true);
    const loadingToast = toast.loading('欠席情報を登録中です...');

    try {
      const targetMonth = absenceDate.substring(0, 7);
      
      // 1. 回数制限チェック
      const absenceQuery = query(
        collection(db, "attendanceRecords"), 
        where("userId", "==", absentUserId), 
        where("month", "==", targetMonth), 
        where("usageStatus", "==", "欠席")
      );
      const absenceSnapshot = await getDocs(absenceQuery);
      
      if (absenceSnapshot.size >= 4) {
        throw new Error(`${user.lastName} ${user.firstName}さんは、この月の欠席回数が上限の4回に達しています。`);
      }

      // 2. 重複チェック
      const q = query(
        collection(db, "attendanceRecords"), 
        where("userId", "==", absentUserId), 
        where("date", "==", absenceDate)
      );
      const existingSnapshot = await getDocs(q);
      if (!existingSnapshot.empty) {
        throw new Error(`${absenceDate} に ${user.lastName} ${user.firstName} さんの記録は既にあります。`);
      }

      // 連絡内容から理由を自動判定
      const autoReason = determineAbsenceCategory(notes);

      // 3. 保存 (実績記録票)
      const docRef = await addDoc(collection(db, "attendanceRecords"), {
        userId: user.id,
        userName: `${user.lastName} ${user.firstName}`,
        date: absenceDate,
        month: targetMonth,
        usageStatus: '欠席',
        reason: autoReason, 
        notes: notes,
        staffName: staffName, // ★変更: 決定した担当者名を保存
        createdAt: new Date(),
        // 必要なら recordedBy: staffName としても良いですが、既存が staffName を使っているようなのでそれに合わせました
      });
      
      // ★★★ 追加: 支援記録の自動生成 ★★★
      await createRecord({
        date: absenceDate,
        userId: user.id,
        userName: `${user.lastName} ${user.firstName}`,
        status: '欠席',
        absenceReason: notes,
      });

      toast.success(`${absenceDate} に ${user.lastName} ${user.firstName} さんを欠席登録しました。`, { id: loadingToast });
      
      // AI生成を開始
      generateAndSaveAdvice(docRef.id, user.id, absenceDate, notes);

      // State更新
      setAbsenceCounts(prev => ({
        ...prev,
        [user.id]: (prev[user.id] || 0) + 1
      }));

      // フォームリセット
      setAbsentUserId('');
      setUserSearchQuery('');
      setNotes('');
      setSelectedStaffId(''); // ★追加: リセット
      
    } catch (error: any) {
      toast.error(error.message, { id: loadingToast });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <AppLayout pageTitle="別日の欠席登録"><div className="p-8 text-center">読み込み中...</div></AppLayout>;

  return (
    <AppLayout pageTitle="別日の欠席登録">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 max-w-2xl mx-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-1">欠席登録</h3>
        <p className="text-sm text-gray-500 mb-6">先日付の欠席連絡などを登録します。</p>
        
        <div className="space-y-5">
          {/* ★追加: ゲスト用 担当職員プルダウン */}
          {isGuest && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                担当職員 <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-blue-50"
              >
                <option value="">担当者を選択してください</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 日付 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">日付 <span className="text-red-500">*</span></label>
            <input 
              type="date" 
              value={absenceDate} 
              onChange={(e) => setAbsenceDate(e.target.value)} 
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
            />
          </div>

          {/* 利用者 (検索式 + 回数表示) */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">利用者 <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder={users.length > 0 ? "氏名を入力して検索..." : "読み込み中..."}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                disabled={!!absentUserId}
              />
              
              {!absentUserId && userSearchQuery && searchMatchedUsers.length > 0 && (
                <ul className="absolute top-full left-0 z-10 w-full max-h-60 overflow-y-auto bg-white border border-blue-400 rounded-md shadow-lg mt-1">
                  {searchMatchedUsers.map(user => {
                    const count = absenceCounts[user.id] || 0; 
                    return (
                      <li
                        key={user.id}
                        onClick={() => {
                          setAbsentUserId(user.id);
                          setUserSearchQuery('');
                        }}
                        className="p-3 cursor-pointer hover:bg-blue-100 text-sm border-b last:border-b-0 flex justify-between items-center"
                      >
                        <span className="font-medium text-gray-800">
                          {user.lastName} {user.firstName}
                        </span>
                        <span className={`font-bold ${count >= 4 ? 'text-red-600' : 'text-red-500'}`}>
                          欠席: {count}回
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {absentUserId && (
              <div className="mt-2 flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-200">
                <span className="text-blue-700 font-bold">
                  選択中: {users.find(u => u.id === absentUserId)?.lastName} {users.find(u => u.id === absentUserId)?.firstName}
                  <span className="ml-2 text-sm text-red-500">
                    (今月欠席: {absenceCounts[absentUserId] || 0}回)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAbsentUserId('');
                    setUserSearchQuery('');
                  }}
                  className="text-sm text-gray-500 hover:text-red-500 underline"
                >
                  解除
                </button>
              </div>
            )}
          </div>

          {/* 詳細メモ */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">連絡の内容 <span className="text-red-500">*</span></label>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              placeholder="例：当日母より「熱があるので休みます」"
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
            <p className="text-xs text-gray-400 mt-1">※内容から「体調不良」「私用」などの分類が自動で記録されます。</p>
          </div>

          {/* 登録ボタン */}
          <div className="pt-4 text-center">
            <button 
              onClick={handleAddAbsence}
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md active:scale-95 disabled:bg-gray-400"
            >
              {isSubmitting ? '登録中...' : '登録する'}
            </button>
            
            {/* ゲストかどうかで注釈を出し分ける */}
            <p className="text-xs text-gray-400 mt-2">
              {isGuest 
                ? '※ゲストアカウントで操作中のため、担当者の選択が必須です' 
                : `※登録者（${currentUser?.displayName || 'あなた'}）が担当者として記録されます`}
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}