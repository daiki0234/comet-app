import React from 'react';

type RecordData = {
  userName: string;
  date: string;
  usageStatus: '放課後' | '休校日' | '欠席' ;
  notes?: string;
};

// ★修正1: index（何番目のデータか）を受け取れるようにします
type Props = { 
  record: RecordData | null;
  index?: number; // 追加
};

export const ServiceRecordSheet = ({ record, index = 0 }: Props) => {
  const SHEET_HEIGHT = '128mm'; 
  const SHEET_WIDTH = '182mm';

  // ★修正2: 偶数(0, 2, 4...)は上段、奇数(1, 3, 5...)は下段
  // つまり、「偶数のときだけ」線を表示します。
  // (indexは0始まりなので、0番目=上段=線あり、1番目=下段=線なし)
  const showCutLine = index % 2 === 0;

  if (!record) {
    return <div style={{ height: SHEET_HEIGHT, width: SHEET_WIDTH, boxSizing: 'border-box' }}></div>;
  }

  const date = new Date(record.date + 'T00:00:00');
  const dateStr = `令和 ${date.getFullYear() - 2018}年 ${date.getMonth() + 1}月 ${date.getDate()}日 (${['日','月','火','水','木','金','土'][date.getDay()]})`;

  const baseFontSize = '9pt';
  const tdStyle: React.CSSProperties = { 
    border: '1px solid #333', 
    padding: '3px',
    verticalAlign: 'top', 
    fontSize: baseFontSize 
  };

  return (
    <>
      <style>{`
        @media print {
          @page { size: B5 portrait; margin: 0; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <div style={{ 
        height: SHEET_HEIGHT, 
        width: SHEET_WIDTH,
        boxSizing: 'border-box', 
        padding: '6mm', 
        paddingLeft: '15mm', 
        color: 'black', 
        backgroundColor: 'white', 
        fontFamily: "'Noto Sans JP', sans-serif",
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* --- (中身のテーブル部分は変更なし) --- */}
        <table style={{ width: '100%', border: 'none', borderCollapse: 'collapse', marginBottom:'8px' }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ border: 'none', width: '70px', verticalAlign: 'bottom' }}>
                <img src="/images/logo.png" alt="logo" style={{ width: '70px' }} />
              </td>
              <td style={{ border: 'none', verticalAlign: 'center', paddingBottom: '5px', paddingLeft:'15px' }}>
                <h2 style={{ textAlign: 'left', margin: 0, fontSize: '14pt', letterSpacing: '2px', fontWeight: 'bold' }}>サービス提供記録</h2>
              </td>
              <td style={{ border: 'none', textAlign: 'right', verticalAlign:'center', fontSize: '9pt', width: '180px' }}>
                ハッピーテラス俊徳道教室
              </td>
            </tr>
            <tr>
              <td style={{ width: 'auto', textAlign:'right', fontSize: '9pt' }}>利用児童名</td>
              <td style={{ width: 'auto', fontSize: '11pt', paddingLeft: '10px', textAlign:'center' }}>{record.userName}</td>
              <td style={{ width: '30px', fontSize: '9pt' }}>様</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black', marginTop: '2px'}}>
          <tbody>
            <tr>
              <td colSpan={2} style={{...tdStyle, width:'60px', backgroundColor: '#f2f2f2', textAlign:'center', verticalAlign:'center', paddingBottom:'2px'}}>利用日</td>
              <td colSpan={3} style={{...tdStyle, height:'35px'}}>
                {dateStr}
                <span style={{ marginLeft: '15px' }}>
                  <input type="checkbox" checked={record.usageStatus === '放課後'} readOnly style={{ display:'inline-block', transform: 'scale(1.1)', marginRight: '4px', marginTop:'8px', verticalAlign: 'center' }}/>
                  <label style={{ verticalAlign: 'center' }}>放課後</label>
                </span>
                <span style={{ marginLeft: '10px' }}>
                  <input type="checkbox" checked={record.usageStatus === '休校日'} readOnly style={{ display:'inline-block', transform: 'scale(1.1)', marginRight: '4px', marginTop:'8px', verticalAlign: 'center' }}/>
                  <label style={{ verticalAlign: 'center' }}>休校日</label>
                </span>
              </td>
            </tr>
            <tr>
              <td colSpan={2} rowSpan={2} style={{...tdStyle, width:'60px', backgroundColor: '#f2f2f2', verticalAlign:'center', textAlign:'center'}}>様子など</td>
              <td colSpan={4} style={{...tdStyle, height: '50px', verticalAlign: 'center' }}>
                <div style={{ marginBottom: '4px' }}>◎ 体　調【　　　　　　良好　　　　　　　　　】</div>
                <div>◎ 活　動【挨拶・体操　　　　　　　　　　　　　　　　　　　　】</div>
              </td>
            </tr>
            <tr>
              <td colSpan={4} style={{...tdStyle, height: '80px' }}></td>
            </tr>
            <tr>
              <td colSpan={2} style={{...tdStyle, width:'60px', backgroundColor: '#f2f2f2', verticalAlign:'center', textAlign:'center'}}>ご家庭より</td>
              <td colSpan={4} style={{ ...tdStyle, height: '60px' }}></td>
            </tr>
            <tr>
              <td colSpan={2} style={{...tdStyle, width:'60px', backgroundColor: '#f2f2f2', verticalAlign:'center', textAlign:'center'}}>特記事項</td>
              <td style={{ ...tdStyle, height: '60px' }}>{record.notes}</td>
              <td style={{ border: '1px solid black', padding: 0, width: '130px' }}>
                <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                  <tbody>
                    <tr>
                      <td style={{ borderBottom: '1px solid black', fontSize: '7pt', verticalAlign:'top', height: '25px', width:'43px'}}>記録</td>
                      <td style={{ borderBottom: '1px solid black', borderLeft: '1px solid black', verticalAlign:'top', fontSize: '7pt', width:'43px'}}>責任者</td>
                      <td style={{ borderBottom: '1px solid black', borderLeft: '1px solid black', verticalAlign:'top', fontSize: '7pt', width:'43px'}}>保護者印</td>
                    </tr>
                    <tr style={{ height: '35px' }}>
                      <td style={{}}></td>
                      <td style={{ borderLeft: '1px solid black', verticalAlign: 'middle' }}>
                        <img src="/images/maeda.gif" alt="maeda_seal" style={{ width: '25px', margin: 'auto' }} />
                      </td>
                      <td style={{ borderLeft: '1px solid black' }}></td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
        {/* -------------------------------------- */}

        {/* ★修正3: showCutLineがtrueのときだけ表示 */}
        {showCutLine && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            borderBottom: '1px dashed #999', 
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            pointerEvents: 'none'
          }}>
            <span style={{ 
              fontSize: '8px', 
              color: '#999', 
              backgroundColor: 'white', 
              padding: '0 5px',
              marginBottom: '-6px' 
            }}>
              {/* キリトリセン */}
            </span>
          </div>
        )}
      </div>
    </>
  );
};