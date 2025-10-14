import React from 'react';

type RecordData = {
  userName: string;
  date: string;
  usageStatus: '放課後' | '休校日' | '欠席' | null ;
  notes?: string;
};

type Props = { record: RecordData | null };

export const ServiceRecordSheet = ({ record }: Props) => {
  // データがない場合は、レイアウトを崩さないための空のボックス
  if (!record) {
    return <div style={{ height: '148.5mm', boxSizing: 'border-box' }}></div>;
  }

  const date = new Date(record.date + 'T00:00:00');
  const dateStr = `令和 ${date.getFullYear() - 2018}年 ${date.getMonth() + 1}月 ${date.getDate()}日 (${['日','月','火','水','木','金','土'][date.getDay()]})`;

  const tdStyle: React.CSSProperties = { border: '1px solid #333', padding: '4px', verticalAlign: 'top', fontSize: '10pt' };
  const verticalTextStyle: React.CSSProperties = { ...tdStyle, textAlign: 'center', writingMode: 'vertical-rl', width: '20px', padding: '2px', letterSpacing: '2px', fontWeight: 'normal' };

  return (
    <div style={{ height: '148.5mm', width: '100%', boxSizing: 'border-box', padding: '8mm', paddingLeft: '20mm', color: 'black', backgroundColor: 'white', fontFamily: "'Noto Sans JP', sans-serif" }}>
      <table style={{ width: '100%', border: 'none', borderCollapse: 'collapse',marginBottom:'10px' }}>
        <tbody>
          <tr>
            <td rowSpan={2} style={{ border: 'none', width: '80px', verticalAlign: 'bottom' }}>
              <img src="/images/logo.png" alt="logo" style={{ width: '80px' }} />
            </td>
            <td style={{ border: 'none', verticalAlign: 'center', paddingBottom: '5px',paddingLeft:'20px' }}>
              <h2 style={{ textAlign: 'left', margin: 0, fontSize: '16pt', letterSpacing: '2px', fontWeight: 'bold' }}>サービス提供記録</h2>
            </td>
            <td style={{ border: 'none', textAlign: 'right', verticalAlign:'center', fontSize: '10pt', width: '200px' }}>
              ハッピーテラス俊徳道教室
            </td>
          </tr>
          <tr>
            <td style={{ width: 'auto',textAlign:'right'}}>利用児童名</td>
            <td style={{ width: 'auto', fontSize: '12pt', paddingLeft: '10px' ,textAlign:'center'}}>{record.userName}</td>
            <td style={{ width: '30px'}}>様</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black', marginTop: '5px'}}>
        <tbody>
          <tr>
            <td colSpan={2} style={{...tdStyle, width:'70px',backgroundColor: '#f2f2f2', textAlign:'center',verticalAlign:'center',paddingBottom:'5px'}}>利用日</td>
            <td colSpan={3} style={{...tdStyle, height:'40px'}}>
              {dateStr}
              <span style={{ marginLeft: '20px' }}>
                <input type="checkbox" checked={record.usageStatus === '放課後'} readOnly style={{ display:'inline-block', transform: 'scale(1.2)', marginRight: '4px',marginTop:'10px',verticalAlign: 'center' }}/>
                <label style={{ verticalAlign: 'center' }}>放課後</label>
              </span>
              <span style={{ marginLeft: '10px' }}>
                <input type="checkbox" checked={record.usageStatus === '休校日'} readOnly style={{ display:'inline-block',transform: 'scale(1.2)', marginRight: '4px',marginTop:'10px',verticalAlign: 'center' }}/>
                <label style={{ verticalAlign: 'center' }}>休校日</label>
              </span>
            </td>
          </tr>
          <tr>
            <td colSpan={2} rowSpan={2} style={{...tdStyle, width:'70px',backgroundColor: '#f2f2f2',verticalAlign:'center', textAlign:'center'}}>様子など</td>
            <td colSpan={4} style={{...tdStyle, height: '60px',verticalAlign: 'center' }}>
              <div style={{ marginBottom: '5px' }}>◎ 体　調【　　　　　　良好　　　　　　　　　】</div>
              <div>◎ 活　動【挨拶・体操　　　　　　　　　　　　　　　　　　　　】</div>
            </td>
          </tr>
          <tr>
            <td colSpan={4} style={{...tdStyle, height: '100px' }}></td>
          </tr>
          <tr>
            <td colSpan={2} style={{...tdStyle, width:'70px', backgroundColor: '#f2f2f2',verticalAlign:'center', textAlign:'center'}}>ご家庭より</td>
            <td colSpan={4} style={{ ...tdStyle, height: '80px' }}></td>
          </tr>
          <tr>
            <td colSpan={2} style={{...tdStyle, width:'70px', backgroundColor: '#f2f2f2',verticalAlign:'center', textAlign:'center'}}>特記事項</td>
            <td style={{ ...tdStyle, height: '80px' }}>{record.notes}</td>
            <td style={{ border: '1px solid black', padding: 0, width: '150px' }}>
              <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                <tbody>
                  <tr>
                    <td style={{ borderBottom: '1px solid black', fontSize: '8pt', verticalAlign:'top', height: '30px' ,width:'50px'}}>記録</td>
                    <td style={{ borderBottom: '1px solid black', borderLeft: '1px solid black',verticalAlign:'top', fontSize: '8pt' ,width:'50px'}}>責任者</td>
                    <td style={{ borderBottom: '1px solid black', borderLeft: '1px solid black', verticalAlign:'top',fontSize: '8pt' ,width:'50px'}}>保護者印</td>
                  </tr>
                  <tr style={{ height: '40px' }}>
                    <td style={{}}></td>
                    <td style={{ borderLeft: '1px solid black', verticalAlign: 'middle' }}>
                      <img src="/images/maeda.gif" alt="maeda_seal" style={{ width: '30px', margin: 'auto' }} />
                    </td>
                    <td style={{ borderLeft: '1px solid black' }}></td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

