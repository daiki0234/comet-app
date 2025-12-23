"use client";

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/Layout';

export default function SupportDashboardPage() {
  
  const menuItems = [
    {
      title: "支援記録",
      description: "日々の活動記録や利用者の様子を記入・確認します。",
      href: "/support/records",
      iconColor: "bg-blue-100 text-blue-600",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
      )
    },
    {
      title: "個別支援計画",
      description: "利用者ごとの長期・短期目標や支援方針を作成・管理します。",
      href: "/support/plans",
      iconColor: "bg-green-100 text-green-600",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
      )
    },
    {
      title: "モニタリング",
      description: "計画の達成度を評価し、次の支援につなげるための見直しを行います。",
      href: "/support/monitoring",
      iconColor: "bg-purple-100 text-purple-600",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      )
    },
    // ★追加: ケース担当者会議
    {
      title: "ケース担当者会議",
      description: "会議の実施記録や検討内容、利用者ごとの支援方針の変更点を管理します。",
      href: "/support/case-meetings",
      iconColor: "bg-orange-100 text-orange-600",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      )
    },
  ];

  return (
    <AppLayout pageTitle="支援管理">
      {/* 4つになったのでレスポンシブ設定を調整しました (md:2列, lg:4列) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href} className="group block h-full">
            <div className="h-full bg-white p-6 rounded-2xl shadow-ios border border-gray-200 transition-all duration-200 group-hover:shadow-md group-hover:border-blue-300 flex flex-col">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${item.iconColor}`}>
                {item.icon}
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-blue-600 transition-colors">
                {item.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {item.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </AppLayout>
  );
}