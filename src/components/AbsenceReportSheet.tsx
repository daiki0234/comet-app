import React from 'react';

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
  dateStr: string;
  records: AbsenceRecord[];
  pageIndex: number; // ★ 追加: 現在のページ番号 (0始まり)
  totalPages: number; // ★ 追加: 総ページ数
};

const formatDateJP = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}年 ${d.getMonth() + 1}月 ${d.getDate()}日 (${week})`;
};

const cleanNoteText = (text: string) => {
  if (!text) return '';
  return text
    .replace(/^欠席[（(]\d+[）)]\s*[｜\|]\s*/u, '')
    .replace(/^欠席\s*[｜\|]\s*/u, '');
};

export const AbsenceReportSheet: React.FC<Props> = ({ dateStr, records, pageIndex, totalPages }) => {
  return (
    <div 
      className="bg-white text-black box-border relative"
      style={{ width: '210mm', height: '297mm', padding: '15mm' }}
    >
      {/* タイトルと日付 */}
      <div className="mb-2 relative">
        <h1 className="text-2xl font-bold text-center mb-2">欠席時対応加算記録</h1>
        <div className="text-right text-sm font-semibold">
          日付：{formatDateJP(dateStr)}
          {/* 複数ページある場合のみページ番号を表示 */}
          {totalPages > 1 && (
            <span className="ml-4 text-gray-600">
              ({pageIndex + 1} / {totalPages})
            </span>
          )}
        </div>
      </div>

      {/* 押印欄 (管理者・児発管) - 全ページに表示するか、1枚目だけにするかはお好みですが、通常は全ページにあってOK */}
      <div className="flex justify-end mb-4">
        <div className="flex border border-black">
          <div className="border-r border-black w-20">
            <div className="bg-gray-200 text-center text-xs py-1 border-b border-black font-bold">管理者</div>
            <div className="h-16"></div>
          </div>
          <div className="w-20">
            <div className="bg-gray-200 text-center text-xs py-1 border-b border-black font-bold">児発管</div>
            <div className="h-16"></div>
          </div>
        </div>
      </div>

      {/* テーブル */}
      <table className="w-full border-collapse border border-black text-xs table-fixed">
        <colgroup>
          <col style={{ width: '6%' }} />  {/* No. */}
          <col style={{ width: '15%' }} /> {/* 氏名 */}
          <col style={{ width: '12%' }} /> {/* 理由 */}
          <col style={{ width: '27%' }} /> {/* 連絡内容 */}
          <col style={{ width: '27%' }} /> {/* 相談援助 */}
          <col style={{ width: '13%' }} /> {/* 次回/担当 */}
        </colgroup>
        <thead>
          <tr className="bg-gray-200 text-center h-8">
            <th className="border border-black p-1">No.</th>
            <th className="border border-black p-1">利用者氏名</th>
            <th className="border border-black p-1">欠席理由</th>
            <th className="border border-black p-1">連絡の内容</th>
            <th className="border border-black p-1">相談援助内容 (対応)</th>
            <th className="border border-black p-1">次回予定<br/>/ 担当者</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, index) => (
            <tr key={rec.id} className="align-top">
              {/* 通し番号 (ページをまたいでも連番になるように計算) */}
              <td className="border border-black p-2 text-center">
                {(pageIndex * 8) + index + 1} 
                {/* ※「8」は1ページの最大件数と合わせてください */}
              </td>
              <td className="border border-black p-2 font-bold break-words">{rec.userName}</td>
              <td className="border border-black p-2 text-center">{rec.reason}</td>
              <td className="border border-black p-2 whitespace-pre-wrap break-words leading-snug">
                {cleanNoteText(rec.notes)}
              </td>
              <td className="border border-black p-2 whitespace-pre-wrap break-words leading-snug">
                {rec.aiAdvice}
              </td>
              <td className="border border-black p-2 text-center">
                <div className="mb-2 border-b border-dotted border-gray-400 pb-1">
                  {rec.nextVisit || '-'}
                </div>
                <div>{rec.staffName}</div>
              </td>
            </tr>
          ))}
          {/* ★ 空白行の生成コードは削除しました ★ */}
        </tbody>
      </table>

      <div className="absolute bottom-10 right-10 text-[10px] text-gray-400">
        Comet System / 出力日: {new Date().toLocaleDateString()}
      </div>
    </div>
  );
};