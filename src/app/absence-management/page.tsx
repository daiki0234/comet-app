"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, doc, updateDoc, orderBy, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

// ★ PDF生成用ライブラリ
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import { AbsenceReportSheet } from '@/components/AbsenceReportSheet'; // ★ 作成したコンポーネント

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

  // --- データ取得 ---
  const fetchAbsenceRecords = async () => {
    setLoading(true);
    try {
      const startStr = `${currentYear}-${pad2(currentMonth)}-01`;
      const endStr = `${currentYear}-${pad2(currentMonth)}-31`;

      const q = query(
        collection(db, 'attendanceRecords'),
        where('usageStatus', '==', '欠席'),
        where('date', '>=', startStr),
        where('date', '<=', endStr),
        orderBy('date', 'asc')
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        const notes = d.notes || '';
        const reason = d.reason || determineAbsenceCategory(notes);

        return {
          id: doc.id,
          date: d.date,
          userId: d.userId,
          userName: d.userName,
          reason: reason,
          notes: notes,
          aiAdvice: d.aiAdvice || '',
          staffName: d.staffName || '',
          nextVisit: d.nextVisit || '', 
        } as AbsenceRecord;
      });

      setRecords(data);
    } catch (error) {
      console.error("取得エラー:", error);
      toast.error("欠席データの取得に失敗しました。");
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

  // --- 一括AI作成機能 (月単位・不足情報補完) ---
  const handleBatchGenerate = async () => {
    if (!confirm(`${currentYear}年${currentMonth}月 の欠席データに対して、\nAI相談・担当者・次回予定を一括作成しますか？\n(空欄の項目のみ補完されます)`)) return;

    const loadingToast = toast.loading("データを処理中... (AI生成が含まれる場合は時間がかかります)");
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

  // --- ★★★ PDF一括出力 (A4縦・ハンコ欄あり) ★★★ ---
  const handlePrintMonthlyReport = async () => {
    if (records.length === 0) return toast.error("出力するデータがありません");

    const loadingToast = toast.loading("PDFを生成中...");

    try {
      // 1. 日付ごとにデータをグループ化
      const groupedByDate: { [date: string]: AbsenceRecord[] } = {};
      records.forEach(r => {
        if (!groupedByDate[r.date]) groupedByDate[r.date] = [];
        groupedByDate[r.date].push(r);
      });

      const dates = Object.keys(groupedByDate).sort();
      
      // ★ 修正: PDF初期化 (A4 縦向き portrait)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // 3. 日付ごとにループしてページ作成
      for (let i = 0; i < dates.length; i++) {
        const dateStr = dates[i];
        const dayRecords = groupedByDate[dateStr];

        // 一時的なDOMを作成
        const tempDiv = document.createElement('div');
        // ★ 修正: 幅をA4縦に合わせる (210mm)
        tempDiv.style.width = '210mm'; 
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px'; 
        document.body.appendChild(tempDiv);

        // Reactコンポーネントをレンダリング
        const root = createRoot(tempDiv);
        await new Promise<void>((resolve) => {
          root.render(<AbsenceReportSheet dateStr={dateStr} records={dayRecords} />);
          setTimeout(resolve, 500);
        });

        // html2canvas で画像化 (解像度2倍)
        const canvas = await html2canvas(tempDiv, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');

        if (i > 0) pdf.addPage();
        
        // ★ 修正: 画像サイズをA4縦 (210x297) に合わせる
        pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);

        root.unmount();
        document.body.removeChild(tempDiv);
      }

      // 4. 保存
      pdf.save(`${currentYear}年${currentMonth}月_欠席対応記録.pdf`);
      toast.success("PDFをダウンロードしました", { id: loadingToast });

    } catch (e) {
      console.error("PDF Generation Error:", e);
      toast.error("PDFの生成に失敗しました", { id: loadingToast });
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