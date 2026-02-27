"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, limit, doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { UserData } from '@/types/billing';

// --- 選択肢定数 (変更なし) ---
const CONDITIONS = ['良好', '注意', '悪化'];
const SERVICE_TIME_CLASSES = [
  '区分1(30分以上1時間30分以下)',
  '区分2(1時間30分超3時間以下)',
  '区分3(3時間超5時間以下)'
];
const EXTENDED_ADDONS = ['加算しない', '1（30分以上1時間未満）', '2（1時間以上2時間未満）', '3（2時間以上）'];

// --- 長い選択肢リスト (変更なし) ---
const OPT_INDIVIDUAL = ['加算しない', 'Ⅰ-イ 【ケアニーズの高い障害児 90単位】', 'Ⅰ-イ 【強行（基礎） 120単位】', 'Ⅰ-ロ 【著しく重度の障害児 120単位】', 'Ⅱ 【150単位】', 'Ⅲ 【70単位】', 'Ⅰ-イ 【ケアニーズの高い障害児 90単位】・Ⅱ 【150単位】', 'Ⅰ-イ 【ケアニーズの高い障害児 90単位】・Ⅲ 【70単位】', 'Ⅰ-イ 【強行（基礎） 120単位】・Ⅱ 【150単位】', 'Ⅰ-イ 【強行（基礎） 120単位】・Ⅲ 【70単位】', 'Ⅰ-ロ 【著しく重度の障害児に支援 120単位】・Ⅱ 【150単位】', 'Ⅰ-ロ 【著しく重度の障害児に支援 120単位】・Ⅲ 【70単位】', 'Ⅱ 【150単位】・Ⅲ 【70単位】', 'Ⅰ-イ 【ケアニーズの高い障害児 90単位】・Ⅱ 【150単位】・Ⅲ 【70単位】', 'Ⅰ-イ 【強行（基礎） 120単位】・Ⅱ 【150単位】・Ⅲ 【70単位】', 'Ⅰ-ロ 【著しく重度の障害児に支援 120単位】・Ⅱ 【150単位】・Ⅲ 【70単位】'];
const OPT_AGENCY = ['加算しない', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];
const OPT_FAMILY = ['加算しない', 'Ⅰ1（居宅を訪問・1時間以上）', 'Ⅰ2（居宅を訪問・1時間未満）', 'Ⅰ3（事業所等で対面）', 'Ⅰ4（オンライン）', 'Ⅱ1（事業所等で対面）', 'Ⅱ2（オンライン）', 'Ⅰ1・Ⅱ1', 'Ⅰ1・Ⅱ2', 'Ⅰ2・Ⅱ1', 'Ⅰ2・Ⅱ2', 'Ⅰ3・Ⅱ1', 'Ⅰ3・Ⅱ2', 'Ⅰ4・Ⅱ1', 'Ⅰ4・Ⅱ2'];
const OPT_TRANSPORT = ['加算しない', '往', '復', '往復'];
const OPT_INDEPENDENCE = ['加算しない', '1回', '2回'];
const OPT_INTER_AGENCY = ['加算しない', 'Ⅰ（会議を開催）', 'Ⅱ（会議に参画）'];
const OPT_MEDICAL = ['加算しない', 'Ⅰ（32単位）', 'Ⅱ（63単位）', 'Ⅲ（125単位）', 'Ⅳ 1人（800単位）', 'Ⅳ 2人（500単位）', 'Ⅳ 3人〜8人（400単位）', 'Ⅴ 1人（1600単位）', 'Ⅴ 2人（960単位）', 'Ⅴ 3人〜8人（800単位）', 'Ⅵ 看護師1人・利用者1人（500単位）', 'Ⅵ 看護師1人・利用者2人（250単位）', 'Ⅵ 看護師1人・利用者3人（166単位）', 'Ⅵ 看護師2人・利用者1人（1000単位）', 'Ⅵ 看護師2人・利用者2人（500単位）', 'Ⅵ 看護師2人・利用者3人（333単位）', 'Ⅵ 看護師2人・利用者4人（250単位）', 'Ⅵ 看護師2人・利用者5人（200単位）', 'Ⅵ 看護師2人・利用者6人（166単位）', 'Ⅵ 看護師3人・利用者1人（1500単位）', 'Ⅵ 看護師3人・利用者2人（750単位）', 'Ⅵ 看護師3人・利用者3人（500単位）', 'Ⅵ 看護師3人・利用者4人（375単位）', 'Ⅵ 看護師3人・利用者5人（300単位）', 'Ⅵ 看護師3人・利用者6人（250単位）', 'Ⅵ 看護師3人・利用者7人（214単位）', 'Ⅵ 看護師3人・利用者8人（187単位）', 'Ⅶ（250単位）'];
const OPT_SELF_RELIANCE = ['加算しない', '加算する（月2回まで）'];
const OPT_INTENSE = ['加算しない', 'Ⅰ（200単位）', 'Ⅱ（250単位）', 'Ⅰ（90日以内・700単位）', 'Ⅱ（90日以内・750単位）'];
const OPT_WELFARE = ['加算しない', 'Ⅰ', 'Ⅱ', 'Ⅲ'];
const OPT_STAFF_ADDON = ['加算しない', '常勤専従・経験5年以上', '常勤専従・経験5年未満', '常勤換算・経験5年以上', '常勤換算・経験5年未満', 'その他従業員を配置'];
const OPT_DEDUCTION = ['減算しない', '30%減算', '50%減算'];
const OPT_ABSENCE = ['加算しない', 'Ⅰ'];

export default function NewRecordPage() {
  const router = useRouter();
  
  // --- State ---
  const [users, setUsers] = useState<UserData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activePlan, setActivePlan] = useState<any>(null);

  // フォームデータ
  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    userId: '',
    userName: '',
    
    // 出席
    status: '放課後' as '放課後' | '休校日' | '欠席',
    startTime: '',
    endTime: '',
    duration: '', 
    extensionDuration: '', 
    condition: '良好',

    // 加算（左下）
    timeClass: '',
    extendedSupportAddon: '加算しない',
    absenceAddon: 'Ⅰ',

    childcareSupport: '加算しない',
    individualSupport: '加算しない',
    specializedSupport: '加算しない',
    agencyCooperation: '加算しない',
    familySupport: '加算しない',
    transportation: '加算しない',
    independenceSupport: '加算しない',
    interAgencyCooperation: '加算しない',
    medicalSupport: '加算しない',
    selfRelianceSupport: '加算しない',
    intenseBehaviorSupport: '加算しない',

    // 事業所加算・減算
    welfareSpecialist: '加算しない',
    staffAddon: '加算しない',
    specializedSystem: '加算しない',
    planMissing: '減算しない',
    managerMissing: '減算しない',
    staffMissing: '減算しない',

    // 記録（右側）
    trainingContent: '',
    supportContent: '',
    staffSharing: '',
  });

  const [targetComments, setTargetComments] = useState<Record<string, string>>({});

  // --- データ取得 ---
  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const uSnap = await getDocs(collection(db, 'users'));
        setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));

        // 事業所マスタのデフォルト反映
        const aSnap = await getDocs(collection(db, 'additions'));
        const additions = aSnap.docs.map(d => d.data());
        let newDefaults: any = {};

        additions.forEach(add => {
          if (add.target === '事業所') {
            if (add.name === '福祉専門職員配置等加算' && OPT_WELFARE.includes(add.details)) {
              newDefaults.welfareSpecialist = add.details;
            }
            if (add.name === '児童指導員等加配加算' && OPT_STAFF_ADDON.includes(add.details)) {
              newDefaults.staffAddon = add.details;
            }
            if (add.name === '専門的支援体制加算') {
              newDefaults.specializedSystem = ['加算する', '加算しない'].includes(add.details) ? add.details : '加算する';
            }
          }
        });

        if (Object.keys(newDefaults).length > 0) {
          setFormData(prev => ({ ...prev, ...newDefaults }));
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchMasters();
  }, []);

  // --- ロジック (算定時間・区分の自動算出) ---
  // ★重要: startTime/endTime からの計算ではなく、Plan/Statusからの算出に変更
  useEffect(() => {
    if(formData.status === '欠席') {
        setFormData(prev => ({ ...prev, duration: '', timeClass: '', extendedSupportAddon: '加算しない' }));
        return;
    }

    // 1. 算定時間の決定 (計画書優先 > 利用状況フォールバック)
    let determinedDuration = '';

    // --- 🔽 修正ポイント: 休校日かどうかを先に判定する 🔽 ---

    if (formData.status === '休校日') {
      // 1. 利用状況が「休校日」の場合
      // もし計画書に「休業日（standardではなくholidayなどの枠）」があればそこを見るロジックも組めますが、
      // 一旦、ご要望に合わせて「休校日なら3.5h」を最優先にします。
      determinedDuration = '3.5';

    } else if (activePlan) {
      // 2. 利用状況が「放課後」かつ「計画書がある」場合
      const dateObj = new Date(formData.date);
      const jsDay = dateObj.getDay(); 
      const appDayIndex = jsDay === 0 ? 6 : jsDay - 1; 
      const schedule = activePlan.schedules?.standard?.[appDayIndex];
      
      if (schedule && schedule.duration) {
        determinedDuration = schedule.duration;
      }
    }

    // 3. それでも決まらない場合の最終フォールバック
    if (!determinedDuration) {
      if (formData.status === '放課後') determinedDuration = '2.0';
      else if (formData.status === '休校日') determinedDuration = '3.5';
    }
    // --- 🔼 修正ここまで 🔼 ---

    // 2. 区分判定
    let newClass = '';
    if (determinedDuration) {
      const dNum = Number(determinedDuration);
      if (!isNaN(dNum)) {
        if (dNum <= 1.5) newClass = SERVICE_TIME_CLASSES[0];
        else if (dNum <= 3.0) newClass = SERVICE_TIME_CLASSES[1];
        else newClass = SERVICE_TIME_CLASSES[2];
      }
    }

    // 更新 (duration, timeClass)
    // ※無限ループ防止のため、値が変わる時だけ更新するようにチェックするのが理想ですが、
    // ReactのsetStateは同じ値なら再レンダリングされないため、簡易的に記述します。
    // ただし、useEffect内でsetFormDataを使う際は依存配列に注意が必要です。
    setFormData(prev => {
        // 値が変わらない場合は更新しない（無限ループ防止）
        if (prev.duration === determinedDuration && prev.timeClass === newClass) return prev;
        return { ...prev, duration: determinedDuration, timeClass: newClass };
    });

  }, [formData.date, formData.status, activePlan]); // 依存配列: 日付、状態、計画書

  // --- ロジック (延長支援加算) ---
  useEffect(() => {
    if(formData.status === '欠席') return;

    // 延長支援加算判定 (手入力された延長時間数に基づく)
    if (formData.extensionDuration) {
        const extHours = Number(formData.extensionDuration);
        let extAddon = '加算しない';
        if (extHours >= 2.0) extAddon = '3（2時間以上）';
        else if (extHours >= 1.0) extAddon = '2（1時間以上2時間未満）';
        else if (extHours >= 0.5) extAddon = '1（30分以上1時間未満）';
        
        setFormData(prev => {
            if (prev.extendedSupportAddon === extAddon) return prev;
            return { ...prev, extendedSupportAddon: extAddon };
        });
    } else {
        setFormData(prev => {
            if (prev.extendedSupportAddon === '加算しない') return prev;
            return { ...prev, extendedSupportAddon: '加算しない' };
        });
    }
  }, [formData.extensionDuration, formData.status]);


  // 利用者選択
  const handleSelectUser = async (user: UserData) => {
    setFormData({ ...formData, userId: user.id, userName: `${user.lastName} ${user.firstName}` });
    setSearchTerm(`${user.lastName} ${user.firstName}`);
    setShowSuggestions(false);

    // 本番の計画書を取得
    const q = query(
      collection(db, 'supportPlans'),
      where('userId', '==', user.id),
      where('status', '==', '本番'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      setActivePlan(snap.docs[0].data());
    } else {
      setActivePlan(null);
      // Planがない場合はフォールバック値が適用されるのでエラー表示は控えめに
      toast("本番の計画書が見つかりません (デフォルト時間を適用します)");
    }
  };

  const handleSave = async () => {
    if (!formData.userId) return toast.error("利用者を選択してください");
    
    const commentsArray = Object.entries(targetComments).map(([key, val]) => ({
        targetId: key,
        comment: val,
        order: activePlan?.supportTargets?.find((t:any) => t.id === key)?.displayOrder || '0'
    }));

    try {
      await addDoc(collection(db, 'supportRecords'), {
        ...formData,
        targetComments: commentsArray,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("記録を保存しました");
      router.push('/support/records'); 
    } catch(e) {
      console.error(e);
      toast.error("保存失敗");
    }
  };

  return (
    <AppLayout pageTitle="支援記録 新規作成">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full pb-20">
        
        {/* === 左カラム === */}
        <div className="space-y-6 overflow-y-auto pr-2">
          
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <h3 className="font-bold text-gray-700 border-l-4 border-blue-500 pl-2">基本情報・出席</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500">支援日</label>
                <input type="date" value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})} className="w-full border p-2 rounded" />
              </div>
              <div className="relative">
                <label className="text-xs font-bold text-gray-500">利用者氏名</label>
                <input 
                  type="text" 
                  value={searchTerm} 
                  onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full border p-2 rounded"
                  placeholder="検索..." 
                />
                {showSuggestions && (
                  <div className="absolute z-10 w-full bg-white border shadow-lg max-h-40 overflow-y-auto mt-1">
                    {users.filter(u => `${u.lastName} ${u.firstName}`.includes(searchTerm)).map(u => (
                      <div key={u.id} onClick={() => handleSelectUser(u)} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">{u.lastName} {u.firstName}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div>
                <label className="text-xs font-bold text-gray-500">利用状況</label>
                <div className="flex gap-4 mt-1">
                  {['放課後','休校日','欠席'].map(st => (
  <label key={st} className="flex items-center gap-1 text-sm cursor-pointer">
    <input type="radio" checked={formData.status === st} onChange={() => setFormData({...formData, status: st as any})} /> 
    <span className={st === '欠席' ? 'text-red-600 font-bold' : ''}>
      {st === '欠席' ? st : `${st}利用`} {/* 表示だけ「利用」をつける等はお好みで */}
    </span>
  </label>
))}
                </div>
              </div>
              
              {formData.status !== '欠席' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500">開始時間</label>
                      <input type="time" value={formData.startTime} onChange={e=>setFormData({...formData, startTime: e.target.value})} className="w-full border p-2 rounded" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500">終了時間</label>
                      <input type="time" value={formData.endTime} onChange={e=>setFormData({...formData, endTime: e.target.value})} className="w-full border p-2 rounded" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500">算定時間数 (自動)</label>
                      <input type="number" step="0.1" value={formData.duration} onChange={e=>setFormData({...formData, duration: e.target.value})} className="w-full border p-2 rounded bg-gray-100" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500">延長時間数</label>
                      <input type="number" step="0.1" value={formData.extensionDuration} onChange={e=>setFormData({...formData, extensionDuration: e.target.value})} className="w-full border p-2 rounded" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500">体調</label>
                      <select value={formData.condition} onChange={e=>setFormData({...formData, condition: e.target.value as any})} className="w-full border p-2 rounded">
                        {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <h3 className="font-bold text-gray-700 border-l-4 border-orange-500 pl-2">加減算設定</h3>
            <div className="space-y-4">
              {formData.status === '欠席' ? (
                <div className="grid grid-cols-1 gap-3">
                  <SelectField label="欠席時対応加算" value={formData.absenceAddon} onChange={v=>setFormData({...formData, absenceAddon: v})} options={OPT_ABSENCE} />
                  <SelectField label="関係機関連携加算" value={formData.agencyCooperation} onChange={v=>setFormData({...formData, agencyCooperation: v})} options={OPT_AGENCY} />
                  <SelectField label="家族支援加算" value={formData.familySupport} onChange={v=>setFormData({...formData, familySupport: v})} options={OPT_FAMILY} />
                  <SelectField label="通所自立支援加算" value={formData.independenceSupport} onChange={v=>setFormData({...formData, independenceSupport: v})} options={OPT_INDEPENDENCE} />
                  <SelectField label="事業所間連携加算" value={formData.interAgencyCooperation} onChange={v=>setFormData({...formData, interAgencyCooperation: v})} options={OPT_INTER_AGENCY} />
                  <SelectField label="自立サポート加算" value={formData.selfRelianceSupport} onChange={v=>setFormData({...formData, selfRelianceSupport: v})} options={OPT_SELF_RELIANCE} />
                </div>
              ) : (
                <>
                  <SelectField label="支援時間区分 (自動算出)" value={formData.timeClass} onChange={v=>setFormData({...formData, timeClass: v})} options={['', ...SERVICE_TIME_CLASSES]} />
                  <SelectField label="延長支援加算" value={formData.extendedSupportAddon} onChange={v=>setFormData({...formData, extendedSupportAddon: v})} options={EXTENDED_ADDONS} />
                  <div className="border-t my-2"></div>
                  <p className="text-xs font-bold text-gray-400">個別設定加算</p>
                  <div className="grid grid-cols-1 gap-3">
                    <SelectField label="子育てサポート加算" value={formData.childcareSupport} onChange={v=>setFormData({...formData, childcareSupport: v})} options={['加算しない', '加算する']} />
                    <SelectField label="個別サポート加算" value={formData.individualSupport} onChange={v=>setFormData({...formData, individualSupport: v})} options={OPT_INDIVIDUAL} />
                    <SelectField label="専門的支援実施加算" value={formData.specializedSupport} onChange={v=>setFormData({...formData, specializedSupport: v})} options={['加算しない', '加算する']} />
                    <SelectField label="関係機関連携加算" value={formData.agencyCooperation} onChange={v=>setFormData({...formData, agencyCooperation: v})} options={OPT_AGENCY} />
                    <SelectField label="家族支援加算" value={formData.familySupport} onChange={v=>setFormData({...formData, familySupport: v})} options={OPT_FAMILY} />
                    <SelectField label="送迎加算" value={formData.transportation} onChange={v=>setFormData({...formData, transportation: v})} options={OPT_TRANSPORT} />
                    <SelectField label="通所自立支援加算" value={formData.independenceSupport} onChange={v=>setFormData({...formData, independenceSupport: v})} options={OPT_INDEPENDENCE} />
                    <SelectField label="事業所間連携加算" value={formData.interAgencyCooperation} onChange={v=>setFormData({...formData, interAgencyCooperation: v})} options={OPT_INTER_AGENCY} />
                    <SelectField label="医療連携体制加算" value={formData.medicalSupport} onChange={v=>setFormData({...formData, medicalSupport: v})} options={OPT_MEDICAL} />
                    <SelectField label="自立サポート加算" value={formData.selfRelianceSupport} onChange={v=>setFormData({...formData, selfRelianceSupport: v})} options={OPT_SELF_RELIANCE} />
                    <SelectField label="強度行動障害児支援加算" value={formData.intenseBehaviorSupport} onChange={v=>setFormData({...formData, intenseBehaviorSupport: v})} options={OPT_INTENSE} />
                  </div>
                  <div className="border-t my-2"></div>
                  <p className="text-xs font-bold text-gray-400">事業所体制加算</p>
                  <div className="grid grid-cols-1 gap-3">
                    <SelectField label="福祉専門職員配置等加算" value={formData.welfareSpecialist} onChange={v=>setFormData({...formData, welfareSpecialist: v})} options={OPT_WELFARE} />
                    <SelectField label="児童指導員等加配加算" value={formData.staffAddon} onChange={v=>setFormData({...formData, staffAddon: v})} options={OPT_STAFF_ADDON} />
                    <SelectField label="専門的支援体制加算" value={formData.specializedSystem} onChange={v=>setFormData({...formData, specializedSystem: v})} options={['加算しない', '加算する']} />
                  </div>
                  <div className="border-t my-2"></div>
                  <p className="text-xs font-bold text-red-400">減算</p>
                  <div className="grid grid-cols-1 gap-3">
                    <SelectField label="個別支援計画未作成減算" value={formData.planMissing} onChange={v=>setFormData({...formData, planMissing: v})} options={OPT_DEDUCTION} />
                    <SelectField label="児発管欠如減算" value={formData.managerMissing} onChange={v=>setFormData({...formData, managerMissing: v})} options={OPT_DEDUCTION} />
                    <SelectField label="サービス提供職員欠如減算" value={formData.staffMissing} onChange={v=>setFormData({...formData, staffMissing: v})} options={OPT_DEDUCTION} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* === 右カラム: 記録・目標 (変更なしのため省略、元のJSXを利用) === */}
        <div className="space-y-6 overflow-y-auto pr-2">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <h3 className="font-bold text-gray-700 border-l-4 border-green-500 pl-2">支援記録</h3>
            <div>
              <label className="text-xs font-bold text-gray-500">トレーニング内容</label>
              <div className="w-full min-h-[40px] p-2 bg-gray-50 border rounded text-sm text-gray-700">
                {formData.trainingContent || <span className="text-gray-400 text-xs">（登録されたトレーニングはありません）</span>}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">支援内容</label>
              <textarea value={formData.supportContent} onChange={e=>setFormData({...formData, supportContent: e.target.value})} className="w-full border p-2 rounded h-24 text-sm" placeholder="本日の様子など" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">スタッフへの共有事項</label>
              <textarea value={formData.staffSharing} onChange={e=>setFormData({...formData, staffSharing: e.target.value})} className="w-full border p-2 rounded h-20 text-sm" placeholder="申し送り事項" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <h3 className="font-bold text-gray-700 border-l-4 border-purple-500 pl-2">目標・コメント</h3>
            {!activePlan ? (
              <p className="text-sm text-gray-400 p-4 text-center">本番の個別支援計画が存在しません</p>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">長期目標</label>
                    {/* 🔽 whitespace-pre-wrap を追加 🔽 */}
                    <div className="bg-gray-50 p-2 rounded text-sm border whitespace-pre-wrap">{activePlan.longTermGoal}</div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">短期目標</label>
                    {/* 🔽 whitespace-pre-wrap を追加 🔽 */}
                    <div className="bg-gray-50 p-2 rounded text-sm border whitespace-pre-wrap">{activePlan.shortTermGoal}</div>
                  </div>
                </div>
                {activePlan.supportTargets?.sort((a:any,b:any)=>Number(a.displayOrder)-Number(b.displayOrder)).map((target: any, idx: number) => (
                  <div key={idx} className="border-t pt-4">
                    <div className="mb-2">
                      <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">支援目標 {target.displayOrder}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 mb-2">
                      <div className="text-sm font-bold text-gray-800">{target.goal}</div>
                      {/* 🔽 whitespace-pre-wrap を追加 🔽 */}
                      <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded whitespace-pre-wrap">{target.content}</div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500">コメント</label>
                      {/* 🔽 input から textarea に変更 🔽 */}
                      <textarea 
                        className="w-full border p-2 rounded text-sm h-20 resize-y" // 高さ固定(h-20)と縦のみリサイズ可(resize-y)を追加
                        placeholder="この目標に対する本日の様子を入力してください..."
                        value={targetComments[target.id] || ''}
                        onChange={(e) => setTargetComments({...targetComments, [target.id]: e.target.value})}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 flex justify-end gap-4 z-20 shadow-lg lg:col-span-2">
           <button onClick={() => router.back()} className="px-6 py-2 bg-gray-100 rounded hover:bg-gray-200 font-bold text-gray-600">キャンセル</button>
           <button onClick={handleSave} className="px-8 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-md">保存</button>
        </div>

      </div>
    </AppLayout>
  );
}

// 共通Selectコンポーネント (変更なし)
const SelectField = ({ label, value, onChange, options }: { label: string, value: string, onChange: (v: string) => void, options: string[] }) => (
  <div className="flex flex-col">
    <label className="text-xs font-bold text-gray-500 mb-1">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="border p-2 rounded text-sm bg-white">
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);