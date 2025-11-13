// src/app/masters/page.tsx

"use client";
import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout';
// ステップ3で作成するコンポーネント
import MunicipalityManager from '@/components/masters/MunicipalityManager';
// import FacilityManager from '@/components/masters/FacilityManager';
// import SchoolManager from '@/components/masters/SchoolManager';

// どのタブが選択されているかを管理する型
type MasterTab = 'municipalities' | 'facilities' | 'schools';

export default function MastersPage() {
  const [activeTab, setActiveTab] = useState<MasterTab>('municipalities');

  return (
    <AppLayout pageTitle="マスタ設定">
      {/* 白いカード */}
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        
        {/* ★★★ タブ切り替えボタン (このUIに修正) ★★★ */}
        <div className="flex border-b border-gray-200">
          <button 
            onClick={() => setActiveTab('municipalities')} 
            className={`py-3 px-4 text-sm font-medium ${activeTab === 'municipalities' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            支給市町村マスタ
          </button>
          <button 
            onClick={() => setActiveTab('facilities')} 
            className={`py-3 px-4 text-sm font-medium ${activeTab === 'facilities' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            事業所マスタ
          </button>
          <button 
            onClick={() => setActiveTab('schools')} 
            className={`py-3 px-4 text-sm font-medium ${activeTab === 'schools' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            学校マスタ
          </button>
        </div>
        
        {/* タブの中身 */}
        <div className="mt-6">
          {activeTab === 'municipalities' && (
            <MunicipalityManager />
          )}
          {activeTab === 'facilities' && (
            // <FacilityManager /> 
            <p>（事業所マスタは現在開発中です）</p>
          )}
          {activeTab === 'schools' && (
            // <SchoolManager />
            <p>（学校マスタは現在開発中です）</p>
          )}
        </div>

      </div>
    </AppLayout>
  );
}