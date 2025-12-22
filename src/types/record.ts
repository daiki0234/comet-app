import { Timestamp } from 'firebase/firestore';

export type ServiceTimeClass = '区分1' | '区分2' | '区分3';
export type ExtendedSupport = '加算しない' | '1時間未満' | '1時間以上2時間未満' | '2時間以上';

export interface SupportRecord {
  id?: string;
  date: string;
  userId: string;
  userName: string;
  
  // 出席状況
  status: '放課後' | '休校日' | '欠席';
  startTime: string;
  endTime: string;
  duration: number;
  extensionDuration: number;
  condition: '良好' | '注意' | '悪化';

  // 加算関係 (共通・出席時)
  timeClass: string;
  extendedSupportAddon: string;
  
  // ★追加: 欠席時用
  absenceAddon: string; // 欠席時対応加算

  // 個別設定加算
  childcareSupport: string;
  individualSupport: string;
  specializedSupport: string;
  agencyCooperation: string;
  familySupport: string;
  transportation: string;
  independenceSupport: string;
  interAgencyCooperation: string;
  medicalSupport: string;
  selfRelianceSupport: string;
  intenseBehaviorSupport: string;

  // 事業所設定加算
  welfareSpecialist: string;
  staffAddon: string;
  specializedSystem: string;

  // 減算
  planMissing: string;
  managerMissing: string;
  staffMissing: string;

  // 記録
  trainingContent: string;
  supportContent: string;
  staffSharing: string;

  // 計画参照コメント
  targetComments: {
    targetId: string;
    order: string;
    comment: string;
  }[];

  createdAt: any;
  updatedAt: any;
}