"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, doc, updateDoc, orderBy, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

// PDF生成用ライブラリ
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- 型定義 ---
type AbsenceRecord = {
  id: string;
  date: string; // YYYY-MM-DD
  userId: string;
  userName: string;
  reason: string;       // 欠席理由
  notes: string;        // 連絡の内容
  aiAdvice: string;     // 相談内容
  staffName: string;    // 担当者
  nextVisit: string;    // 次回利用予定
  updatedAt?: Timestamp;
};

// ヘルパー関数
const pad2 = (n: number) => n.toString().padStart(2, "0");
const formatDateJP = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日(${week})`;
};

// 欠席理由の自動判定ロジック
const determineAbsenceCategory = (text: string): string => {
  if (!text) return 'その他';
  if (text.includes('体調不良') || text.includes('熱') || text.includes('頭痛') || text.includes('風邪') || text.includes('痛') || text.includes('病院')) {
    return '体調不良';
  } else if (text.includes('用事') || text.includes('親戚') || text.includes('家族') || text.includes('私用')) {
    return '私用';
  } else if (text.includes('クラブ') || text.includes('大会') || text.includes('練習試合') || text.includes('運動会') || text.includes('部活')) {
    return '学校行事';
  } else {
    return 'その他';
  }
};

// ブラウザでArrayBufferをBase64に変換する関数
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export default function AbsenceManagementPage() {
  const { currentUser } = useAuth();
  const now = new Date();
  
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);
  
  const [records, setRecords] = useState<AbsenceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<AbsenceRecord> | null>(null);

  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - i), []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  // --- データ取得 (リクエスト数削減・最適化版) ---
  const fetchAbsenceRecords = async () => {
    setLoading(true);
    try {
      // 1. 取得範囲の決定: 今月1日 〜 来月末日
      // ※次回予定を探すために、少し先まで一度に取得します
      const startDate = new Date(currentYear, currentMonth - 1, 1);
      const nextMonthDate = new Date(currentYear, currentMonth + 1, 0); // 来月末

      const startStr = `${startDate.getFullYear()}-${pad2(startDate.getMonth() + 1)}-01`;
      const searchEndStr = `${nextMonthDate.getFullYear()}-${pad2(nextMonthDate.getMonth() + 1)}-${pad2(nextMonthDate.getDate())}`;

      // 2. 一括取得 (欠席だけでなく、次回予定の候補となる「利用日」も含めて全て取得)
      // これによりクエリ回数を「1回」にします。
      const q = query(
        collection(db, 'attendanceRecords'),
        where('date', '>=', startStr),
        where('date', '<=', searchEndStr),
        orderBy('date', 'asc')
      );

      const snapshot = await getDocs(q);
      
      // 全データを配列化
      const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      // 3. 今月の欠席データのみを抽出
      const thisMonthEndStr = `${currentYear}-${pad2(currentMonth)}-31`;
      const absenceDocs = allDocs.filter(d => 
        d.usageStatus === '欠席' && 
        d.date <= thisMonthEndStr
      );

      // 4. メモリ上で次回予定をマッチング
      const processedData = absenceDocs.map(d => {
        const notes = d.notes || '';
        const reason = d.reason || determineAbsenceCategory(notes);
        
        let nextVisit = d.nextVisit || '';

        // 次回予定が空の場合、取得したデータの中から探す
        if (!nextVisit) {
          // 同じユーザーで、欠席日より未来で、かつ欠席ではない最初の日付を探す
          const found = allDocs.find(x => 
            x.userId === d.userId && 
            x.date > d.date && 
            x.usageStatus !== '欠席'
          );
          
          if (found) {
             const nd = new Date(found.date);
             // フォーマット: 次回M月D日利用予定
             nextVisit = `次回${nd.getMonth() + 1}月${nd.getDate()}日利用予定`;
          }
        }

        return {
          id: d.id,
          date: d.date,
          userId: d.userId,
          userName: d.userName,
          reason: reason,
          notes: notes,
          aiAdvice: d.aiAdvice || '',
          staffName: d.staffName || '',
          nextVisit: nextVisit, 
        } as AbsenceRecord;
      });

      setRecords(processedData);

    } catch (error: any) {
      console.error("取得エラー:", error);
      // クオータエラーの場合の特別なメッセージ
      if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota')) {
        toast.error("読み取り回数の上限に達しました。しばらく時間をおいてください。");
      } else {
        toast.error("欠席データの取得に失敗しました。");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAbsenceRecords();
  }, [currentYear, currentMonth]);


  // --- 編集機能 ---
  const handleEdit = (record: AbsenceRecord) => {
    setEditingId(record.id);
    setEditData({ ...record });
  };

  const handleSave = async () => {
    if (!editingId || !editData) return;
    try {
      const docRef = doc(db, 'attendanceRecords', editingId);
      const updatePayload = {
        reason: editData.reason,
        notes: editData.notes,
        aiAdvice: editData.aiAdvice,
        nextVisit: editData.nextVisit,
        staffName: editData.staffName || currentUser?.displayName || '担当者',
      };
      await updateDoc(docRef, updatePayload);
      toast.success("更新しました");
      setEditingId(null);
      setEditData(null);
      fetchAbsenceRecords();
    } catch (error) {
      console.error(error);
      toast.error("保存に失敗しました");
    }
  };

  // --- 個別AI作成 (編集画面用) ---
  const handleGenerateAdvice = async () => {
    if (!editData || !editData.userId || !editData.date) return;
    const loadingToast = toast.loading("AIが相談内容を考案中...");
    try {
      const res = await fetch('/api/absence/generate-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editData.userId,
          date: editData.date,
          currentNote: editData.notes
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEditData(prev => prev ? { ...prev, aiAdvice: data.advice } : null);
      toast.success("生成しました", { id: loadingToast });
    } catch (e: any) {
      toast.error(`生成失敗: ${e.message}`, { id: loadingToast });
    }
  };

  // --- 一括AI作成機能 (月単位) ---
  const handleBatchGenerate = async () => {
    // ★修正: メッセージから「次回予定」を削除し、実態に合わせました
    if (!confirm(`${currentYear}年${currentMonth}月 の欠席データに対して、\nAI相談・担当者を一括作成しますか？\n(空欄の項目のみ補完されます)`)) return;

    const loadingToast = toast.loading("データを処理中...");
    try {
      const res = await fetch('/api/absence/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          year: currentYear, 
          month: currentMonth,
          staffName: currentUser?.displayName || '担当者'
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      toast.success(`${data.count}件のデータを更新しました`, { id: loadingToast });
      fetchAbsenceRecords();
    } catch (e: any) {
      console.error(e);
      toast.error(`作成失敗: ${e.message}`, { id: loadingToast });
    }
  };

  const cleanNoteText = (text: string) => {
    if (!text) return '';
    return text
      .replace(/^欠席[（(]\d+[）)]\s*[｜\|]\s*/u, '')
      .replace(/^欠席\s*[｜\|]\s*/u, '');
  };

  // --- PDF一括出力 ---
  const handlePrintMonthlyReport = async () => {
    if (records.length === 0) return toast.error("出力するデータがありません");

    const loadingToast = toast.loading("PDFを生成中...");

    try {
      const groupedByDate: { [date: string]: AbsenceRecord[] } = {};
      records.forEach(r => {
        if (!groupedByDate[r.date]) groupedByDate[r.date] = [];
        groupedByDate[r.date].push(r);
      });

      const dates = Object.keys(groupedByDate).sort();
      
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      try {
        const fontUrl = '/fonts/NotoSansJP-Regular.ttf';
        const fontRes = await fetch(fontUrl);
        if (!fontRes.ok) throw new Error("フォントファイルが見つかりません");
        
        const fontBuffer = await fontRes.arrayBuffer();
        const fontBase64 = arrayBufferToBase64(fontBuffer);

        pdf.addFileToVFS('NotoSansJP.ttf', fontBase64);
        pdf.addFont('NotoSansJP.ttf', 'NotoSansJP', 'normal');
        pdf.addFont('NotoSansJP.ttf', 'NotoSansJP', 'bold');
        pdf.setFont('NotoSansJP');
      } catch (err) {
        console.error("Font loading error:", err);
        toast.error("フォントの読み込みに失敗しました。", { id: loadingToast });
      }

      for (let i = 0; i < dates.length; i++) {
        const dateStr = dates[i];
        const dayRecords = groupedByDate[dateStr];
        const dateJp = formatDateJP(dateStr);

        if (i > 0) pdf.addPage();

        pdf.setFontSize(16);
        pdf.text('欠席時対応加算記録', 105, 20, { align: 'center' });
        
        pdf.setFontSize(10);
        pdf.text(`日付：${dateJp}`, 195, 28, { align: 'right' });

        pdf.rect(150, 35, 20, 20);
        pdf.text('管理者', 160, 40, { align: 'center' });
        pdf.line(150, 42, 170, 42);

        pdf.rect(170, 35, 20, 20);
        pdf.text('児発管', 180, 40, { align: 'center' });
        pdf.line(170, 42, 190, 42);

        const tableBody = dayRecords.map((rec, index) => [
          index + 1,
          rec.userName,
          rec.reason,
          cleanNoteText(rec.notes),
          rec.aiAdvice,
          `${rec.nextVisit || '-'}\n${rec.staffName}`
        ]);

        autoTable(pdf, {
          startY: 60,
          head: [['No.', '利用者氏名', '欠席理由', '連絡の内容', '相談援助内容 (対応)', '次回予定 / 担当']],
          body: tableBody,
          styles: { 
            font: 'NotoSansJP',
            fontSize: 9,
            cellPadding: 3,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            valign: 'top',
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: [230, 230, 230],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 30, fontStyle: 'bold' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 45 },
            4: { cellWidth: 50 },
            5: { cellWidth: 30, halign: 'center' }
          },
          theme: 'grid',
          margin: { top: 20, bottom: 20, left: 15, right: 15 },
        });

        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text(`Comet System / 出力日: ${new Date().toLocaleDateString()}`, 195, 290, { align: 'right' });
        pdf.setTextColor(0);
      }

      pdf.save(`${currentYear}年${currentMonth}月_欠席対応記録.pdf`);
      toast.success("PDFをダウンロードしました", { id: loadingToast });

    } catch (e: any) {
      console.error("PDF Generation Error:", e);
      toast.error(`PDF生成失敗: ${e.message}`, { id: loadingToast });
    }
  };


  return (
    <AppLayout pageTitle="欠席管理">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        
        {/* ヘッダー・フィルター */}
        <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="font-bold text-gray-700">対象月:</label>
              <select value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))} className="p-2 border rounded-md bg-white">
                {years.map(y => <option key={y} value={y}>{y}年</option>)}
              </select>
              <select value={currentMonth} onChange={(e) => setCurrentMonth(Number(e.target.value))} className="p-2 border rounded-md bg-white">
                {months.map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
            </div>
            <span className="text-sm text-gray-500">{records.length} 件の欠席</span>
          </div>

          <div className="flex gap-2">
            {/* AI一括作成ボタン */}
            <button 
              onClick={handleBatchGenerate}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2 shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              今月のAI一括作成
            </button>

            {/* PDF出力ボタン */}
            <button 
              onClick={handlePrintMonthlyReport}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2 shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              月間レポート出力 (PDF)
            </button>
          </div>
        </div>

        {/* 一覧テーブル */}
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 whitespace-nowrap">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">利用者</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">欠席理由</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[200px]">連絡の内容</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[200px]">相談内容(AI)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">担当者</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">次回予定</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.length === 0 && !loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">この月の欠席記録はありません。</td></tr>
              ) : (
                records.map(record => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    {editingId === record.id && editData ? (
                      // --- 編集モード ---
                      <>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDateJP(record.date)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-800">{record.userName}</td>
                        <td className="px-4 py-3"><input className="border rounded p-1 w-full" value={editData.reason} onChange={e => setEditData({...editData, reason: e.target.value})} /></td>
                        <td className="px-4 py-3"><textarea className="border rounded p-1 w-full" value={editData.notes} onChange={e => setEditData({...editData, notes: e.target.value})} /></td>
                        <td className="px-4 py-3">
                          <div className="relative">
                            <textarea 
                              className="border rounded p-1 w-full bg-blue-50 min-h-[80px]" 
                              value={editData.aiAdvice} 
                              onChange={e => setEditData({...editData, aiAdvice: e.target.value})} 
                              placeholder="AI生成または手入力" 
                            />
                            <button 
                              onClick={handleGenerateAdvice}
                              className="absolute bottom-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded hover:bg-blue-700 shadow-sm flex items-center gap-1"
                              type="button"
                            >
                              AI作成
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3"><input className="border rounded p-1 w-24" value={editData.staffName} onChange={e => setEditData({...editData, staffName: e.target.value})} /></td>
                        <td className="px-4 py-3"><input className="border rounded p-1 w-24" value={editData.nextVisit} onChange={e => setEditData({...editData, nextVisit: e.target.value})} /></td>
                        <td className="px-4 py-3 text-sm font-medium space-x-2">
                          <button onClick={handleSave} className="text-green-600 hover:text-green-900">保存</button>
                          <button onClick={() => {setEditingId(null); setEditData(null);}} className="text-gray-500 hover:text-gray-700">中止</button>
                        </td>
                      </>
                    ) : (
                      // --- 表示モード ---
                      <>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDateJP(record.date)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-800">{record.userName}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <span className={`px-2 py-1 rounded text-xs font-bold
                            ${record.reason === '体調不良' ? 'bg-red-100 text-red-700' : 
                              record.reason === '私用' ? 'bg-green-100 text-green-700' :
                              record.reason === '学校行事' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                            {record.reason}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap max-w-xs">{record.notes}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap max-w-xs">{record.aiAdvice || <span className="text-gray-400 text-xs">(未記入)</span>}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{record.staffName || <span className="text-gray-400">-</span>}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{record.nextVisit || <span className="text-gray-400">-</span>}</td>
                        <td className="px-4 py-3 text-sm font-medium">
                          <button onClick={() => handleEdit(record)} className="text-blue-600 hover:text-blue-900">編集</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}