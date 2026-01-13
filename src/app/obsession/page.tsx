"use client";

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, addDoc, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { AppLayout } from '@/components/Layout';
import toast from 'react-hot-toast';

// CSVの行データ型定義
type CsvRow = { [key: string]: any; };

type UserMapInfo = { id: string; name: string; };

// 曖昧なキー名から値を探すヘルパー関数
const findVal = (row: CsvRow, searchWords: string[]): string => {
  const keys = Object.keys(row);
  // 全てのキーワードを含むキーを探す
  const targetKey = keys.find(k => searchWords.every(word => k.includes(word)));
  return targetKey && row[targetKey] ? String(row[targetKey]).trim() : '';
};

export default function ImportCsvPage() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [userMap, setUserMap] = useState<Map<string, UserMapInfo>>(new Map());

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const map = new Map<string, UserMapInfo>();
        usersSnap.forEach(doc => {
          const data = doc.data();
          const fullName = `${data.lastName || ''}${data.firstName || ''}`.replace(/[\s\u3000]+/g, '');
          if (fullName) {
            map.set(fullName, { id: doc.id, name: `${data.lastName || ''} ${data.firstName || ''}`.trim() });
          }
        });
        setUserMap(map);
        addLog(`システム準備完了: 利用者マスタ ${usersSnap.size}件を読み込みました`);
      } catch (err) {
        console.error(err);
        addLog('エラー: 利用者データの取得に失敗しました');
      }
    };
    fetchUsers();
  }, []);

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const handleDeleteImported = async () => {
    if (!confirm('警告: "csv-import" として登録されたデータを全て削除しますか？')) return;
    setLoading(true);
    addLog('削除処理を開始しました...');
    try {
      const q = query(collection(db, 'supportPlans'), where('source', '==', 'csv-import'));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        addLog('削除対象のデータは見つかりませんでした。');
        setLoading(false);
        return;
      }
      addLog(`削除対象: ${snapshot.size}件。削除中...`);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      addLog(`完了: ${snapshot.size}件のデータを削除しました。`);
      toast.success(`${snapshot.size}件削除しました。再インポート可能です。`);
    } catch (error: any) {
      console.error(error);
      addLog(`削除エラー: ${error.message}`);
      toast.error('削除に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('CSVデータのインポートを開始しますか？')) {
      e.target.value = '';
      return;
    }
    setLoading(true);
    setLogs([]);
    setProgress(0);
    addLog(`ファイル読み込み開始: ${file.name}`);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        addLog(`CSV行数: ${rows.length}件`);
        
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 2; 

          // 利用者マッチング
          const rowLastName = findVal(row, ['利用者_姓']) || findVal(row, ['利用者', '姓']);
          const rowFirstName = findVal(row, ['利用者_名']) || findVal(row, ['利用者', '名']);
          const csvNameRaw = `${rowLastName}${rowFirstName}`;
          const csvName = csvNameRaw.replace(/[\s\u3000]+/g, '');
          
          const userInfo = userMap.get(csvName);

          if (!userInfo || typeof userInfo === 'string' || !userInfo.id) {
            addLog(`[SKIP] 行${rowNum}: 利用者「${rowLastName} ${rowFirstName}」未登録のためスキップ`);
            skipCount++;
            continue;
          }

          try {
            const planData = convertRowToSupportPlan(row, userInfo.id, userInfo.name);
            await addDoc(collection(db, 'supportPlans'), planData);
            successCount++;
          } catch (err: any) {
            console.error(err);
            addLog(`[ERROR] 行${rowNum}: 保存失敗 - ${err.message}`);
            errorCount++;
          }

          setProgress(Math.round(((i + 1) / rows.length) * 100));
          if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
        }

        addLog('------------------------------------------------');
        addLog(`完了: 成功 ${successCount}件 / スキップ ${skipCount}件 / エラー ${errorCount}件`);
        if (successCount > 0) toast.success(`${successCount}件のインポートに成功しました`);
        setLoading(false);
        e.target.value = '';
      },
      error: (err) => {
        addLog(`CSV読み込みエラー: ${err.message}`);
        setLoading(false);
      }
    });
  };

  return (
    <AppLayout pageTitle="データ取り込み (個別支援計画)">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800">個別支援計画 CSVインポート</h2>
            <button
              onClick={handleDeleteImported}
              disabled={loading}
              className="text-sm text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg font-bold transition-colors disabled:opacity-50"
            >
              前回インポートしたデータを削除する
            </button>
          </div>
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <h3 className="font-bold mb-2">使い方（やり直し手順）</h3>
            <ol className="list-decimal pl-5 space-y-1">
              <li>右上の<strong>「削除する」</strong>ボタンを押してください。</li>
              <li>ログに「削除完了」と出たら、再度CSVファイルを選択してインポートしてください。</li>
              <li><strong>FALSE → 本番、TRUE → 原案</strong> として登録されます。</li>
            </ol>
          </div>
          <div className="space-y-4">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={loading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer disabled:opacity-50"
            />
            {loading && (
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
              </div>
            )}
          </div>
        </div>
        
        <div className="bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-700">
          <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
            <span className="text-xs font-mono text-gray-400">実行ログ</span>
          </div>
          <div className="p-4 h-64 overflow-y-auto font-mono text-xs text-green-300 space-y-1">
            {logs.length === 0 ? <span className="text-gray-500">処理結果が表示されます...</span> : logs.map((log, i) => <div key={i} className="break-all border-b border-gray-800/50 pb-1 last:border-0">{log}</div>)}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// --- データ変換ロジック (厳密版) ---

function convertRowToSupportPlan(row: CsvRow, userId: string, userName: string) {
  // 日付
  let creationDate = new Date().toISOString().slice(0, 10); 
  const createdStr = findVal(row, ['作成日']);
  if (createdStr) {
    const d = new Date(createdStr.replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, ''));
    if (!isNaN(d.getTime())) creationDate = d.toISOString().slice(0, 10);
  }

  // ステータス: FALSE → 本番
  const statusVal = findVal(row, ['作成状態']).toUpperCase();
  const status = (statusVal === 'FALSE') ? '本番' : '原案';

  // 時間割
  const schedules: any = { pre: {}, standard: {}, post: {} };
  const typeMap: Record<string, string> = {
    '【支援前】': 'pre',
    '標準的': 'standard',
    '【支援後】': 'post'
  };
  const dayKeys = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日']; 
  
  Object.keys(typeMap).forEach(searchPrefix => {
    const targetType = typeMap[searchPrefix];
    
    dayKeys.forEach((dayLabel, idx) => {
      // 部分一致で値を探す
      const start = findVal(row, [searchPrefix, dayLabel, '開始']);
      const end = findVal(row, [searchPrefix, dayLabel, '終了']);
      const dur = findVal(row, [searchPrefix, dayLabel, '算定']);

      if (start || end) {
        schedules[targetType][idx] = { start, end, duration: dur };
      }
    });
  });

  // 備考
  const remarks = {
    pre: findVal(row, ['【支援前】', '備考']),
    standard: findVal(row, ['標準的', '備考']),
    post: findVal(row, ['【支援後】', '備考'])
  };

  // 支援目標リスト
  const supportTargets = [];
  for (let i = 1; i <= 8; i++) {
    // 検索キーを作成
    // ★重要: "1_" だけでなく "_支援目標" (アンダースコア付き) で検索することで
    // "1_表示順" などを拾わないようにする
    const numKey = `${i}_`; 
    
    // ★ここを修正: "支援目標" -> "_支援目標" にして列名を厳密に特定
    const goalText = findVal(row, [numKey, '_支援目標']);
    
    if (goalText) {
      const fiveDomainsStr = findVal(row, [numKey, '_5領域']); // "5領域" -> "_5領域"
      const categoryStr = findVal(row, [numKey, '_支援項目']); // "支援項目" -> "_支援項目"

      supportTargets.push({
        id: crypto.randomUUID(),
        displayOrder: String(findVal(row, [numKey, '_表示順']) || i), // "表示順" -> "_表示順"
        priority: findVal(row, [numKey, '_優先順位']),
        achievementPeriod: findVal(row, [numKey, '_達成時期']) || '6ヶ月後',
        achievementPeriodOther: findVal(row, [numKey, '達成時期', 'その他']),
        supportCategories: categoryStr ? [categoryStr] : [],
        goal: goalText,
        content: findVal(row, [numKey, '_支援内容']), // "支援内容" -> "_支援内容"
        fiveDomains: fiveDomainsStr ? [fiveDomainsStr] : [],
        staff: findVal(row, [numKey, '_担当者']), // "担当者" -> "_担当者"
        remarks: findVal(row, [numKey, '_留意事項']), // "留意事項" -> "_留意事項"
      });
    }
  }

  const userRequest = findVal(row, ['生活に対する意向']); 
  const authorLastName = findVal(row, ['入力者', '姓']);
  const authorFirstName = findVal(row, ['入力者', '名']);
  
  const transportVal = findVal(row, ['送迎']);
  const mealVal = findVal(row, ['食事']);

  // 短期目標
  const shortTermGoal = findVal(row, ['短期目標']);

  return {
    creationDate: creationDate,
    status: status,
    userId: userId || '',
    userName: userName || '',
    author: `${authorLastName} ${authorFirstName}`.trim(),
    hasTransport: (transportVal.toUpperCase() === 'TRUE') ? 'あり' : 'なし',
    hasMeal: (mealVal.toUpperCase() === 'TRUE') ? 'あり' : 'なし',
    userRequest: userRequest,
    policy: findVal(row, ['総合的な支援の方針']),
    longTermGoal: findVal(row, ['長期目標']),
    shortTermGoal: shortTermGoal, 
    
    schedules: schedules,
    remarks: remarks,
    supportTargets: supportTargets,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: 'csv-import'
  };
}