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

// ★ 文言整形関数 ("欠席(n)|" を除去)
const cleanNoteText = (text: string) => {
  if (!text) return '';
  // 全角・半角の「欠席(数字)|」または「欠席|」を除去
  return text
    .replace(/^欠席[（(]\d+[）)]\s*[｜\|]\s*/u, '')
    .replace(/^欠席\s*[｜\|]\s*/u, '');
};

export const AbsenceReportSheet: React.FC<Props> = ({ dateStr, records }) => {
  return (
    // ★ 修正: A4縦 (210mm x 297mm)
    <div 
      className="bg-white text-black box-border relative"
      style={{ width: '210mm', height: '297mm', padding: '15mm' }}
    >
      {/* タイトルと日付 */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-center mb-2">欠席時対応加算記録</h1>
        <div className="text-right text-sm font-semibold">
          日付：{formatDateJP(dateStr)}
        </div>
      </div>

      {/* ★ 追加: 押印欄 (管理者・児発管) */}
      <div className="flex justify-end mb-4">
        <div className="flex border border-black">
          {/* 管理者枠 */}
          <div className="border-r border-black w-20">
            <div className="bg-gray-200 text-center text-xs py-1 border-b border-black font-bold">
              管理者
            </div>
            <div className="h-16"></div> {/* ハンコスペース */}
          </div>
          {/* 児発管枠 */}
          <div className="w-20">
            <div className="bg-gray-200 text-center text-xs py-1 border-b border-black font-bold">
              児発管
            </div>
            <div className="h-16"></div> {/* ハンコスペース */}
          </div>
        </div>
      </div>

      {/* テーブル (縦向き用に幅などを調整) */}
      <table className="w-full border-collapse border border-black text-xs table-fixed">
        <colgroup>
          <col style={{ width: '8%' }} />  {/* No. */}
          <col style={{ width: '15%' }} /> {/* 氏名 */}
          <col style={{ width: '12%' }} /> {/* 理由 */}
          <col style={{ width: '25%' }} /> {/* 連絡内容 */}
          <col style={{ width: '25%' }} /> {/* 相談援助 */}
          <col style={{ width: '15%' }} /> {/* 次回/担当 */}
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
              <td className="border border-black p-2 text-center">{index + 1}</td>
              <td className="border border-black p-2 font-bold break-words">{rec.userName}</td>
              <td className="border border-black p-2 text-center">{rec.reason}</td>
              
              {/* ★ 修正: 整形したテキストを表示 */}
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
          
          {/* 余白行 (レイアウト維持のため数行追加) */}
          {records.length < 6 && Array.from({ length: 6 - records.length }).map((_, i) => (
            <tr key={`empty-${i}`} className="h-16">
              <td className="border border-black"></td>
              <td className="border border-black"></td>
              <td className="border border-black"></td>
              <td className="border border-black"></td>
              <td className="border border-black"></td>
              <td className="border border-black"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* フッター */}
      <div className="absolute bottom-10 right-10 text-[10px] text-gray-400">
        Comet System / 出力日: {new Date().toLocaleDateString()}
      </div>
    </div>
  );
};