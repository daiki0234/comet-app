"use client";

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/Layout';

export default function AuditPlansPage() {
  return (
    <AppLayout pageTitle="計画作成 (監査対応)">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* ヘッダー説明 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 text-lg mb-2">計画作成メニュー</h3>
          <p className="text-gray-600 text-sm">
            行政監査で確認される各種計画書を作成・管理します。<br />
            以下のメニューから作成する計画を選択してください。
          </p>
        </div>

        {/* メニューカード一覧 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* ① 安全計画 */}
          <Link 
            href="/audit/plans/safety"
            className="group bg-white p-6 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            
            <div>
              <h4 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-blue-600 transition-colors">安全計画</h4>
              <p className="text-gray-500 text-xs leading-relaxed">
                事業所の安全確保に関する計画（点検、マニュアル、訓練計画など）を策定します。
              </p>
            </div>
            
            <span className="text-sm font-bold text-blue-600 mt-auto flex items-center gap-1 group-hover:gap-2 transition-all">
              一覧へ
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </span>
          </Link>

          {/* ② 年間計画 */}
          <Link 
            href="/audit/plans/annual"
            className="group bg-white p-6 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-green-300 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden"
          >
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </div>
            
            <div>
              <h4 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-green-600 transition-colors">年間計画</h4>
              <p className="text-gray-500 text-xs leading-relaxed">
                事業所の年間行事や活動計画を策定・管理します。
              </p>
            </div>
            
            <span className="text-sm font-bold text-green-600 mt-auto flex items-center gap-1 group-hover:gap-2 transition-all">
              一覧へ
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </span>
          </Link>

          {/* ③ 5領域プログラム */}
          <Link 
            href="/audit/plans/5domain"
            className="group bg-white p-6 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
            </div>
            
            <div>
              <h4 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-purple-600 transition-colors">5領域プログラム</h4>
              <p className="text-gray-500 text-xs leading-relaxed">
                5領域（健康・生活、運動・感覚など）に基づく支援プログラムを管理します。
              </p>
            </div>
            
            <span className="text-sm font-bold text-purple-600 mt-auto flex items-center gap-1 group-hover:gap-2 transition-all">
              一覧へ
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </span>
          </Link>

        </div>
      </div>
    </AppLayout>
  );
}