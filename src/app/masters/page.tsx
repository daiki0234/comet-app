// src/app/masters/page.tsx

"use client";
import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout';

import MunicipalityManager from '@/components/masters/MunicipalityManager';
// ★ 1. FacilityManager をインポート
import FacilityManager from '@/components/masters/FacilityManager';
// import SchoolManager from '@/components/masters/SchoolManager';
// import AdditionManager from '@/components/masters/AdditionManager';

type MasterTab = 'municipalities' | 'facilities' | 'schools' | 'additions';

export default function MastersPage() {
  const [activeTab, setActiveTab] = useState<MasterTab>('municipalities');

  return (
    <AppLayout pageTitle="マスタ設定">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        
        {/* タブボタン (ステップ1で修正済み) */}
        <div className="flex border-b border-gray-200">
          <button onClick={() => setActiveTab('municipalities')} className={`...`}>支給市町村マスタ</button>
          <button onClick={() => setActiveTab('facilities')} className={`...`}>事業所マスタ</button>
          <button onClick={() => setActiveTab('schools')} className={`...`}>学校マスタ</button>
          <button onClick={() => setActiveTab('additions')} className={`...`}>加算マスタ</button>
        </div>
        
        {/* タブの中身 */}
        <div className="mt-6">
          {activeTab === 'municipalities' && (
            <MunicipalityManager />
          )}
          {/* ★ 2. 'facilities' タブの中身を差し替え */}
          {activeTab === 'facilities' && (
            <FacilityManager /> 
          )}
          {activeTab === 'schools' && (
            <p>（学校マスタは現在開発中です）</p>
          )}
          {activeTab === 'additions' && (
            <p>（加算マスタは現在開発中です）</p>
          )}
        </div>

      </div>
    </AppLayout>
  );
}