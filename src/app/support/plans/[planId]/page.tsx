"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db, auth } from '@/lib/firebase/firebase';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { UserData } from '@/types/billing';

// --- 定数定義 ---
const DAYS = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日・祝日・長期休'];
const SCHEDULE_TYPES = ['pre', 'standard', 'post'] as const;

const PERIOD_OPTIONS = [...Array(12)].map((_, i) => `${i + 1}ヶ月後`).concat(['その他']);
const SUPPORT_CATEGORIES = ['本人支援', '家族支援', '移行支援', '地域支援・連携'];
const FIVE_DOMAINS = ['健康・生活', '運動・感覚', '認知・行動', '言語・コミュニケーション', '人間関係・社会性'];

type ScheduleType = typeof SCHEDULE_TYPES[number];

type TimeSlot = {
  start: string;
  end: string;
  duration: string;
};

type WeeklySchedule = { [key: string]: TimeSlot; };

type SupportTargetItem = {
  id: string;
  displayOrder: string;
  priority: string;
  achievementPeriod: string;
  achievementPeriodOther: string;
  supportCategories: string[];
  goal: string;
  content: string;
  fiveDomains: string[];
  staff: string;
  remarks: string;
};

export default function PlanEditPage({ params }: { params: { planId: string } }) {
  const router = useRouter();
  
  // --- ステート管理 ---
  const [users, setUsers] = useState<UserData[]>([]);
  const [staffs, setStaffs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 基本情報
  const [basicInfo, setBasicInfo] = useState({
    creationDate: '',
    status: '原案' as '原案' | '本番',
    userId: '',
    userName: '',
    author: '',
    hasTransport: 'なし' as 'あり' | 'なし',
    hasMeal: 'なし' as 'あり' | 'なし',
    userRequest: '',
    policy: '',
    longTermGoal: '',
    shortTermGoal: '',
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 時間割データ
  const [schedules, setSchedules] = useState<Record<ScheduleType, WeeklySchedule>>({
    pre: {},
    standard: {},
    post: {},
  });
  
  // 時間割備考
  const [remarks, setRemarks] = useState<Record<ScheduleType, string>>({
    pre: '',
    standard: '',
    post: '',
  });

  // 支援目標リスト
  const [supportTargets, setSupportTargets] = useState<SupportTargetItem[]>([]);

  // --- データ取得 ---
  useEffect(() => {
    const initData = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
        setUsers(usersData);

        const staffsSnap = await getDocs(collection(db, 'admins'));
        const staffList = staffsSnap.docs.map(d => d.data().name as string).filter(Boolean);
        setStaffs(staffList);

        const docRef = doc(db, 'supportPlans', params.planId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          
          setBasicInfo({
            creationDate: data.creationDate || '',
            status: data.status || '原案',
            userId: data.userId || '',
            userName: data.userName || '',
            author: data.author || '',
            hasTransport: data.hasTransport || 'なし',
            hasMeal: data.hasMeal || 'なし',
            userRequest: data.userRequest || '',
            policy: data.policy || '',
            longTermGoal: data.longTermGoal || '',
            shortTermGoal: data.shortTermGoal || '',
          });

          if (data.userId) {
            const targetUser = usersData.find(u => u.id === data.userId);
            if (targetUser) {
              setSearchTerm(`${targetUser.lastName} ${targetUser.firstName}`);
            }
          }

          if (data.schedules) setSchedules(data.schedules);
          if (data.remarks) setRemarks(data.remarks);
          if (data.supportTargets) setSupportTargets(data.supportTargets);

        } else {
          toast.error("計画書が見つかりません");
          router.push('/support/plans');
        }
      } catch(e) {
        console.error(e);
        toast.error("データの読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, [params.planId, router]);

  // --- 計算ロジック ---
  const calculateDurationStr = (start: string, end: string): string => {
    if (!start || !end) return '';
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let diffM = (endH * 60 + endM) - (startH * 60 + startM);
    if (diffM < 0) diffM += 24 * 60;
    const hours = diffM / 60;
    if (hours === 0) return '';
    return hours.toFixed(1);
  };

  // --- ハンドラ ---
  const handleSelectUser = (user: UserData) => {
    setBasicInfo({ ...basicInfo, userId: user.id, userName: `${user.lastName} ${user.firstName}` });
    setSearchTerm(`${user.lastName} ${user.firstName}`);
    setShowSuggestions(false);
  };

  const handleTimeChange = (type: ScheduleType, dayIndex: number, field: 'start' | 'end' | 'duration', value: string) => {
    setSchedules(prev => {
      const currentDay = prev[type][dayIndex] || { start: '', end: '', duration: '' };
      let newDay = { ...currentDay, [field]: value };
      if (field === 'start' || field === 'end') {
        if (newDay.start && newDay.end) {
          newDay.duration = calculateDurationStr(newDay.start, newDay.end);
        }
      }
      return { ...prev, [type]: { ...prev[type], [dayIndex]: newDay } };
    });
  };

  const handleTargetChange = (id: string, field: keyof SupportTargetItem, value: any) => {
    setSupportTargets(prev => prev.map(item => {
      if (item.id !== id) return item;
      return { ...item, [field]: value };
    }));
  };

  const handleTargetCheckbox = (id: string, field: 'supportCategories' | 'fiveDomains', value: string) => {
    setSupportTargets(prev => prev.map(item => {
      if (item.id !== id) return item;
      const list = item[field];
      if (list.includes(value)) {
        return { ...item, [field]: list.filter(v => v !== value) };
      } else {
        return { ...item, [field]: [...list, value] };
      }
    }));
  };

  const addTarget = () => {
    setSupportTargets(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        displayOrder: String(prev.length + 1),
        priority: '',
        achievementPeriod: '6ヶ月後',
        achievementPeriodOther: '',
        supportCategories: ['本人支援'],
        goal: '',
        content: '',
        fiveDomains: [],
        staff: '',
        remarks: '',
      }
    ]);
  };

  const removeTarget = (id: string) => {
    if (supportTargets.length <= 1) return toast.error("これ以上削除できません");
    setSupportTargets(prev => prev.filter(item => item.id !== id));
  };

  // 更新処理
  const handleUpdate = async () => {
    if (!basicInfo.creationDate) return toast.error("作成日を入力してください");
    if (!basicInfo.status) return toast.error("作成状態を選択してください");
    if (!basicInfo.userId) return toast.error("利用者を選択してください");
    if (!basicInfo.author) return toast.error("入力者を選択してください");

    const toastId = toast.loading("更新中...");
    try {
        const docRef = doc(db, 'supportPlans', params.planId);
        await updateDoc(docRef, {
            ...basicInfo,
            schedules,
            remarks,
            supportTargets,
            updatedAt: serverTimestamp(),
        });
        toast.success("更新しました", { id: toastId });
        router.push('/support/plans');
    } catch(e) {
        console.error(e);
        toast.error("更新失敗", { id: toastId });
    }
  };

  // ★追加: コピー作成処理
  const handleCopy = async () => {
    if (!confirm("現在の内容をコピーして、新しい計画書を作成しますか？")) return;
    
    // バリデーション
    if (!basicInfo.creationDate) return toast.error("作成日を入力してください");
    if (!basicInfo.userId) return toast.error("利用者を選択してください");

    const toastId = toast.loading("コピー作成中...");
    try {
        // 新規ドキュメントとして追加 (addDoc)
        const docRef = await addDoc(collection(db, 'supportPlans'), {
            ...basicInfo,
            status: '原案', // コピー時は安全のため「原案」に戻す
            schedules,
            remarks,
            supportTargets,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        
        toast.success("コピーを作成しました", { id: toastId });
        // 新しい計画書の編集画面へ遷移
        router.push(`/support/plans/${docRef.id}`);
    } catch(e) {
        console.error(e);
        toast.error("コピー作成に失敗しました", { id: toastId });
    }
  };

  if (loading) {
    return <AppLayout pageTitle="読み込み中..."><div className="p-8 text-center">データを取得しています...</div></AppLayout>;
  }

  return (
    <AppLayout pageTitle="個別支援計画 編集">
      <div className="space-y-8 pb-32">
        
        {/* --- 基本情報 --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-sm font-bold text-gray-700 mb-4 border-l-4 border-blue-500 pl-2">基本情報</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div className="flex items-center gap-4">
              <label className="w-24 bg-red-50 text-gray-700 font-bold p-2 text-sm text-center rounded">作成日</label>
              <input type="date" value={basicInfo.creationDate} onChange={(e) => setBasicInfo({...basicInfo, creationDate: e.target.value})} className="border p-2 rounded flex-1" />
            </div>
            <div className="flex items-center gap-4">
              <label className="w-24 bg-red-50 text-gray-700 font-bold p-2 text-sm text-center rounded">作成状態</label>
              <div className="flex gap-4 items-center">
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={basicInfo.status === '原案'} onChange={() => setBasicInfo({...basicInfo, status: '原案'})} className="w-4 h-4" /> 原案</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={basicInfo.status === '本番'} onChange={() => setBasicInfo({...basicInfo, status: '本番'})} className="w-4 h-4" /> 本番</label>
              </div>
            </div>
            
            <div className="flex items-center gap-4 relative">
              <label className="w-24 bg-gray-200 text-gray-700 font-bold p-2 text-sm text-center rounded">利用者氏名</label>
              <div className="flex-1 relative">
                <input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} placeholder="利用者名検索..." className="w-full border p-2 rounded outline-none" />
                {showSuggestions && searchTerm && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded mt-1 shadow-lg max-h-40 overflow-y-auto">
                    {users.filter(u => `${u.lastName} ${u.firstName}`.includes(searchTerm)).map(u => (
                      <div key={u.id} onClick={() => handleSelectUser(u)} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">{u.lastName} {u.firstName}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <label className="w-24 bg-gray-200 text-gray-700 font-bold p-2 text-sm text-center rounded">入力者</label>
              <select value={basicInfo.author} onChange={(e) => setBasicInfo({...basicInfo, author: e.target.value})} className="border p-2 rounded flex-1 bg-white">
                <option value="">選択してください</option>
                {staffs.map((s, idx) => <option key={idx} value={s}>{s}</option>)}
                {basicInfo.author && !staffs.includes(basicInfo.author) && (
                   <option value={basicInfo.author}>{basicInfo.author}</option>
                )}
              </select>
            </div>

            <div className="flex items-center gap-4">
              <label className="w-24 bg-gray-200 text-gray-700 font-bold p-2 text-sm text-center rounded">送迎の有無</label>
              <div className="flex gap-4 border p-2 rounded flex-1 bg-white">
                 <label className="flex items-center gap-2"><input type="radio" checked={basicInfo.hasTransport === 'あり'} onChange={() => setBasicInfo({...basicInfo, hasTransport: 'あり'})} /> あり</label>
                 <label className="flex items-center gap-2"><input type="radio" checked={basicInfo.hasTransport === 'なし'} onChange={() => setBasicInfo({...basicInfo, hasTransport: 'なし'})} /> なし</label>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="w-24 bg-gray-200 text-gray-700 font-bold p-2 text-sm text-center rounded">食事提供</label>
              <div className="flex gap-4 border p-2 rounded flex-1 bg-white">
                 <label className="flex items-center gap-2"><input type="radio" checked={basicInfo.hasMeal === 'あり'} onChange={() => setBasicInfo({...basicInfo, hasMeal: 'あり'})} /> あり</label>
                 <label className="flex items-center gap-2"><input type="radio" checked={basicInfo.hasMeal === 'なし'} onChange={() => setBasicInfo({...basicInfo, hasMeal: 'なし'})} /> なし</label>
              </div>
            </div>
          </div>
        </div>

        {/* --- 時間割 --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TimeColumn title="【支援前】延長支援時間" type="pre" data={schedules.pre} remarks={remarks.pre} onTimeChange={handleTimeChange} onRemarkChange={(val: any) => setRemarks({...remarks, pre: val})} />
          <TimeColumn title="支援の標準的な提供時間等" type="standard" bgColor="bg-indigo-50" data={schedules.standard} remarks={remarks.standard} onTimeChange={handleTimeChange} onRemarkChange={(val: any) => setRemarks({...remarks, standard: val})} />
          <TimeColumn title="【支援後】延長支援時間" type="post" data={schedules.post} remarks={remarks.post} onTimeChange={handleTimeChange} onRemarkChange={(val: any) => setRemarks({...remarks, post: val})} />
        </div>

        {/* --- 意向・方針・目標 --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TextAreaField label="利用児及び家族の生活に対する意向" value={basicInfo.userRequest} onChange={(val:any) => setBasicInfo({...basicInfo, userRequest: val})} height="h-32" />
            <TextAreaField label="総合的な支援の方針" value={basicInfo.policy} onChange={(val:any) => setBasicInfo({...basicInfo, policy: val})} height="h-32" />
            <TextAreaField label="長期目標" value={basicInfo.longTermGoal} onChange={(val:any) => setBasicInfo({...basicInfo, longTermGoal: val})} height="h-24" />
            <TextAreaField label="短期目標" value={basicInfo.shortTermGoal} onChange={(val:any) => setBasicInfo({...basicInfo, shortTermGoal: val})} height="h-24" />
          </div>
        </div>

        {/* --- 支援目標リスト --- */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-800">支援目標及び具体的な支援内容等</h2>
          
          {supportTargets.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative group">
              <button onClick={() => removeTarget(item.id)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-2" title="削除">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>

              {/* 1段目 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 pr-8">
                <div className="flex items-center gap-2">
                  <label className="w-20 bg-red-50 text-gray-700 font-bold p-2 text-xs text-center rounded">表示順</label>
                  <select value={item.displayOrder} onChange={e => handleTargetChange(item.id, 'displayOrder', e.target.value)} className="border p-2 rounded flex-1 text-sm bg-white">
                    {[...Array(20)].map((_, i) => <option key={i} value={i+1}>{i+1}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-20 bg-gray-200 text-gray-700 font-bold p-2 text-xs text-center rounded">優先順位</label>
                  <input type="text" value={item.priority} onChange={e => handleTargetChange(item.id, 'priority', e.target.value)} className="border p-2 rounded flex-1 text-sm" />
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <label className="w-20 bg-gray-200 text-gray-700 font-bold p-2 text-xs text-center rounded">達成時期</label>
                  <select value={item.achievementPeriod} onChange={e => handleTargetChange(item.id, 'achievementPeriod', e.target.value)} className="border p-2 rounded w-32 text-sm bg-white">
                    {PERIOD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  {item.achievementPeriod === 'その他' && (
                    <input type="text" placeholder="詳細" value={item.achievementPeriodOther} onChange={e => handleTargetChange(item.id, 'achievementPeriodOther', e.target.value)} className="border p-2 rounded flex-1 text-sm" />
                  )}
                </div>
              </div>

              {/* 2段目: 支援項目 */}
              <div className="mb-4">
                <label className="text-xs font-bold text-gray-700 block mb-1">支援項目</label>
                <div className="flex gap-4 flex-wrap">
                  {SUPPORT_CATEGORIES.map(cat => (
                    <label key={cat} className="flex items-center gap-1 text-sm cursor-pointer">
                      <input type="checkbox" checked={item.supportCategories.includes(cat)} onChange={() => handleTargetCheckbox(item.id, 'supportCategories', cat)} className="w-4 h-4 text-blue-600 rounded" />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>

              {/* 3段目: 支援目標・内容 (2カラム) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <TextAreaField label="支援目標" value={item.goal} onChange={(val:any) => handleTargetChange(item.id, 'goal', val)} height="h-24" bgColor="bg-gray-100" />
                <TextAreaField label="支援内容" value={item.content} onChange={(val:any) => handleTargetChange(item.id, 'content', val)} height="h-24" bgColor="bg-gray-100" />
              </div>

              {/* 4段目: 5領域 & 担当者 (2カラム) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <label className="text-xs font-bold text-gray-700 block mb-2">5領域との関連性</label>
                    <div className="flex gap-x-4 gap-y-2 flex-wrap">
                    {FIVE_DOMAINS.map(domain => (
                        <label key={domain} className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="checkbox" checked={item.fiveDomains.includes(domain)} onChange={() => handleTargetCheckbox(item.id, 'fiveDomains', domain)} className="w-4 h-4 text-blue-600 rounded" />
                        {domain}
                        </label>
                    ))}
                    </div>
                </div>
                <TextAreaField 
                  label="担当者・提供機関" 
                  value={item.staff} 
                  onChange={(val:any) => handleTargetChange(item.id, 'staff', val)} 
                  height="h-auto" 
                  minHeight="min-h-[80px]" 
                  bgColor="bg-gray-100"
                />
              </div>

              {/* 5段目: 留意事項 (全幅) */}
              <div className="w-full">
                <TextAreaField 
                    label="留意事項" 
                    value={item.remarks} 
                    onChange={(val:any) => handleTargetChange(item.id, 'remarks', val)} 
                    height="h-16"
                    bgColor="bg-gray-100"
                />
              </div>

            </div>
          ))}

          <button onClick={addTarget} className="w-full py-3 bg-dashed border-2 border-gray-300 text-gray-500 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            支援目標を追加する
          </button>
        </div>

        {/* フッターアクション */}
        <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 flex justify-end gap-4 z-20 shadow-lg">
           <button onClick={() => router.back()} className="px-6 py-2 bg-gray-100 rounded hover:bg-gray-200 font-bold text-gray-600">キャンセル</button>
           
           {/* コピー作成ボタン */}
           <button onClick={handleCopy} className="px-6 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 shadow-md flex items-center gap-2">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
             コピーして新規作成
           </button>

           <button onClick={handleUpdate} className="px-8 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-md">更新</button>
        </div>
      </div>
    </AppLayout>
  );
}

// --- サブコンポーネント (Newと同一) ---
function TimeColumn({ title, type, bgColor = 'bg-white', data, remarks, onTimeChange, onRemarkChange }: any) {
  return (
    <div className={`p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full ${bgColor}`}>
      <h3 className="font-bold text-gray-800 mb-4">{title}</h3>
      <div className="space-y-3 flex-1">
        {DAYS.map((day: string, idx: number) => {
          const slot = data[idx] || { start: '', end: '', duration: '' };
          return (
            <div key={day} className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-600">{day}</label>
              <div className="flex items-center gap-2">
                <input type="time" className="border p-1 rounded text-sm w-24 bg-white" value={slot.start || ''} onChange={(e) => onTimeChange(type, idx, 'start', e.target.value)} />
                <span className="text-gray-400">~</span>
                <input type="time" className="border p-1 rounded text-sm w-24 bg-white" value={slot.end || ''} onChange={(e) => onTimeChange(type, idx, 'end', e.target.value)} />
                <div className="flex-1 flex items-center border border-gray-300 rounded overflow-hidden bg-white">
                  <span className="bg-gray-100 text-gray-600 text-[10px] px-1 py-1.5 border-r font-bold whitespace-nowrap">算定時間</span>
                  <input type="text" className="w-full text-center text-sm outline-none font-bold text-blue-600 px-1" placeholder="-" value={slot.duration || ''} onChange={(e) => onTimeChange(type, idx, 'duration', e.target.value)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6">
        <div className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-1 rounded-t w-16 text-center">備考</div>
        <textarea className="w-full border p-2 text-sm rounded-b-lg rounded-tr-lg h-24 outline-none focus:ring-1 focus:ring-blue-400 resize-none" placeholder="備考を入力..." maxLength={1000} value={remarks} onChange={(e: any) => onRemarkChange(e.target.value)} />
      </div>
    </div>
  );
}

function TextAreaField({ label, value, onChange, height = "h-24", minHeight = "", bgColor = "bg-gray-200" }: any) {
  return (
    <div className={`flex ${minHeight} h-full`}>
      <div className={`${bgColor} text-gray-700 font-bold p-3 text-sm flex items-center justify-center w-32 rounded-l-lg leading-tight flex-shrink-0`}>
        {label}
      </div>
      <textarea 
        className={`flex-1 border-y border-r border-gray-300 p-2 text-sm rounded-r-lg outline-none focus:ring-1 focus:ring-blue-400 resize-none ${height} w-full`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}