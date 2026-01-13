"use client";

import React from 'react';
import { AppLayout } from '@/components/Layout';
import AdminManager from '@/components/masters/AdminManager'; 
import { useAuth } from '@/context/AuthContext'; // ★追加

export default function AdminSettingsPage() {
  const { isAdmin, isLoading } = useAuth(); // ★権限チェック

  // ロード中は何も表示しない、あるいはローディング表示
  if (isLoading) return null;

  // ★アクセス制限: 管理者でなければ表示しない
  if (!isAdmin) {
    return (
      <AppLayout pageTitle="職員管理">
        <div className="p-8 text-center bg-white rounded-2xl shadow-ios border border-gray-200">
          <p className="text-red-500 font-bold mb-2">アクセス権限がありません</p>
          <p className="text-gray-600 text-sm">このページを表示するには管理者権限が必要です。</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout pageTitle="職員管理">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        <AdminManager />
      </div>
    </AppLayout>
  );
}