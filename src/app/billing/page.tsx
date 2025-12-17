"use client";

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/Layout';

export default function BillingMenuPage() {
  return (
    <AppLayout pageTitle="請求管理メニュー">
      <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-2">国保連請求業務</h2>
          <p className="text-gray-500 text-sm">
            毎月の請求業務を行います。以下のステップ順に進めてください。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* ① サービス提供実績記録票 */}
          <Link href="/billing/records" className="group block h-full">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-blue-300 transition-all h-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-blue-500 group-hover:w-3 transition-all"></div>
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">Step 1</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-blue-500"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M16 13H8"></path><path d="M16 17H8"></path><path d="M10 9H8"></path></svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-blue-600">実績記録票の作成</h3>
                  <p className="text-sm text-gray-500">
                    日々の出欠・加算記録を集計し、実績のチェックと保護者印用「サービス提供実績記録票」の印刷を行います。
                  </p>
                </div>
                <div className="mt-6 flex items-center text-sm font-bold text-blue-600">
                  ページを開く <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            </div>
          </Link>

          {/* ② 上限額管理結果票 */}
          <Link href="/billing/limits" className="group block h-full">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-orange-300 transition-all h-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-orange-500 group-hover:w-3 transition-all"></div>
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded">Step 2</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-orange-500"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-orange-600">上限額管理</h3>
                  <p className="text-sm text-gray-500">
                    【未実装】<br/>
                    利用者負担上限額管理を行います。他事業所との利用調整や、結果票の作成はこちらから。
                  </p>
                </div>
                <div className="mt-6 flex items-center text-sm font-bold text-orange-600 opacity-50">
                  (準備中)
                </div>
              </div>
            </div>
          </Link>

          {/* ③ 請求明細書 */}
          <Link href="/billing/invoice" className="group block h-full">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-green-300 transition-all h-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-green-500 group-hover:w-3 transition-all"></div>
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Step 3</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-green-500"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><path d="M14 2v6h6"></path><path d="M3 15h6"></path><path d="M3 18h6"></path><path d="M10 22v-8a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v8"></path></svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-green-600">請求データ作成</h3>
                  <p className="text-sm text-gray-500">
                    【未実装】<br/>
                    最終的な給付費請求書・明細書を作成し、国保連提出用のCSVデータを出力します。
                  </p>
                </div>
                <div className="mt-6 flex items-center text-sm font-bold text-green-600 opacity-50">
                  (準備中)
                </div>
              </div>
            </div>
          </Link>

        </div>
      </div>
    </AppLayout>
  );
}