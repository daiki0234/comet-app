"use client";

import React from 'react';
import { Document as PdfDocument, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { SupportPlan } from '@/types/plan';

// ユーザーデータの型定義（PDF生成用に柔軟に定義）
interface UserDataPDF {
  lastName: string;
  firstName: string;
  lastKana?: string; 
  firstKana?: string; 
  birthday?: string; 
  gender?: string;
  jukyushaNo?: string; 
  recipientNumber?: string;
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

// スタイル定義
const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: 'NotoSansJP',
    fontSize: 9,
    lineHeight: 1.3,
  },
  
  // --- ヘッダー ---
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
    marginBottom: 2,
  },
  headerSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    width: '100%',
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
  },
  metaInfo: {
    fontSize: 8,
    textAlign: 'right',
  },

  // --- テーブル構造 ---
  table: {
    width: '100%',
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    width: '100%',
    minHeight: 20,
    alignItems: 'stretch',
  },
  
  // --- セル装飾 ---
  cell: {
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    padding: 2, 
    justifyContent: 'center',
  },
  th: {
    backgroundColor: '#f0f0f0',
    textAlign: 'center',
    fontSize: 8, 
    fontWeight: 'bold',
  },
  td: {
    textAlign: 'left',
    fontSize: 7.5, 
  },

  // 枠線調整
  cellFirst: {
    borderLeftWidth: 1,
    borderLeftColor: '#000',
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopColor: '#000',
  },

  // --- 幅設定 (合計100%) ---
  colNo: { width: '3%' },       
  colPriority: { width: '3%' }, 
  colGoal: { width: '20%' },    
  colContent: { width: '36%' }, 
  colPeriod: { width: '8%' },   
  colStaff: { width: '18%' },   
  colRemarks: { width: '12%' },
  
  // 時間割用
  wSchedule: { width: '14.28%' },

  // --- その他パーツ ---
  sectionTitle: {
    backgroundColor: '#e0e0e0',
    padding: 2,
    borderWidth: 1,
    borderColor: '#000',
    fontSize: 9,
    marginTop: 4,
    borderBottomWidth: 0,
  },
  box: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 4,
    marginBottom: 4,
    minHeight: 30,
  },
});

interface Props {
  plan: SupportPlan;
  user: any; 
  managerName?: string;
}

const DAYS = ['月', '火', '水', '木', '金', '土', '日・祝・長期休'];

export const PlanPDFDocument: React.FC<Props> = ({ plan, user, managerName }) => {
  const isDraft = plan.status === '原案';
  const title = `個別支援計画書${isDraft ? '【原案】' : ''}`;
  
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const creationDate = formatDate(plan.creationDate);
  const birthDay = formatDate(user?.birthday || user?.birthDate); 
  const kana = `${user?.lastKana || user?.lastNameKana || ''} ${user?.firstKana || user?.firstNameKana || ''}`;
  const recipientNo = user?.jukyushaNo || user?.recipientNumber || '';
  const gender = user?.gender === 'male' ? '男性' : user?.gender === 'female' ? '女性' : user?.gender || '';

  // 児発管の名前を優先、なければ作成者
  const signerName = managerName || plan.author;

  return (
    <PdfDocument>
      {/* ================= 1ページ目 ================= */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        
        {/* ヘッダー */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.metaInfo}>
            <Text>作成日: {creationDate}</Text>
            <Text>事業所名: ハッピーテラス俊徳道教室</Text>
          </View>
        </View>
        <View style={styles.headerSeparator} />

        {/* 基本情報 */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.rowFirst]}>
            <View style={[styles.cell, styles.th, styles.cellFirst, { width: '10%' }]}><Text>ふりがな</Text></View>
            <View style={[styles.cell, styles.td, { width: '20%' }]}><Text>{kana}</Text></View>
            <View style={[styles.cell, styles.th, { width: '10%' }]}><Text>生年月日</Text></View>
            <View style={[styles.cell, styles.td, { width: '20%' }]}><Text>{birthDay}</Text></View>
            <View style={[styles.cell, styles.th, { width: '10%' }]}><Text>受給者証番号</Text></View>
            <View style={[styles.cell, styles.td, { width: '30%' }]}><Text>{recipientNo}</Text></View>
          </View>
          
          <View style={styles.tableRow}>
            <View style={[styles.cell, styles.th, styles.cellFirst, { width: '10%' }]}><Text>お名前</Text></View>
            <View style={[styles.cell, styles.td, { width: '20%' }]}><Text>{user?.lastName} {user?.firstName}</Text></View>
            
            <View style={[styles.cell, styles.th, { width: '10%' }]}><Text>性別</Text></View>
            <View style={[styles.cell, styles.td, { width: '10%' }]}><Text>{gender}</Text></View>
            
            <View style={[styles.cell, styles.th, { width: '15%' }]}><Text>送迎の有無</Text></View>
            <View style={[styles.cell, styles.td, { width: '10%' }]}><Text>無し</Text></View>
            
            <View style={[styles.cell, styles.th, { width: '15%' }]}><Text>食事提供の有無</Text></View>
            <View style={[styles.cell, styles.td, { width: '10%' }]}><Text>無し</Text></View>
          </View>
        </View>

        {/* 意向・方針・目標 */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ width: '50%' }}>
            <Text style={styles.sectionTitle}>利用児及び家族の生活に対する意向</Text>
            <View style={[styles.box, { height: 50 }]}><Text>{plan.userRequest}</Text></View>
            <Text style={styles.sectionTitle}>長期目標</Text>
            <View style={[styles.box, { height: 35 }]}><Text>{plan.longTermGoal}</Text></View>
          </View>

          <View style={{ width: '50%' }}>
            <Text style={styles.sectionTitle}>総合的な支援の方針</Text>
            <View style={[styles.box, { height: 50 }]}><Text>{plan.policy}</Text></View>
            <Text style={styles.sectionTitle}>短期目標</Text>
            <View style={[styles.box, { height: 35 }]}><Text>{plan.shortTermGoal}</Text></View>
          </View>
        </View>

        {/* 支援目標テーブル */}
        <Text style={{ fontSize: 9, marginTop: 8, marginBottom: 2 }}>支援目標及び具体的な支援内容等</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.rowFirst]} fixed>
            <View style={[styles.cell, styles.th, styles.cellFirst, styles.colNo]}><Text>No</Text></View>
            <View style={[styles.cell, styles.th, styles.colPriority]}><Text>優先</Text></View>
            <View style={[styles.cell, styles.th, styles.colGoal]}><Text>支援目標</Text></View>
            <View style={[styles.cell, styles.th, styles.colContent]}><Text>支援内容</Text></View>
            <View style={[styles.cell, styles.th, styles.colPeriod]}><Text>達成時期</Text></View>
            <View style={[styles.cell, styles.th, styles.colStaff]}><Text>担当者</Text></View>
            <View style={[styles.cell, styles.th, styles.colRemarks]}><Text>留意事項</Text></View>
          </View>

          {plan.supportTargets.map((target, index) => (
            <View key={index} style={styles.tableRow} wrap={false}>
              <View style={[styles.cell, styles.td, styles.cellFirst, styles.colNo, { textAlign: 'center' }]}>
                <Text>{target.displayOrder}</Text>
              </View>
              <View style={[styles.cell, styles.td, styles.colPriority, { textAlign: 'center' }]}>
                <Text>{target.priority}</Text>
              </View>
              
              <View style={[styles.cell, styles.td, styles.colGoal]}><Text>{target.goal}</Text></View>
              
              <View style={[styles.cell, styles.td, styles.colContent]}>
                <Text>
                  {target.supportCategories && target.supportCategories.length > 0 && (
                    <Text style={{ fontWeight: 'bold' }}>
                       {`【${target.supportCategories.join('・')}】\n`}
                    </Text>
                  )}
                  {target.content}
                </Text>
              </View>

              <View style={[styles.cell, styles.td, styles.colPeriod, { textAlign: 'center' }]}>
                <Text>{target.achievementPeriod === 'その他' ? target.achievementPeriodOther : target.achievementPeriod}</Text>
              </View>
              
              <View style={[styles.cell, styles.td, styles.colStaff]}>
                <Text style={{ fontSize: 6.5 }}>{target.staff}</Text>
              </View>
              
              <View style={[styles.cell, styles.td, styles.colRemarks]}><Text>{target.remarks}</Text></View>
            </View>
          ))}
        </View>
      </Page>


      {/* ================= 2ページ目 ================= */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        
        <View style={styles.headerRow}>
          <Text style={styles.title}>個別支援計画書(提供時間等) {isDraft ? '【原案】' : ''}</Text>
          <Text>利用者名: {user?.lastName} {user?.firstName} 様</Text>
        </View>
        <View style={styles.headerSeparator} />

        <View style={{ width: '100%', marginTop: 5 }}>
          
          {/* 1. 標準時間 */}
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.sectionTitle}>支援の標準的な提供時間等</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.rowFirst]}>
                {DAYS.map((d, i) => (
                  // ★修正: undefined ではなく空オブジェクト {} を返す
                  <View key={d} style={[styles.cell, styles.th, styles.wSchedule, i === 0 ? styles.cellFirst : {}]}>
                    <Text style={{ fontSize: 6 }}>{d}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.tableRow}>
                {DAYS.map((_, i) => {
                  const slot = plan.schedules?.standard?.[i] || { start: '', end: '', duration: '' };
                  return (
                    // ★修正: undefined ではなく空オブジェクト {} を返す
                    <View key={i} style={[styles.cell, styles.td, styles.wSchedule, i === 0 ? styles.cellFirst : {}, { height: 35 }]}>
                      <Text style={{ fontSize: 7, textAlign: 'center' }}>{slot.start ? `${slot.start}~${slot.end}` : ''}</Text>
                      <Text style={{ fontSize: 8, marginTop: 2, textAlign: 'center' }}>{slot.duration ? `${slot.duration}h` : ''}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 8, marginRight: 5 }}>特記事項:</Text>
              <Text style={{ fontSize: 8 }}>{plan.remarks?.standard}</Text>
            </View>
          </View>

          {/* 2. 支援前延長 */}
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.sectionTitle}>【支援前】延長支援時間</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.rowFirst]}>
                {DAYS.map((d, i) => (
                  // ★修正: undefined ではなく空オブジェクト {} を返す
                  <View key={d} style={[styles.cell, styles.th, styles.wSchedule, i === 0 ? styles.cellFirst : {}]}>
                     <Text style={{ fontSize: 6 }}>{d}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.tableRow}>
                {DAYS.map((_, i) => {
                  const slot = plan.schedules?.pre?.[i] || { start: '', end: '', duration: '' };
                  return (
                    // ★修正: undefined ではなく空オブジェクト {} を返す
                    <View key={i} style={[styles.cell, styles.td, styles.wSchedule, i === 0 ? styles.cellFirst : {}, { height: 35 }]}>
                      <Text style={{ fontSize: 7, textAlign: 'center' }}>{slot.start ? `${slot.start}~${slot.end}` : ''}</Text>
                      <Text style={{ fontSize: 8, marginTop: 2, textAlign: 'center' }}>{slot.duration ? `${slot.duration}h` : ''}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 8, marginRight: 5 }}>特記事項:</Text>
              <Text style={{ fontSize: 8 }}>{plan.remarks?.pre}</Text>
            </View>
          </View>

          {/* 3. 支援後延長 */}
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.sectionTitle}>【支援後】延長支援時間</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.rowFirst]}>
                {DAYS.map((d, i) => (
                  // ★修正: undefined ではなく空オブジェクト {} を返す
                  <View key={d} style={[styles.cell, styles.th, styles.wSchedule, i === 0 ? styles.cellFirst : {}]}>
                     <Text style={{ fontSize: 6 }}>{d}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.tableRow}>
                {DAYS.map((_, i) => {
                  const slot = plan.schedules?.post?.[i] || { start: '', end: '', duration: '' };
                  return (
                    // ★修正: undefined ではなく空オブジェクト {} を返す
                    <View key={i} style={[styles.cell, styles.td, styles.wSchedule, i === 0 ? styles.cellFirst : {}, { height: 35 }]}>
                      <Text style={{ fontSize: 7, textAlign: 'center' }}>{slot.start ? `${slot.start}~${slot.end}` : ''}</Text>
                      <Text style={{ fontSize: 8, marginTop: 2, textAlign: 'center' }}>{slot.duration ? `${slot.duration}h` : ''}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 8, marginRight: 5 }}>特記事項:</Text>
              <Text style={{ fontSize: 8 }}>{plan.remarks?.post}</Text>
            </View>
          </View>

        </View>

        {/* 署名欄 */}
        <View style={{ marginTop: 20, borderTopWidth: 1, borderColor: '#ccc', paddingTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ width: '45%' }}>
              <Text>提供する支援内容について、本計画書に基づき説明しました。</Text>
              <View style={{ marginTop: 20, borderBottomWidth: 1, borderColor: '#000', paddingBottom: 2 }}>
                <Text>児童発達支援管理責任者氏名: {signerName}</Text>
              </View>
            </View>
            <View style={{ width: '45%' }}>
              <Text>本計画書に基づき支援の説明を受け、内容に同意しました。</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
                <View style={{ width: '40%', borderBottomWidth: 1, borderColor: '#000', paddingBottom: 2 }}>
                  <Text>年月日:      年    月    日</Text>
                </View>
                <View style={{ width: '55%', borderBottomWidth: 1, borderColor: '#000', paddingBottom: 2 }}>
                  <Text>(保護者署名)</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

      </Page>
    </PdfDocument>
  );
};