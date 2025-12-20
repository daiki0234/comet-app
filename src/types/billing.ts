export type UserData = {
  id: string;
  lastName: string;
  firstName: string;
  guardianLastName?: string;
  guardianFirstName?: string;
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
  
  // 延長支援: { class: 1, ... } の形、または数値/文字列
  extension?: any; 
  
  // 各種加算フラグ
  hasFamilySupport?: boolean;       // 家族支援
  hasIndependenceSupport?: boolean; // 通所自立
  hasMedicalSupport?: boolean;      // 医療連携 (追加)
  hasIntensiveSupport?: boolean;    // 集中的支援 (追加)
  hasSpecialSupport?: boolean;      // 専門的支援 (追加)
  hasBathSupport?: boolean;         // 入浴支援 (追加)
  hasChildcareSupport?: boolean;    // 子育てサポート (追加)
  hasSelfRelianceSupport?: boolean; // 自立サポート (追加)
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