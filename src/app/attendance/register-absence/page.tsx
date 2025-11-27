"use client";

import React, { useState, useEffect ,useMemo} from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

type User = { id: string; lastName: string; firstName: string; };

const toDateString = (date: Date) => date.toISOString().split('T')[0];

// ★ 追加: 欠席理由の自動判定ロジック
const determineAbsenceCategory = (text: string): string => {
  if (!text) return 'その他';
  if (text.includes('体調不良') || text.includes('熱') || text.includes('頭痛') || text.includes('風邪') || text.includes('痛')  || text.includes('インフル') || text.includes('病院')) return '体調不良';
  else if (text.includes('用事') || text.includes('親戚') || text.includes('家族') || text.includes('家庭') || text.includes('私用')) return '私用';
  else if (text.includes('クラブ') || text.includes('大会') || text.includes('練習試合') || text.includes('運動会') || text.includes('部活')) return '学校行事';
  else return 'その他';
};

export default function RegisterAbsencePage() {
  const router = useRouter();
  const { currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // フォーム用State
  const [absentUserId, setAbsentUserId] = useState('');
  const [absenceDate, setAbsenceDate] = useState(toDateString(new Date()));
  const [notes, setNotes] = useState('');   // 詳細メモ（これだけ入力してもらう）
  // ※ reason（手動入力）は削除しました
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ★★★ 追加: 検索用State ★★★
  const [userSearchQuery, setUserSearchQuery] = useState('');

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

  // ★★★ 追加: 検索ロジック ★★★
  const searchMatchedUsers = useMemo(() => {
    const queryText = userSearchQuery.trim();
    if (!queryText) return []; // 未入力時は候補を出さない
    
    const lowerQuery = queryText.toLowerCase();
    return users.filter(user => {
      const fullName = `${user.lastName || ''}${user.firstName || ''}`;
      return fullName.toLowerCase().includes(lowerQuery);
    });
  }, [userSearchQuery, users]);

  const handleAddAbsence = async () => {
    if (!absentUserId) { return toast.error('利用者を選択してください。'); }
    const user = users.find(u => u.id === absentUserId);
    if (!user) return;
    
    setIsSubmitting(true);
    const loadingToast = toast.loading('欠席情報を登録中です...');

    try {
      const targetMonth = absenceDate.substring(0, 7);
      
      // 1. 回数制限チェック (4回まで)
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

      // ★ 連絡内容から理由を自動判定
      const autoReason = determineAbsenceCategory(notes);

      // 3. 保存
      await addDoc(collection(db, "attendanceRecords"), {
        userId: user.id,
        userName: `${user.lastName} ${user.firstName}`,
        date: absenceDate,
        month: targetMonth,
        usageStatus: '欠席',
        
        reason: autoReason, // ★ 自動判定した値を保存
        notes: notes,
        staffName: currentUser?.displayName || '担当者',
        
        createdAt: new Date(),
      });
      
      toast.success(`${absenceDate} に ${user.lastName} ${user.firstName} さんを欠席登録しました。`, { id: loadingToast });
      
      // フォームリセット
      setAbsentUserId('');
      setNotes('');
      // setReason('') は削除済み
      
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

          {/* 利用者 (検索式に変更) */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">利用者 <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder={users.length > 0 ? "氏名を入力して検索..." : "読み込み中..."}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                disabled={!!absentUserId} // 選択済みなら入力不可にする
              />
              
              {/* 候補リスト */}
              {!absentUserId && userSearchQuery && searchMatchedUsers.length > 0 && (
                <ul className="absolute top-full left-0 z-10 w-full max-h-60 overflow-y-auto bg-white border border-blue-400 rounded-md shadow-lg mt-1">
                  {searchMatchedUsers.map(user => (
                    <li
                      key={user.id}
                      onClick={() => {
                        setAbsentUserId(user.id);
                        setUserSearchQuery(''); // 入力をクリア
                      }}
                      className="p-3 cursor-pointer hover:bg-blue-100 text-sm border-b last:border-b-0"
                    >
                      {user.lastName} {user.firstName}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 選択中の表示 & 解除ボタン */}
            {absentUserId && (
              <div className="mt-2 flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-200">
                <span className="text-blue-700 font-bold">
                  選択中: {users.find(u => u.id === absentUserId)?.lastName} {users.find(u => u.id === absentUserId)?.firstName}
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

          {/* ★ 手動の「欠席理由」入力欄を削除しました ★ */}

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
            <p className="text-xs text-gray-400 mt-2">
              ※登録者（{currentUser?.displayName || 'あなた'}）が担当者として記録されます
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}