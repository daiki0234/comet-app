"use client";

import React from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { MonitoringPDFDocument } from './MonitoringPDFDocument';
import { MonitoringRecord } from '@/types/monitoring';
import { SupportPlan } from '@/types/plan';
import { UserData } from '@/types/billing';

interface Props {
  monitoring: MonitoringRecord;
  plan: SupportPlan | null;
  user: UserData | null;
}

export const MonitoringPDFDownloadButton: React.FC<Props> = ({ monitoring, plan, user }) => {
  const fileName = `${monitoring.userName || '利用者'}_モニタリング_${monitoring.creationDate}.pdf`;

  // データが揃っていない場合はボタンを無効化
  if (!monitoring || !plan || !user) {
    return (
      <button disabled className="bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed flex items-center gap-2 font-bold">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
        PDF作成 (データ不足)
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={<MonitoringPDFDocument monitoring={monitoring} plan={plan} user={user} />}
      fileName={fileName}
      // ★修正: 緑色に変更 (bg-green-600 hover:bg-green-700)
      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold shadow-md flex items-center gap-2 transition-colors"
    >
      {({ loading }) => (
        <>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          {loading ? '準備中...' : 'PDF作成'}
        </>
      )}
    </PDFDownloadLink>
  );
};