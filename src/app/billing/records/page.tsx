"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { downloadRecordsCsv } from '@/lib/billing/csv-exporter';
import { downloadPdf, downloadMergedPdf } from '@/lib/billing/pdf-exporter';

// コンポーネント
import { ServiceRecordSheet } from '@/components/billing/ServiceRecordSheet';
import { ValidationResult, UserData, AttendanceRecord } from '@/types/billing';

export default function BillingPage() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [loading, setLoading] = useState(false);
  const [validations, setValidations] = useState<ValidationResult[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // データ取得
  const fetchAndValidate = async () => {
    setLoading(true);
    setValidations([]);
    setSelectedUserIds(new Set());
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const recordsRef = collection(db, 'attendanceRecords');
      const q = query(recordsRef, where('month', '==', selectedMonth));
      const recordsSnap = await getDocs(q);
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const [yearStr, monthStr] = selectedMonth.split('-');
      const monthEnd = new Date(Number(yearStr), Number(monthStr), 0); 

      const results: ValidationResult[] = users.map(user => {
        const userData: UserData = {
          id: user.id,
          lastName: user.lastName || '',
          firstName: user.firstName || '',
          guardianLastName: user.guardianLastName || user.protectorLastName || '',
          guardianFirstName: user.guardianFirstName || user.protectorFirstName || '',
          jukyushaNo: user.jukyushaNo || '',
          cityNo: user.cityNo || '',
          daysSpecified: user.daysSpecified || '0',
          decisionEndDate: user.decisionEndDate || '',
          upperLimitAmount: user.upperLimitAmount || '0',
          serviceHoDay: user.serviceHoDay || '',
          serviceJihatsu: user.serviceJihatsu || '',
        };
        
        // ユーザーごとの実績レコード
        const userRecords: AttendanceRecord[] = allRecords.filter(r => r.userId === user.id)
          .map(r => ({ ...r } as any));
          
        const usageCount = userRecords.filter(r => r.usageStatus !== '欠席').length;
        const limitCount = Number(userData.daysSpecified) || 0;
        const isExpired = userData.decisionEndDate ? new Date(userData.decisionEndDate) < monthEnd : false;
        
        return {
          user: userData,
          records: userRecords,
          usageCount,
          limitCount,
          upperLimit: Number(userData.upperLimitAmount) || 0,
          estimatedCost: 0, finalBurden: 0,
          isOverLimit: limitCount > 0 && usageCount > limitCount,
          isExpired,
          missingFields: !userData.jukyushaNo ? ['受給者証'] : [],
        };
      });

      // ★修正: 利用日数が1日以上ある人のみ表示（0日の人は除外）
      // usageCount は「欠席以外」のレコード数なので、これが0なら実利用なしとみなします
      const activeResults = results.filter(r => r.usageCount > 0);
      
      activeResults.sort((a, b) => `${a.user.lastName}`.localeCompare(b.user.lastName, 'ja'));
      setValidations(activeResults);
      toast.success('データを読み込みました');
    } catch (e) {
      console.error(e);
      toast.error('エラー');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAndValidate(); }, [selectedMonth]);

  // --- チェックボックス ---
  const toggleSelectAll = () => {
    if (selectedUserIds.size === validations.length) setSelectedUserIds(new Set());
    else setSelectedUserIds(new Set(validations.map(v => v.user.id)));
  };
  const toggleSelectUser = (id: string) => {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedUserIds(newSet);
  };

  // --- PDFダウンロード処理 (Single) ---
  const handleDownloadPdf = async (res: ValidationResult) => {
    const toastId = toast.loading('PDF生成中...');
    try {
      const elementId = `sheet-${res.user.id}`;
      const fileName = `実績記録票_${res.user.lastName}${res.user.firstName}_${selectedMonth}.pdf`;
      await downloadPdf(elementId, fileName);
      toast.success('ダウンロード完了', { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error('PDF生成に失敗しました', { id: toastId });
    }
  };

  // --- 一括PDFダウンロード ---
  const handlePrintSelected = async () => {
    if (selectedUserIds.size === 0) return toast.error("対象を選択してください");
    
    const targets = validations.filter(v => selectedUserIds.has(v.user.id));
    if (!confirm(`${targets.length}名分の実績票を1つのPDFにまとめて出力しますか？`)) return;

    const toastId = toast.loading(`PDF生成準備中...`);
    try {
      const elementIds = targets.map(t => `sheet-${t.user.id}`);
      const fileName = `実績記録票_一括出力_${selectedMonth}.pdf`;

      await downloadMergedPdf(elementIds, fileName, (current, total) => {
         toast.loading(`生成中: ${current} / ${total} 枚目`, { id: toastId });
      });

      toast.success("ダウンロード完了", { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error("PDF生成中にエラーが発生しました", { id: toastId });
    }
  };

  const handleFixRecord = (userId: string) => {
    router.push(`/billing/records/${userId}?month=${selectedMonth}`);
  };

  const handleDownloadCsv = () => {
    if (validations.length === 0) return toast.error("データなし");
    downloadRecordsCsv(validations, selectedMonth, "1234567890");
    toast.success("CSV出力完了");
  };

  return (
    <AppLayout pageTitle="請求管理・実績チェック">
      <div className="space-y-6">
        {/* コントロールパネル */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4 print:hidden">
            <h2 className="font-bold text-gray-700">対象年月:</h2>
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="font-bold p-2 border rounded-lg" />
            <button onClick={fetchAndValidate} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg></button>
        </div>

        {/* 一覧テーブル */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
          {/* テーブルヘッダー (アクションバー) */}
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            {/* 左側: 選択状態 */}
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="text-xs font-bold bg-white border border-gray-300 px-3 py-1 rounded hover:bg-gray-50">
                {selectedUserIds.size === validations.length ? '全解除' : '全選択'}
              </button>
              <span className="text-sm font-bold text-gray-600">
                選択中: <span className="text-blue-600 text-lg">{selectedUserIds.size}</span> 名
              </span>
            </div>

            {/* 右側: アクションボタン */}
            <div className="flex items-center gap-3">
              {/* PDF発行ボタン */}
              <button 
                onClick={handlePrintSelected} 
                disabled={selectedUserIds.size === 0} 
                className={`
                  flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-lg transition-all shadow-sm
                  ${selectedUserIds.size > 0 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md transform hover:-translate-y-0.5' 
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }
                `}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                選択した実績票をPDF発行
              </button>

              {/* CSV出力ボタン */}
              <button 
                onClick={handleDownloadCsv} 
                disabled={loading || validations.length === 0} 
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-bold rounded-lg transition-colors"
                title="全データをCSVで出力"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                CSV出力
              </button>
            </div>
          </div>
          
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
              <tr>
                <th className="px-4 py-3 w-10 text-center"><input type="checkbox" checked={validations.length > 0 && selectedUserIds.size === validations.length} onChange={toggleSelectAll} className="w-4 h-4 cursor-pointer" /></th>
                <th className="px-4 py-3">利用者名</th>
                <th className="px-4 py-3 text-center">上限管理</th>
                <th className="px-4 py-3 text-center">日数</th>
                <th className="px-4 py-3 text-center">放課後利用</th>
                <th className="px-4 py-3 text-center">休校日利用</th>
                <th className="px-4 py-3 text-center">加算</th>
                <th className="px-4 py-3 text-center w-48">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {validations.map((res) => {
                const afterSchoolCount = res.records.filter(r => r.usageStatus === '放課後').length;
                const holidayCount = res.records.filter(r => r.usageStatus === '休校日').length;
                
                const hasAdditional = res.records.some(r => 
                  r.extension || r.hasFamilySupport || r.hasMedicalSupport || 
                  r.hasIntensiveSupport || r.hasSpecialSupport || r.hasIndependenceSupport ||
                  r.hasBathSupport || r.hasChildcareSupport || r.hasSelfRelianceSupport
                );

                return (
                  <tr key={res.user.id} className={`hover:bg-blue-50 transition-colors ${selectedUserIds.has(res.user.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3 text-center"><input type="checkbox" checked={selectedUserIds.has(res.user.id)} onChange={() => toggleSelectUser(res.user.id)} className="w-4 h-4 cursor-pointer" /></td>
                    <td className="px-4 py-3 font-bold text-gray-800 flex items-center gap-2">
                      {res.user.lastName} {res.user.firstName}
                      <Link href={`/users/${res.user.id}`} className="text-gray-400 hover:text-blue-600"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></Link>
                    </td>
                    <td className="px-4 py-3 text-center text-xs">{res.upperLimit > 0 ? <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full">管理あり</span> : <span className="text-gray-400">-</span>}</td>
                    
                    {/* 日数 */}
                    <td className={`px-4 py-3 text-center font-bold ${res.isOverLimit ? 'text-red-600' : 'text-gray-700'}`}>{res.usageCount}日</td>
                    
                    {/* ★修正: 放課後利用回数 (単位: 日) */}
                    <td className="px-4 py-3 text-center text-gray-600">
                      {afterSchoolCount > 0 ? `${afterSchoolCount}日` : '-'}
                    </td>
                    
                    {/* ★修正: 休校日利用回数 (単位: 日) */}
                    <td className="px-4 py-3 text-center text-gray-600">
                      {holidayCount > 0 ? `${holidayCount}日` : '-'}
                    </td>
                    
                    {/* 加算有無 */}
                    <td className="px-4 py-3 text-center text-xs">
                      {hasAdditional ? (
                        <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-bold">加算あり</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleFixRecord(res.user.id)} className="bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 text-xs font-bold px-3 py-1.5 rounded">修正</button>
                        <button onClick={() => handleDownloadPdf(res)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded">PDF</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* --- 隠し印刷エリア (HTML to PDF用) --- */}
        <div id="print-container">
          <style dangerouslySetInnerHTML={{ __html: `
            @media screen { #print-container { position: absolute; left: -9999px; top: -9999px; } }
            @media print {
              @page { size: A4 portrait; margin: 0; }
              body > * { display: none !important; }
              #print-container { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
              #print-container * { visibility: visible !important; }
            }
          `}} />
          {validations.map((res) => (
             <div key={res.user.id} className={selectedUserIds.has(res.user.id) ? 'print:block' : 'print:hidden'}>
                <ServiceRecordSheet id={`sheet-${res.user.id}`} data={res} month={selectedMonth} />
             </div>
          ))}
        </div>

      </div>
    </AppLayout>
  );
}