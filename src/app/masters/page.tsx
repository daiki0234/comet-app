// src/app/masters/page.tsx

"use client";
import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout';
// ステップ3で作成するコンポーネント
import MunicipalityManager from '@/components/masters/MunicipalityManager';
// import FacilityManager from '@/components/masters/FacilityManager';
// import SchoolManager from '@/components/masters/SchoolManager';

type MasterTab = 'municipalities' | 'facilities' | 'schools';

export default function MastersPage() {
  const [activeTab, setActiveTab] = useState<MasterTab>('municipalities');

  return (
    <AppLayout pageTitle="マスタ設定">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        
        {/* タブ切り替えボタン */}
        <div className="flex border-b border-gray-200">
          <button onClick={() => setActiveTab('municipalities')} className={`...`}>
            支給市町村マスタ
          </button>
          <button onClick={() => setActiveTab('facilities')} className={`...`}>
            事業所マスタ
          </button>
          <button onClick={() => setActiveTab('schools')} className={`...`}>
            学校マスタ
          </button>
        </div>
        
        {/* タブの中身 */}
        <div className="mt-6">
          {activeTab === 'municipalities' && (
            <MunicipalityManager />
          )}
          {/* ... 他のタブは後で実装 ... */}
        </div>
      </div>
    </AppLayout>
  );
}