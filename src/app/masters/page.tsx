"use client";
import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout';

// コンポーネントのインポート
import MunicipalityManager from '@/components/masters/MunicipalityManager';
import FacilityManager from '@/components/masters/FacilityManager';
import SchoolManager from '@/components/masters/SchoolManager';
import AdditionManager from '@/components/masters/AdditionManager';
import TrainingManager from '@/components/masters/TrainingManager'; // ★追加

// ★ 1. 型に 'trainings' を追加
type MasterTab = 'municipalities' | 'facilities' | 'schools' | 'additions' | 'trainings';

export default function MastersPage() {
  const [activeTab, setActiveTab] = useState<MasterTab>('municipalities');

  return (
    <AppLayout pageTitle="マスタ設定">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('municipalities')} 
            className={`py-3 px-4 text-sm font-medium whitespace-nowrap ${activeTab === 'municipalities' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            支給市町村マスタ
          </button>
          <button 
            onClick={() => setActiveTab('facilities')} 
            className={`py-3 px-4 text-sm font-medium whitespace-nowrap ${activeTab === 'facilities' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            事業所マスタ
          </button>
          <button 
            onClick={() => setActiveTab('schools')} 
            className={`py-3 px-4 text-sm font-medium whitespace-nowrap ${activeTab === 'schools' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            学校マスタ
          </button>
          <button 
            onClick={() => setActiveTab('additions')} 
            className={`py-3 px-4 text-sm font-medium whitespace-nowrap ${activeTab === 'additions' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            加算マスタ
          </button>
          {/* ★ 2. 「トレーニングマスタ」のタブボタンを追加 */}
          <button 
            onClick={() => setActiveTab('trainings')} 
            className={`py-3 px-4 text-sm font-medium whitespace-nowrap ${activeTab === 'trainings' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            トレーニングマスタ
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
          {activeTab === 'additions' && (
             <AdditionManager />
          )}
          {/* ★ 3. 「トレーニングマスタ」の中身を追加 */}
          {activeTab === 'trainings' && (
             <TrainingManager />
          )}
        </div>

      </div>
    </AppLayout>
  );
}