"use client";

import React, { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { PlanPDFDocument } from './PlanPDFDocument';
import { SupportPlan } from '@/types/plan';
import { UserData } from '@/types/billing';
import toast from 'react-hot-toast';

interface Props {
  plan: SupportPlan;
  user: UserData;
  managerName?: string;
}

export const PlanPDFDownloadButton: React.FC<Props> = ({ plan, user, managerName }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    try {
      setIsGenerating(true);
      const toastId = toast.loading('PDFを生成しています...');

      // 1. PDFドキュメントの定義を作成
      const doc = <PlanPDFDocument plan={plan} user={user} managerName={managerName} />;

      // 2. Blob（データの実体）を生成
      // ※ここで初めてPDF生成処理が走ります
      const blob = await pdf(doc).toBlob();

      // 3. ダウンロードリンクを動的に作ってクリックさせる
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // ファイル名: [利用者名]_個別支援計画書_[作成日].pdf
      const dateStr = plan.creationDate ? new Date(plan.creationDate).toLocaleDateString('ja-JP').replace(/\//g, '-') : '日付なし';
      link.download = `${user.lastName}${user.firstName}_個別支援計画書_${dateStr}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('ダウンロードしました', { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error('PDF生成に失敗しました');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={isGenerating}
      className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition-colors ${
        isGenerating 
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
          : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
      }`}
      title="PDFを出力"
    >
      {isGenerating ? (
        <>
          <svg className="animate-spin h-3 w-3 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          生成中...
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          PDF
        </>
      )}
    </button>
  );
};