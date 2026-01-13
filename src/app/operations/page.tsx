"use client";

import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';

// --- 型定義 ---
type BusinessDayStatus = 'OPEN' | 'CLOSED';
type BusinessDay = {
  date: string;
  status: BusinessDayStatus;
  note?: string;
};

type ShiftCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'AM' | 'PM' | 'R' | '休み';

type StaffShift = {
  id: string; 
  date: string;
  staffName: string;
  shiftType: ShiftCode;
};

// ★修正: カテゴリの型を string に緩和（具体的なテーマ名が入るため）
type TrainingCategory = string; 

type DailyTraining = {
  date: string;
  title: string;
  category: TrainingCategory;
  description?: string;
};

type WeeklyItem = { id: string; name: string; };
type TrainingTheme = {
  id: string;
  name: string;
  domain: string;
  weeklyItems: WeeklyItem[];
};

type WeeklyPlan = {
  id: string;
  themeId: string;
  weeklyItemId: string;
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 固定カテゴリの定義（UI用）
const FIXED_CATEGORIES = ['イベント', '防災', 'その他'] as const;

const SHIFT_DEFINITIONS: Record<string, string> = {
  'A': '9:00～18:00', 'B': '10:00～19:00', 'C': '8:30～17:30',
  'D': '9:30～18:30', 'E': '9:30～17:30', 'F': '10:00～18:00',
  'AM': 'AM有給', 'PM': 'PM有給', 'R': 'R休暇',
};
const SHIFT_CODES = Object.keys(SHIFT_DEFINITIONS) as ShiftCode[];

const SHIFT_MAP: Record<string, ShiftCode> = {
  'A': 'A', 'ａ': 'A', 'Ａ': 'A', 'B': 'B', 'b': 'B', 'Ｂ': 'B',
  'C': 'C', 'c': 'C', 'Ｃ': 'C', 'D': 'D', 'd': 'D', 'Ｄ': 'D',
  'E': 'E', 'e': 'E', 'Ｅ': 'E', 'F': 'F', 'f': 'F', 'Ｆ': 'F',
  'AM': 'AM', 'am': 'AM', 'ＡＭ': 'AM', 'AM有給': 'AM', '午前': 'AM', '午前休': 'AM', '半休(AM)': 'AM',
  'PM': 'PM', 'pm': 'PM', 'ＰＭ': 'PM', 'PM有給': 'PM', '午後': 'PM', '午後休': 'PM', '半休(PM)': 'PM',
  'R': 'R', 'r': 'R', 'Ｒ': 'R', 'R休暇': 'R', 'Ｒ休暇': 'R', 'リフレッシュ': 'R',
  '休': '休み', '休み': '休み', '公': '休み', '公休': '休み', '有': '休み', '有給': '休み', '有休': '休み', '/': '休み', '': '休み', '-': '休み'
};

const getShiftColor = (code: string) => {
  switch (code) {
    case 'A': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'B': return 'bg-green-100 text-green-700 border-green-200';
    case 'C': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'D': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'E': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'F': return 'bg-pink-100 text-pink-700 border-pink-200';
    case 'AM': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'PM': return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    case 'R': return 'bg-rose-100 text-rose-700 border-rose-200';
    case '休み': return 'bg-gray-100 text-gray-500 border-gray-200';
    default: return 'bg-white text-gray-800 border-gray-200';
  }
};

const toDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthDates = (year: number, month: number) => {
  const dates = [];
  const firstDate = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0);
  for (let d = 1; d <= lastDate.getDate(); d++) {
    dates.push(new Date(year, month, d));
  }
  return dates;
};

const chunkDatesByWeek = (dates: Date[]) => {
  const weeks: Date[][] = [];
  if (dates.length === 0) return weeks;
  let currentWeek: Date[] = [];
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const startCal = new Date(firstDate);
  startCal.setDate(startCal.getDate() - startCal.getDay());
  const endCal = new Date(lastDate);
  endCal.setDate(endCal.getDate() + (6 - endCal.getDay()));
  let temp = new Date(startCal);
  while (temp <= endCal) {
    if (temp.getDay() === 0) {
      currentWeek = [];
      weeks.push(currentWeek);
    }
    currentWeek.push(new Date(temp));
    temp.setDate(temp.getDate() + 1);
  }
  return weeks;
};

export default function OperationsPage() {
  const [activeTab, setActiveTab] = useState<'business' | 'shift' | 'training'>('business');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const [businessDays, setBusinessDays] = useState<Record<string, BusinessDay>>({});
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [trainings, setTrainings] = useState<Record<string, DailyTraining>>({});
  const [themes, setThemes] = useState<TrainingTheme[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<Record<string, WeeklyPlan>>({});
  const [staffList, setStaffList] = useState<string[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTraining, setEditTraining] = useState<DailyTraining>({ date: '', title: '', category: 'テーマ', description: '' });

  const [newStaffName, setNewStaffName] = useState('');
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

    try {
      const [busSnap, shiftSnap, trainSnap, adminSnap, themeSnap, weeklyPlanSnap] = await Promise.all([
        getDocs(query(collection(db, 'businessDays'), where('date', '>=', startStr), where('date', '<=', endStr))),
        getDocs(query(collection(db, 'shifts'), where('date', '>=', startStr), where('date', '<=', endStr))),
        getDocs(query(collection(db, 'dailyTrainings'), where('date', '>=', startStr), where('date', '<=', endStr))),
        getDocs(collection(db, 'admins')),
        getDocs(collection(db, 'trainingThemes')),
        getDocs(collection(db, 'weeklyTrainingPlans'))
      ]);

      const busMap: Record<string, BusinessDay> = {};
      busSnap.forEach(d => { busMap[d.id] = d.data() as BusinessDay; });
      setBusinessDays(busMap);

      const loadedShifts = shiftSnap.docs.map(d => ({ id: d.id, ...d.data() } as StaffShift));
      setShifts(loadedShifts);

      const enrolledStaffNames = adminSnap.docs.map(d => d.data()).filter((d: any) => d.isEnrolled !== false).map((d: any) => d.name);
      const shiftStaffNames = loadedShifts.map(s => s.staffName);
      const dynamicStaffs = Array.from(new Set([...enrolledStaffNames, ...shiftStaffNames])).sort();
      setStaffList(dynamicStaffs);

      const trainMap: Record<string, DailyTraining> = {};
      trainSnap.forEach(d => { trainMap[d.id] = d.data() as DailyTraining; });
      setTrainings(trainMap);

      const loadedThemes = themeSnap.docs.map(d => ({ id: d.id, ...d.data() } as TrainingTheme));
      setThemes(loadedThemes);

      const wpMap: Record<string, WeeklyPlan> = {};
      weeklyPlanSnap.forEach(d => { wpMap[d.id] = d.data() as WeeklyPlan; });
      setWeeklyPlans(wpMap);

    } catch (e) {
      console.error(e);
      toast.error("データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [currentDate]);

  const getThemeNameForDate = (dateStr: string): string => {
    if (!dateStr) return 'テーマ';
    const date = new Date(dateStr);
    const day = date.getDay();
    const sunday = new Date(date);
    sunday.setDate(date.getDate() - day);
    const sundayStr = toDateStr(sunday);
    const plan = weeklyPlans[sundayStr];
    if (!plan?.themeId) return 'テーマ';
    const theme = themes.find(t => t.id === plan.themeId);
    return theme ? theme.name : 'テーマ';
  };

  // ... (省略: toggleBusinessDay, updateShift, handleDeleteStaff, handleAddStaff, handleCsvImport などは変更なし) ...
  const toggleBusinessDay = async (dateStr: string) => {
    const current = businessDays[dateStr];
    const newStatus = current?.status === 'CLOSED' ? 'OPEN' : 'CLOSED';
    if (newStatus === 'CLOSED') {
      await setDoc(doc(db, 'businessDays', dateStr), { date: dateStr, status: 'CLOSED' });
      setBusinessDays(prev => ({ ...prev, [dateStr]: { date: dateStr, status: 'CLOSED' } }));
    } else {
      await deleteDoc(doc(db, 'businessDays', dateStr));
      const newMap = { ...businessDays };
      delete newMap[dateStr];
      setBusinessDays(newMap);
    }
  };

  const updateShift = async (dateStr: string, staffName: string, type: string) => {
    const id = `${dateStr}_${staffName}`;
    if (type === '休み') {
      await deleteDoc(doc(db, 'shifts', id));
      setShifts(prev => prev.filter(s => s.id !== id));
    } else {
      const newShift: StaffShift = { id, date: dateStr, staffName, shiftType: type as ShiftCode };
      await setDoc(doc(db, 'shifts', id), newShift);
      setShifts(prev => [...prev.filter(s => s.id !== id), newShift]);
    }
  };

  const updateWeeklyPlan = async (sundayDateStr: string, field: 'themeId' | 'weeklyItemId', value: string) => {
    const currentPlan = weeklyPlans[sundayDateStr] || { id: sundayDateStr, themeId: '', weeklyItemId: '' };
    const newPlan = { ...currentPlan, [field]: value };
    if (field === 'themeId') { newPlan.weeklyItemId = ''; }
    try {
      await setDoc(doc(db, 'weeklyTrainingPlans', sundayDateStr), newPlan);
      setWeeklyPlans(prev => ({ ...prev, [sundayDateStr]: newPlan }));
    } catch (e) {
      console.error(e);
      toast.error("週間設定の保存に失敗しました");
    }
  };

  const handleDeleteStaff = async (staffName: string) => {
    if (!confirm(`${staffName} さんの当月のシフトデータを削除して、表示から消去しますか？`)) return;
    try {
      const batch = writeBatch(db);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
      const endStr = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
      const targetShifts = shifts.filter(s => s.staffName === staffName);
      targetShifts.forEach(s => { batch.delete(doc(db, 'shifts', s.id)); });
      await batch.commit();
      setShifts(prev => prev.filter(s => s.staffName !== staffName));
      setStaffList(prev => prev.filter(name => name !== staffName));
      toast.success(`${staffName} さんを削除しました`);
    } catch (e) {
      console.error(e);
      toast.error("削除に失敗しました");
    }
  };

  const handleAddStaff = () => {
    if (!newStaffName.trim()) return toast.error("スタッフ名を入力してください");
    if (staffList.includes(newStaffName)) return toast.error("既に追加されているスタッフです");
    setStaffList(prev => [...prev, newStaffName].sort());
    setNewStaffName('');
    setIsAddStaffModalOpen(false);
    toast.success("スタッフを追加しました");
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsText(file, 'Shift_JIS');
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;
        const rows = text.split(/\r\n|\n|\r/).map(row => row.split(','));
        const headerRow = rows[0]; 
        if (!headerRow || headerRow.length < 2) throw new Error("フォーマットが無効です");
        const staffMap: Record<number, string> = {};
        const csvStaffNames: string[] = [];
        headerRow.forEach((cell, idx) => {
          if (idx === 0) return; 
          const name = cell.trim();
          if (name) { staffMap[idx] = name; csvStaffNames.push(name); }
        });
        setStaffList(prev => Array.from(new Set([...prev, ...csvStaffNames])).sort());
        const batch = writeBatch(db);
        let updateCount = 0;
        const targetYear = currentDate.getFullYear();
        const targetMonth = currentDate.getMonth() + 1;
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const dateCell = row[0]?.trim(); 
          if (!dateCell) continue;
          let dateStr = "";
          const fullDateMatch = dateCell.match(/(\d{4})[\/\-\年](\d{1,2})[\/\-\月](\d{1,2})/);
          if (fullDateMatch) {
            dateStr = `${fullDateMatch[1]}-${fullDateMatch[2].padStart(2, '0')}-${fullDateMatch[3].padStart(2, '0')}`;
          } else {
            const dayMatch = dateCell.match(/(\d+)/);
            if (dayMatch) {
              const day = parseInt(dayMatch[1], 10);
              if (day >= 1 && day <= 31) dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
          }
          if (!dateStr) continue;
          for (let j = 1; j < row.length; j++) {
            const staffName = staffMap[j];
            if (!staffName) continue;
            const rawValue = row[j]?.trim();
            let shiftType: ShiftCode = SHIFT_MAP[rawValue] || '休み';
            const id = `${dateStr}_${staffName}`;
            const shiftData: StaffShift = { id, date: dateStr, staffName, shiftType };
            const ref = doc(db, 'shifts', id);
            if (shiftType === '休み') batch.delete(ref);
            else batch.set(ref, shiftData);
            updateCount++;
          }
        }
        if (updateCount > 0) {
          await batch.commit();
          toast.success(`${updateCount}件のシフトデータを反映しました`);
          await loadData(); 
        } else {
          toast('更新対象のデータがありませんでした');
        }
      } catch (err) {
        console.error(err);
        toast.error("CSVの読み込みに失敗しました");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''; 
      }
    };
  };

  const handleSaveTraining = async () => {
    if (!editTraining.title) return toast.error("タイトルを入力してください");
    
    // ★修正: カテゴリが「テーマ」の場合、実際のテーマ名に置き換えて保存する
    let categoryToSave = editTraining.category;
    if (categoryToSave === 'テーマ') {
      const resolvedName = getThemeNameForDate(editTraining.date);
      // 「テーマ」という文字列のまま保存されないようにする（未設定の場合は'テーマ'のまま）
      if (resolvedName !== 'テーマ') {
        categoryToSave = resolvedName;
      }
    }

    const dataToSave = {
      ...editTraining,
      category: categoryToSave
    };

    await setDoc(doc(db, 'dailyTrainings', editTraining.date), dataToSave);
    setTrainings(prev => ({ ...prev, [editTraining.date]: dataToSave }));
    setIsModalOpen(false);
    toast.success("トレーニング内容を保存しました");
  };

  const calendarDates = getMonthDates(currentDate.getFullYear(), currentDate.getMonth());
  const calendarWeeks = chunkDatesByWeek(calendarDates);

  return (
    <AppLayout pageTitle="運営管理">
      <div className="space-y-6">
        
        {/* タブ */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button onClick={() => setActiveTab('business')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'business' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>営業管理</button>
          <button onClick={() => setActiveTab('shift')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'shift' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>シフト管理</button>
          <button onClick={() => setActiveTab('training')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'training' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>トレーニング管理</button>
        </div>

        {/* 月操作 */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-2 hover:bg-gray-100 rounded-full">←</button>
          <h2 className="text-xl font-bold text-gray-800">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</h2>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-2 hover:bg-gray-100 rounded-full">→</button>
        </div>

        {/* コンテンツ */}
        <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 overflow-x-auto">
          {/* ① 営業管理 */}
          {activeTab === 'business' && (
            <div>
              <div className="mb-4 text-sm text-gray-500">💡 日付をクリックすると「開所/休所」を切り替えられます。</div>
              <div className="grid grid-cols-7 gap-2 min-w-[600px]">
                {WEEKDAYS.map(d => <div key={d} className="text-center font-bold text-gray-400 py-2">{d}</div>)}
                {Array.from({ length: calendarDates[0].getDay() }).map((_, i) => <div key={`empty-${i}`} />)}
                {calendarDates.map(date => {
                  const dStr = toDateStr(date);
                  const isClosed = businessDays[dStr]?.status === 'CLOSED';
                  return (
                    <div key={dStr} onClick={() => toggleBusinessDay(dStr)} className={`h-24 border rounded-xl p-2 cursor-pointer transition-all hover:opacity-80 flex flex-col items-center justify-center ${isClosed ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                      <span className={`text-lg font-bold ${isClosed ? 'text-red-500' : 'text-gray-700'}`}>{date.getDate()}</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full mt-2 ${isClosed ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{isClosed ? '休所' : '開所'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ② シフト管理 */}
          {activeTab === 'shift' && (
            <div>
              <div className="mb-6">
                <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg mb-4 text-xs">
                  <span className="font-bold text-gray-600 mr-2">シフト区分:</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
                    {Object.entries(SHIFT_DEFINITIONS).map(([code, time]) => (
                      <span key={code} className="flex items-center"><span className={`w-5 h-5 flex items-center justify-center rounded font-bold mr-1 border ${getShiftColor(code)}`}>{code}</span><span className="text-gray-600">{time}</span></span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <p className="text-sm text-gray-500">💡 CSV(横:スタッフ/縦:日付)で一括登録できます。(有給などは「休み」となります)</p>
                  <div className="flex gap-2">
                    <button onClick={() => setIsAddStaffModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm text-sm font-bold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>スタッフ追加</button>
                    <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleCsvImport} />
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm text-sm font-bold"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>CSV一括登録</button>
                  </div>
                </div>
              </div>
              <table className="w-full text-sm border-collapse min-w-[800px]">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-50 text-left w-32 sticky left-0 z-10">日付</th>
                    {staffList.map(staff => (
                      <th key={staff} className="border p-2 bg-gray-50 min-w-[80px] text-center relative group">
                        {staff}
                        <button onClick={() => handleDeleteStaff(staff)} className="absolute top-1 right-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title={`${staff} を削除`}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calendarDates.map(date => {
                    const dStr = toDateStr(date);
                    const isSunday = date.getDay() === 0;
                    const isRedDay = isSunday || businessDays[dStr]?.status === 'CLOSED';
                    const workingCount = staffList.filter(staff => {
                      const shift = shifts.find(s => s.date === dStr && s.staffName === staff);
                      return shift && shift.shiftType !== '休み';
                    }).length;
                    return (
                      <tr key={dStr} className="hover:bg-gray-50">
                        <td className={`border p-2 font-bold text-center sticky left-0 z-10 ${isRedDay ? 'bg-red-50 text-red-600' : 'bg-white'}`}>
                          <div>{date.getDate()} ({WEEKDAYS[date.getDay()]})</div>
                          <div className="text-[10px] mt-1 text-gray-500 font-normal">出勤: <span className="font-bold text-gray-700">{workingCount}</span>名</div>
                        </td>
                        {staffList.map(staff => {
                          const shift = shifts.find(s => s.date === dStr && s.staffName === staff);
                          const currentType = shift?.shiftType || '休み';
                          return (
                            <td key={staff} className="border p-1 text-center">
                              <select value={currentType} onChange={(e) => updateShift(dStr, staff, e.target.value)} className={`w-full p-1 rounded text-center font-bold text-xs border ${getShiftColor(currentType)}`}>
                                <option value="休み">休み</option>
                                {SHIFT_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ③ トレーニング管理 */}
          {activeTab === 'training' && (
            <div className="min-w-[1000px]">
              <div className="mb-4 text-sm text-gray-500">💡 週間テーマとトレーニングを設定し、日々の活動を記録します。</div>
              <table className="w-full border-collapse table-fixed">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs font-bold uppercase">
                    {/* 幅を均等にする (100% / 8列 = 12.5%) */}
                    <th className="border p-2 w-[12.5%]">テーマ / 週間トレーニング</th>
                    {WEEKDAYS.map((d, i) => (
                      <th key={d} className={`border p-2 w-[12.5%] ${i===0 ? 'text-red-500' : i===6 ? 'text-blue-500' : ''}`}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {calendarWeeks.map((week, weekIndex) => {
                    const sundayStr = toDateStr(week[0]);
                    const currentPlan = weeklyPlans[sundayStr] || { themeId: '', weeklyItemId: '' };
                    const selectedTheme = themes.find(t => t.id === currentPlan.themeId);
                    const availableItems = selectedTheme ? selectedTheme.weeklyItems : [];

                    return (
                      <tr key={`week-${weekIndex}`} className="divide-x divide-gray-200 border-b">
                        <td className="p-2 align-top bg-gray-50">
                          <div className="flex flex-col gap-2">
                            <div>
                              <div className="text-xs text-gray-500 mb-1 font-bold">テーマ</div>
                              <select value={currentPlan.themeId} onChange={(e) => updateWeeklyPlan(sundayStr, 'themeId', e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm bg-white">
                                <option value="">(未設定)</option>
                                {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                              {selectedTheme && <div className="text-[10px] text-blue-600 mt-1">領域: {selectedTheme.domain}</div>}
                            </div>
                            <div className="border-t border-gray-200 pt-2">
                              <div className="text-xs text-gray-500 mb-1 font-bold">週間トレーニング</div>
                              <select value={currentPlan.weeklyItemId} onChange={(e) => updateWeeklyPlan(sundayStr, 'weeklyItemId', e.target.value)} disabled={!currentPlan.themeId} className="w-full p-2 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-400 bg-white">
                                <option value="">(未設定)</option>
                                {availableItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                              </select>
                            </div>
                          </div>
                        </td>
                        {week.map((date) => {
                          const dStr = toDateStr(date);
                          const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                          if (!isCurrentMonth) return <td key={dStr} className="bg-gray-50 border-r p-2 opacity-30"></td>;
                          const train = trainings[dStr];
                          const isToday = dStr === toDateStr(new Date());
                          
                          return (
                            <td 
                              key={dStr} 
                              onClick={() => {
                                // モーダルを開く前に、カテゴリが「テーマ」(or 具体的なテーマ名) かどうかを判定して初期値をセットする
                                // 既存データがある場合: そのまま使用
                                // 新規の場合: デフォルト 'テーマ'
                                let initialCategory = 'テーマ';
                                if (train) {
                                  // 既存データがある場合、カテゴリが固定カテゴリ以外ならそれは「テーマ」扱いとする
                                  const isFixed = FIXED_CATEGORIES.some(fc => fc === train.category);
                                  initialCategory = isFixed ? train.category : 'テーマ';
                                }

                                setEditTraining(train || { date: dStr, title: '', category: initialCategory, description: '' });
                                setIsModalOpen(true);
                              }}
                              className={`align-top p-2 cursor-pointer hover:bg-blue-50 transition-all border-r h-32 relative group ${isToday ? 'bg-yellow-50' : 'bg-white'}`}
                            >
                              <div className="font-bold text-gray-700 mb-1">{date.getDate()}</div>
                              {train ? (
                                <div className="flex flex-col gap-1">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded text-white text-center font-bold ${
                                    FIXED_CATEGORIES.some(c => c === train.category) 
                                      ? (train.category === 'イベント' ? 'bg-orange-500' : train.category === '防災' ? 'bg-red-500' : 'bg-gray-500')
                                      : 'bg-blue-500' // 固定カテゴリ以外（つまりテーマ）は青
                                  }`}>
                                    {train.category}
                                  </span>
                                  <span className="text-xs font-bold text-gray-800 line-clamp-3 leading-tight">{train.title}</span>
                                </div>
                              ) : (
                                <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100"><span className="text-2xl text-gray-300">+</span></div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* スタッフ追加モーダル */}
        {isAddStaffModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm m-4">
              <h3 className="text-lg font-bold text-gray-800 mb-4">スタッフ追加</h3>
              <div className="space-y-4"><div><label className="block text-sm font-bold text-gray-700 mb-1">スタッフ名</label><input type="text" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" placeholder="例: スタッフC" /></div></div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t"><button onClick={() => setIsAddStaffModalOpen(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg">キャンセル</button><button onClick={handleAddStaff} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">追加する</button></div>
            </div>
          </div>
        )}

        {/* トレーニング編集モーダル */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md m-4">
              <h3 className="text-lg font-bold text-gray-800 mb-4">{editTraining.date} のトレーニング設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">カテゴリ</label>
                  <div className="flex flex-wrap gap-2">
                    {/* ★修正: モーダルのカテゴリボタン表示 */}
                    <button 
                      onClick={() => setEditTraining({ ...editTraining, category: 'テーマ' })} 
                      className={`
                        px-3 py-1 rounded-full text-sm font-bold border transition-colors
                        ${editTraining.category === 'テーマ' 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}
                      `}
                    >
                      {/* テーマの場合は、その週の実際のテーマ名を表示。未設定なら「テーマ」 */}
                      {getThemeNameForDate(editTraining.date) === 'テーマ' ? 'テーマ (未設定)' : getThemeNameForDate(editTraining.date)}
                    </button>

                    {FIXED_CATEGORIES.map(cat => (
                      <button 
                        key={cat} 
                        onClick={() => setEditTraining({ ...editTraining, category: cat })} 
                        className={`
                          px-3 py-1 rounded-full text-sm font-bold border transition-colors
                          ${editTraining.category === cat 
                            ? (cat === 'イベント' ? 'bg-orange-600 text-white border-orange-600' :
                               cat === '防災' ? 'bg-red-600 text-white border-red-600' :
                               'bg-gray-600 text-white border-gray-600')
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}
                        `}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div><label className="block text-sm font-bold text-gray-700 mb-1">トレーニング名</label><input type="text" value={editTraining.title} onChange={(e) => setEditTraining({ ...editTraining, title: e.target.value })} className="w-full p-2 border border-gray-300 rounded-md" /></div>
                <div><label className="block text-sm font-bold text-gray-700 mb-1">内容・メモ</label><textarea value={editTraining.description} onChange={(e) => setEditTraining({ ...editTraining, description: e.target.value })} rows={3} className="w-full p-2 border border-gray-300 rounded-md" /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t"><button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg">キャンセル</button><button onClick={handleSaveTraining} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">保存する</button></div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}