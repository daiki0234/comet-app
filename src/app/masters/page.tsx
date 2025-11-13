// src/app/masters/page.tsx

"use client";
import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout';

// コンポーネントのインポート（MunicipalityManagerのみ）
import MunicipalityManager from '@/components/masters/MunicipalityManager';
import FacilityManager from '@/components/masters/FacilityManager'; // ← ステップ3で有効化
import SchoolManager from '@/components/masters/SchoolManager';
import AdditionManager from '@/components/masters/AdditionManager';

// ★ 1. 型に 'additions' を追加
type MasterTab = 'municipalities' | 'facilities' | 'schools' | 'additions';

export default function MastersPage() {
  const [activeTab, setActiveTab] = useState<MasterTab>('municipalities');

  return (
    <AppLayout pageTitle="マスタ設定">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        
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
          {/* ★ 2. 「加算マスタ」のタブボタンを追加 */}
          <button 
            onClick={() => setActiveTab('additions')} 
            className={`py-3 px-4 text-sm font-medium ${activeTab === 'additions' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            加算マスタ
          </button>
        </div>
        
        {/* タブの中身 */}
        <div className="mt-6">
          {activeTab === 'municipalities' && (
            <MunicipalityManager />
          )}
          {activeTab === 'facilities' && (
             <FacilityManager /> 
          )}
          {activeTab === 'schools' && (
             <SchoolManager />
          )}
          {/* ★ 3. 「加算マスタ」の中身を追加 */}
          {activeTab === 'additions' && (
             <AdditionManager />
            
          )}
        </div>

      </div>
    </AppLayout>
  );
}