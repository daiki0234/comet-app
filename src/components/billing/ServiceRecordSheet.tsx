import React from 'react';
import { ValidationResult } from '@/types/billing';

type Props = {
  data: ValidationResult | null;
  month: string;
  id?: string;
};

export const ServiceRecordSheet = React.forwardRef<HTMLDivElement, Props>(({ data, month, id }, ref) => {
  if (!data) return null;
  
  const [year, m] = month.split('-');
  const daysInMonth = new Date(Number(year), Number(m), 0).getDate();
  const dateList = Array.from({ length: 31 }, (_, i) => i + 1);

  const provider = {
    name: "Comet放課後等デイサービス",
    number: "1234567890", 
  };

  const getDayOfWeek = (d: number) => {
    const date = new Date(Number(year), Number(m) - 1, d);
    return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  };

  const getRecord = (d: number) => {
    const dateStr = `${year}-${m}-${String(d).padStart(2, '0')}`;
    return data.records.find(r => r.date === dateStr);
  };

  // 集計処理
  let totalFixedHours = 0; 
  let countAfterSchool = 0;
  let countHoliday = 0;
  let countAbsence = 0;

  data.records.forEach(rec => {
    const dateParts = rec.date.split('-');
    if (Number(dateParts[1]) !== Number(m)) return;

    if (rec.usageStatus === '放課後') {
      countAfterSchool++;
      totalFixedHours += 2;   
    } else if (rec.usageStatus === '休校日') {
      countHoliday++;
      totalFixedHours += 3.5; 
    } else if (rec.usageStatus === '欠席') {
      countAbsence++;
    }
  });

  // PDF化の際に文字位置を安定させるためのラッパー
  const CellCenter = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`flex items-center justify-center w-full h-full text-center leading-none ${className}`} 
         style={{ minHeight: '100%' }}>
      {children}
    </div>
  );

  return (
    <div id={id} ref={ref} className="bg-white text-black font-sans box-border relative mx-auto print:block print:visible"
         style={{ width: '210mm', height: '296mm', padding: '10mm' }}>
      
      <style jsx global>{`
        /* PDF化対策用CSS */
        .record-table {
          width: 100%;
          border-collapse: separate; 
          border-spacing: 0;
          table-layout: fixed;
          /* テーブル全体の基本フォントサイズ */
          font-size: 8px;
          
          border-top: 0.1mm solid #000;
          border-left: 0.1mm solid #000;
        }
        
        .record-table th {
          border-bottom: 0.1mm solid #000;
          border-right: 0.1mm solid #000;
          border-top: none;
          border-left: none;
          padding: 0;
          height: 5.8mm;
          overflow: hidden;
          box-sizing: border-box;
          /* ヘッダーの文字サイズは少し小さめに維持 */
          font-size: 8px;
        }

        .record-table td {
          border-bottom: 0.1mm solid #000;
          border-right: 0.1mm solid #000;
          border-top: none;
          border-left: none;
          padding: 0;
          height: 5.8mm;
          overflow: hidden;
          box-sizing: border-box;
          /* ★修正: データセルのフォントサイズを9pxに統一 */
          font-size: 9px;
        }
        
        /* ヘッダー背景色 */
        .header-bg {
          background-color: #f0f0f0 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* 罫線ユーティリティ */
        .border-r-dot { border-right: 0.1mm dotted #000; }
        .border-b-solid { border-bottom: 0.1mm solid #000; }
        .border-r-solid { border-right: 0.1mm solid #000; }
        .border-t-solid { border-top: 0.1mm solid #000; }
        .border-l-solid { border-left: 0.1mm solid #000; }

        /* 下部テーブル */
        .sub-table { 
          width: 100%; 
          border-collapse: separate; 
          border-spacing: 0;
          border-top: 0.1mm solid #000;
          border-left: 0.1mm solid #000;
          font-size: 8px; 
        }
        .sub-table th, .sub-table td { 
          border-bottom: 0.1mm solid #000; 
          border-right: 0.1mm solid #000; 
          border-top: none;
          border-left: none;
          height: 6mm; 
          padding: 0; 
        }
      `}</style>

      {/* --- ヘッダーエリア --- */}
      <div className="relative h-8 mb-2 w-full">
        <div className="absolute bottom-1 left-0 font-bold text-sm z-10">
          {year}年 {Number(m)}月分
        </div>
        <div className="absolute bottom-0 w-full text-center">
          <span className="inline-block border-b-2 border-black pb-1 font-bold text-base px-4 bg-white relative z-0">
            放課後等デイサービス提供実績記録票
          </span>
        </div>
      </div>
      
      {/* --- 利用者・事業者情報 --- */}
      <div className="flex mb-2 border-t-solid border-l-solid text-[9px]">
        {/* 左カラム */}
        <div className="w-1/2 flex flex-col border-r-solid">
          <div className="flex border-b-solid h-[7mm]">
             <div className="w-32 bg-gray-100 border-r-dot font-bold"><CellCenter>受給者証番号</CellCenter></div>
             <div className="flex-1 font-mono font-bold text-xs"><CellCenter>{data.user.jukyushaNo || ''}</CellCenter></div>
          </div>
          <div className="flex border-b-solid h-[8mm]">
             <div className="w-32 bg-gray-100 border-r-dot font-bold">
               <CellCenter className="text-[8px] leading-none py-1">給付決定<br/>保護者等氏名</CellCenter>
             </div>
             <div className="flex-1 font-bold">
                <CellCenter className="leading-none pb-[1px]">
                  {data.user.guardianLastName && data.user.guardianFirstName
                    ? `${data.user.guardianLastName} ${data.user.guardianFirstName}`
                    : `${data.user.lastName} (保護者)`
                  }
                </CellCenter>
             </div>
          </div>
          <div className="flex border-b-solid h-[7mm]">
             <div className="w-32 bg-gray-100 border-r-dot font-bold"><CellCenter>児童氏名</CellCenter></div>
             <div className="flex-1 font-bold text-xs"><CellCenter>{data.user.lastName} {data.user.firstName}</CellCenter></div>
          </div>
          <div className="flex border-b-solid h-[7mm]">
             <div className="w-32 bg-gray-100 border-r-dot font-bold"><CellCenter>契約支給量</CellCenter></div>
             <div className="flex-1"><CellCenter>{data.user.daysSpecified ? `${data.user.daysSpecified}日/月` : ''}</CellCenter></div>
          </div>
        </div>

        {/* 右カラム */}
        <div className="w-1/2 flex flex-col border-r-solid">
          <div className="flex border-b-solid h-[14mm]">
             <div className="w-24 bg-gray-100 border-r-dot font-bold"><CellCenter>事業所番号</CellCenter></div>
             <div className="flex-1 font-mono"><CellCenter>{provider.number}</CellCenter></div>
          </div>
          <div className="flex border-b-solid h-[15mm]">
             <div className="w-24 bg-gray-100 border-r-dot font-bold"><CellCenter className="text-[8px] leading-none">事業者及び<br/>その事業所</CellCenter></div>
             <div className="flex-1 text-[8px] px-1"><CellCenter>{provider.name}</CellCenter></div>
          </div>
        </div>
      </div>

      {/* --- メインテーブル --- */}
      <table className="record-table">
        <thead>
          <tr className="header-row">
            <th rowSpan={2} style={{ width: '3%' }} className="header-bg"><CellCenter>日<br/>付</CellCenter></th>
            <th rowSpan={2} style={{ width: '3%' }} className="header-bg"><CellCenter>曜<br/>日</CellCenter></th>
            <th rowSpan={2} style={{ width: '8%' }} className="header-bg"><CellCenter>サービス<br/>提供の<br/>状況</CellCenter></th>
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter>提供<br/>形態</CellCenter></th>
            <th rowSpan={2} style={{ width: '6%' }} className="header-bg"><CellCenter>開始<br/>時間</CellCenter></th>
            <th rowSpan={2} style={{ width: '6%' }} className="header-bg"><CellCenter>終了<br/>時間</CellCenter></th>
            <th rowSpan={2} style={{ width: '5%' }} className="header-bg"><CellCenter>算定<br/>時間</CellCenter></th>
            
            <th colSpan={2} style={{ width: '6%' }} className="header-bg"><CellCenter>送迎加算</CellCenter></th>
            
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter><span className="text-[6px]">家族支援<br/>加算</span></CellCenter></th>
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter><span className="text-[6px]">医療連携<br/>加算</span></CellCenter></th>
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter><span className="text-[6px]">延長支援<br/>加算</span></CellCenter></th>
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter><span className="text-[6px]">集中的<br/>支援加算</span></CellCenter></th>
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter><span className="text-[6px]">専門的<br/>支援加算</span></CellCenter></th>
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter><span className="text-[6px]">通所自立<br/>支援加算</span></CellCenter></th>
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter><span className="text-[6px]">入浴支援<br/>加算</span></CellCenter></th>
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter><span className="text-[6px]">子育て<br/>サポート<br />加算</span></CellCenter></th>
            <th rowSpan={2} style={{ width: '4%' }} className="header-bg"><CellCenter><span className="text-[6px]">自立<br/>サポート<br />加算</span></CellCenter></th>
            
            <th rowSpan={2} style={{ width: '7%' }} className="header-bg"><CellCenter>保護者等<br/>確認印</CellCenter></th>
            <th rowSpan={2} style={{ width: 'auto' }} className="header-bg"><CellCenter>備考</CellCenter></th>
          </tr>
          <tr>
            <th style={{ width: '3%' }} className="header-bg"><CellCenter>往</CellCenter></th>
            <th style={{ width: '3%' }} className="header-bg"><CellCenter>復</CellCenter></th>
          </tr>
        </thead>
        <tbody>
          {dateList.map((day) => {
            if (day > daysInMonth) return <tr key={day}><td colSpan={20} className="bg-gray-200"></td></tr>;

            const rec = getRecord(day);
            const wd = getDayOfWeek(day);
            const isSun = wd === '日';
            
            let status = ''; let typeCode = ''; 
            let arrival = ''; let departure = ''; let hoursStr = '';
            let transGo = ''; let transBack = '';
            let family = ''; let medical = ''; let extension = ''; 
            let intensive = ''; let special = ''; let independence = ''; 
            let bath = ''; let childcare = ''; let selfReliance = ''; 

            if (rec) {
              if (rec.usageStatus === '放課後') {
                status = ''; typeCode = '1'; hoursStr = '2'; 
              } else if (rec.usageStatus === '休校日') {
                status = ''; typeCode = '2'; hoursStr = '3.5'; 
              } else if (rec.usageStatus === '欠席') {
                status = '欠席'; 
              }

              if (rec.usageStatus !== '欠席') {
                arrival = rec.arrivalTime || '';
                departure = rec.departureTime || '';
                
                if (rec.extension) {
                   const extVal = rec.extension;
                   extension = typeof extVal === 'object' ? String(extVal.class || '') : String(extVal);
                }
                if (rec.hasFamilySupport) family = '1';
                if (rec.hasMedicalSupport) medical = '1';
                if (rec.hasIntensiveSupport) intensive = '1';
                if (rec.hasSpecialSupport) special = '1';
                if (rec.hasIndependenceSupport) independence = '1';
                if (rec.hasBathSupport) bath = '1';
                if (rec.hasChildcareSupport) childcare = '1';
                if (rec.hasSelfRelianceSupport) selfReliance = '1';
              }
            }

            return (
              <tr key={day}>
                <td><CellCenter>{day}</CellCenter></td>
                <td className={isSun ? 'text-red-600 font-bold' : ''}><CellCenter>{wd}</CellCenter></td>
                {/* ★修正: 個別の fontSize 指定を削除し、一括CSS(9px)を適用 */}
                <td><CellCenter>{status}</CellCenter></td>
                <td><CellCenter>{typeCode}</CellCenter></td>
                <td><CellCenter>{arrival}</CellCenter></td>
                <td><CellCenter>{departure}</CellCenter></td>
                <td><CellCenter>{hoursStr}</CellCenter></td>
                <td><CellCenter>{transGo}</CellCenter></td>
                <td><CellCenter>{transBack}</CellCenter></td>
                <td><CellCenter>{family}</CellCenter></td>
                <td><CellCenter>{medical}</CellCenter></td>
                <td className="font-bold"><CellCenter>{extension}</CellCenter></td>
                <td><CellCenter>{intensive}</CellCenter></td>
                <td><CellCenter>{special}</CellCenter></td>
                <td><CellCenter>{independence}</CellCenter></td>
                <td><CellCenter>{bath}</CellCenter></td>
                <td><CellCenter>{childcare}</CellCenter></td>
                <td><CellCenter>{selfReliance}</CellCenter></td>
                <td></td>
                <td></td>
              </tr>
            );
          })}
          
          <tr className="bg-gray-100 font-bold" style={{ height: '7mm' }}>
            <td colSpan={2}><CellCenter>合計</CellCenter></td>
            <td colSpan={4} className="border-r-solid"><div className="flex items-center justify-end h-full w-full pr-1 text-[9px]">算定時間数合計:</div></td>
            <td><CellCenter>{totalFixedHours}</CellCenter></td>
            <td colSpan={13} className="bg-gray-200"></td>
          </tr>
        </tbody>
      </table>

      {/* --- 内訳集計 & フッター --- */}
      <div className="absolute bottom-[10mm] left-[10mm] right-[10mm] flex flex-col gap-1">
        <div className="flex text-[10px] font-bold border-b-solid border-r-solid border-l-solid border-t-solid p-1 bg-gray-50 justify-around">
          <span>放課後等利用：{countAfterSchool}回</span>
          <span>休業日利用：{countHoliday}回</span>
          <span>欠席時対応：{countAbsence}回</span>
        </div>
        <div className="flex gap-2 h-[25mm] items-start mt-1">
          <div className="w-[70%] flex flex-col gap-1">
            <table className="sub-table">
              <tbody>
                <tr>
                  <td className="bg-gray-100 w-32 font-bold"><CellCenter>保育・教育等移行支援加算</CellCenter></td>
                  <td className="bg-gray-100 w-16 font-bold"><CellCenter>移行日</CellCenter></td>
                  <td></td>
                  <td className="bg-gray-100 w-24 font-bold"><CellCenter>移行後算定日</CellCenter></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="bg-gray-100 font-bold"><CellCenter>集中的支援加算</CellCenter></td>
                  <td className="bg-gray-100 font-bold"><CellCenter>支援開始日</CellCenter></td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="w-[30%] border-l-solid border-r-solid border-t-solid border-b-solid p-2 text-[10px] h-full flex flex-col justify-end text-right leading-relaxed">
            <p className="font-bold mb-1 text-xs">{provider.name}</p>
            <p>管理者: 山田 太郎</p>
          </div>
        </div>
      </div>
    </div>
  );
});

ServiceRecordSheet.displayName = "ServiceRecordSheet";