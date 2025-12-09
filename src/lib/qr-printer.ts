import QRCode from 'qrcode';
import jsPDF from 'jspdf';

// フォント読み込み用ヘルパー
async function loadFont(pdf: jsPDF) {
  try {
    const fontUrl = '/fonts/NotoSansJP-Regular.ttf';
    const fontRes = await fetch(fontUrl);
    if (!fontRes.ok) throw new Error(`フォントファイルが見つかりません: ${fontUrl}`);
    const fontBuffer = await fontRes.arrayBuffer();
    
    let binary = '';
    const bytes = new Uint8Array(fontBuffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const fontBase64 = window.btoa(binary);

    pdf.addFileToVFS('NotoSansJP.ttf', fontBase64);
    pdf.addFont('NotoSansJP.ttf', 'NotoSansJP', 'normal');
    pdf.setFont('NotoSansJP'); 
  } catch (e) {
    console.error("Font load error:", e);
  }
}

export const generateQrCard = async (userId: string, userName: string) => {
  // A4サイズ (210mm x 297mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  await loadFont(pdf);

  const generateQR = async (text: string) => {
    return await QRCode.toDataURL(text, { 
      errorCorrectionLevel: 'H', 
      width: 500, 
      margin: 0,
      color: { dark: '#000000', light: '#00000000' }
    });
  };

  // --- レイアウト設定 (A4) ---
  const pageWidth = 210;
  const pageHeight = 297;
  
  // カードサイズ: 縦125mm x 横80mm
  const cardWidth = 80;
  const cardHeight = 125;
  const cardGap = 20; // ★ 上下のカードの間隔 (20mm)
  
  // 中央配置のためのX座標
  const startX = (pageWidth - cardWidth) / 2;
  const centerX = pageWidth / 2;

  // 上下配置のためのY座標
  // (カード2枚 + 間隔) をページ中央に配置
  const totalContentHeight = (cardHeight * 2) + cardGap;
  const startY_Top = (pageHeight - totalContentHeight) / 2;      // 上段の開始Y
  const startY_Bottom = startY_Top + cardHeight + cardGap;       // 下段の開始Y

  // --- 色定義 ---
  const COLOR_BLUE: [number, number, number] = [59, 130, 246];   // 放課後
  const COLOR_ORANGE: [number, number, number] = [249, 115, 22]; // 休校日

  // --- カード描画関数 (1枚分) ---
  const drawSingleCard = async (
    y: number,          // 開始Y座標
    displayText: string, 
    qrData: string,
    themeColor: [number, number, number],
    isArrival: boolean  
  ) => {
    const radius = 5; 
    
    // 1. 背景・枠線
    if (isArrival) {
      // 来所: 白背景 + 色枠線
      pdf.setDrawColor(themeColor[0], themeColor[1], themeColor[2]);
      pdf.setLineWidth(2.0);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(startX, y, cardWidth, cardHeight, radius, radius, 'FD'); 
      pdf.setTextColor(themeColor[0], themeColor[1], themeColor[2]);
    } else {
      // 帰所: 色背景
      pdf.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
      pdf.roundedRect(startX, y, cardWidth, cardHeight, radius, radius, 'F');
      pdf.setTextColor(255, 255, 255);
    }

    pdf.setFont('NotoSansJP');

    // 2. 名前
    pdf.setFontSize(35); 
    pdf.text(userName, centerX, y + 25, { align: 'center' });

    // 3. ラベル
    pdf.setFontSize(24);
    pdf.text(displayText, centerX, y + 45, { align: 'center' });

    // 4. QRコード
    const qrImg = await generateQR(qrData);
    const qrSize = 50; // 50mm x 50mm
    const qrY = y + 60; 
    
    if (!isArrival) {
      pdf.setFillColor(255, 255, 255);
      const bgMargin = 2;
      pdf.roundedRect(
        centerX - (qrSize/2) - bgMargin, 
        qrY - bgMargin, 
        qrSize + (bgMargin*2), 
        qrSize + (bgMargin*2), 
        3, 3, 'F'
      );
    }
    
    pdf.addImage(qrImg, 'PNG', centerX - (qrSize/2), qrY, qrSize, qrSize);
  };

  // --- 1ページ目: 放課後セット (青) ---
  // 上段: 来所
  await drawSingleCard(
    startY_Top,
    '放課後・来所',
    `comet://scan?id=${userId}&status=◯&type=来所`,
    COLOR_BLUE,
    true
  );
  
  // 下段: 帰所
  await drawSingleCard(
    startY_Bottom,
    '放課後・帰所',
    `comet://scan?id=${userId}&status=◯&type=帰所`,
    COLOR_BLUE,
    false
  );

  // --- 2ページ目: 休校日セット (オレンジ) ---
  pdf.addPage();

  // 上段: 来所
  await drawSingleCard(
    startY_Top,
    '休校日・来所',
    `comet://scan?id=${userId}&status=◎&type=来所`,
    COLOR_ORANGE,
    true
  );

  // 下段: 帰所
  await drawSingleCard(
    startY_Bottom,
    '休校日・帰所',
    `comet://scan?id=${userId}&status=◎&type=帰所`,
    COLOR_ORANGE,
    false
  );

  // 保存
  pdf.save(`${userName}_QRカード.pdf`);
};