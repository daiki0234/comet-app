'use client';

import { useEffect, useRef } from 'react';
import { Html5Qrcode /*, Html5QrcodeSupportedFormats*/ } from 'html5-qrcode';

type Props = {
  onScanSuccess: (text: string) => void;
  onScanFailure?: (err: string) => void;
  boxSize?: number; // 任意: スキャン枠の大きさ(px)
};

export function QrCodeScanner({ onScanSuccess, onScanFailure, boxSize = 250 }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const regionId = 'qr-reader-' + Math.random().toString(36).slice(2);

  useEffect(() => {
    if (!mountRef.current) return;

    const el = document.createElement('div');
    el.id = regionId;
    mountRef.current.appendChild(el);

    const scanner = new Html5Qrcode(regionId, { verbose: false });
    qrRef.current = scanner;

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

    const config = {
      fps: 10,
      // qrbox: 固定値だと小画面で潰れるので関数に
      qrbox: (vw: number, vh: number) => Math.min(vw, vh, boxSize) as any,
      aspectRatio: 1.0,
      rememberLastUsedCamera: true,
      // formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    } as any;

    // iOS Safari は facingMode が無視される/失敗することがある
    const primaryStart = isIOS ? undefined : { facingMode: 'environment' };

    const startWith = async () => {
      try {
        await scanner.start(
          primaryStart as any,
          config,
          (txt) => onScanSuccess(txt),
          (err) => onScanFailure && onScanFailure(String(err))
        );
      } catch (e1: any) {
        // フォールバック：列挙して「背面」っぽいカメラ or 先頭を明示指定
        try {
          const devices = await Html5Qrcode.getCameras();
          const back =
            devices.find((d) => /back|environment|rear/i.test(d.label)) ?? devices[0];
          if (!back) throw new Error('カメラが見つかりません');
          await scanner.start(
            { deviceId: { exact: back.id } } as any,
            config,
            (txt) => onScanSuccess(txt),
            (err) => onScanFailure && onScanFailure(String(err))
          );
        } catch (e2: any) {
          onScanFailure && onScanFailure(e2?.message || String(e2));
        }
      }
    };

    startWith();

    return () => {
      (async () => {
        try {
          if (qrRef.current) {
            await qrRef.current.stop();
            await qrRef.current.clear();
          }
        } catch {}
        // DOM掃除
        if (mountRef.current) mountRef.current.innerHTML = '';
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={mountRef} className="w-full grid place-items-center">
      <div className="text-xs text-gray-500">カメラ起動中…（iPadはカメラ許可＆HTTPS必須）</div>
    </div>
  );
}
