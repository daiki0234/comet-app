"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react'; // ★ 1. useMemo を追加
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, // ★ 2. マスタ読み込み
  getDocs, 
  query, 
  orderBy, 
  Timestamp  // ★ 2. マスタ読み込み
} from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';
import toast from 'react-hot-toast';

// --- ★ 3. マスタの型定義 ---

interface Municipality {
  id: string; name: string; code: string; updatedAt: Timestamp | null;
}
interface Facility {
  id: string; code: string; name: string; phone: string; fax: string; contactPerson: string; updatedAt: Timestamp | null;
}
interface School {
  id: string; name: string; type: string; phone: string; updatedAt: Timestamp | null;
}
interface Addition {
  id: string; name: string; details: string; points: number; target: string; updatedAt: Timestamp | null;
}
type AdditionMap = Map<string, Addition[]>;
type ManagedByOffice = { name: string; officeNo: string; tel: string; fax: string; };

// ★ 4. 利用者データの型定義 (加算情報を変更)
type UserData = {
  lastName: string; firstName: string; lastKana: string; firstKana: string;
  birthday: string; gender: string; schoolName: string; schoolGrade: string;
  guardianLastName: string; guardianFirstName: string; postalCode: string;
  address: string; contact: string; contactPerson: string; allergies: string;
  serviceHoDay: ServiceStatus; serviceJihatsu: ServiceStatus; serviceSoudan: ServiceStatus;
  jukyushaNo: string; issueDate: string; cityNo: string; cityName: string;
  daysSpecified: string; daysDeducted: boolean; decisionStartDate: string; decisionEndDate: string;
  upperLimitAmount: string; upperLimitStartDate: string; upperLimitEndDate: string;
  contractStartDate: string; contractEndDate: string; providerNoteNo: string; contractedAmount: string;
  
  // ▼▼▼ 加算情報を配列に変更 ▼▼▼
  appliedAdditions: { name: string; details: string; }[];
  
  // ▼▼▼ 古い加算フィールド (読み込み時のみ使用) ▼▼▼
  individualSupportSurcharge?: string;
  selfRelianceSurcharge?: string;
  
  capManagementType: string; capOfficeNo: string; capOfficeName: string;
  managedByOffices: ManagedByOffice[];
};

type ServiceStatus = '契約なし' | '利用中' | '休止中' | '契約終了';

const toServiceStatus = (v: unknown): ServiceStatus => {
  if (v === '1' || v === 1 || v === true || v === '利用中') return '利用中';
  if (v === '休止中') return '休止中';
  if (v === '契約終了') return '契約終了';
  return '契約なし';
};

const toCsvFlag = (s: ServiceStatus): string => (s === '利用中' ? '1' : '');

type Props = { params: { id: string; } };

const RequiredBadge = () => (
  <span className="ml-2 bg-red-500 text-white text-xs font-medium px-2.5 py-0.5 rounded-full">必須</span>
);

export default function UserDetailPage({ params }: Props) {
  const router = useRouter();
  const userId = params.id;

  const [formData, setFormData] = useState<UserData | null>(null);
  const [initialFormData, setInitialFormData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  // ★ 5. マスタデータ読み込み State
  const [mastersLoading, setMastersLoading] = useState(true);
  const [municipalitiesList, setMunicipalitiesList] = useState<Municipality[]>([]);
  const [facilitiesList, setFacilitiesList] = useState<Facility[]>([]);
  const [schoolsList, setSchoolsList] = useState<School[]>([]);
  const [additionsList, setAdditionsList] = useState<Addition[]>([]);
  const [selectedFacilityToAdd, setSelectedFacilityToAdd] = useState<string>('');

  // ★ 6. マスタデータと利用者データを並行して読み込み
  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    setMastersLoading(true);
    try {
      // マスタデータの読み込み
      const [muniSnap, facSnap, schoolSnap, addSnap] = await Promise.all([
        getDocs(query(collection(db, 'municipalities'), orderBy('code'))),
        getDocs(query(collection(db, 'facilities'), orderBy('name'))),
        getDocs(query(collection(db, 'schools'), orderBy('name'))),
        getDocs(query(collection(db, 'additions'), orderBy('name')))
      ]);
      setMunicipalitiesList(muniSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Municipality)));
      setFacilitiesList(facSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Facility)));
      setSchoolsList(schoolSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as School)));
      setAdditionsList(addSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Addition)));
      setMastersLoading(false);

      // 利用者データの読み込み
      const docRef = doc(db, "users", userId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const raw = docSnap.data() as any;
        
        // ★★★ 7. データ移行ロジック ★★★
        let migratedAdditions: { name: string; details: string; }[] = [];
        
        if (raw.appliedAdditions) {
          // 新しいデータ形式が既に存在する
          migratedAdditions = raw.appliedAdditions;
        } else {
          // 古いデータ形式の場合、変換を試みる
          if (raw.individualSupportSurcharge && raw.individualSupportSurcharge !== 'なし') {
            migratedAdditions.push({
              name: "個別サポート加算",
              details: `個別サポート加算(${raw.individualSupportSurcharge})` // "Ⅰ" -> "個別サポート加算(Ⅰ)"
            });
          }
          if (raw.selfRelianceSurcharge && raw.selfRelianceSurcharge !== '無し') {
            migratedAdditions.push({
              name: "通所自立支援加算",
              details: "通所自立支援加算" // 古いデータは "有り" しかないため
            });
          }
          // (他の古い加算フィールドがあれば、ここに追加)
        }
        // ★★★ 移行ロジックここまで ★★★

        const data: UserData = {
          ...raw,
          serviceHoDay: toServiceStatus(raw.serviceHoDay),
          serviceJihatsu: toServiceStatus(raw.serviceJihatsu),
          serviceSoudan: toServiceStatus(raw.serviceSoudan),
          appliedAdditions: migratedAdditions, // ★ 移行後のデータをセット
          managedByOffices: raw.managedByOffices || [],
        };
        
        setFormData(data);
        setInitialFormData(data);
      } else {
        toast.error("利用者が見つかりません");
        setFormData(null);
      }
    } catch (error) {
      console.error("データ読み込みエラー:", error);
      toast.error("データの読み込みに失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);
  
  // ★ 8. 加算マスタを「依存プルダウン」用に変換
  const additionMap = useMemo<AdditionMap>(() => {
    const map: AdditionMap = new Map();
    additionsList.forEach(addition => {
      if (!map.has(addition.name)) {
        map.set(addition.name, []);
      }
      map.get(addition.name)!.push(addition);
    });
    return map;
  }, [additionsList]);
  
  const additionNameList = useMemo(() => Array.from(additionMap.keys()), [additionMap]);


  // --- フォーム入力処理 ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!formData) return;
    let { name, value, type } = e.target;
    if (name === 'postalCode') value = value.replace(/-/g, '').replace(/[^0-9]/g, '');
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData(prev => prev ? { ...prev, [name]: checked } : null);
    } else {
      setFormData(prev => prev ? { ...prev, [name]: value } : null);
    }
  };

  // ★ 9. 市町村マスタ連動
  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedMuni = municipalitiesList.find(m => m.id === selectedId);
    setFormData(prev => prev ? { 
      ...prev, 
      cityName: selectedMuni ? selectedMuni.name : '',
      cityNo: selectedMuni ? selectedMuni.code : ''
    } : null);
  };

  // ★ 10. 上限管理事業所マスタ連動
  const handleCapOfficeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedFacility = facilitiesList.find(f => f.id === selectedId);
    setFormData(prev => prev ? { 
      ...prev, 
      capOfficeName: selectedFacility ? selectedFacility.name : '',
      capOfficeNo: selectedFacility ? selectedFacility.code : ''
    } : null);
  };
  
  // ★ 11. 加算情報の変更処理 (新規登録ページからコピー)
  const handleAppliedAdditionChange = (index: number, field: 'name' | 'details', value: string) => {
    if (!formData) return;
    const newAdditions = [...formData.appliedAdditions];
    const currentAddition = { ...newAdditions[index] };
    if (field === 'name') {
      currentAddition.name = value;
      const detailsList = additionMap.get(value);
      currentAddition.details = detailsList && detailsList.length > 0 ? detailsList[0].details : '';
    } else {
      currentAddition.details = value;
    }
    newAdditions[index] = currentAddition;
    setFormData(prev => prev ? { ...prev, appliedAdditions: newAdditions } : null);
  };

  const addAppliedAddition = () => {
    if (!formData) return;
    const defaultName = additionNameList.length > 0 ? additionNameList[0] : '';
    const detailsList = additionMap.get(defaultName);
    const defaultDetails = detailsList && detailsList.length > 0 ? detailsList[0].details : '';
    setFormData(prev => prev ? { 
      ...prev, 
      appliedAdditions: [
        ...prev.appliedAdditions, 
        { name: defaultName, details: defaultDetails }
      ] 
    } : null);
  };
  
  const removeAppliedAddition = (index: number) => {
    if (!formData) return;
    setFormData(prev => prev ? { 
      ...prev, 
      appliedAdditions: prev.appliedAdditions.filter((_, i) => i !== index)
    } : null);
  };

  // ★ 12. 被上限管理事業所の追加（マスタから）
  const addManagedByOffice = () => {
    if (!formData || !selectedFacilityToAdd) {
      toast.error('事業所マスタから追加する事業所を選択してください。');
      return;
    }
    const facility = facilitiesList.find(f => f.id === selectedFacilityToAdd);
    if (!facility) return;
    if (formData.managedByOffices.some(office => office.officeNo === facility.code)) {
      toast.error('この事業所は既に追加されています。');
      return;
    }
    setFormData(prev => prev ? { 
      ...prev, 
      managedByOffices: [
        ...prev.managedByOffices, 
        { name: facility.name, officeNo: facility.code, tel: facility.phone || '', fax: facility.fax || '' }
      ] 
    } : null);
    setSelectedFacilityToAdd('');
  };
  const removeManagedByOffice = (index: number) => {
    if (!formData) return;
    setFormData(prev => prev ? { ...prev, managedByOffices: prev.managedByOffices.filter((_, i) => i !== index) } : null);
  };

  // (handlePostalCodeSearch は変更なし)
  const handlePostalCodeSearch = async () => { /* ... (省略) ... */ };
  
  // (handleCancelEdit は変更なし)
  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormData(initialFormData);
  };

  // ★ 13. 更新処理 (古い加算フィールドを削除)
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    setIsSubmitting(true);
    const loadingToast = toast.loading('情報を更新中です...');
    const docRef = doc(db, "users", userId);
    try {
      const payload: any = { // ★ any型にして delete を許可
        ...formData,
        serviceHoDay: toCsvFlag(formData.serviceHoDay),
        serviceJihatsu: toCsvFlag(formData.serviceJihatsu),
        serviceSoudan: toCsvFlag(formData.serviceSoudan),
      };

      // ★★★ データ移行：古いフィールドをDBから削除 ★★★
      delete payload.individualSupportSurcharge;
      delete payload.selfRelianceSurcharge;
      // (他の古い加算フィールドがあれば、ここで delete)
      // ★★★ 移行ここまで ★★★

      await updateDoc(docRef, payload);
      toast.success('利用者情報を正常に更新しました。', { id: loadingToast });
      setIsEditing(false);
      setInitialFormData(formData); // 更新後のデータを初期値としてセット
    } catch (error) {
      console.error("更新エラー:", error);
      toast.error('更新に失敗しました。', { id: loadingToast });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <AppLayout pageTitle="読み込み中..."><div className="text-center p-8">読み込み中...</div></AppLayout>;
  }
  if (!formData) {
    return <AppLayout pageTitle="エラー"><div className="text-center p-8 text-red-600">利用者データが見つかりませんでした。</div></AppLayout>;
  }

  // --- クラス定義 (変更なし) ---
  const inputClass = "mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white";
  const disabledInputClass = "mt-1 w-full p-2 border-gray-200 bg-gray-100 rounded-md text-gray-500";
  const labelClass = "block text-sm font-medium text-gray-700";
  const inputPost = "mt-1 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500";
  const disabledPostClass = "mt-1 p-2 border-gray-200 bg-gray-100 rounded-md text-gray-500";


  // --- ★ 14. タブごとのレンダリング (UIをマスタ連携に変更) ---

  const renderBasicInfoTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {/* ... (姓, 名, かな, 生年月日, 性別 ... は変更なし) ... */}
        <div><label className={labelClass}>姓<RequiredBadge /></label><input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>名<RequiredBadge /></label><input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>ふりがな（せい）<RequiredBadge /></label><input type="text" name="lastKana" value={formData.lastKana} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>ふりがな（めい）<RequiredBadge /></label><input type="text" name="firstKana" value={formData.firstKana} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>生年月日<RequiredBadge /></label><input type="date" name="birthday" value={formData.birthday} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>性別</label><select name="gender" value={formData.gender} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>男性</option><option>女性</option><option>その他</option></select></div>
        
        {/* ★ 学校名 (プルダウンに変更) */}
        <div>
          <label className={labelClass}>学校名</label>
          <select 
            name="schoolName" 
            value={formData.schoolName} // valueは名前(string)のまま
            onChange={handleChange} 
            disabled={!isEditing || mastersLoading}
            className={isEditing ? inputClass : disabledInputClass}
          >
            <option value="">{mastersLoading ? 'マスタ読込中...' : '学校を選択'}</option>
            {schoolsList.map(school => (
              <option key={school.id} value={school.name}>
                {school.name} ({school.type})
              </option>
            ))}
            {/* 既に手入力されている値がリストにない場合も表示する */}
            {formData.schoolName && !schoolsList.some(s => s.name === formData.schoolName) && (
              <option value={formData.schoolName}>
                {formData.schoolName} (マスタにない値)
              </option>
            )}
          </select>
        </div>
        
        <div><label className={labelClass}>学年</label><input type="text" name="schoolGrade" value={formData.schoolGrade} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        {/* ... (保護者, 郵便番号, 住所 ... は変更なし) ... */}
        <div><label className={labelClass}>保護者氏名（姓）</label><input type="text" name="guardianLastName" value={formData.guardianLastName} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>保護者氏名（名）</label><input type="text" name="guardianFirstName" value={formData.guardianFirstName} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div className="md:col-span-2"><label className={labelClass}>郵便番号</label><div className="flex items-center space-x-2 mt-1"><input type="text" name="postalCode" value={formData.postalCode} onChange={handleChange} placeholder="1234567" disabled={!isEditing} className={isEditing ? inputPost : disabledPostClass} /><button type="button" onClick={handlePostalCodeSearch} disabled={!isEditing} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg disabled:bg-gray-100 disabled:text-gray-400">住所検索</button></div></div>
        <div className="md:col-span-2"><label className={labelClass}>住所</label><input type="text" name="address" value={formData.address} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-6"><div><label className={labelClass}>連絡先</label><input type="tel" name="contact" value={formData.contact} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div><div><label className={labelClass}>続柄など</label><input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleChange} placeholder="例：母" disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div></div>
        <div className="md:col-span-2"><label className={labelClass}>アレルギー・持病など</label><textarea name="allergies" value={formData.allergies} onChange={handleChange} rows={4} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} ></textarea></div>
      </div>
    </div>
  );

  const renderServiceInfoTab = () => (
    <div className="space-y-6">
      {/* 利用サービス (変更なし) */}
      <div className="p-4 border rounded-lg bg-gray-50"><h3 className="text-lg font-semibold text-gray-800 mb-4">利用サービス</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div><label className={labelClass}>放課後等デイサービス</label><select name="serviceHoDay" value={formData.serviceHoDay} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>契約なし</option><option>利用中</option><option>休止中</option><option>契約終了</option></select></div>
        <div><label className={labelClass}>児童発達支援</label><select name="serviceJihatsu" value={formData.serviceJihatsu} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>契約なし</option><option>利用中</option><option>休止中</option><option>契約終了</option></select></div>
        <div><label className={labelClass}>相談支援</label><select name="serviceSoudan" value={formData.serviceSoudan} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>契約なし</option><option>利用中</option><option>休止中</option><option>契約終了</option></select></div>
      </div></div>
      
      {/* 受給者証情報 */}
      <div className="p-4 border rounded-lg bg-gray-50"><h3 className="text-lg font-semibold text-gray-800 mb-4">受給者証情報</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div><label className="text-sm">受給者証番号</label><input type="text" name="jukyushaNo" value={formData.jukyushaNo} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">交付年月日</label><input type="date" name="issueDate" value={formData.issueDate} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        
        {/* ★ 市町村 (プルダウンと自動入力) */}
        <div>
          <label className="text-sm">支給市町村名</label>
          <select 
            value={municipalitiesList.find(m => m.name === formData.cityName)?.id || ''}
            onChange={handleCityChange}
            disabled={!isEditing || mastersLoading}
            className={isEditing ? inputClass : disabledInputClass}
          >
            <option value="">{mastersLoading ? 'マスタ読込中...' : '市町村を選択'}</option>
            {municipalitiesList.map(muni => (
              <option key={muni.id} value={muni.id}>
                {muni.name} ({muni.code})
              </option>
            ))}
            {formData.cityName && !municipalitiesList.some(m => m.name === formData.cityName) && (
              <option value={formData.cityName}>
                {formData.cityName} (マスタにない値)
              </option>
            )}
          </select>
        </div>
        <div>
          <label className="text-sm">支給市町村番号</label>
          <input type="text" name="cityNo" value={formData.cityNo} readOnly className={disabledInputClass} />
        </div>
        
        {/* ... (支給量, 給付決定日 ... は変更なし) ... */}
        <div><label className="text-sm">給付決定支給量等(指定日数)</label><input type="number" name="daysSpecified" value={formData.daysSpecified} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div className="flex items-center pt-6"><input type="checkbox" name="daysDeducted" checked={formData.daysDeducted} onChange={handleChange} disabled={!isEditing} className="h-4 w-4 rounded" /><label className="ml-2 text-sm">当該月の日数から指定日数を控除</label></div>
        <div><label className="text-sm">給付決定開始日</label><input type="date" name="decisionStartDate" value={formData.decisionStartDate} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">給付決定終了日</label><input type="date" name="decisionEndDate" value={formData.decisionEndDate} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">利用者負担上限月額</label><input type="number" name="upperLimitAmount" value={formData.upperLimitAmount} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div></div>
        <div><label className="text-sm">利用者負担適用期間(開始日)</label><input type="date" name="upperLimitStartDate" value={formData.upperLimitStartDate} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">利用者負担適用期間(終了日)</label><input type="date" name="upperLimitEndDate" value={formData.upperLimitEndDate} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">契約開始日</label><input type="date" name="contractStartDate" value={formData.contractStartDate} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">契約終了日</label><input type="date" name="contractEndDate" value={formData.contractEndDate} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">事業者記入欄番号</label><input type="text" name="providerNoteNo" value={formData.providerNoteNo} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">契約支給量</label><input type="number" name="contractedAmount" value={formData.contractedAmount} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
      </div></div>
      
      {/* ★ 加算情報 (新しいUIに変更) */}
      <div className="p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">加算情報</h3>
        <div className="space-y-4">
          {formData.appliedAdditions.map((addition, index) => (
            <div key={index} className="p-4 border rounded-md bg-white relative">
              {isEditing && (
                <button type="button" onClick={() => removeAppliedAddition(index)} className="absolute top-2 right-2 text-red-500 hover:text-red-700">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                </button>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm">加算名</label>
                  <select 
                    value={addition.name} 
                    onChange={(e) => handleAppliedAdditionChange(index, 'name', e.target.value)}
                    disabled={!isEditing || mastersLoading}
                    className={isEditing ? inputClass : disabledInputClass}
                  >
                    {additionNameList.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    {/* マスタにない古い値も表示 */}
                    {addition.name && !additionNameList.includes(addition.name) && (
                      <option value={addition.name}>{addition.name} (旧)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-sm">加算内容</label>
                  <select 
                    value={addition.details} 
                    onChange={(e) => handleAppliedAdditionChange(index, 'details', e.target.value)}
                    disabled={!isEditing || mastersLoading}
                    className={isEditing ? inputClass : disabledInputClass}
                  >
                    {(additionMap.get(addition.name) || []).map(detailItem => (
                      <option key={detailItem.id} value={detailItem.details}>
                        {detailItem.details} ({detailItem.points}点)
                      </option>
                    ))}
                    {/* マスタにない古い値も表示 */}
                    {addition.details && !(additionMap.get(addition.name) || []).some(d => d.details === addition.details) && (
                      <option value={addition.details}>{addition.details} (旧)</option>
                    )}
                  </select>
                </div>
              </div>
            </div>
          ))}
          {isEditing && (
            <button 
              type="button" 
              onClick={addAppliedAddition} 
              className="w-full flex items-center justify-center p-2 border-2 border-dashed rounded-lg text-blue-600 hover:bg-blue-50"
              disabled={mastersLoading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span className="ml-2">加算項目を追加</span>
            </button>
          )}
        </div>
      </div>
      
      {/* ★ 上限管理 (プルダウンに変更) */}
      <div className="p-4 border rounded-lg bg-gray-50"><h3 className="text-lg font-semibold text-gray-800 mb-4">上限管理</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div><label className="text-sm">上限管理</label><select name="capManagementType" value={formData.capManagementType} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>なし</option><option>上限管理</option><option>被上限管理</option><option>上限管理(複数児童)</option></select></div>
        <div></div>
        <div>
          <label className="text-sm">上限管理事業所名</label>
          <select 
            value={facilitiesList.find(f => f.name === formData.capOfficeName)?.id || ''}
            onChange={handleCapOfficeChange}
            disabled={!isEditing || mastersLoading}
            className={isEditing ? inputClass : disabledInputClass}
          >
            <option value="">{mastersLoading ? 'マスタ読込中...' : '事業所を選択'}</option>
            {facilitiesList.map(fac => (
              <option key={fac.id} value={fac.id}>
                {fac.name} ({fac.code})
              </option>
            ))}
            {formData.capOfficeName && !facilitiesList.some(f => f.name === formData.capOfficeName) && (
              <option value={formData.capOfficeName}>
                {formData.capOfficeName} (マスタにない値)
              </option>
            )}
          </select>
        </div>
        <div>
          <label className="text-sm">上限管理事業所番号</label>
          <input type="text" name="capOfficeNo" value={formData.capOfficeNo} readOnly className={disabledInputClass} />
        </div>
      </div></div>
      
      {/* ★ 被上限管理事業所 (マスタから追加) */}
      <div className="p-4 border rounded-lg bg-gray-50"><h3 className="text-lg font-semibold text-gray-800 mb-4">被上限管理事業所</h3><div className="space-y-4">
        {formData.managedByOffices.map((office, index) => (
          <div key={index} className="p-4 border rounded-md bg-white relative">
            {isEditing && <button type="button" onClick={() => removeManagedByOffice(index)} className="absolute top-2 right-2 text-red-500 hover:text-red-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            </button>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 編集モードでもマスタから入れたデータは readOnly */}
              <div><label className="text-sm">事業所名</label><input type="text" value={office.name} readOnly disabled={!isEditing} className={disabledInputClass} /></div>
              <div><label className="text-sm">指定事業所番号</label><input type="text" value={office.officeNo} readOnly disabled={!isEditing} className={disabledInputClass} /></div>
              <div><label className="text-sm">電話番号</label><input type="text" value={office.tel} readOnly disabled={!isEditing} className={disabledInputClass} /></div>
              <div><label className="text-sm">FAX番号</label><input type="text" value={office.fax} readOnly disabled={!isEditing} className={disabledInputClass} /></div>
            </div>
          </div>
        ))}
        {isEditing && (
          <div className="flex items-center gap-2">
            <select 
              value={selectedFacilityToAdd}
              onChange={(e) => setSelectedFacilityToAdd(e.target.value)}
              className="w-full p-2 border-gray-300 border rounded-md bg-white"
              disabled={mastersLoading}
            >
              <option value="">{mastersLoading ? 'マスタ読込中...' : '追加する事業所を選択'}</option>
              {facilitiesList.map(fac => (
                <option key={fac.id} value={fac.id}>
                  {fac.name} ({fac.code})
                </option>
              ))}
            </select>
            <button 
              type="button" 
              onClick={addManagedByOffice} 
              className="p-2 border-2 border-dashed rounded-lg text-blue-600 hover:bg-blue-50"
              disabled={mastersLoading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
        )}
      </div></div>
    </div>
  );

  return (
    <AppLayout pageTitle={`利用者情報: ${formData.lastName} ${formData.firstName}`}>
      <form onSubmit={handleUpdate}>
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-ios border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <div className="flex border-b border-gray-200">
              <button type="button" onClick={() => setActiveTab('basic')} className={`py-3 px-4 text-sm font-medium ${activeTab === 'basic' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>基本情報</button>
              <button type="button" onClick={() => setActiveTab('service')} className={`py-3 px-4 text-sm font-medium ${activeTab === 'service' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>サービス情報</button>
            </div>
            {!isEditing && (
              <button type="button" onClick={() => setIsEditing(true)} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">編集する</button>
            )}
          </div>

          <div className="mt-6">
            {activeTab === 'basic' ? renderBasicInfoTab() : renderServiceInfoTab()}
          </div>

          {isEditing && (
            <div className="flex items-center justify-end space-x-4 pt-6 mt-6 border-t border-gray-200">
              <button type="button" onClick={handleCancelEdit} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">キャンセル</button>
              <button type="submit" disabled={isSubmitting || mastersLoading} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400">
                {isSubmitting ? '更新中...' : '更新を保存'}
              </button>
            </div>
          )}
        </div>
      </form>
    </AppLayout>
  );
}