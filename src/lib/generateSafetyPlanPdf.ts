import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SafetyPlan } from '@/types/audit';

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}

export const generateSafetyPlanPdf = async (plan: SafetyPlan) => {
  const doc = new jsPDF();

  try {
    const fontUrl = '/fonts/NotoSansJP-Regular.ttf';
    const fontBytes = await fetch(fontUrl).then((res) => res.arrayBuffer());
    const filename = 'NotoSansJP-Regular.ttf';
    
    // バイナリデータをBase64に変換
    const binary = new Uint8Array(fontBytes);
    let fontBase64 = '';
    for (let i = 0; i < binary.length; i++) {
      fontBase64 += String.fromCharCode(binary[i]);
    }
    fontBase64 = window.btoa(fontBase64);
    
    doc.addFileToVFS(filename, fontBase64);
    
    // ★重要: 同じフォントファイルを 'normal' と 'bold' 両方で登録する
    doc.addFont(filename, 'NotoSansJP', 'normal');
    doc.addFont(filename, 'NotoSansJP', 'bold'); 
    
    doc.setFont('NotoSansJP');
  } catch (e) {
    console.error("フォント読み込みエラー:", e);
    alert("フォント読み込みに失敗しました。public/fonts/NotoSansJP-Regular.ttf を確認してください。");
    return;
  }

  // --- 共通設定 ---
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;
  let currentY = 20;

  const addText = (text: string, fontSize: number = 10, isBold: boolean = false, indent: number = 0) => {
    doc.setFontSize(fontSize);
    doc.setFont('NotoSansJP', isBold ? 'bold' : 'normal');
    
    const textWidth = pageWidth - (margin * 2) - indent;
    const splitText = doc.splitTextToSize(text || '', textWidth);
    
    doc.text(splitText, margin + indent, currentY);
    currentY += (splitText.length * fontSize * 0.5) + 2; 
  };

  const addSectionTitle = (text: string) => {
    currentY += 5;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, currentY - 4, pageWidth - (margin * 2), 6, 'F');
    // ここでboldが指定されても、上記で登録したので文字化けしません
    addText(text, 11, true); 
    currentY += 2;
  };

  const addSubTitle = (text: string) => {
    currentY += 2;
    addText(text, 10, true);
  };

  // --- ドキュメント作成 ---

  // タイトル
  doc.setFontSize(16);
  doc.setFont('NotoSansJP', 'bold');
  doc.text(`令和${plan.fiscalYear - 2018}年度　安全計画【${plan.facilityName}】`, pageWidth / 2, currentY, { align: 'center' });
  currentY += 15;

  // 1. 安全点検
  addSectionTitle("◎安全点検");
  addSubTitle("（１）施設・設備・施設外環境（緊急避難先等）の安全点検");

  const getPlanContent = (type: 'safetyChecks' | 'drills', month: number, field: 'content' | 'subContent' = 'content') => {
    const item = plan[type].find(i => i.month === month);
    return item ? item[field] || '' : '';
  };

  const months1 = [4, 5, 6, 7, 8, 9];
  const months2 = [10, 11, 12, 1, 2, 3];

  // 安全点検 (上半期)
  autoTable(doc, {
    startY: currentY,
    head: [['月', ...months1.map(m => `${m}月`)]],
    body: [['重点点検箇所', ...months1.map(m => getPlanContent('safetyChecks', m))]],
    styles: { font: 'NotoSansJP', fontSize: 8, lineWidth: 0.1, lineColor: 0 },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, halign: 'center', fontStyle: 'bold' }, // ヘッダーは太字
    theme: 'grid',
  });
  currentY = doc.lastAutoTable.finalY + 2;

  // 安全点検 (下半期)
  autoTable(doc, {
    startY: currentY,
    head: [['月', ...months2.map(m => `${m}月`)]],
    body: [['重点点検箇所', ...months2.map(m => getPlanContent('safetyChecks', m))]],
    styles: { font: 'NotoSansJP', fontSize: 8, lineWidth: 0.1, lineColor: 0 },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, halign: 'center', fontStyle: 'bold' },
    theme: 'grid',
  });
  currentY = doc.lastAutoTable.finalY + 5;

  // マニュアル
  addSubTitle("（２）マニュアルの策定・共有");
  autoTable(doc, {
    startY: currentY,
    head: [['分野', '策定時期', '見直し予定', '掲示・管理場所']],
    body: plan.manuals.map(m => [m.category, m.creationDate, m.reviewDate, m.location]),
    styles: { font: 'NotoSansJP', fontSize: 8, lineWidth: 0.1, lineColor: 0 },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, halign: 'center', fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 60 } },
    theme: 'grid',
  });
  currentY = doc.lastAutoTable.finalY + 5;

  // 2. 安全指導
  addSectionTitle("◎児童・保護者に対する安全指導等");
  addSubTitle("（１）児童への安全指導");
  addText(plan.childGuidance, 9, false, 5);
  currentY += 3;
  
  addSubTitle("（２）保護者への説明・共有");
  addText(plan.parentGuidance, 9, false, 5);

  if (currentY > 250) { doc.addPage(); currentY = 20; }

  // 3. 訓練・研修
  addSectionTitle("◎訓練・研修");
  addSubTitle("（１）訓練のテーマ・取組");

  // 訓練 (上半期)
  autoTable(doc, {
    startY: currentY,
    head: [['月', ...months1.map(m => `${m}月`)]],
    body: [
      ['避難訓練等', ...months1.map(m => getPlanContent('drills', m, 'content'))],
      ['その他', ...months1.map(m => getPlanContent('drills', m, 'subContent'))]
    ],
    styles: { font: 'NotoSansJP', fontSize: 8, lineWidth: 0.1, lineColor: 0 },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, halign: 'center', fontStyle: 'bold' },
    theme: 'grid',
  });
  currentY = doc.lastAutoTable.finalY + 2;

  // 訓練 (下半期)
  autoTable(doc, {
    startY: currentY,
    head: [['月', ...months2.map(m => `${m}月`)]],
    body: [
      ['避難訓練等', ...months2.map(m => getPlanContent('drills', m, 'content'))],
      ['その他', ...months2.map(m => getPlanContent('drills', m, 'subContent'))]
    ],
    styles: { font: 'NotoSansJP', fontSize: 8, lineWidth: 0.1, lineColor: 0 },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, halign: 'center', fontStyle: 'bold' },
    theme: 'grid',
  });
  currentY = doc.lastAutoTable.finalY + 5;

  // 訓練詳細
  addSubTitle("（２）訓練の参加予定者");
  addText(plan.drillParticipants, 9, false, 5);
  currentY += 3;

  addSubTitle("（３）職員への研修・講習");
  addText(plan.staffTraining, 9, false, 5);
  currentY += 3;

  addSubTitle("（４）行政等が実施する訓練・講習スケジュール");
  addText(plan.externalTraining, 9, false, 5);

  if (currentY > 260) { doc.addPage(); currentY = 20; }

  // 4. その他
  addSectionTitle("◎再発防止策・その他");
  addSubTitle("再発防止策の徹底（ヒヤリ・ハット事例の収集・分析及び対策等）");
  addText(plan.recurrencePrevention, 9, false, 5);
  currentY += 3;

  addSubTitle("その他の安全確保に向けた取組");
  addText(plan.otherMeasures, 9, false, 5);

  doc.save(`安全計画_${plan.fiscalYear}_${plan.facilityName}.pdf`);
};