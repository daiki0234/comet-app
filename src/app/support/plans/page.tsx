"use client";

import React from 'react';
import { AppLayout } from '@/components/Layout';

export default function SupportPlansPage() {
  return (
    <AppLayout pageTitle="個別支援計画">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        <h2 className="text-xl font-bold mb-4">個別支援計画の管理</h2>
        <p className="text-gray-600">
          ここに利用者一覧を表示し、選択した利用者の計画を作成・編集する画面へ遷移します。
          （次回、ここに利用者リストと計画ステータス一覧を実装します）
        </p>
      </div>
    </AppLayout>
  );
}