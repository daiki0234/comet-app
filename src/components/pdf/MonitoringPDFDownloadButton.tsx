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

interface Props {
  monitoring: MonitoringRecord;
  plan?: SupportPlan | null; 
  user?: UserData | null;
}

export const MonitoringPDFDownloadButton: React.FC<Props> = ({ monitoring, plan: initialPlan, user: initialUser }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    // 親の行クリックイベント（詳細画面への遷移など）を止める
    e.stopPropagation();

    try {
      setIsGenerating(true);
      const toastId = toast.loading('PDFを生成しています...');

      // --- 1. 足りないデータを補完する処理 ---
      let currentPlan = initialPlan || null;
      let currentUser = initialUser || null;

      // 計画書 (SupportPlan) が渡されていない場合、IDを使って取りに行く
      if (!currentPlan) {
        // 型定義に planId がなくてもデータとして持っていれば取り出す
        const planId = (monitoring as any).planId || (monitoring as any).supportPlanId;
        
        if (planId) {
          try {
            const planSnap = await getDoc(doc(db, 'supportPlans', planId));
            if (planSnap.exists()) {
              currentPlan = { id: planSnap.id, ...planSnap.data() } as SupportPlan;
              console.log("✅ [一覧] 計画書データを取得しました:", currentPlan);
            } else {
              console.warn("⚠️ 指定されたIDの計画書が見つかりませんでした:", planId);
            }
          } catch (err) {
            console.error("計画書取得エラー:", err);
          }
        } else {
          console.warn("⚠️ monitoringデータ内に planId がありません。");
        }
      }

      // 利用者 (User) が渡されていない場合、IDを使って取りに行く
      if (!currentUser && monitoring.userId) {
        try {
          const userSnap = await getDoc(doc(db, 'users', monitoring.userId));
          if (userSnap.exists()) {
            currentUser = { id: userSnap.id, ...userSnap.data() } as UserData;
            console.log("✅ [一覧] 利用者データを取得しました:", currentUser);
          }
        } catch (err) {
          console.error("利用者取得エラー:", err);
        }
      }

      // --- 2. PDF生成 ---
      const docElement = <MonitoringPDFDocument monitoring={monitoring} plan={currentPlan} user={currentUser} />;
      const blob = await pdf(docElement).toBlob();

      // --- 3. ダウンロード ---
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // ファイル名生成 (日付のスラッシュをハイフンに置換)
      const dateStr = monitoring.creationDate ? String(monitoring.creationDate).replace(/\//g, '-') : '日付なし';
      const userName = monitoring.userName || '利用者';
      link.download = `${userName}_モニタリング_${dateStr}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('ダウンロードしました', { id: toastId });

    } catch (e: any) {
      console.error("PDF生成エラー:", e);
      toast.error(`PDF生成失敗: ${e.message}`);
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
        <>生成中...</>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          PDF
        </>
      )}
    </button>
  );
};