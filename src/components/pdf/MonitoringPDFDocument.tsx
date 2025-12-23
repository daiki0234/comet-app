"use client";

import React from 'react';
import { Document as PdfDocument, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { MonitoringRecord } from '@/types/monitoring';
import { SupportPlan } from '@/types/plan';

// ★追加: ユーザーデータの型定義（揺らぎ吸収用）
interface UserDataMonitoring {
  lastName: string;
  firstName: string;
  lastKana?: string; 
  firstKana?: string;
  lastNameKana?: string; // 互換性
  firstNameKana?: string; // 互換性
  birthday?: string;
  birthDate?: string; // 互換性
  gender?: string;
  [key: string]: any;
}

// フォント登録
Font.register({
  family: 'NotoSansJP',
  fonts: [
    { src: '/fonts/NotoSansJP-Regular.ttf' },
    // { src: '/fonts/NotoSansJP-Bold.ttf', fontWeight: 'bold' }
  ]
});

const styles = StyleSheet.create({
  page: { padding: 20, fontFamily: 'NotoSansJP', fontSize: 9, lineHeight: 1.4 },
  
  // ヘッダー
  header: { marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 5 },
  title: { fontSize: 14, marginBottom: 2 },
  subTitle: { fontSize: 10, marginBottom: 2 },
  period: { fontSize: 9, textAlign: 'right' },

  // 共通テーブルスタイル
  table: { width: '100%', marginBottom: 10, borderLeftWidth: 1, borderTopWidth: 1, borderColor: '#000' },
  row: { flexDirection: 'row' },
  cell: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', padding: 3, fontSize: 8 },
  headerCell: { backgroundColor: '#f0f0f0', textAlign: 'center', fontWeight: 'bold' },
  
  // セクション
  sectionTitle: { fontSize: 10, marginTop: 10, marginBottom: 4, backgroundColor: '#e0e0e0', padding: 2, borderWidth: 1, borderColor: '#000' },
  box: { borderWidth: 1, borderColor: '#000', padding: 4, marginBottom: 5, minHeight: 30 },
  
  // 支援目標用スタイル
  targetBox: { borderWidth: 1, borderColor: '#000', marginBottom: 8 },
  targetRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#ccc' },
  targetLabel: { width: '15%', backgroundColor: '#f0f0f0', padding: 4, justifyContent: 'center', fontSize: 8, borderRightWidth: 1, borderColor: '#ccc' },
  targetContent: { width: '85%', padding: 4, fontSize: 9 },
  
  // フッター
  footer: { position: 'absolute', bottom: 20, left: 20, right: 20, textAlign: 'right', fontSize: 8, color: '#666' },
});

interface Props {
  monitoring: MonitoringRecord;
  plan: SupportPlan | null;
  user: any; // ★修正: 型エラー回避のため any で受けつつ、内部で UserDataMonitoring として扱う
}

export const MonitoringPDFDocument: React.FC<Props> = ({ monitoring, plan, user }) => {
  
  // ★データ整形ロジック
  const userData = user as UserDataMonitoring;
  
  // ふりがな (lastKana または lastNameKana)
  const kana = `${userData?.lastKana || userData?.lastNameKana || ''} ${userData?.firstKana || userData?.firstNameKana || ''}`;
  
  // 誕生日 (birthday または birthDate)
  const birthDateRaw = userData?.birthday || userData?.birthDate;
  
  // 性別
  const genderText = userData?.gender === 'male' ? '男性' : userData?.gender === 'female' ? '女性' : userData?.gender || '';

  // --- ヘルパー関数: 年齢・学年計算 ---
  const getAge = (birthDate?: string) => {
    if (!birthDate) return '';
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return ''; // 無効な日付
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return `${age}歳`;
  };

  const getGrade = (birthDate?: string) => {
    if (!birthDate) return '';
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return ''; // 無効な日付
    const today = new Date();
    const schoolYearStart = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear(); // 4月始まり
    
    let ageAtApril1st = schoolYearStart - birth.getFullYear();
    if (birth.getMonth() < 3 || (birth.getMonth() === 3 && birth.getDate() === 1)) {
        ageAtApril1st++; 
    }

    if (ageAtApril1st < 6) return '未就学';
    if (ageAtApril1st === 6) return '小学1年生';
    if (ageAtApril1st === 7) return '小学2年生';
    if (ageAtApril1st === 8) return '小学3年生';
    if (ageAtApril1st === 9) return '小学4年生';
    if (ageAtApril1st === 10) return '小学5年生';
    if (ageAtApril1st === 11) return '小学6年生';
    if (ageAtApril1st === 12) return '中学1年生';
    if (ageAtApril1st === 13) return '中学2年生';
    if (ageAtApril1st === 14) return '中学3年生';
    if (ageAtApril1st >= 15 && ageAtApril1st <= 17) return '高校生';
    return '';
  };

  // 評価データの取得ヘルパー
  const getEval = (targetId: string) => {
    const found = monitoring.targetEvaluations?.find(t => t.targetId === targetId);
    return found ? found.evaluation : '';
  };

  return (
    <PdfDocument>
      <Page size="A4" style={styles.page}>
        
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>モニタリング</Text>
          <Text style={styles.subTitle}>振り返り</Text>
          <Text style={styles.period}>
            {monitoring.periodStart} ~ {monitoring.periodEnd}
          </Text>
        </View>

        {/* 利用者情報 */}
        <View style={styles.table}>
          {/* 1行目 */}
          <View style={styles.row}>
            <View style={[styles.cell, styles.headerCell, { width: '15%' }]}><Text>ふりがな</Text></View>
            <View style={[styles.cell, { width: '35%' }]}><Text>{kana}</Text></View>
            <View style={[styles.cell, styles.headerCell, { width: '10%' }]}><Text>性別</Text></View>
            <View style={[styles.cell, styles.headerCell, { width: '10%' }]}><Text>年齢</Text></View>
            <View style={[styles.cell, styles.headerCell, { width: '30%' }]}><Text>学年</Text></View>
          </View>
          
          {/* 2行目: ここに width を追加して整列させます */}
          <View style={styles.row}>
            <View style={[styles.cell, styles.headerCell, { width: '15%' }]}><Text>お名前</Text></View>
            <View style={[styles.cell, { width: '35%' }]}><Text>{monitoring.userName}</Text></View>
            <View style={[styles.cell, { textAlign: 'center', width: '10%' }]}><Text>{genderText}</Text></View>
            <View style={[styles.cell, { textAlign: 'center', width: '10%' }]}><Text>{getAge(birthDateRaw)}</Text></View>
            <View style={[styles.cell, { textAlign: 'center', width: '30%' }]}><Text>{getGrade(birthDateRaw)}</Text></View>
          </View>
        </View>

        {/* 計画の目標 */}
        <Text style={styles.sectionTitle}>長期目標</Text>
        <View style={styles.box}><Text>{plan?.longTermGoal}</Text></View>
        
        <Text style={styles.sectionTitle}>短期目標</Text>
        <View style={styles.box}><Text>{plan?.shortTermGoal}</Text></View>

        {/* 支援目標と評価 */}
        <Text style={{ fontSize: 10, marginTop: 10, marginBottom: 4, fontWeight: 'bold' }}>支援目標・内容・評価</Text>
        
        {plan?.supportTargets?.sort((a:any, b:any) => Number(a.displayOrder) - Number(b.displayOrder)).map((target, index) => (
          <View key={index} style={styles.targetBox} wrap={false}>
            {/* 行1: 目標 */}
            <View style={styles.targetRow}>
              <View style={styles.targetLabel}><Text>支援目標{target.displayOrder}</Text></View>
              <View style={styles.targetContent}>
                <Text style={{ fontSize: 8, color: '#666' }}>
                  {target.supportCategories?.length > 0 ? `【${target.supportCategories.join('・')}】` : ''} 
                  {target.fiveDomains?.length > 0 ? ` [${target.fiveDomains.join('・')}]` : ''}
                </Text>
                <Text>{target.goal}</Text>
              </View>
            </View>
            {/* 行2: 内容 */}
            <View style={styles.targetRow}>
              <View style={styles.targetLabel}><Text>支援内容</Text></View>
              <View style={styles.targetContent}>
                <Text>{target.content}</Text>
              </View>
            </View>
            {/* 行3: 評価 */}
            <View style={[styles.targetRow, { borderBottomWidth: 0 }]}>
              <View style={[styles.targetLabel, { backgroundColor: '#fffbe6' }]}><Text>目標の評価</Text></View>
              <View style={styles.targetContent}>
                <Text>{getEval(target.id)}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* 主な取り組み内容 */}
        <Text style={styles.sectionTitle}>主な取り組み内容</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <View style={[styles.cell, styles.headerCell, { width: '10%' }]}><Text>No</Text></View>
            <View style={[styles.cell, styles.headerCell, { width: '45%' }]}><Text>取り組み内容</Text></View>
            <View style={[styles.cell, styles.headerCell, { width: '45%' }]}><Text>評価</Text></View>
          </View>
          {[1, 2, 3].map(num => (
            <View key={num} style={styles.row}>
              <View style={[styles.cell, { width: '10%', textAlign: 'center' }]}><Text>{num}</Text></View>
              {/* @ts-ignore */}
              <View style={[styles.cell, { width: '45%', minHeight: 30 }]}><Text>{monitoring[`initiative${num}`]}</Text></View>
              {/* @ts-ignore */}
              <View style={[styles.cell, { width: '45%', minHeight: 30 }]}><Text>{monitoring[`evaluation${num}`]}</Text></View>
            </View>
          ))}
        </View>

        {/* 短信 */}
        <Text style={styles.sectionTitle}>短信</Text>
        <View style={[styles.box, { minHeight: 50 }]}><Text>{monitoring.shortMessage}</Text></View>

        {/* フッター情報 */}
        <View style={styles.footer}>
          <Text>作成日: {monitoring.creationDate}   作成者: {monitoring.author}</Text>
          <Text>事業所名: ハッピーテラス俊徳道教室</Text>
        </View>

      </Page>
    </PdfDocument>
  );
};