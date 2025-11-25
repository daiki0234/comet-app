"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/Layout';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, doc, updateDoc, orderBy, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext'; // 担当者名取得用
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // npm install jspdf-autotable してください

// --- 型定義 ---
type AbsenceRecord = {
  id: string;
  date: string; // YYYY-MM-DD
  userId: string;
  userName: string;
  reason: string;       // 欠席理由 (例: 体調不良)
  notes: string;        // 連絡の内容 (保護者からの連絡)
  aiAdvice: string;     // 相談内容 (AI生成)
  staffName: string;    // 担当者 (対応したスタッフ)
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

export default function AbsenceManagementPage() {
  const { currentUser } = useAuth(); // ログイン中のユーザー情報
  const now = new Date();
  
  // フィルター State
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);
  
  // データ State
  const [records, setRecords] = useState<AbsenceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // 編集用 State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<AbsenceRecord> | null>(null);

  // プルダウン用リスト
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
        orderBy('date', 'asc') // 日付順
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          date: d.date,
          userId: d.userId,
          userName: d.userName,
          reason: d.reason || 'その他', // 既存データにない場合のデフォルト
          notes: d.notes || '',
          aiAdvice: d.aiAdvice || '', // まだ無い機能なので空
          staffName: d.staffName || '', // 既存データは空かも
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

  // 年月が変わったら再取得
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
      
      // 更新データを準備 (担当者が空なら、今のログインユーザーで上書きするなどのロジックも可)
      const updatePayload = {
        reason: editData.reason,
        notes: editData.notes,
        aiAdvice: editData.aiAdvice,
        nextVisit: editData.nextVisit,
        staffName: editData.staffName || currentUser?.displayName || '担当者', // 未入力なら自動補完
      };

      await updateDoc(docRef, updatePayload);
      
      toast.success("更新しました");
      setEditingId(null);
      setEditData(null);
      fetchAbsenceRecords(); // リロード
    } catch (error) {
      console.error(error);
      toast.error("保存に失敗しました");
    }
  };

  // --- PDF作成機能 (1ヶ月分) ---
  const handlePrintMonthlyReport = () => {
    if (records.length === 0) return toast.error("出力するデータがありません");

    // 1. 日付ごとにデータをグループ化
    const groupedByDate: { [date: string]: AbsenceRecord[] } = {};
    records.forEach(r => {
      if (!groupedByDate[r.date]) groupedByDate[r.date] = [];
      groupedByDate[r.date].push(r);
    });

    // 2. PDF生成 (jsPDF + autoTable)
    const doc = new jsPDF({ orientation: 'landscape' }); // 横向き A4
    
    // 日本語フォント設定 (実際にはカスタムフォントの読み込みが必要です)
    // ここでは標準フォントを使用する前提の簡易コードです。
    // ※日本語を通すには .ttf ファイルの addFileToVFS が必要になります。
    
    let pageIndex = 0;
    const dates = Object.keys(groupedByDate).sort();

    dates.forEach((dateStr) => {
      if (pageIndex > 0) doc.addPage(); // 2日目以降は改ページ
      pageIndex++;

      const dayRecords = groupedByDate[dateStr];
      const dateJp = formatDateJP(dateStr);

      // ヘッダー
      doc.setFontSize(16);
      doc.text(`欠席時対応加算記録 - ${dateJp}`, 14, 20);
      doc.setFontSize(10);
      doc.text(`作成日: ${new Date().toLocaleDateString()}`, 250, 20);

      // テーブルデータ作成
      const tableBody = dayRecords.map(r => [
        r.userName,
        r.reason,
        r.notes,
        r.aiAdvice,
        r.nextVisit,
        r.staffName
      ]);

      // テーブル描画 (autoTable)
      (doc as any).autoTable({
        startY: 30,
        head: [['利用者名', '欠席理由', '連絡の内容', '相談内容(対応)', '次回予定', '担当者']],
        body: tableBody,
        styles: { font: 'helvetica', fontSize: 10 }, // ※日本語フォント設定が必要
        columnStyles: {
          0: { cellWidth: 30 }, // 利用者名
          1: { cellWidth: 30 }, // 理由
          2: { cellWidth: 60 }, // 連絡内容
          3: { cellWidth: 60 }, // 相談内容
          4: { cellWidth: 30 }, // 次回
          5: { cellWidth: 20 }, // 担当
        },
        theme: 'grid'
      });
      
      // 署名欄などが必要なら footer に追加
    });

    doc.save(`${currentYear}年${currentMonth}月_欠席対応記録.pdf`);
  };


  return (
    <AppLayout pageTitle="欠席管理">
      <div className="bg-white p-6 rounded-2xl shadow-ios border border-gray-200">
        
        {/* ヘッダー・フィルター */}
        <div className="flex flex-wrap justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="font-bold text-gray-700">対象月:</label>
              <select value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))} className="p-2 border rounded-md">
                {years.map(y => <option key={y} value={y}>{y}年</option>)}
              </select>
              <select value={currentMonth} onChange={(e) => setCurrentMonth(Number(e.target.value))} className="p-2 border rounded-md">
                {months.map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
            </div>
            <span className="text-sm text-gray-500">{records.length} 件の欠席</span>
          </div>

          <button 
            onClick={handlePrintMonthlyReport}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            月間レポート出力 (PDF)
          </button>
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
                        <td className="px-4 py-3"><textarea className="border rounded p-1 w-full bg-blue-50" value={editData.aiAdvice} onChange={e => setEditData({...editData, aiAdvice: e.target.value})} placeholder="AI生成または手入力" /></td>
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
                        <td className="px-4 py-3 text-sm text-gray-700">{record.reason}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">{record.notes}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">{record.aiAdvice || <span className="text-gray-400 text-xs">(未記入)</span>}</td>
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