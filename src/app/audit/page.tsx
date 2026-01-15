"use client";

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/Layout';

export default function AuditPage() {
  return (
    <AppLayout pageTitle="監査管理">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* ヘッダー説明 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 text-lg mb-2">行政監査対応メニュー</h3>
          <p className="text-gray-600 text-sm">
            行政実地指導・監査において確認される計画書や、義務付けられている研修の記録を作成・管理します。<br />
            以下のメニューから作業を選択してください。
          </p>
        </div>

        {/* メニューカード一覧 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* ① 安全計画 */}
          <Link 
            href="/safety/plans"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              {/* Shield Icon */}
              <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor" className="text-blue-600">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>

            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            
            <div>
              <h4 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-blue-600 transition-colors">安全計画</h4>
              <p className="text-gray-500 text-sm leading-relaxed">
                事業所における安全確保のための計画を策定・管理します。事故防止や災害対策などの取り組みを記録します。
              </p>
            </div>
            
            <span className="text-sm font-bold text-blue-600 mt-auto flex items-center gap-1 group-hover:gap-2 transition-all">
              作成画面へ
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </span>
          </Link>

          {/* ② 研修管理 */}
          <Link 
            href="/audit/training"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-orange-300 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              {/* Academic/Training Icon */}
              <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor" className="text-orange-600">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
              </svg>
            </div>

            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
              </svg>
            </div>
            
            <div>
              <h4 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-orange-600 transition-colors">研修管理</h4>
              <p className="text-gray-500 text-sm leading-relaxed">
                虐待防止研修、身体拘束適正化研修などの年間計画策定と、実施記録の作成・管理を行います。
              </p>
            </div>
            
            <span className="text-sm font-bold text-orange-600 mt-auto flex items-center gap-1 group-hover:gap-2 transition-all">
              作成画面へ
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </span>
          </Link>

          {/* ③ ５領域プログラム */}
          <Link 
            href="/audit/five-domains"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-green-300 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              {/* Puzzle/Blocks Icon */}
              <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor" className="text-green-600">
                <path d="M10 2h4a1 1 0 0 1 .7.3l3 3a1 1 0 0 1 .3.7v4a1 1 0 0 1-.3.7l-3 3a1 1 0 0 1-.7.3h-4a1 1 0 0 1-.7-.3l-3-3a1 1 0 0 1-.3-.7V6a1 1 0 0 1 .3-.7l3-3A1 1 0 0 1 10 2z"></path>
              </svg>
            </div>

            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.5 6c-2.61.7-5.67 1-8.5 1s-5.89-.3-8.5-1"></path>
                <path d="M20.8 13c-2.48 1.1-5.4 2-8.8 2s-6.32-.9-8.8-2"></path>
                <path d="M12 21V6"></path>
              </svg>
            </div>
            
            <div>
              <h4 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-green-600 transition-colors">５領域プログラム</h4>
              <p className="text-gray-500 text-sm leading-relaxed">
                事業所が提供する支援プログラムと、5領域（健康・生活、運動・感覚など）との関連付けを管理・公表します。
              </p>
            </div>
            
            <span className="text-sm font-bold text-green-600 mt-auto flex items-center gap-1 group-hover:gap-2 transition-all">
              作成画面へ
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
            </span>
          </Link>

        </div>
      </div>
    </AppLayout>
  );
}