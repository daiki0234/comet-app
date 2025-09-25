"use client";

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/Layout';

export default function DashboardPage() {
  return (
    <AppLayout pageTitle="ダッシュボード">
      <div className="bg-white p-6 sm:p-8 rounded-ios shadow-ios border border-ios-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">ようこそ Comet へ！</h2>
        <p className="text-gray-600 leading-relaxed max-w-2xl">
          日々の業務を効率化し、利用者様と向き合う大切な時間を増やすために。
          Cometは、あなたの業務をシンプルで直感的なものに変えるお手伝いをします。
          上のメニューから各機能へアクセスしてください。
        </p>
        <div className="mt-8">
          <Link href="/attendance">
            <button className="bg-ios-blue hover:bg-blue-600 text-white font-bold py-3 px-5 rounded-ios shadow-sm hover:shadow-md transition-all transform hover:scale-105">
              今日の出欠記録を始める
            </button>
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}

