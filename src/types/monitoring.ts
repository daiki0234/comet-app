export interface TargetEvaluation {
  targetId: string; // 支援目標のID
  evaluation: string; // 評価コメント
}

export interface MonitoringRecord {
  id?: string;
  createdAt?: any;
  updatedAt?: any;

  // 基本情報
  creationDate: string;
  periodStart: string;
  periodEnd: string;
  userId: string;
  userName: string;
  author: string; // 作成者

  // 主な取り組み内容 (1~3)
  initiative1: string;
  evaluation1: string;
  initiative2: string;
  evaluation2: string;
  initiative3: string;
  evaluation3: string;
  
  // 短信
  shortMessage: string;

  // 参照した計画書の情報
  refPlanId: string; // 紐付いた計画書のID

  // 支援目標ごとの評価
  // 配列で持ち、targetIdで紐付けます
  targetEvaluations: TargetEvaluation[];
}