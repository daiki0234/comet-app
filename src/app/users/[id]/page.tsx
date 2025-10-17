"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';
import toast from 'react-hot-toast'; // ★ toastをインポート

// 型定義
type ManagedByOffice = { name: string; officeNo: string; tel: string; fax: string; };
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
  individualSupportSurcharge: string;
  selfRelianceSurcharge: string;
  capManagementType: string; capOfficeNo: string; capOfficeName: string;
  managedByOffices: ManagedByOffice[];
};

type ServiceStatus = '契約なし' | '利用中' | '休止中' | '契約終了';

// CSV/DB → 画面表示用
const toServiceStatus = (v: unknown): ServiceStatus => {
  // "1" / 1 / true は「利用中」とみなす。それ以外は「契約なし」へ寄せる
  return v === '1' || v === 1 || v === true ? '利用中' : '契約なし';
};

// 画面表示用 → CSV/DB
const toCsvFlag = (s: ServiceStatus): string => (s === '利用中' ? '1' : '');

type Props = { params: { id: string; } };

// ★★★ 必須マークのコンポーネント ★★★
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

  const fetchUser = useCallback(async () => {
    setIsLoading(true);
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as UserData;
      const raw = docSnap.data() as any;
      const data: UserData = {
        ...raw,
        serviceHoDay: toServiceStatus(raw.serviceHoDay),
        serviceJihatsu: toServiceStatus(raw.serviceJihatsu),
        serviceSoudan: toServiceStatus(raw.serviceSoudan),
      };
      if (!data.managedByOffices) {
        data.managedByOffices = [];
      }
      setFormData(data);
      setInitialFormData(data);
    } else {
      console.log("利用者が見つかりません");
      setFormData(null);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

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

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    setIsSubmitting(true);
    const loadingToast = toast.loading('情報を更新中です...'); // ★ ローディング通知
    const docRef = doc(db, "users", userId);
    try {
      await updateDoc(docRef, { ...formData });
         const payload = {
     ...formData,
     serviceHoDay: toCsvFlag(formData.serviceHoDay),
     serviceJihatsu: toCsvFlag(formData.serviceJihatsu),
     serviceSoudan: toCsvFlag(formData.serviceSoudan),
   };
   await updateDoc(docRef, payload);
      toast.success('利用者情報を正常に更新しました。', { id: loadingToast }); // ★ 成功通知
      setIsEditing(false);
      setInitialFormData(formData);
    } catch (error) {
      console.error("更新エラー:", error);
      toast.error('更新に失敗しました。', { id: loadingToast }); // ★ エラー通知
    } finally {
      setIsSubmitting(false);
    }
  };

const handlePostalCodeSearch = async () => {
 // ✅ formData 自体の null を先にガード
  if (!formData || !formData.postalCode) {
    toast.error('郵便番号を入力してください。');
    return;
  }
  try {
    const response = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${encodeURIComponent(formData.postalCode)}`
    );
    const data = await response.json();

    if (data?.status === 200 && Array.isArray(data.results) && data.results.length > 0) {
      const r = data.results[0];
      const fullAddress = `${r.address1 ?? ''}${r.address2 ?? ''}${r.address3 ?? ''}`;
      // ✅ prev が null の可能性も考慮して安全に更新
      setFormData(prev => (prev ? { ...prev, address: fullAddress } : prev));
      toast.success('住所を自動入力しました。');
    } else {
      toast.error('該当する住所が見つかりませんでした。');
    }
  } catch (error) {
    console.error('住所検索エラー:', error);
    toast.error('住所の検索に失敗しました。');
  }
};
  

  const handleManagedByOfficeChange = (index: number, field: keyof ManagedByOffice, value: string) => {
    if (!formData) return;
    const updatedOffices = [...formData.managedByOffices];
    updatedOffices[index] = { ...updatedOffices[index], [field]: value };
    setFormData(prev => prev ? { ...prev, managedByOffices: updatedOffices } : null);
  };
  const addManagedByOffice = () => {
    if (!formData) return;
    setFormData(prev => prev ? { ...prev, managedByOffices: [...prev.managedByOffices, { name: '', officeNo: '', tel: '', fax: '' }] } : null);
  };
  const removeManagedByOffice = (index: number) => {
    if (!formData) return;
    const updatedOffices = formData.managedByOffices.filter((_, i) => i !== index);
    setFormData(prev => prev ? { ...prev, managedByOffices: updatedOffices } : null);
  };
  
  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormData(initialFormData);
  };

  if (isLoading) {
    return <AppLayout pageTitle="読み込み中..."><div className="text-center p-8">読み込み中...</div></AppLayout>;
  }
  if (!formData) {
    return <AppLayout pageTitle="エラー"><div className="text-center p-8 text-red-600">利用者データが見つかりませんでした。</div></AppLayout>;
  }

  const inputClass = "mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500";
  const disabledInputClass = "mt-1 w-full p-2 border-gray-200 bg-gray-100 rounded-md text-gray-500";
  const labelClass = "block text-sm font-medium text-gray-700";
  const inputPost = "mt-1 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500";
  const disabledPostClass = "mt-1 p-2 border-gray-200 bg-gray-100 rounded-md text-gray-500";

  const renderBasicInfoTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div><label className={labelClass}>姓<RequiredBadge /></label><input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>名<RequiredBadge /></label><input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>ふりがな（せい）<RequiredBadge /></label><input type="text" name="lastKana" value={formData.lastKana} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>ふりがな（めい）<RequiredBadge /></label><input type="text" name="firstKana" value={formData.firstKana} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>生年月日<RequiredBadge /></label><input type="date" name="birthday" value={formData.birthday} onChange={handleChange} required disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>性別</label><select name="gender" value={formData.gender} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>男性</option><option>女性</option><option>その他</option></select></div>
        <div><label className={labelClass}>学校名</label><input type="text" name="schoolName" value={formData.schoolName} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className={labelClass}>学年</label><input type="text" name="schoolGrade" value={formData.schoolGrade} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
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
      <div className="p-4 border rounded-lg bg-gray-50"><h3 className="text-lg font-semibold text-gray-800 mb-4">利用サービス</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div><label className={labelClass}>放課後等デイサービス</label><select name="serviceHoDay" value={formData.serviceHoDay} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>契約なし</option><option>利用中</option><option>休止中</option><option>契約終了</option></select></div>
        <div><label className={labelClass}>児童発達支援</label><select name="serviceJihatsu" value={formData.serviceJihatsu} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>契約なし</option><option>利用中</option><option>休止中</option><option>契約終了</option></select></div>
        <div><label className={labelClass}>相談支援</label><select name="serviceSoudan" value={formData.serviceSoudan} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>契約なし</option><option>利用中</option><option>休止中</option><option>契約終了</option></select></div>
      </div></div>
      <div className="p-4 border rounded-lg bg-gray-50"><h3 className="text-lg font-semibold text-gray-800 mb-4">受給者証情報</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div><label className="text-sm">受給者証番号</label><input type="text" name="jukyushaNo" value={formData.jukyushaNo} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">交付年月日</label><input type="date" name="issueDate" value={formData.issueDate} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">支給市町村番号</label><input type="text" name="cityNo" value={formData.cityNo} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">支給市町村名</label><input type="text" name="cityName" value={formData.cityName} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
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
      <div className="p-4 border rounded-lg bg-gray-50"><h3 className="text-lg font-semibold text-gray-800 mb-4">加算情報</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div><label className="block text-sm font-medium text-gray-700">個別サポート加算</label><select name="individualSupportSurcharge" value={formData.individualSupportSurcharge} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>なし</option><option>Ⅰ</option><option>Ⅱ</option><option>Ⅲ</option></select></div>
        <div><label className="block text-sm font-medium text-gray-700">通所自立支援加算</label><select name="selfRelianceSurcharge" value={formData.selfRelianceSurcharge} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>無し</option><option>有り</option></select></div>
      </div></div>
      <div className="p-4 border rounded-lg bg-gray-50"><h3 className="text-lg font-semibold text-gray-800 mb-4">上限管理</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div><label className="text-sm">上限管理</label><select name="capManagementType" value={formData.capManagementType} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass}><option>なし</option><option>上限管理</option><option>被上限管理</option><option>上限管理(複数児童)</option></select></div>
        <div></div>
        <div><label className="text-sm">上限管理事業所番号</label><input type="text" name="capOfficeNo" value={formData.capOfficeNo} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
        <div><label className="text-sm">上限管理事業所名</label><input type="text" name="capOfficeName" value={formData.capOfficeName} onChange={handleChange} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
      </div></div>
      <div className="p-4 border rounded-lg bg-gray-50"><h3 className="text-lg font-semibold text-gray-800 mb-4">被上限管理事業所</h3><div className="space-y-4">
        {formData.managedByOffices.map((office, index) => (
          <div key={index} className="p-4 border rounded-md bg-white relative">
            {isEditing && <button type="button" onClick={() => removeManagedByOffice(index)} className="absolute top-2 right-2 text-red-500 hover:text-red-700"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg></button>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><label className="text-sm">事業所名</label><input type="text" value={office.name} onChange={(e) => handleManagedByOfficeChange(index, 'name', e.target.value)} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
              <div><label className="text-sm">指定事業所番号</label><input type="text" value={office.officeNo} onChange={(e) => handleManagedByOfficeChange(index, 'officeNo', e.target.value)} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
              <div><label className="text-sm">電話番号</label><input type="text" value={office.tel} onChange={(e) => handleManagedByOfficeChange(index, 'tel', e.target.value)} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
              <div><label className="text-sm">FAX番号</label><input type="text" value={office.fax} onChange={(e) => handleManagedByOfficeChange(index, 'fax', e.target.value)} disabled={!isEditing} className={isEditing ? inputClass : disabledInputClass} /></div>
            </div>
          </div>
        ))}
        {isEditing && <button type="button" onClick={addManagedByOffice} className="w-full flex items-center justify-center p-2 border-2 border-dashed rounded-lg text-blue-600 hover:bg-blue-50"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span className="ml-2">被上限管理事業所を追加</span></button>}
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
              <button type="submit" disabled={isSubmitting} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">
                {isSubmitting ? '更新中...' : '更新を保存'}
              </button>
            </div>
          )}
        </div>
      </form>
    </AppLayout>
  );
}
