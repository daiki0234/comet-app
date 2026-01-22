"use client";

import React, { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { MonitoringPDFDocument } from './MonitoringPDFDocument';
import { MonitoringRecord } from '@/types/monitoring';
import { SupportPlan } from '@/types/plan';
import { UserData } from '@/types/billing';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

// 一覧画面からは plan と user が渡されないため、'?' をつけて省略可能にします
interface Props {
  monitoring: MonitoringRecord;
  plan?: SupportPlan | null; 
  user?: UserData | null;
}

export const MonitoringPDFDownloadButton: React.FC<Props> = ({ monitoring, plan: initialPlan, user: initialUser }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    // 親要素へのイベント伝播を防ぐ（行クリックで編集画面へ遷移するのを防ぐため）
    e.stopPropagation();

    try {
      setIsGenerating(true);
      const toastId = toast.loading('PDFを生成しています...');

      // 1. データが足りない場合は取得する
      let currentPlan = initialPlan;
      let currentUser = initialUser;

      // ★修正: planIdが型定義にない場合のエラー回避のため as any を使用
      // 計画書の取得
      const planId = (monitoring as any).planId; 
      if (!currentPlan && planId) {
        try {
          const planSnap = await getDoc(doc(db, 'supportPlans', planId));
          if (planSnap.exists()) {
            currentPlan = { id: planSnap.id, ...planSnap.data() } as SupportPlan;
          }
        } catch (err) {
          console.error("計画書取得エラー", err);
        }
      }

      // 利用者の取得 (monitoring.userId から)
      if (!currentUser && monitoring.userId) {
        try {
          const userSnap = await getDoc(doc(db, 'users', monitoring.userId));
          if (userSnap.exists()) {
            currentUser = { id: userSnap.id, ...userSnap.data() } as UserData;
          }
        } catch (err) {
          console.error("利用者取得エラー", err);
        }
      }

      // それでもデータがなければエラー
      if (!currentPlan || !currentUser) {
        toast.error('関連データ（計画書や利用者）が見つかりません', { id: toastId });
        setIsGenerating(false);
        return;
      }

      // 2. PDF生成
      const docElement = <MonitoringPDFDocument monitoring={monitoring} plan={currentPlan} user={currentUser} />;
      const blob = await pdf(docElement).toBlob();

      // 3. ダウンロード
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // ファイル名生成
      const dateStr = monitoring.creationDate ? monitoring.creationDate.replace(/\//g, '-') : '日付なし';
      link.download = `${monitoring.userName}_モニタリング_${dateStr}.pdf`;
      
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
      className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition-colors shadow-sm ${
        isGenerating 
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
          : 'bg-green-600 text-white hover:bg-green-700 border border-green-700'
      }`}
      title="PDFを出力"
    >
      {isGenerating ? (
        <>
          <svg className="animate-spin h-3 w-3 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          生成中
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          PDF
        </>
      )}
    </button>
  );
};