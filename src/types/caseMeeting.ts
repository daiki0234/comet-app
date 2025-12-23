export interface CaseMeetingDetail {
  userId: string;
  userName: string;
  content: string; // 変更内容・検討内容
}

export interface CaseMeeting {
  id?: string;
  createdAt?: any;
  updatedAt?: any;

  date: string;       // 会議実施日
  staffIds: string[]; // 参加職員IDの配列
  staffNames: string[]; // 参加職員名の配列（表示用）

  // 議題・対象者リスト
  details: CaseMeetingDetail[];
}