export type UserData = {
  id: string;
  lastName: string;
  firstName: string;
  jukyushaNo: string;
  cityNo: string;
  daysSpecified: string; // 支給量
  decisionEndDate: string; // 給付決定終了日
  upperLimitAmount: string; // 負担上限月額
  serviceHoDay: string;
  serviceJihatsu: string;
};

export type AttendanceRecord = {
  id: string;
  userId: string;
  date: string;
  usageStatus: '放課後' | '休校日' | '欠席';
  arrivalTime: string;
  departureTime: string;
  
  // 加算関係のフラグ・データ
  extension?: {
    minutes: number;
    class: 1 | 2 | 3;
    display: string;
  } | null;
  
  hasFamilySupport?: boolean;       // 家族支援加算
  hasIndependenceSupport?: boolean; // 通所自立支援加算
  
  // 今後追加するかもしれない加算（エラー防止のため定義しておくと安全）
  hasMedicalSupport?: boolean;      // 医療連携
  hasBathSupport?: boolean;         // 入浴支援
  // 必要に応じて他の加算フラグもここに追加
};

export type ValidationResult = {
  user: UserData;
  usageCount: number; // 実績日数
  limitCount: number; // 支給量
  upperLimit: number; // 負担上限月額
  estimatedCost: number; // 推定1割負担額
  finalBurden: number; // 最終的な請求予定額
  
  isOverLimit: boolean; // 日数超過フラグ
  isExpired: boolean;   // 期限切れフラグ
  missingFields: string[]; // 不足項目
  
  records: AttendanceRecord[];
};