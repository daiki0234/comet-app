"use client";

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/Layout';
import { SafetyPlanForm } from '@/components/audit/SafetyPlanForm';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { SafetyPlan } from '@/types/audit';
import toast from 'react-hot-toast';

export default function EditSafetyPlanPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<SafetyPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(db, 'safetyPlans', params.id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setData({ id: docSnap.id, ...docSnap.data() } as SafetyPlan);
        } else {
          toast.error("データが見つかりません");
        }
      } catch (e) {
        console.error(e);
        toast.error("読み込みエラー");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [params.id]);

  if (loading) return <AppLayout pageTitle="読み込み中..."><div>Loading...</div></AppLayout>;
  if (!data) return <AppLayout pageTitle="エラー"><div>データが見つかりません</div></AppLayout>;

  return (
    <AppLayout pageTitle="安全計画 編集">
      <div className="max-w-5xl mx-auto">
        <SafetyPlanForm initialData={data} isEdit={true} />
      </div>
    </AppLayout>
  );
}