"use client";

import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/Layout';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { downloadRecordsCsv } from '@/lib/billing/csv-exporter';

// --- 型定義 ---
type UserData = {
  id: string;
  lastName: string; firstName: string;
  jukyushaNo: string; cityNo: string;
  daysSpecified: string; // 支給量
  decisionEndDate: string; // 給付決定終了日
  upperLimitAmount: string; // 負担上限月額
  serviceHoDay: string; serviceJihatsu: string;
};

type AttendanceRecord = {
  id: string;
  userId: string;
  date: string;
  usageStatus: '放課後' | '休校日' | '欠席';
  arrivalTime: string;
  departureTime: string;
};

type ValidationResult = {
  user: UserData;
  usageCount: number; // 実績日数
  limitCount: number; // 支給量
  upperLimit: number; // 負担上限月額
  estimatedCost: number; // 推定1割負担額
  finalBurden: number; // 最終的な請求予定額 (上限と推定の小さい方)
  
  isOverLimit: boolean; // 日数超過フラグ
  isExpired: boolean;   // 期限切れフラグ
  missingFields: string[]; // 不足項目
  
  records: AttendanceRecord[];
};

// --- 印刷用コンポーネント (単票) ---
const ServiceRecordSheet = ({ data, month }: { data: ValidationResult, month: string }) => {
  if (!data) return null;
  
  const [year, m] = month.split('-');
  const daysInMonth = new Date(Number(year), Number(m), 0).getDate();
  const dateList = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getDayOfWeek = (d: number) => {
    const date = new Date(Number(year), Number(m) - 1, d);
    return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  };

  const getRecord = (d: number) => {
    const dateStr = `${year}-${m}-${String(d).padStart(2, '0')}`;
    return data.records.find(r => r.date === dateStr);
  };

  return (
    // break-after-page で改ページを強制
    <div className="p-8 bg-white text-black text-xs font-serif w-full h-full page-break">
      <div className="text-center font-bold text-lg mb-2 border-b-2 border-black pb-1">
        サービス提供実績記録票
      </div>
      
      <div className="flex justify-between items-end mb-2">
        <div>
          <span className="text-sm font-bold">{year}年 {m}月分</span>
        </div>
        <div className="text-right text-[10px]">
          <div className="flex justify-end gap-4">
            <p>受給者証番号: <span className="font-mono text-base">{data.user.jukyushaNo || '________'}</span></p>
            <p>支給市町村: {data.user.cityNo || '_____'}</p>
          </div>
          <div className="flex justify-end gap-4 mt-1">
             <p>氏名: <span className="font-bold text-sm">{data.user.lastName} {data.user.firstName} 様</span></p>
             <p>負担上限月額: <span className="font-bold">{data.upperLimit.toLocaleString()}円</span></p>
          </div>
        </div>
      </div>

      <table className="w-full border-collapse border border-black text-center text-[10px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-1 w-8">日付</th>
            <th className="border border-black p-1 w-8">曜日</th>
            <th className="border border-black p-1">サービス提供<br/>の状況</th>
            <th className="border border-black p-1 w-12">開始<br/>時間</th>
            <th className="border border-black p-1 w-12">終了<br/>時間</th>
            <th className="border border-black p-1 w-8">送迎</th>
            <th className="border border-black p-1 w-8">給食</th>
            <th className="border border-black p-1">利用者<br/>確認印</th>
          </tr>
        </thead>
        <tbody>
          {dateList.map(day => {
            const rec = getRecord(day);
            const wd = getDayOfWeek(day);
            const isSun = wd === '日';
            let status = '';
            if (rec) {
              if (rec.usageStatus === '放課後') status = '授業終了後';
              else if (rec.usageStatus === '休校日') status = '休業日';
              else if (rec.usageStatus === '欠席') status = '欠席時対応';
            }

            return (
              <tr key={day} className="h-7">
                <td className="border border-black">{day}</td>
                <td className={`border border-black ${isSun ? 'text-red-500' : ''}`}>{wd}</td>
                <td className="border border-black text-left px-1">{status}</td>
                <td className="border border-black">{rec?.arrivalTime || ''}</td>
                <td className="border border-black">{rec?.departureTime || ''}</td>
                <td className="border border-black">{rec?.arrivalTime ? '往復' : ''}</td> 
                <td className="border border-black"></td>
                <td className="border border-black"></td>
              </tr>
            );
          })}
          <tr className="font-bold bg-gray-50 h-8">
            <td colSpan={2} className="border border-black">合計</td>
            <td className="border border-black text-left px-2">{data.usageCount}回</td>
            <td colSpan={5} className="border border-black bg-gray-100 text-left px-2 font-normal text-[9px]">
              ※この用紙は、ご家庭で大切に保管してください。
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex justify-between items-end">
        <div className="border border-black p-2 w-1/2">
          <p className="mb-6">上記の内容に相違ありません。</p>
          <div className="flex justify-end items-center gap-2">
            <span>保護者氏名</span>
            <div className="border-b border-black border-dashed w-32 h-6"></div>
            <span>印</span>
          </div>
        </div>
        <div className="text-right text-[10px]">
          <p className="font-bold text-xs mb-1">Comet放課後等デイサービス</p>
          <p>事業者番号: 1234567890</p>
          <p>電話番号: 03-1234-5678</p>
          <p>管理者: 山田 太郎</p>
        </div>
      </div>
    </div>
  );
};


export default function BillingPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [loading, setLoading] = useState(false);
  const [validations, setValidations] = useState<ValidationResult[]>([]);
  
  // 印刷制御用
  const [isPrintingAll, setIsPrintingAll] = useState(false);
  const [printTarget, setPrintTarget] = useState<ValidationResult | null>(null);

  // ★ 追加: CSVダウンロードハンドラ
  const handleDownloadCsv = () => {
    if (validations.length === 0) {
      toast.error("出力するデータがありません");
      return;
    }
    
    // エラーがある場合は確認
    const hasError = validations.some(v => v.isOverLimit || v.isExpired || v.missingFields.length > 0);
    if (hasError) {
      if (!confirm("エラー項目（赤字）が含まれていますが、CSVを出力しますか？")) {
        return;
      }
    }

    try {
      // 事業所番号は一旦固定値または環境変数などから。
      // 将来的には「運営管理 > 事業所設定」から取得するようにします。
      const officeCode = "1234567890"; 
      
      downloadRecordsCsv(validations, selectedMonth, officeCode);
      toast.success("CSVをダウンロードしました");
    } catch (e) {
      console.error(e);
      toast.error("CSV出力に失敗しました");
    }
  };

  // データ集計処理
  const fetchAndValidate = async () => {
    setLoading(true);
    setValidations([]);
    
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));

      const recordsRef = collection(db, 'attendanceRecords');
      const q = query(recordsRef, where('month', '==', selectedMonth));
      const recordsSnap = await getDocs(q);
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));

      // 選択月の日数と末日を取得
      const [yearStr, monthStr] = selectedMonth.split('-');
      const monthEnd = new Date(Number(yearStr), Number(monthStr), 0); // 月末日

      const results: ValidationResult[] = users.map(user => {
        const userRecords = allRecords.filter(r => r.userId === user.id);
        const usageCount = userRecords.filter(r => r.usageStatus !== '欠席').length;
        const limitCount = user.daysSpecified ? Number(user.daysSpecified) : 0;
        
        // --- 1. 期限切れチェック ---
        const decisionEnd = user.decisionEndDate ? new Date(user.decisionEndDate) : null;
        // 決定終了日が「月末日」より前なら期限切れ
        const isExpired = decisionEnd ? decisionEnd < monthEnd : true; // 日付なしは一旦期限切れ扱い(要確認)

        // --- 2. 負担額計算 ---
        const upperLimit = user.upperLimitAmount ? Number(user.upperLimitAmount) : 0;
        // ※ 概算計算: (回数 * 平均600単位 * 10円 * 10%) ※実際はマスタから計算すべきだが今は目安として
        const estimatedTotalCost = usageCount * 600 * 10; 
        const estimatedBurden = Math.floor(estimatedTotalCost * 0.1);
        const finalBurden = upperLimit > 0 ? Math.min(estimatedBurden, upperLimit) : 0;

        // --- 3. 必須項目チェック ---
        const missingFields: string[] = [];
        if (!user.jukyushaNo) missingFields.push('受給者証番号');
        if (!user.cityNo) missingFields.push('市町村番号');
        if (!user.daysSpecified) missingFields.push('支給量');
        if (!user.decisionEndDate) missingFields.push('終了日');
        if (!user.upperLimitAmount) missingFields.push('上限額');
        
        const isActive = user.serviceHoDay === '利用中' || user.serviceJihatsu === '利用中';

        return {
          user,
          records: userRecords,
          usageCount,
          limitCount,
          upperLimit,
          estimatedCost: estimatedBurden,
          finalBurden,
          isOverLimit: limitCount > 0 && usageCount > limitCount,
          isExpired: isExpired,
          missingFields,
        };
      });

      // 実績がある or 利用中の人のみ表示
      const activeResults = results.filter(r => r.records.length > 0 || r.user.serviceHoDay === '利用中');
      activeResults.sort((a, b) => `${a.user.lastName}`.localeCompare(b.user.lastName, 'ja'));
      setValidations(activeResults);
      toast.success('集計完了');

    } catch (e) {
      console.error(e);
      toast.error('エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAndValidate();
  }, [selectedMonth]);


  // 一括印刷ハンドラ
  const handlePrintAll = () => {
    setIsPrintingAll(true);
    // レンダリング待ち
    setTimeout(() => {
      window.print();
      // 印刷ダイアログが閉じたらフラグを戻したいが、
      // window.printはブロッキングなので直後でOK、またはonafterprintイベントを使う
      setIsPrintingAll(false);
    }, 500);
  };

  // 個別印刷ハンドラ
  const handlePrintSingle = (res: ValidationResult) => {
    setPrintTarget(res);
    setTimeout(() => {
      window.print();
      setPrintTarget(null); // クリア
    }, 300);
  };

  return (
    <AppLayout pageTitle="請求管理・実績チェック">
      <div className="space-y-6">
        
        {/* コントロールパネル */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-gray-700">対象年月:</h2>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-lg font-bold p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={fetchAndValidate} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full" title="再集計">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
             <button 
              onClick={handlePrintAll}
              disabled={loading || validations.length === 0}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-2 shadow-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              一括印刷 ({validations.length}名)
            </button>
          </div>
        </div>

        {/* --- チェック一覧テーブル --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">実績チェック一覧</h3>
            <span className="text-xs text-gray-500">※印刷前に必ずエラーを確認してください</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                <tr>
                  <th className="px-4 py-3">利用者名</th>
                  <th className="px-4 py-3 text-center">受給者証期限</th>
                  <th className="px-4 py-3 text-center">支給量</th>
                  <th className="px-4 py-3 text-center">利用日数</th>
                  <th className="px-4 py-3 text-right">上限額</th>
                  <th className="px-4 py-3 text-right">請求予定額</th>
                  <th className="px-4 py-3">状態</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-500">集計中...</td></tr>
                ) : validations.length === 0 ? (
                   <tr><td colSpan={8} className="p-8 text-center text-gray-500">対象者がいません</td></tr>
                ) : (
                  validations.map((res) => (
                    <tr key={res.user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-gray-800">
                        {res.user.lastName} {res.user.firstName}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {res.isExpired ? (
                          <span className="bg-red-100 text-red-600 px-2 py-1 rounded font-bold text-xs">期限切れ</span>
                        ) : (
                          <span className="text-gray-600">{res.user.decisionEndDate}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {res.limitCount}日
                      </td>
                      <td className={`px-4 py-3 text-center font-bold ${res.isOverLimit ? 'text-red-600' : 'text-blue-600'}`}>
                        {res.usageCount}日
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {res.upperLimit.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">
                        {res.finalBurden.toLocaleString()}
                        <span className="text-[10px] text-gray-400 block font-normal">
                          (推計1割: {res.estimatedCost.toLocaleString()})
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {res.isOverLimit && <span className="text-red-600 text-xs font-bold">⚠️ 日数超過</span>}
                          {res.isExpired && <span className="text-red-600 text-xs font-bold">⚠️ 受給者証期限切れ</span>}
                          {res.missingFields.length > 0 && (
                            <span className="text-red-500 text-xs">不足: {res.missingFields.join(',')}</span>
                          )}
                          {!res.isOverLimit && !res.isExpired && res.missingFields.length === 0 && (
                            <span className="text-green-600 text-xs font-bold">OK</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handlePrintSingle(res)} className="text-blue-600 hover:underline text-xs">
                          個別印刷
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
       {/* --- CSV出力ボタンエリア --- */}
        <div className="print:hidden p-6 bg-gray-50 rounded-xl border border-gray-200">
           <h3 className="font-bold text-gray-700 mb-2">CSV出力（次ステップ）</h3>
           <p className="text-sm text-gray-500 mb-4">全員のチェックと印刷が完了したら、国保連取り込み用のCSVを出力します。</p>
           
           {/* ★ 修正: ボタンを有効化し、onClickを追加 */}
           <button 
             onClick={handleDownloadCsv}
             disabled={loading || validations.length === 0}
             className="bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
           >
             実績記録票CSVを出力
           </button>
        </div>

        {/* --- 印刷用エリア (画面には表示されない) --- */}
       <div id="print-container">
          <style jsx global>{`
            @media print {
              /* 1. ページ内のすべての要素を一旦非表示にする */
              body * {
                visibility: hidden;
              }
              
              /* 2. 印刷したいエリア(#print-container)とその子要素だけを表示する */
              #print-container, #print-container * {
                visibility: visible;
              }

              /* 3. 印刷エリアを画面の左上に強制配置する */
              #print-container {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 0;
              }

              /* 4. 余白設定 */
              @page { margin: 0; size: auto; }
            }
          `}</style>
          
          {/* 一括印刷モードの時: 全員分レンダリング */}
          {isPrintingAll && validations.map((res, index) => (
             <ServiceRecordSheet key={res.user.id} data={res} month={selectedMonth} />
          ))}

          {/* 個別印刷モードの時: 対象者のみレンダリング */}
          {!isPrintingAll && printTarget && (
            <ServiceRecordSheet data={printTarget} month={selectedMonth} />
          )}
        </div>

      </div>
    </AppLayout>
  );
}