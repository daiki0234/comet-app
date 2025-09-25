// src/app/qr-test/page.tsx

"use client";

import { Html5QrcodeScanner } from 'html5-qrcode';
import React, { useState, useEffect } from 'react';

const qrcodeRegionId = "html5qr-code-full-region";

const QrCodeScanner = ({ onScanSuccess, onScanFailure }: { onScanSuccess: (decodedText: string) => void, onScanFailure: (error: any) => void }) => {
  useEffect(() => {
    const html5QrcodeScanner = new Html5QrcodeScanner(
      qrcodeRegionId,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);

    // コンポーネントがアンマウントされたときにスキャナをクリーンアップ
    return () => {
      html5QrcodeScanner.clear().catch(error => {
        console.error("Failed to clear html5QrcodeScanner.", error);
      });
    };
  }, [onScanSuccess, onScanFailure]);

  return <div id={qrcodeRegionId} />;
};

export default function QrTestPage() {
  const [result, setResult] = useState('No result');

  const handleScanSuccess = (decodedText: string) => {
    console.log(`Scan successful, result: ${decodedText}`);
    setResult(decodedText);
  };

  const handleScanFailure = (error: any) => {
    // console.warn(`Scan failure, error: ${error}`);
  };

  return (
    <div style={{ padding: '50px' }}>
      <h1>QRスキャナー 最終テスト</h1>
      <div style={{ width: '400px', margin: '20px', border: '1px solid #ccc' }}>
        <QrCodeScanner
          onScanSuccess={handleScanSuccess}
          onScanFailure={handleScanFailure}
        />
      </div>
      <hr />
      <h2>スキャン結果:</h2>
      <p>{result}</p>
    </div>
  );
}