"use client";

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/Layout';

export default function AuditPage() {
  return (
    <AppLayout pageTitle="監査管理">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* ヘッダー説明 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 text-lg mb-2">行政監査対応メニュー</h3>
          <p className="text-gray-600 text-sm">
            行政実地指導・監査において確認される計画書や、義務付けられている研修の記録を作成・管理します。<br />
            以下のメニューから作業を選択してください。
          </p>
        </div>

        {/* メニューカード一覧 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* ① 計画作成 */}
          <Link 
            href="/audit/plans"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor" className="text-blue-600">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>

            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            
            <div>
              <h4 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-blue-600 transition-colors">計画作成</h4>
              <p className="text-gray-500 text-sm leading-relaxed">
                安全計画、年間事業計画、5領域プログラムなどの必須計画書を作成・管理します。
              </p>
            </div>
            
            <span className="text-sm font-bold text-blue-600 mt-auto flex items-center gap-1 group-hover:gap-2 transition-all">
              作成画面へ
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </span>
          </Link>

          {/* ② 研修管理 */}
          <Link 
            href="/audit/trainings"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-orange-300 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor" className="text-orange-600">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
            </div>

            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
            </div>
            
            <div>
              <h4 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-orange-600 transition-colors">研修管理</h4>
              <p className="text-gray-500 text-sm leading-relaxed">
                虐待防止研修、身体拘束適正化研修など、義務付けられている研修の議事録を作成・保管します。
              </p>
            </div>
            
            <span className="text-sm font-bold text-orange-600 mt-auto flex items-center gap-1 group-hover:gap-2 transition-all">
              作成画面へ
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </span>
          </Link>

        </div>
      </div>
    </AppLayout>
  );
}