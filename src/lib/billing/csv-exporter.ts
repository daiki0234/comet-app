// src/lib/billing/csv-exporter.ts

import Encoding from 'encoding-japanese';
import { ValidationResult } from '@/types/billing';

/**
 * サービス提供実績記録票（レコード）のCSVを出力およびダウンロードする
 */
export const downloadRecordsCsv = (
  results: ValidationResult[],
  yearMonth: string, // "2024-04"
  officeNo: string = "0000000000" // 事業所番号（実際は事業所マスタから取得推奨）
) => {
  const [year, month] = yearMonth.split('-');
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();

  // CSVの行データを作成
  const rows: string[][] = [];

  // ヘッダー行（国保連仕様ではヘッダー不要な場合が多いが、確認用につけるか、仕様に合わせて削除してください）
  // 今回は「取込送信」ソフトの一般的な仕様に合わせて「ヘッダーなし」でデータのみ作成します。

  results.forEach((res) => {
    // 実績がない、かつ契約中でない人はスキップ
    if (res.usageCount === 0 && !res.user.daysSpecified) return;

    // 1行のデータ配列
    const row: string[] = [];

    // --- 基本情報 ---
    // 1. レコード種別 (実績記録票は通常特定のヘッダコードがありますが、簡易CSVとしてデータ部のみ作成)
    // ここでは汎用的な並びとして作成します。実際の取り込みソフトの仕様に合わせて調整が必要です。
    // 一般的な並び: 受給者証番号, 氏名, 事業所番号, 年月, ...日付ごとのコード
    
    row.push(res.user.jukyushaNo || ""); // 受給者証番号
    row.push(`${res.user.lastName} ${res.user.firstName}`); // 氏名
    row.push(officeNo); // 事業所番号
    row.push(`${year}${month}`); // 提供年月 (YYYYMM)

    // --- 31日分の状況コード ---
    // 1: 授業終了後 (放課後)
    // 2: 休業日 (学校休み)
    // 3: その他
    // 4: 欠席時対応
    for (let day = 1; day <= 31; day++) {
      if (day > daysInMonth) {
        row.push(""); // 存在しない日は空欄
        continue;
      }

      const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
      const record = res.records.find(r => r.date === dateStr);

      if (!record) {
        row.push(""); // 記録なし
      } else {
        switch (record.usageStatus) {
          case '放課後':
            row.push("1");
            break;
          case '休校日':
            row.push("2");
            break;
          case '欠席':
            // 欠席時対応加算のフラグがあれば '4'、なければ単なる欠席なので空欄（またはソフト仕様による）
            // ここでは簡易的に「欠席記録があれば4」としますが、
            // 本来は「加算算定の有無」を確認すべきです。
            // 今回のAttendanceRecordには加算詳細がないため、一旦 '4' と仮定します。
            row.push("4"); 
            break;
          default:
            row.push("");
        }
      }
    }

    rows.push(row);
  });

  // CSV文字列に変換 (カンマ区切り、改行付き)
  const csvString = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\r\n');

  // Shift-JISに変換
  const unicodeArray = Encoding.stringToCode(csvString);
  const sjisArray = Encoding.convert(unicodeArray, {
    to: 'SJIS',
    from: 'UNICODE',
  });
  const uint8Array = new Uint8Array(sjisArray);

  // ダウンロード処理
  const blob = new Blob([uint8Array], { type: 'text/csv;charset=Shift_JIS' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `service_records_${year}${month}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};