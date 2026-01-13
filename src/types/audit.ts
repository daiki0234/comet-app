export type MonthlyPlan = {
  month: number;
  content: string; // 重点点検箇所 や 避難訓練内容
  subContent?: string; // その他（訓練の場合など）
};

export type ManualEntry = {
  id: string;
  category: string; // 分野
  creationDate: string; // 策定時期
  reviewDate: string; // 見直し予定時期
  location: string; // 掲示・管理場所
};

export type SafetyPlan = {
  id?: string;
  fiscalYear: number; // 年度 (例: 2025)
  facilityName: string; // 事業所名
  createdAt: any;
  updatedAt: any;

  // 1. 安全点検
  safetyChecks: MonthlyPlan[]; // 4月〜3月の点検計画

  // 2. マニュアル策定
  manuals: ManualEntry[];

  // 3. 安全指導
  childGuidance: string; // 児童への安全指導
  parentGuidance: string; // 保護者への説明

  // 4. 訓練・研修
  drills: MonthlyPlan[]; // 4月〜3月の訓練計画
  drillParticipants: string; // 訓練参加予定者
  staffTraining: string; // 職員への研修
  externalTraining: string; // 行政等が実施する訓練

  // 5. 再発防止
  recurrencePrevention: string; // 再発防止策

  // 6. その他
  otherMeasures: string; // その他の取り組み
};