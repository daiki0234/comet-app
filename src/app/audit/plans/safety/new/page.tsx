"use client";

import React from 'react';
import { AppLayout } from '@/components/Layout';
import { SafetyPlanForm } from '@/components/audit/SafetyPlanForm';

export default function NewSafetyPlanPage() {
  return (
    <AppLayout pageTitle="安全計画 新規作成">
      <div className="max-w-5xl mx-auto">
        <SafetyPlanForm />
      </div>
    </AppLayout>
  );
}