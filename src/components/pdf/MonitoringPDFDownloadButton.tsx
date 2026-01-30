"use client";

import React, { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { MonitoringPDFDocument } from './MonitoringPDFDocument';
import { MonitoringRecord } from '@/types/monitoring';
import { SupportPlan } from '@/types/plan';
import { UserData } from '@/types/billing';
import { db } from '@/lib/firebase/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs 
} from 'firebase/firestore'; // ★追加
import toast from 'react-hot-toast';

interface Props {
  monitoring: MonitoringRecord;
  plan?: SupportPlan | null; 
  user?: UserData | null;
}

export const MonitoringPDFDownloadButton: React.FC<Props> = ({ monitoring, plan: initialPlan, user: initialUser }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      setIsGenerating(true);
      const toastId = toast.loading('PDFを生成しています...');

      let currentPlan = initialPlan || null;
      let currentUser = initialUser || null;

      // ==========================================
      // 1. 計画書 (SupportPlan) の自動取得プロセス
      // ==========================================
      if (!currentPlan) {
        // まずIDを持っているか確認
        const planId = (monitoring as any).planId || (monitoring as any).supportPlanId;
        
        if (planId) {
          // IDがあるなら、それを取得（通常ルート）
          try {
            const planSnap = await getDoc(doc(db, 'supportPlans', planId));
            if (planSnap.exists()) {
              currentPlan = { id: planSnap.id, ...planSnap.data() } as SupportPlan;
            }
          } catch (err) {
            console.error("計画書ID検索エラー:", err);
          }
        }
        
        // ★★★ 追加: IDがない、または取得に失敗した場合のバックアップ検索 ★★★
        if (!currentPlan && monitoring.userId) {
          console.log("紐づく計画書が見つからないため、最新の計画書を検索します...");
          try {
            // その利用者の、最新の「本番」または「原案」の計画書を探す
            const q = query(
              collection(db, 'supportPlans'),
              where('userId', '==', monitoring.userId),
              // ステータスでの絞り込みは必須ではないが、本番を優先したい場合はソート順で調整可能
              // ここでは単純に作成日が新しいものを取得
              orderBy('creationDate', 'desc'),
              limit(1)
            );
            
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              const docSnap = querySnapshot.docs[0];
              currentPlan = { id: docSnap.id, ...docSnap.data() } as SupportPlan;
              console.log("✅ 最新の計画書を自動適用しました:", currentPlan);
              toast.success("最新の計画書データを適用しました", { id: toastId });
            } else {
              console.warn("⚠️ この利用者の計画書が1件も見つかりませんでした。");
            }
          } catch (err) {
            console.error("計画書自動検索エラー:", err);
          }
        }
      }

      // ==========================================
      // 2. 利用者 (User) の自動取得プロセス
      // ==========================================
      if (!currentUser && monitoring.userId) {
        try {
          const userSnap = await getDoc(doc(db, 'users', monitoring.userId));
          if (userSnap.exists()) {
            currentUser = { id: userSnap.id, ...userSnap.data() } as UserData;
          }
        } catch (err) {
          console.error("利用者取得エラー:", err);
        }
      }

      // 3. PDF生成
      const docElement = <MonitoringPDFDocument monitoring={monitoring} plan={currentPlan} user={currentUser} />;
      const blob = await pdf(docElement).toBlob();

      // 4. ダウンロード
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
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
        <>生成...</>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          PDF
        </>
      )}
    </button>
  );
};