"use client";

import React from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { CaseMeetingPDFDocument } from './CaseMeetingPDFDocument';
import { CaseMeeting } from '@/types/caseMeeting';

interface Props {
  meeting: CaseMeeting;
  variant?: 'button' | 'icon'; // ★追加: 表示モード
}

export const CaseMeetingPDFDownloadButton: React.FC<Props> = ({ meeting, variant = 'button' }) => {
  const fileName = `ケース会議議事録_${meeting.date}.pdf`;

  // 必須データチェック
  if (!meeting || !meeting.date) {
    if (variant === 'icon') return <span className="text-gray-300">-</span>;
    return (
      <button disabled className="bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed flex items-center gap-2 font-bold">
        PDF作成
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={<CaseMeetingPDFDocument meeting={meeting} />}
      fileName={fileName}
      className={
        variant === 'button'
          ? "bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold shadow-md flex items-center gap-2 transition-colors"
          : "text-green-600 hover:text-green-900 bg-green-50 p-2 rounded hover:bg-green-100 transition-colors"
      }
      title="PDF出力"
    >
      {({ loading }) => (
        <>
          {loading ? (
            // ローディング中
            variant === 'button' ? '準備中...' : '...'
          ) : (
            // アイコン表示
            <>
              <svg width={variant === 'button' ? 20 : 18} height={variant === 'button' ? 20 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              {variant === 'button' && 'PDF作成'}
            </>
          )}
        </>
      )}
    </PDFDownloadLink>
  );
};