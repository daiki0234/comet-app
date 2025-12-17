import React from 'react';
import { ValidationResult } from '@/types/billing';

type Props = {
  data: ValidationResult | null;
  month: string;
};

export const ServiceRecordSheet = React.forwardRef<HTMLDivElement, Props>(({ data, month }, ref) => {
  if (!data) return null;
  
  const [year, m] = month.split('-');
  const daysInMonth = new Date(Number(year), Number(m), 0).getDate();
  const dateList = Array.from({ length: daysInMonth }, (_, i) => i + 1);

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

  let totalUsage = 0;

  return (
    // A4サイズ固定・余白0設定
    <div ref={ref} className="bg-white text-black font-serif w-[210mm] h-[297mm] relative page-break text-[10px] leading-tight overflow-hidden">
      
      {/* 印刷用CSS: 余白を強制的に0にする */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; }
        }
        .vertical-text {
          writing-mode: vertical-rl;
          text-orientation: upright;
          letter-spacing: 0.05em;
          margin: 0 auto;
          font-size: 8px;
        }
        /* テーブルの罫線を細くする */
        table, th, td {
          border-width: 0.5px !important;
          border-color: #000 !important;
        }
      `}</style>

      {/* コンテンツエリア (内側に10mm〜15mmの余白を擬似的に設ける) */}
      <div className="w-full h-full p-[12mm] flex flex-col justify-between">

        {/* --- 上部エリア --- */}
        <div>
          <h1 className="text-center font-bold text-base mb-1 border-b border-black pb-1">
            放課後等デイサービス提供実績記録票
          </h1>
          
          {/* 基本情報 */}
          <div className="flex justify-between items-end mb-1 h-[18mm]">
            <div className="font-bold text-sm mb-1">
              {year}年 {Number(m)}月分
            </div>
            
            <div className="flex flex-col items-end gap-1 text-[9px] w-[80%]">
               <div className="grid grid-cols-2 w-full gap-2 border-b border-dotted border-gray-400 pb-1">
                 <div className="flex justify-between">
                   <span>受給者証番号:</span>
                   <span className="font-mono font-bold ml-2 text-xs">{data.user.jukyushaNo || '__________'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span>支給市町村:</span>
                   <span className="ml-2">{data.user.cityNo || '_____'}</span>
                 </div>
               </div>
               <div className="grid grid-cols-2 w-full gap-2">
                 <div className="flex justify-between">
                   <span>児童氏名:</span>
                   <span className="font-bold text-xs ml-2">{data.user.lastName} {data.user.firstName}</span>
                 </div>
                 <div className="flex justify-between">
                   <span>負担上限月額:</span>
                   <span className="ml-2 font-bold">{data.upperLimit ? `${data.upperLimit.toLocaleString()}円` : '0円'}</span>
                 </div>
               </div>
            </div>
          </div>

          {/* --- テーブル --- */}
          <table className="w-full border-collapse border border-black text-center table-fixed text-[8px]">
            <thead>
              <tr className="bg-gray-100 h-[18mm] align-middle">
                <th className="border border-black w-[3%]">日<br/>付</th>
                <th className="border border-black w-[3%]">曜<br/>日</th>
                <th className="border border-black w-[8%]">サービス<br/>提供の<br/>状況</th>
                <th className="border border-black w-[4%]">提供<br/>形態</th>
                <th className="border border-black w-[6%]">開始<br/>時間</th>
                <th className="border border-black w-[6%]">終了<br/>時間</th>
                <th className="border border-black w-[4%]">算定<br/>時間</th>
                
                {/* 加算項目 (縦書き) */}
                <th className="border border-black w-[4%] pt-1">
                  <div className="h-full flex flex-col justify-end items-center">
                    <span className="vertical-text" style={{height:'12mm'}}>送迎加算</span>
                    <div className="border-t border-black text-[6px] w-full text-center">往復</div>
                  </div>
                </th>
                <th className="border border-black w-[3%]"><div className="vertical-text h-[16mm]">家族支援</div></th>
                <th className="border border-black w-[3%]"><div className="vertical-text h-[16mm]">医療連携</div></th>
                <th className="border border-black w-[3%]"><div className="vertical-text h-[16mm]">延長支援</div></th>
                <th className="border border-black w-[3%]"><div className="vertical-text h-[16mm]">集中的</div></th>
                <th className="border border-black w-[3%]"><div className="vertical-text h-[16mm]">専門的</div></th>
                <th className="border border-black w-[3%]"><div className="vertical-text h-[16mm]">通所自立</div></th>
                <th className="border border-black w-[3%]"><div className="vertical-text h-[16mm]">入浴支援</div></th>
                <th className="border border-black w-[3%]"><div className="vertical-text h-[16mm]">子育て</div></th>
                <th className="border border-black w-[3%]"><div className="vertical-text h-[16mm]">自立</div></th>
                
                <th className="border border-black w-[7%]">保護者等<br/>確認印</th>
                <th className="border border-black w-auto">備考</th>
              </tr>
            </thead>
            <tbody>
              {/* 31日分ループ */}
              {Array.from({ length: 31 }).map((_, index) => {
                const day = index + 1;
                
                // 存在しない日付は斜線などを入れたいが、今回は空行
                if (day > daysInMonth) {
                   return <tr key={day} className="h-[5.8mm] border border-black"><td colSpan={19} className="bg-gray-100"></td></tr>;
                }

                const rec = getRecord(day);
                const wd = getDayOfWeek(day);
                const isSun = wd === '日';
                
                let status = ''; 
                let typeCode = ''; 
                let arrival = '';
                let departure = '';
                let hours = '';
                
                let trans = ''; 
                let family = ''; 
                let medical = ''; 
                let extension = ''; 
                let intensive = ''; 
                let special = ''; 
                let independence = ''; 
                let bath = ''; 
                let childcare = ''; 
                let selfReliance = ''; 

                if (rec) {
                  if (rec.usageStatus === '放課後') {
                    status = '授業終了後';
                    typeCode = '1';
                    totalUsage++;
                  } else if (rec.usageStatus === '休校日') {
                    status = '休業日';
                    typeCode = '2';
                    totalUsage++;
                  } else if (rec.usageStatus === '欠席') {
                    status = '欠席時対応';
                  }

                  if (rec.usageStatus !== '欠席') {
                    arrival = rec.arrivalTime || '';
                    departure = rec.departureTime || '';
                    if (arrival) trans = '1'; 

                    if ((rec as any).extension) {
                       const extVal = (rec as any).extension;
                       extension = typeof extVal === 'object' ? String(extVal.class || '') : String(extVal);
                    }

                    if (rec.hasFamilySupport) family = '1';
                    if (rec.hasIndependenceSupport) independence = '1';
                  }
                }

                return (
                  <tr key={day} className="h-[5.8mm] border border-black hover:bg-none">
                    <td className="border-r border-black">{day}</td>
                    <td className={`border-r border-black ${isSun ? 'text-red-600 font-bold' : ''}`}>{wd}</td>
                    <td className="border-r border-black text-[7px] overflow-hidden whitespace-nowrap px-[1px]">{status}</td>
                    <td className="border-r border-black">{typeCode}</td>
                    <td className="border-r border-black text-[8px]">{arrival}</td>
                    <td className="border-r border-black text-[8px]">{departure}</td>
                    <td className="border-r border-black">{hours}</td>
                    
                    <td className="border-r border-black">{trans}</td>
                    <td className="border-r border-black">{family}</td>
                    <td className="border-r border-black">{medical}</td>
                    <td className="border-r border-black font-bold">{extension}</td>
                    <td className="border-r border-black">{intensive}</td>
                    <td className="border-r border-black">{special}</td>
                    <td className="border-r border-black">{independence}</td>
                    <td className="border-r border-black">{bath}</td>
                    <td className="border-r border-black">{childcare}</td>
                    <td className="border-r border-black">{selfReliance}</td>
                    
                    <td className="border-r border-black"></td> 
                    <td className="border-r border-black"></td> 
                  </tr>
                );
              })}
              
              {/* 合計行 */}
              <tr className="bg-gray-50 h-[6mm] border-t border-black font-bold">
                <td colSpan={2} className="border-r border-black">合計</td>
                <td className="border-r border-black text-center">{totalUsage}回</td>
                <td colSpan={4} className="border-r border-black bg-gray-200"></td>
                
                {/* 加算合計欄 (背景斜線代わりにグレー) */}
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
                
                <td className="border-r border-black bg-gray-200"></td>
                <td className="border-r border-black bg-gray-200"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* --- フッター (最下部に配置) --- */}
        <div className="border border-black p-2 flex justify-between items-end text-[10px] h-[25mm]">
          <div className="w-2/3">
            <p className="mb-4 text-xs">上記の内容に相違ありません。</p>
            <div className="flex items-end gap-2 ml-4">
              <span className="mb-1 text-xs">保護者氏名</span>
              <div className="border-b border-black border-dashed w-48 h-6 mb-1"></div>
              <span className="mb-1 text-xs">印</span>
            </div>
          </div>
          <div className="w-1/3 text-right leading-relaxed">
            <p className="font-bold text-[10px] mb-1">{provider.name}</p>
            <p>事業者番号: {provider.number}</p>
            <p>管理者: 山田 太郎</p>
          </div>
        </div>

      </div>
    </div>
  );
});

ServiceRecordSheet.displayName = "ServiceRecordSheet";