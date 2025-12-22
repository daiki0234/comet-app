"use client";

import React from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { PlanPDFDocument } from './PlanPDFDocument';
import { SupportPlan } from '@/types/plan';
import { UserData } from '@/types/billing';

// ★修正: managerName を受け取れるように型定義を追加
interface Props {
  plan: SupportPlan;
  user: UserData | null;
  managerName?: string; // ここを追加
}

export const PlanPDFDownloadButton: React.FC<Props> = ({ plan, user, managerName }) => {
  const isDraft = plan.status === '原案';
  const fileName = `${user?.lastName || ''}${user?.firstName || ''}_個別支援計画書${isDraft ? '_原案' : ''}.pdf`;

  return (
    <PDFDownloadLink
      // ★修正: managerName を PDFドキュメントコンポーネントに渡す
      document={<PlanPDFDocument plan={plan} user={user} managerName={managerName} />}
      fileName={fileName}
      className="flex items-center gap-1 text-gray-600 hover:text-gray-800 font-bold text-xs border border-gray-200 bg-gray-50 px-3 py-1.5 rounded hover:bg-gray-100 transition-colors"
    >
      {({ loading }) => (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          {loading ? '準備中...' : 'PDF出力'}
        </>
      )}
    </PDFDownloadLink>
  );
};