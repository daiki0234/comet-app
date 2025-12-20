export type PlanStatus = '原案' | '本番';

export type SupportPlan = {
  id: string;
  userId: string;       // 利用者ID
  status: PlanStatus;   // 原案 or 本番
  createdAt: any;       // 作成日 (Firestore Timestamp)
  updatedAt: any;       // 更新日
  
  // 計画期間
  periodStart: string;  // YYYY-MM-DD
  periodEnd: string;    // YYYY-MM-DD

  // 作成者
  author: string;
  
  // 今後詳細を追加するフィールド（今回は枠だけ）
  // userRequest?: string;     // 本人・家族の意向
  // longTermGoal?: string;    // 長期目標
  // shortTermGoals?: any[];   // 短期目標リスト
};