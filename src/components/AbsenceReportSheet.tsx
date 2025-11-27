import React from 'react';

// データ型定義
type AbsenceRecord = {
  id: string;
  date: string;
  userName: string;
  reason: string;
  notes: string;
  aiAdvice: string;
  staffName: string;
  nextVisit: string;
};

type Props = {
  dateStr: string; // "YYYY-MM-DD"
  records: AbsenceRecord[];
};

// 日付フォーマット関数
const formatDateJP = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}年 ${d.getMonth() + 1}月 ${d.getDate()}日 (${week})`;
};

export const AbsenceReportSheet: React.FC<Props> = ({ dateStr, records }) => {
  return (
    // A4横向き (297mm x 210mm) のコンテナ
    <div 
      className="bg-white text-black box-border relative"
      style={{ width: '297mm', height: '210mm', padding: '15mm' }}
    >
      {/* ヘッダー */}
      <div className="flex justify-between items-end mb-4 border-b-2 border-black pb-2">
        <h1 className="text-2xl font-bold">欠席時対応加算記録</h1>
        <div className="text-lg font-semibold">
          日付：{formatDateJP(dateStr)}
        </div>
      </div>

      {/* テーブル */}
      <table className="w-full border-collapse border border-black text-sm">
        <thead>
          <tr className="bg-gray-200 text-center h-10">
            <th className="border border-black p-1 w-12">No.</th>
            <th className="border border-black p-1 w-32">利用者氏名</th>
            <th className="border border-black p-1 w-24">欠席理由</th>
            <th className="border border-black p-1 w-64">連絡の内容</th>
            <th className="border border-black p-1">相談援助内容 (対応)</th>
            <th className="border border-black p-1 w-32">次回予定</th>
            <th className="border border-black p-1 w-24">担当者</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, index) => (
            <tr key={rec.id} className="h-24 align-top">
              <td className="border border-black p-2 text-center">{index + 1}</td>
              <td className="border border-black p-2 font-bold">{rec.userName}</td>
              <td className="border border-black p-2 text-center">{rec.reason}</td>
              <td className="border border-black p-2 whitespace-pre-wrap text-xs">{rec.notes}</td>
              <td className="border border-black p-2 whitespace-pre-wrap text-xs">{rec.aiAdvice}</td>
              <td className="border border-black p-2 text-center text-xs">{rec.nextVisit}</td>
              <td className="border border-black p-2 text-center">{rec.staffName}</td>
            </tr>
          ))}
          {/* 余白行（見た目を整えるため、必要に応じて追加） */}
          {records.length < 5 && Array.from({ length: 5 - records.length }).map((_, i) => (
            <tr key={`empty-${i}`} className="h-24">
              <td className="border border-black p-2"></td>
              <td className="border border-black p-2"></td>
              <td className="border border-black p-2"></td>
              <td className="border border-black p-2"></td>
              <td className="border border-black p-2"></td>
              <td className="border border-black p-2"></td>
              <td className="border border-black p-2"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* フッター (事業所名など) */}
      <div className="absolute bottom-10 right-10 text-sm text-gray-500">
        作成日: {new Date().toLocaleDateString()}
      </div>
    </div>
  );
};