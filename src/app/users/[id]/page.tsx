"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';
import toast from 'react-hot-toast';

// 型定義
type ManagedByOffice = { name: string; officeNo: string; tel: string; fax: string; };

// 【変更点①】 UserDataの型定義を、データベースの実態に合わせて修正
type UserData = {
  lastName: string; firstName: string; lastKana: string; firstKana: string;
  birthday: string; gender: string; schoolName: string; schoolGrade: string;
  guardianLastName: string; guardianFirstName: string; postalCode: string;
  address: string; contact: string; contactPerson: string; allergies: string;
  serviceHoDay: boolean; // stringからbooleanに変更
  serviceJihatsu: boolean; // stringからbooleanに変更
  serviceSoudan: boolean; // stringからbooleanに変更
  jukyushaNo: string; issueDate: string; cityNo: string; cityName: string;
  daysSpecified: string; daysDeducted: boolean; decisionStartDate: string; decisionEndDate: string;
  upperLimitAmount: string; upperLimitStartDate: string; upperLimitEndDate: string;
  contractStartDate: string; contractEndDate: string; providerNoteNo: string; contractedAmount: string;
  individualSupportSurcharge: string;
  selfRelianceSurcharge: string;
  capManagementType: string; capOfficeNo: string; capOfficeName: string;
  managedByOffices: ManagedByOffice[];
};

type Props = { params: { id: string; } };

export default function UserDetailPage({ params }: Props) {
  const router = useRouter();
  const { id } = params;

  const [user, setUser] = useState<UserData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<UserData>>({});
  const [activeTab, setActiveTab] = useState('basic');

  const fetchUser = useCallback(async () => {
    if (!id) return;
    try {
      const userDocRef = doc(db, 'users', id);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data() as UserData;
        setUser(userData);
        setFormData(userData);
      } else {
        toast.error('利用者データが見つかりません。');
        router.push('/users');
      }
    } catch (error) {
      toast.error('データの取得に失敗しました。');
      console.error(error);
    }
  }, [id, router]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // 【変更点②】 サービス編集用のチェックボックスの状態を更新する関数を追加
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
  };

  const handleSave = async () => {
    try {
      const userDocRef = doc(db, 'users', id);
      await updateDoc(userDocRef, formData);
      toast.success('利用者情報を更新しました。');
      setIsEditing(false);
      fetchUser();
    } catch (error) {
      toast.error('更新に失敗しました。');
      console.error(error);
    }
  };

  const handleCancelEdit = () => {
    if(user) setFormData(user);
    setIsEditing(false);
  };

  if (!user) {
    return <AppLayout pageTitle="読み込み中..."><div className="text-center p-10">データを読み込んでいます...</div></AppLayout>;
  }
  
  const renderValue = (value: any) => !isEditing && (value || <span className="text-gray-400">未設定</span>);

  // --- タブの中身を描画する関数 ---
  const renderBasicInfoTab = () => (
    <div className="border-t border-gray-200">
      <dl className="divide-y divide-gray-200">
        <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
          <dt className="text-sm font-medium text-gray-500">氏名</dt>
          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
            {renderValue(`${user.lastName} ${user.firstName}`)}
            {isEditing && (
              <div className="grid grid-cols-2 gap-4">
                <input type="text" name="lastName" value={formData.lastName || ''} onChange={handleInputChange} placeholder="姓" className="w-full p-2 border rounded" />
                <input type="text" name="firstName" value={formData.firstName || ''} onChange={handleInputChange} placeholder="名" className="w-full p-2 border rounded" />
              </div>
            )}
          </dd>
        </div>
        <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
          <dt className="text-sm font-medium text-gray-500">氏名（かな）</dt>
          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
            {renderValue(`${user.lastKana} ${user.firstKana}`)}
            {isEditing && (
              <div className="grid grid-cols-2 gap-4">
                <input type="text" name="lastKana" value={formData.lastKana || ''} onChange={handleInputChange} placeholder="せい" className="w-full p-2 border rounded" />
                <input type="text" name="firstKana" value={formData.firstKana || ''} onChange={handleInputChange} placeholder="めい" className="w-full p-2 border rounded" />
              </div>
            )}
          </dd>
        </div>
        <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
          <dt className="text-sm font-medium text-gray-500">生年月日</dt>
          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
            {renderValue(user.birthday)}
            {isEditing && <input type="date" name="birthday" value={formData.birthday || ''} onChange={handleInputChange} className="w-full p-2 border rounded" />}
          </dd>
        </div>
        <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
          <dt className="text-sm font-medium text-gray-500">住所</dt>
          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
            {renderValue(user.address)}
            {isEditing && <input type="text" name="address" value={formData.address || ''} onChange={handleInputChange} className="w-full p-2 border rounded" />}
          </dd>
        </div>
        <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
          <dt className="text-sm font-medium text-gray-500">保護者氏名</dt>
          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
            {renderValue(`${user.guardianLastName || ''} ${user.guardianFirstName || ''}`)}
             {isEditing && (
              <div className="grid grid-cols-2 gap-4">
                <input type="text" name="guardianLastName" value={formData.guardianLastName || ''} onChange={handleInputChange} placeholder="保護者 姓" className="w-full p-2 border rounded" />
                <input type="text" name="guardianFirstName" value={formData.guardianFirstName || ''} onChange={handleInputChange} placeholder="保護者 名" className="w-full p-2 border rounded" />
              </div>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );

  const renderServiceInfoTab = () => {
    // 【変更点③】 表示するサービス名のリストを作成するロジック
    const services = [];
    // isEditingの状態に関わらず、常にフォームの最新のデータ(formData)を見るように統一
    if (formData.serviceHoDay) services.push("放課後等デイサービス");
    if (formData.serviceJihatsu) services.push("児童発達支援");
    if (formData.serviceSoudan) services.push("相談支援");
    
    return (
      <div className="border-t border-gray-200">
        <dl className="divide-y divide-gray-200">
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-gray-500">利用サービス</dt>
            {isEditing ? (
              // 【変更点④】 編集時はチェックボックスを表示する
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 space-y-2">
                <label className="flex items-center">
                  <input type="checkbox" name="serviceHoDay" checked={!!formData.serviceHoDay} onChange={handleCheckboxChange} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                  <span className="ml-2">放課後等デイサービス</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" name="serviceJihatsu" checked={!!formData.serviceJihatsu} onChange={handleCheckboxChange} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                  <span className="ml-2">児童発達支援</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" name="serviceSoudan" checked={!!formData.serviceSoudan} onChange={handleCheckboxChange} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                  <span className="ml-2">相談支援</span>
                </label>
              </dd>
            ) : (
              // 【変更点⑤】 表示時はサービス名のリストを表示する
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {services.length > 0 ? services.join('、') : <span className="text-gray-400">契約なし</span>}
              </dd>
            )}
          </div>
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-gray-500">受給者証番号</dt>
            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
              {renderValue(user.jukyushaNo)}
              {isEditing && <input type="text" name="jukyushaNo" value={formData.jukyushaNo || ''} onChange={handleInputChange} className="w-full p-2 border rounded" />}
            </dd>
          </div>
          {/* ▼▼▼ ここから下の部分は、いただいたコードから変更ありません ▼▼▼ */}
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-gray-500">上限管理事業所</dt>
            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
              {renderValue(user.capOfficeName)}
              {isEditing && <input type="text" name="capOfficeName" value={formData.capOfficeName || ''} onChange={handleInputChange} className="w-full p-2 border rounded" />}
            </dd>
          </div>
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-gray-500">上限管理区分</dt>
            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
              {renderValue(user.capManagementType)}
              {isEditing && (
                <select name="capManagementType" value={formData.capManagementType || ''} onChange={handleInputChange} className="w-full p-2 border rounded">
                  <option value="">なし</option>
                  <option value="1">上限管理</option>
                  <option value="2">上限管理（複数児童）</option>
                  <option value="3">被上限管理</option>
                </select>
              )}
            </dd>
          </div>
        </dl>
      </div>
    );
  };
  
  return (
    <AppLayout pageTitle={`${user.lastName} ${user.firstName}さんの詳細`}>
      <div className="bg-white shadow-ios rounded-ios border border-ios-gray-200 overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">利用者情報</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">詳細と編集</p>
            </div>
            <div className="flex items-center space-x-2">
               {isEditing && (
                 <>
                  <button type="button" onClick={handleCancelEdit} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">キャンセル</button>
                  <button type="button" onClick={handleSave} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">保存する</button>
                 </>
               )}
            </div>
          </div>
          <div className="mt-4 flex justify-between items-center border-b border-gray-200">
              <div className="flex">
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
        </div>
      </div>
    </AppLayout>
  );
}