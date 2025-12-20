import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * 単一の要素をPDFとしてダウンロード
 */
export const downloadPdf = async (elementId: string, fileName: string) => {
  const element = document.getElementById(elementId);
  if (!element) throw new Error('Element not found');

  const canvas = await html2canvas(element, {
    scale: 3, 
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    scrollY: -window.scrollY, 
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // A4サイズ (mm)
  const pdfWidth = 210;
  const pdfHeight = 297;

  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(fileName);
};

/**
 * 【新規追加】複数の要素を1つのPDFに結合してダウンロード
 */
export const downloadMergedPdf = async (elementIds: string[], fileName: string, onProgress?: (current: number, total: number) => void) => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = 210;
  const pdfHeight = 297;

  for (let i = 0; i < elementIds.length; i++) {
    const elementId = elementIds[i];
    const element = document.getElementById(elementId);
    
    if (element) {
      // 進捗コールバック
      if (onProgress) onProgress(i + 1, elementIds.length);

      // 画像化
      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        scrollY: -window.scrollY,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      // 2人目以降は新しいページを追加
      if (i > 0) {
        pdf.addPage();
      }

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }
  }

  pdf.save(fileName);
};