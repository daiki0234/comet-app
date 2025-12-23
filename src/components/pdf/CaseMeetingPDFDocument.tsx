"use client";

import React from 'react';
import { Document as PdfDocument, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { CaseMeeting } from '@/types/caseMeeting';

// フォント登録
Font.register({
  family: 'NotoSansJP',
  fonts: [
    { src: '/fonts/NotoSansJP-Regular.ttf' },
    // { src: '/fonts/NotoSansJP-Bold.ttf', fontWeight: 'bold' }
  ]
});

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: 'NotoSansJP', fontSize: 10, lineHeight: 1.5 },
  
  // ヘッダー
  header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 10 },
  title: { fontSize: 18, textAlign: 'center', marginBottom: 10, fontWeight: 'bold' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  
  // テーブル
  table: { width: '100%', borderLeftWidth: 1, borderTopWidth: 1, borderColor: '#000', marginTop: 10 },
  row: { flexDirection: 'row' },
  cell: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', padding: 5 },
  headerCell: { backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'center' },

  // 幅設定
  colUser: { width: '25%' },
  colContent: { width: '75%' },

  // フッター
  footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'right', fontSize: 9, color: '#666' },
});

interface Props {
  meeting: CaseMeeting;
}

export const CaseMeetingPDFDocument: React.FC<Props> = ({ meeting }) => {
  return (
    <PdfDocument>
      <Page size="A4" style={styles.page}>
        
        {/* タイトル */}
        <View style={styles.header}>
          <Text style={styles.title}>ケース会議 議事録</Text>
          
          <View style={styles.metaRow}>
            <Text>開催日: {meeting.date}</Text>
            <Text>場所: ハッピーテラス俊徳道教室</Text>
          </View>
          
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ width: 50 }}>参加者:</Text>
            <Text style={{ flex: 1 }}>{meeting.staffNames?.join('、 ')}</Text>
          </View>
        </View>

        {/* 議事録テーブル */}
        <Text style={{ fontSize: 12, marginBottom: 5, fontWeight: 'bold' }}>検討内容詳細</Text>
        <View style={styles.table}>
          {/* ヘッダー行 */}
          <View style={styles.row}>
            <View style={[styles.cell, styles.headerCell, styles.colUser]}><Text>利用者名</Text></View>
            <View style={[styles.cell, styles.headerCell, styles.colContent]}><Text>変更内容・検討事項</Text></View>
          </View>

          {/* データ行 */}
          {meeting.details?.map((detail, index) => (
            <View key={index} style={styles.row} wrap={false}>
              <View style={[styles.cell, styles.colUser]}>
                <Text>{detail.userName}</Text>
              </View>
              <View style={[styles.cell, styles.colContent]}>
                <Text>{detail.content}</Text>
              </View>
            </View>
          ))}
          
          {(!meeting.details || meeting.details.length === 0) && (
             <View style={styles.row}>
               <View style={[styles.cell, { width: '100%', textAlign: 'center', padding: 20 }]}>
                 <Text>記録なし</Text>
               </View>
             </View>
          )}
        </View>

        {/* フッター */}
        <View style={styles.footer}>
          <Text>作成日: {new Date().toLocaleDateString('ja-JP')}</Text>
          <Text>事業所名: ハッピーテラス俊徳道教室</Text>
        </View>

      </Page>
    </PdfDocument>
  );
};