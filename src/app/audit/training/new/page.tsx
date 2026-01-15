"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/Layout';
import { db, storage } from '@/lib/firebase/firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import toast from 'react-hot-toast';

type Staff = {
  id: string;
  name: string;
  role?: string;
};

// フォーム本体
function RecordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const initialDate = searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const initialTopic = searchParams.get('topic') || '';

  const [date, setDate] = useState(initialDate);
  const [topic, setTopic] = useState(initialTopic);
  const [content, setContent] = useState('');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const snap = await getDocs(collection(db, 'admins'));
        const staffs = snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '名称未設定',
          role: doc.data().role,
        }));
        setStaffList(staffs);
      } catch (e) {
        console.error(e);
        toast.error("職員リストの取得に失敗しました");
      }
    };
    fetchStaff();
  }, []);

  const toggleStaff = (id: string) => {
    const newSet = new Set(selectedStaffIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedStaffIds(newSet);
  };

  const toggleAllStaff = () => {
    if (selectedStaffIds.size === staffList.length) {
      setSelectedStaffIds(new Set());
    } else {
      const newSet = new Set(staffList.map(s => s.id));
      setSelectedStaffIds(newSet);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !topic) {
      toast.error("実施日とテーマは必須です");
      return;
    }
    if (!confirm("この内容で記録を保存しますか？")) return;

    setIsSubmitting(true);
    const loadingToast = toast.loading("保存中...");

    try {
      let fileUrl = '';
      let fileName = '';

      if (file && storage) {
        try {
          const storageRef = ref(storage, `training-files/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(storageRef, file);
          fileUrl = await getDownloadURL(snapshot.ref);
          fileName = file.name;
        } catch (storageError) {
          console.error("File upload failed:", storageError);
          toast.error("ファイルのアップロードに失敗しました (Storage未設定の可能性)", { id: loadingToast });
        }
      }

      const participantNames = staffList
        .filter(s => selectedStaffIds.has(s.id))
        .map(s => s.name);

      await addDoc(collection(db, 'trainingRecords'), {
        date,
        topic,
        content,
        participantIds: Array.from(selectedStaffIds),
        participantNames,
        participantCount: selectedStaffIds.size,
        fileUrl,
        fileName,
        createdAt: serverTimestamp(),
      });

      toast.success("研修記録を保存しました", { id: loadingToast });
      router.push('/audit/training'); 

    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました", { id: loadingToast });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-6 pb-2 border-b">研修実施記録</h2>
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 基本情報 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">実施日 <span className="text-red-500">*</span></label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">研修テーマ <span className="text-red-500">*</span></label>
            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例：虐待防止研修" className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
          </div>
        </div>

        {/* 参加者 */}
        <div>
          <div className="flex justify-between items-end mb-2">
            <label className="block text-sm font-bold text-gray-700">
              参加者 <span className="text-gray-500 font-normal ml-2">({selectedStaffIds.size}名 選択中)</span>
            </label>
            <button type="button" onClick={toggleAllStaff} className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
              {selectedStaffIds.size === staffList.length ? '全解除' : '全員選択'}
            </button>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-48 overflow-y-auto">
            {staffList.length === 0 ? <p className="text-sm text-gray-400 text-center">職員データがありません</p> : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {staffList.map(staff => (
                  <label key={staff.id} className="flex items-center space-x-2 cursor-pointer hover:bg-white p-1 rounded transition-colors">
                    <input type="checkbox" checked={selectedStaffIds.has(staff.id)} onChange={() => toggleStaff(staff.id)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300" />
                    <span className="text-sm text-gray-700 truncate">{staff.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 内容 */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">研修内容詳細</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="研修の具体的な内容..." className="w-full border border-gray-300 p-3 rounded-lg h-40 resize-y focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>

        {/* 資料添付 */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">資料添付 (PDF, 画像など)</label>
          <div className="flex items-center gap-4">
            <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors">
              ファイルを選択
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
            </label>
            <span className="text-sm text-gray-600 truncate max-w-xs">{file ? file.name : 'ファイルが選択されていません'}</span>
          </div>
        </div>

        {/* ボタン */}
        <div className="flex justify-end gap-4 pt-4 border-t">
          <button type="button" onClick={() => router.back()} className="px-6 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors" disabled={isSubmitting}>キャンセル</button>
          <button type="submit" className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md transition-colors disabled:opacity-50 flex items-center gap-2" disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : '保存する'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ページコンポーネント
export default function NewTrainingRecordPage() {
  return (
    <AppLayout pageTitle="研修記録作成">
      <Suspense fallback={<div className="p-8 text-center text-gray-500">読み込み中...</div>}>
        <RecordForm />
      </Suspense>
    </AppLayout>
  );
}