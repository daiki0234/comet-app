import { useState } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, orderBy, limit } from 'firebase/firestore';

// ★修正: 実績記録票に合わせて「利用」を削除
export type AutoRecordInput = {
  date: string;
  userId: string;
  userName: string;
  status: '放課後' | '休校日' | '欠席'; 
  
  startTime?: string;
  endTime?: string;
  extensionMinutes?: number;
  absenceReason?: string;
};

const SERVICE_TIME_CLASSES = [
  '区分1(30分以上1時間30分以下)',
  '区分2(1時間30分超3時間以下)',
  '区分3(3時間超5時間以下)'
];

export const useAutoRecord = () => {
  const [isCreating, setIsCreating] = useState(false);

  const createRecord = async (data: AutoRecordInput) => {
    setIsCreating(true);
    try {
      // 1. 重複チェック
      const q = query(
        collection(db, 'supportRecords'),
        where('date', '==', data.date),
        where('userId', '==', data.userId)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        console.log(`[Skip] ${data.userName} の支援記録は既に存在します。`);
        return; 
      }

      // 2. マスタデータ取得 (省略: 前回と同じ)
      let defaultAddons: any = {
        welfareSpecialist: '加算しない',
        staffAddon: '加算しない',
        specializedSystem: '加算しない',
      };
      try {
        const aSnap = await getDocs(collection(db, 'additions'));
        const additions = aSnap.docs.map(d => d.data());
        additions.forEach(add => {
          if (add.target === '事業所') {
            if (add.name === '福祉専門職員配置等加算') defaultAddons.welfareSpecialist = add.details;
            if (add.name === '児童指導員等加配加算') defaultAddons.staffAddon = add.details;
            if (add.name === '専門的支援体制加算') {
               defaultAddons.specializedSystem = ['加算する', '加算しない'].includes(add.details) ? add.details : '加算する';
            }
          }
        });
      } catch (e) {
        console.warn("マスタデータの取得に失敗");
      }

      // 3. データ構築
      let recordData: any = {
        date: data.date,
        userId: data.userId,
        userName: data.userName,
        status: data.status, // そのまま保存
        condition: '良好',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...defaultAddons,
        // ... (その他初期化フィールドは省略: 前回と同じ)
        extendedSupportAddon: '加算しない',
        absenceAddon: '加算しない',
        childcareSupport: '加算しない',
        individualSupport: '加算しない',
        specializedSupport: '加算しない',
        agencyCooperation: '加算しない',
        familySupport: '加算しない',
        transportation: '加算しない',
        independenceSupport: '加算しない',
        interAgencyCooperation: '加算しない',
        medicalSupport: '加算しない',
        selfRelianceSupport: '加算しない',
        intenseBehaviorSupport: '加算しない',
        planMissing: '減算しない',
        managerMissing: '減算しない',
        staffMissing: '減算しない',
        trainingContent: '',
        supportContent: '',
        staffSharing: '',
        targetComments: [],
        duration: '',
        timeClass: '',
      };

      // --- パターンA: 欠席 ---
      if (data.status === '欠席') {
        recordData.absenceAddon = 'Ⅰ';
        recordData.supportContent = data.absenceReason ? `【欠席理由】\n${data.absenceReason}` : '欠席';
        recordData.startTime = '';
        recordData.endTime = '';
        recordData.duration = '';
        recordData.extensionDuration = '';
        recordData.timeClass = '';
      } 
      // --- パターンB: 利用 ---
      else {
        recordData.startTime = data.startTime || '';
        recordData.endTime = data.endTime || '';

        // (1) 算定時間数(duration)の決定
        let determinedDuration = '';

        try {
          const qPlan = query(
            collection(db, 'supportPlans'),
            where('userId', '==', data.userId),
            where('status', '==', '本番'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const planSnap = await getDocs(qPlan);
          
          if (!planSnap.empty) {
            const plan = planSnap.docs[0].data();
            const dateObj = new Date(data.date);
            const jsDay = dateObj.getDay(); 
            const appDayIndex = jsDay === 0 ? 6 : jsDay - 1; 
            const schedule = plan.schedules?.standard?.[appDayIndex];
            if (schedule && schedule.duration) {
              determinedDuration = schedule.duration;
            }
          }
        } catch (e) {
          console.warn("計画書参照エラー", e);
        }

        // フォールバック判定 (★ここを修正)
        if (!determinedDuration) {
          if (data.status === '放課後') { // ★「利用」を削除
            determinedDuration = '2.0';
          } else if (data.status === '休校日') { // ★「利用」を削除
            determinedDuration = '3.5';
          }
        }

        recordData.duration = determinedDuration;

        // (2) 区分判定
        if (determinedDuration) {
          const durationNum = Number(determinedDuration);
          if (!isNaN(durationNum)) {
            if (durationNum <= 1.5) recordData.timeClass = SERVICE_TIME_CLASSES[0];
            else if (durationNum <= 3.0) recordData.timeClass = SERVICE_TIME_CLASSES[1];
            else recordData.timeClass = SERVICE_TIME_CLASSES[2];
          }
        }

        // (3) 延長時間の処理
        if (data.extensionMinutes && data.extensionMinutes > 0) {
          const extHours = Math.round((data.extensionMinutes / 60) * 10) / 10;
          recordData.extensionDuration = String(extHours);
          if (extHours >= 2.0) recordData.extendedSupportAddon = '3（2時間以上）';
          else if (extHours >= 1.0) recordData.extendedSupportAddon = '2（1時間以上2時間未満）';
          else if (extHours >= 0.5) recordData.extendedSupportAddon = '1（30分以上1時間未満）';
        }
      }

      await addDoc(collection(db, 'supportRecords'), recordData);
      console.log(`[Success] 支援記録を自動生成しました: ${data.userName}`);

    } catch (error) {
      console.error("支援記録の自動生成エラー:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return { createRecord, isCreating };
};