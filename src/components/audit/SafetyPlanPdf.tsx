"use client";

import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';
import { SafetyPlan } from '@/types/audit';

// 日本語フォントの登録 (Noto Sans JP)
Font.register({
  family: 'NotoSansJP',
  src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8_.ttf'
});

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'NotoSansJP',
    fontSize: 10,
    lineHeight: 1.4,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    textDecoration: 'underline',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 5,
    backgroundColor: '#f0f0f0',
    padding: 2,
  },
  subTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 3,
  },
  // 表組み用スタイル
  table: {
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableColHeader: {
    backgroundColor: '#e0e0e0',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    padding: 4,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: 'bold',
  },
  tableCol: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    padding: 4,
    fontSize: 9,
  },
  // 最後の列や行の調整
  lastCol: { borderRightWidth: 0 },
  lastRow: { borderBottomWidth: 0 },
  
  // テキストエリア風
  textArea: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 5,
    minHeight: 40,
    fontSize: 9,
    marginBottom: 5,
  },
  textItem: {
    marginLeft: 10,
    marginBottom: 2,
  }
});

interface Props {
  plan: SafetyPlan;
}

export const SafetyPlanPdf: React.FC<Props> = ({ plan }) => {
  const months1 = [4, 5, 6, 7, 8, 9];
  const months2 = [10, 11, 12, 1, 2, 3];

  // 安全点検・訓練の月ごとのコンテンツを取得するヘルパー
  const getContent = (type: 'safetyChecks' | 'drills', month: number, field: 'content' | 'subContent' = 'content') => {
    const item = plan[type].find(i => i.month === month);
    return item ? item[field] || '' : '';
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* タイトル */}
        <Text style={styles.title}>
          令和{plan.fiscalYear - 2018}年度　安全計画【{plan.facilityName}】
        </Text>

        {/* 1. 安全点検 */}
        <Text style={styles.sectionTitle}>◎安全点検</Text>
        <Text style={styles.subTitle}>（１）施設・設備・施設外環境（緊急避難先等）の安全点検</Text>
        
        {/* 点検表 (4-9月) */}
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>月</Text>
            {months1.map(m => (
              <Text key={m} style={[styles.tableColHeader, { width: '14%' }]}>{m}月</Text>
            ))}
          </View>
          <View style={[styles.tableRow, styles.lastRow]}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>重点点検箇所</Text>
            {months1.map(m => (
              <Text key={m} style={[styles.tableCol, { width: '14%' }]}>{getContent('safetyChecks', m)}</Text>
            ))}
          </View>
        </View>

        {/* 点検表 (10-3月) */}
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>月</Text>
            {months2.map(m => (
              <Text key={m} style={[styles.tableColHeader, { width: '14%' }]}>{m}月</Text>
            ))}
          </View>
          <View style={[styles.tableRow, styles.lastRow]}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>重点点検箇所</Text>
            {months2.map(m => (
              <Text key={m} style={[styles.tableCol, { width: '14%' }]}>{getContent('safetyChecks', m)}</Text>
            ))}
          </View>
        </View>

        <Text style={styles.subTitle}>（２）マニュアルの策定・共有</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableColHeader, { width: '40%' }]}>分野</Text>
            <Text style={[styles.tableColHeader, { width: '20%' }]}>策定時期</Text>
            <Text style={[styles.tableColHeader, { width: '20%' }]}>見直し予定</Text>
            <Text style={[styles.tableColHeader, { width: '20%', borderRightWidth: 0 }]}>掲示・管理場所</Text>
          </View>
          {plan.manuals.map((manual, i) => (
            <View key={i} style={[styles.tableRow, i === plan.manuals.length - 1 ? styles.lastRow : {}]}>
              <Text style={[styles.tableCol, { width: '40%' }]}>{manual.category}</Text>
              <Text style={[styles.tableCol, { width: '20%' }]}>{manual.creationDate}</Text>
              <Text style={[styles.tableCol, { width: '20%' }]}>{manual.reviewDate}</Text>
              <Text style={[styles.tableCol, { width: '20%', borderRightWidth: 0 }]}>{manual.location}</Text>
            </View>
          ))}
        </View>

        {/* 2. 安全指導 */}
        <Text style={styles.sectionTitle}>◎児童・保護者に対する安全指導等</Text>
        <Text style={styles.subTitle}>（１）児童への安全指導</Text>
        <View style={styles.textArea}><Text>{plan.childGuidance}</Text></View>

        <Text style={styles.subTitle}>（２）保護者への説明・共有</Text>
        <View style={styles.textArea}><Text>{plan.parentGuidance}</Text></View>

        {/* 3. 訓練・研修 */}
        <Text style={styles.sectionTitle}>◎訓練・研修</Text>
        <Text style={styles.subTitle}>（１）訓練のテーマ・取組</Text>

        {/* 訓練表 (4-9月) */}
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>月</Text>
            {months1.map(m => <Text key={m} style={[styles.tableColHeader, { width: '14%' }]}>{m}月</Text>)}
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>避難訓練等</Text>
            {months1.map(m => <Text key={m} style={[styles.tableCol, { width: '14%' }]}>{getContent('drills', m, 'content')}</Text>)}
          </View>
          <View style={[styles.tableRow, styles.lastRow]}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>その他</Text>
            {months1.map(m => <Text key={m} style={[styles.tableCol, { width: '14%' }]}>{getContent('drills', m, 'subContent')}</Text>)}
          </View>
        </View>

        {/* 訓練表 (10-3月) */}
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>月</Text>
            {months2.map(m => <Text key={m} style={[styles.tableColHeader, { width: '14%' }]}>{m}月</Text>)}
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>避難訓練等</Text>
            {months2.map(m => <Text key={m} style={[styles.tableCol, { width: '14%' }]}>{getContent('drills', m, 'content')}</Text>)}
          </View>
          <View style={[styles.tableRow, styles.lastRow]}>
            <Text style={[styles.tableColHeader, { width: '16%' }]}>その他</Text>
            {months2.map(m => <Text key={m} style={[styles.tableCol, { width: '14%' }]}>{getContent('drills', m, 'subContent')}</Text>)}
          </View>
        </View>

        <Text style={styles.subTitle}>（２）訓練の参加予定者</Text>
        <View style={[styles.textArea, { minHeight: 20 }]}><Text>{plan.drillParticipants}</Text></View>

        <Text style={styles.subTitle}>（３）職員への研修・講習</Text>
        <View style={[styles.textArea, { minHeight: 20 }]}><Text>{plan.staffTraining}</Text></View>

        <Text style={styles.subTitle}>（４）行政等が実施する訓練・講習スケジュール</Text>
        <View style={[styles.textArea, { minHeight: 20 }]}><Text>{plan.externalTraining}</Text></View>

        {/* 4. 再発防止・その他 */}
        <Text style={styles.sectionTitle}>◎再発防止策・その他</Text>
        <Text style={styles.subTitle}>再発防止策の徹底（ヒヤリ・ハット事例の収集・分析及び対策とその共有の方法等）</Text>
        <View style={[styles.textArea, { minHeight: 30 }]}><Text>{plan.recurrencePrevention}</Text></View>

        <Text style={styles.subTitle}>その他の安全確保に向けた取組</Text>
        <View style={[styles.textArea, { minHeight: 30 }]}><Text>{plan.otherMeasures}</Text></View>

      </Page>
    </Document>
  );
};