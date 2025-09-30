"use client";

import React, { useEffect, useRef, memo } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScannerState, Html5QrcodeScanType } from 'html5-qrcode';

// コンポーネントが受け取るプロパティの型を定義
type Props = {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure: (error: string) => void;
};

// memoでコンポーネントをラップし、不要な再描画を防ぐ
export const QrCodeScanner = memo(({ onScanSuccess, onScanFailure }: Props) => {
  // scannerのインスタンスを保持するためのref
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // 既にスキャナが存在しない場合のみ初期化
    if (!scannerRef.current) {
      const scanner = new Html5QrcodeScanner(
        "qr-reader", // このIDは呼び出し元のdivと一致させる
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
        },
        /* verbose= */ false
      );
      
      scanner.render(onScanSuccess, onScanFailure);
      scannerRef.current = scanner;
    }

    // コンポーネントが不要になった時に実行されるクリーンアップ関数
    return () => {
      if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
        scannerRef.current.clear().catch(error => {
          console.error("Failed to clear html5-qrcode-scanner.", error);
        });
        scannerRef.current = null;
      }
    };
  }, [onScanSuccess, onScanFailure]);

  // QRコードを描画するためのdiv要素
  return <div id="qr-reader" className="w-full md:w-1/2 mx-auto"></div>;
});

// displayNameを追加すると、React DevToolsでコンポーネントが見やすくなります
QrCodeScanner.displayName = 'QrCodeScanner';