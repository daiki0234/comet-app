"use client";

import React, { useState } from 'react';
import Papa from 'papaparse';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

// CSVの行データ型定義（必要な部分のみ抜粋）
type CsvRow = {
  作成日: string;
  作成状態: string; // "False"など
  利用者_姓: string;
  利用者_名: string;
  入力者_姓: string;
  入力者_名: string;
  利用児及び家族の生活に対する意向?: string;
  利用者及び家族の生活に対する意向?: string; // カラム名の揺らぎ対応
  長期目標: string;
  総合的な支援の方針: string;
  [key: string]: any; // 動的な目標カラム（"支援目標...1_支援目標"など）のため
};

export default function ImportPlans() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('CSVデータのインポートを開始しますか？\n※データベースへの書き込みが発生します。')) return;

    setLoading(true);
    setLogs([]);
    setProgress(0);
    addLog(`ファイル読み込み開始: ${file.name}`);

    // 1. まず全利用者を取得して、名前でIDを引ける辞書を作る
    const userMap = new Map<string, string>(); // "姓 名" -> userId
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.forEach(doc => {
        const data = doc.data();
        const fullName = `${data.lastName} ${data.firstName}`.replace(/[\s\u3000]+/g, ''); // スペース除去して正規化
        userMap.set(fullName, doc.id);
      });
      addLog(`利用者マスタ取得完了: ${usersSnap.size}件`);
    } catch (err) {
      console.error(err);
      addLog('エラー: 利用者データの取得に失敗しました');
      setLoading(false);
      return;
    }

    // 2. CSVパース & インポート
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        addLog(`CSV行数: ${rows.length}件`);
        
        let successCount = 0;
        let skipCount = 0;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 2; // ヘッダー分+1始まり

          // 氏名マッチング
          const csvNameRaw = `${row.利用者_姓} ${row.利用者_名}`;
          const csvName = csvNameRaw.replace(/[\s\u3000]+/g, '');
          const userId = userMap.get(csvName);

          if (!userId) {
            addLog(`[SKIP] 行${rowNum}: 利用者「${csvNameRaw}」がシステムに見つかりません`);
            skipCount++;
            continue;
          }

          try {
            // データ変換処理
            const planData = convertRowToPlanData(row, userId);
            
            // Firestoreへ保存
            // ※plansコレクションに保存します
            await addDoc(collection(db, 'plans'), planData);
            
            successCount++;
          } catch (err: any) {
            console.error(err);
            addLog(`[ERROR] 行${rowNum}: 保存失敗 - ${err.message}`);
          }

          // 進捗更新
          setProgress(Math.round(((i + 1) / rows.length) * 100));
        }

        addLog(`完了: 成功 ${successCount}件 / スキップ(利用者不明) ${skipCount}件`);
        toast.success(`インポート完了: ${successCount}件`);
        setLoading(false);
      },
      error: (err) => {
        addLog(`CSVパースエラー: ${err.message}`);
        setLoading(false);
      }
    });
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm space-y-4">
      <h3 className="font-bold text-lg text-gray-800">個別支援計画 CSVインポート</h3>
      
      <div className="bg-yellow-50 p-3 rounded text-sm text-yellow-800 border border-yellow-200">
        <p className="font-bold mb-1">注意点</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>CSVの「利用者_姓」「利用者_名」が、システム上の氏名と完全に一致する場合のみ取り込まれます。</li>
          <li>同姓同名の利用者がいる場合、どちらかに紐付く可能性があります（運用上注意）。</li>
          <li>インポートは「追加」として処理されます。重複チェックは行っていません。</li>
        </ul>
      </div>

      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        disabled={loading}
        className="block w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4
          file:rounded-full file:border-0
          file:text-sm file:font-semibold
          file:bg-blue-50 file:text-blue-700
          hover:file:bg-blue-100"
      />

      {loading && (
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      <div className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono h-64 overflow-y-auto">
        {logs.length === 0 ? 'ログがここに表示されます...' : logs.map((log, i) => (
          <div key={i} className="border-b border-gray-800 py-1 last:border-0">{log}</div>
        ))}
      </div>
    </div>
  );
}

// --- ヘルパー関数: CSV行をFirestoreデータ型へ変換 ---

function convertRowToPlanData(row: CsvRow, userId: string) {
  // 日付変換 (例: "2025年9月19日" -> Date -> Timestamp)
  let createdAt = new Date();
  if (row.作成日) {
    const dateStr = row.作成日.replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '');
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) createdAt = d;
  }

  // ステータス変換
  // CSVの「False」などが何を表すか不明ですが、一旦インポートデータはすべて 'completed' (作成済) か 'imported' として扱うか、
  // あるいは 'draft' にするか選べます。ここでは安全のためドラフト扱いにしたい場合は 'draft' にしてください。
  // 今回は既存データなので 'completed' (確定版) として扱います。
  const status = 'completed'; 

  // 短期目標のパース (1〜8)
  const shortTermGoals = [];
  for (let i = 1; i <= 8; i++) {
    const prefix = `支援目標及び具体的な支援内容等${i}_`;
    const goalText = row[`${prefix}支援目標`];
    
    // 目標が入っていれば有効データとみなす
    if (goalText && goalText.trim() !== '') {
      shortTermGoals.push({
        id: crypto.randomUUID(), // 一意なID
        order: Number(row[`${prefix}表示順`] || i),
        category: row[`${prefix}支援項目`] || '', // 本人支援など
        goal: goalText,
        content: row[`${prefix}支援内容`] || '',
        term: row[`${prefix}達成時期`] || '', // "6ヶ月後"など
        // 5領域: CSVでは "健康・生活" のように文字列で入っている想定。
        // Comet側が配列を期待している場合はsplitする。ここではそのまま文字列または配列に変換。
        relevance: row[`${prefix}5領域との関連性`] ? [row[`${prefix}5領域との関連性`]] : [], 
        staff: row[`${prefix}担当者・提供機関`] || '',
        notes: row[`${prefix}留意事項`] || '',
      });
    }
  }

  // 方針など
  const userIntention = row['利用児及び家族の生活に対する意向'] || row['利用者及び家族の生活に対する意向'] || '';
  
  return {
    userId: userId,
    userName: `${row.利用者_姓} ${row.利用者_名}`,
    createdAt: Timestamp.fromDate(createdAt),
    updatedAt: Timestamp.fromDate(new Date()), // インポート日時
    status: status,
    author: `${row.入力者_姓} ${row.入力者_名}`,
    
    // 各種テキストフィールド
    userIntention: userIntention,
    longTermGoal: row.長期目標 || '',
    policy: row.総合的な支援の方針 || '',
    
    // 配列化した目標
    shortTermGoals: shortTermGoals,

    // メタデータ
    source: 'csv-import', // CSV経由であることをマーク
  };
}