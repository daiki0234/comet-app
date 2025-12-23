// スケジュールタイプ
export type ScheduleType = 'pre' | 'standard' | 'post';

// 時間割のスロット
export interface TimeSlot {
  start: string;
  end: string;
  duration: string;
}

// 支援目標のアイテム
export interface SupportTarget {
  id: string;
  displayOrder: string;
  priority: string;
  achievementPeriod: string;
  achievementPeriodOther: string;
  supportCategories: string[];
  goal: string;
  content: string;
  fiveDomains: string[];
  staff: string;
  remarks: string;
}

// 個別支援計画書データ全体
export interface SupportPlan {
  id?: string;
  createdAt?: any; // Firestore Timestamp
  updatedAt?: any; // Firestore Timestamp

  // --- 基本情報 ---
  creationDate: string;
  
  // ★一覧ページでの参照エラー回避用に追加
  periodStart?: string; 
  periodEnd?: string;

  status: '原案' | '本番';
  userId: string;
  userName: string; // 一覧で結合して表示する場合用
  author: string;
  
  // --- チェック項目 ---
  hasTransport: 'あり' | 'なし';
  hasMeal: 'あり' | 'なし';

  // --- 意向・方針・目標 ---
  userRequest: string;
  policy: string;
  longTermGoal: string;
  shortTermGoal: string;

  // --- スケジュール (標準、支援前延長、支援後延長) ---
  schedules: {
    pre: { [key: string]: TimeSlot };
    standard: { [key: string]: TimeSlot };
    post: { [key: string]: TimeSlot };
  };

  // --- 備考 (スケジュールごとの特記事項) ---
  remarks: {
    pre: string;
    standard: string;
    post: string;
  };

  // --- 支援目標リスト ---
  supportTargets: SupportTarget[];
}