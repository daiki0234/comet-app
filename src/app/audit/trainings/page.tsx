"use client";

import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout';

export default function AuditTrainingsPage() {
  const [activeTab, setActiveTab] = useState<'abuse' | 'restraint'>('abuse');

  return (
    <AppLayout pageTitle="研修管理 (監査対応)">
      <div className="space-y-6">
        
        {/* タブ切り替え */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setActiveTab('abuse')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'abuse' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            虐待防止研修
          </button>
          <button 
            onClick={() => setActiveTab('restraint')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'restraint' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            身体拘束適正化研修
          </button>
        </div>

        {/* コンテンツエリア (枠のみ) */}
        <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200 min-h-[400px]">
          {activeTab === 'abuse' && (
            <div>
              <h3 className="text-lg font-bold text-gray-800 mb-4 border-l-4 border-orange-500 pl-2">虐待防止研修 議事録</h3>
              <div className="bg-orange-50 p-4 rounded-lg text-sm text-orange-800 mb-4">
                年1回以上の実施が義務付けられています。実施日、参加者、研修内容（資料等）を記録します。
              </div>
              <p className="text-gray-500 text-sm">※ここに議事録の新規作成・一覧表示機能を実装します。</p>
            </div>
          )}

          {activeTab === 'restraint' && (
            <div>
              <h3 className="text-lg font-bold text-gray-800 mb-4 border-l-4 border-purple-500 pl-2">身体拘束適正化研修 議事録</h3>
              <div className="bg-purple-50 p-4 rounded-lg text-sm text-purple-800 mb-4">
                年1回以上の実施が義務付けられています。実施日、参加者、研修内容を記録します。
              </div>
              <p className="text-gray-500 text-sm">※ここに議事録の新規作成・一覧表示機能を実装します。</p>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}