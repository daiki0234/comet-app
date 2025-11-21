"use client";

import React from 'react';
import { AppLayout } from '@/components/Layout';
import AdminManager from '@/components/masters/AdminManager'; 

export default function AdminSettingsPage() {
  return (
    <AppLayout pageTitle="職員管理">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        <AdminManager />
      </div>
    </AppLayout>
  );
}