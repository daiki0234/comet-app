'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

type Props = {
  onScanSuccess: (text: string) => void;
  onScanFailure?: (err: string) => void;
  boxSize?: number;
};

function isiOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
}

export default function QrCodeScanner({ onScanSuccess, onScanFailure, boxSize = 260 }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const [regionId] = useState(() => 'qr-reader-' + Math.random().toString(36).slice(2));
  const [running, setRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>('');

  const cleanup = useCallback(async () => {
    try {
      if (qrRef.current) {
        if (running) {
          await qrRef.current.stop();
        }
        await qrRef.current.clear();
      }
    } catch {
      // ignore
    } finally {
      qrRef.current = null;
      setRunning(false);
    }
  }, [running]);

  // 初期DOMマウント
  useEffect(() => {
    if (!mountRef.current) return;
    const el = document.createElement('div');
    el.id = regionId;
    mountRef.current.appendChild(el);
    return () => {
      cleanup();
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [regionId, cleanup]);

  const startScan = useCallback(async () => {
    setLastError(null);

    // 一旦安全に後始末
    await cleanup();

    const el = document.getElementById(regionId);
    if (!el) return;

    const scanner = new Html5Qrcode(regionId, { verbose: false });
    qrRef.current = scanner;

    const config: any = {
      fps: 10,
      qrbox: (vw: number, vh: number) => Math.min(vw, vh, boxSize),
      aspectRatio: 1.0,
      rememberLastUsedCamera: true,
    };

    // iOS では facingMode を使わず、失敗時に enumerate → deviceId 指定へフォールバック
    const primaryConstraints = isiOS() ? undefined : ({ facingMode: 'environment' } as any);

    const onSuccess = (txt: string) => {
      onScanSuccess(txt);
    };
    const onFailure = (err: string) => {
      onScanFailure && onScanFailure(err);
    };

    try {
      await scanner.start(primaryConstraints as any, config, onSuccess, onFailure);
      setRunning(true);
      setCameraLabel('');
    } catch (e1: any) {
      // フォールバック：カメラ列挙して“背面っぽい” or 先頭を exact 指定
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!devices || devices.length === 0) {
          throw new Error('カメラが見つかりません（ブラウザのカメラ許可を確認）');
        }
        const back = devices.find(d => /back|environment|rear/i.test(d.label)) ?? devices[0];
        setCameraLabel(back.label || 'default camera');
        await scanner.start({ deviceId: { exact: back.id } } as any, config, onSuccess, onFailure);
        setRunning(true);
      } catch (e2: any) {
        // Permission / NotAllowed / NotFound / Overconstrained を表示して再試行可能に
        const msg = e2?.message || e1?.message || String(e2 || e1);
        setLastError(msg);
        await cleanup();
      }
    }
  }, [boxSize, cleanup, onScanSuccess, onScanFailure, regionId]);

  const stopScan = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  return (
    <div className="w-full">
      <div ref={mountRef} className="w-full grid place-items-center rounded-lg overflow-hidden border border-gray-200 bg-white" />
      <div className="mt-2 flex items-center gap-2">
        {!running ? (
          <button
            onClick={startScan}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg"
          >
            カメラを起動
          </button>
        ) : (
          <button
            onClick={stopScan}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium px-3 py-2 rounded-lg"
          >
            停止
          </button>
        )}
        {cameraLabel && <span className="text-xs text-gray-600">使用カメラ: {cameraLabel}</span>}
      </div>

      {lastError && (
        <div className="mt-2 text-xs text-red-600">
          エラー: {lastError}
          <ul className="list-disc pl-4 mt-1 text-gray-600">
            <li>Safari のアドレスバー「Aa」→ モバイル用Webサイトを表示</li>
            <li>設定 &gt; Safari &gt; カメラ を「許可/確認」に</li>
            <li>このページのカメラ権限を「許可」に（Webサイトの設定）</li>
            <li>HTTPS でアクセス（http だとカメラ不可）</li>
          </ul>
        </div>
      )}

      {!running && !lastError && (
        <p className="text-xs text-gray-500 mt-2">iPadは初回のみカメラ許可が必要です。「カメラを起動」をタップしてください。</p>
      )}
    </div>
  );
}
