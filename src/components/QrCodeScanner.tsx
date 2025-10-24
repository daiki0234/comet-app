'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

type Props = {
  onScanSuccess: (text: string) => void;
  onScanFailure?: (err: string) => void;
  boxSize?: number;
};

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

export default function QrCodeScanner({ onScanSuccess, onScanFailure, boxSize = 280 }: Props) {
  const regionIdRef = useRef('qr-reader-' + Math.random().toString(36).slice(2));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const [status, setStatus] = useState<'idle'|'starting'|'running'|'stopped'|'error'>('idle');
  const lastErrorRef = useRef<string | null>(null);

  const cleanup = useCallback(async () => {
  const inst = qrRef.current;
  try {
    if (inst) {
      // start 済みでなくても stop は安全（Promise）
      try { await inst.stop(); } catch { /* ignore */ }

      // clear は型上 void 扱いなので await / .catch を付けない
      try { inst.clear(); } catch { /* ignore */ }
    }
  } finally {
    qrRef.current = null;
    setStatus('stopped');
    if (containerRef.current) containerRef.current.innerHTML = '';
  }
}, []);

  const ensureRegionMounted = useCallback(() => {
    if (!containerRef.current) return;
    // 二重作成防止
    const existing = document.getElementById(regionIdRef.current);
    if (existing) return;
    const el = document.createElement('div');
    el.id = regionIdRef.current;
    containerRef.current.appendChild(el);
  }, []);

  const startScanner = useCallback(async () => {
    setStatus('starting');
    lastErrorRef.current = null;

    await cleanup();              // 前回の取りこぼしを確実に掃除
    ensureRegionMounted();        // 表示領域を用意

    const scanner = new Html5Qrcode(regionIdRef.current, { verbose: false });
    qrRef.current = scanner;

const config: any = {
  fps: 10,
  // 以前: qrbox: (vw, vh) => Math.min(vw, vh, boxSize),
  qrbox: { width: boxSize, height: boxSize }, // ← こっちが安定
  aspectRatio: 1.0,
  rememberLastUsedCamera: true,
};

    const onOk = (txt: string) => onScanSuccess(txt);
    const onNg = (err: string) => onScanFailure && onScanFailure(String(err));

    // iOS は facingMode が失敗しがちなので undefined から試す
    const primary = isIOS() ? undefined : ({ facingMode: 'environment' } as any);

    try {
      await scanner.start(primary as any, config, onOk, onNg);
      setStatus('running');
      return;
    } catch (e1: any) {
      // フォールバック：カメラ列挙 → 背面/先頭を exact 指定
      try {
        const cams = await Html5Qrcode.getCameras();
        if (!cams || cams.length === 0) throw new Error('カメラが見つかりません（ブラウザ権限を確認）');
        const back = cams.find(c => /back|environment|rear/i.test(c.label)) ?? cams[0];
        await scanner.start({ deviceId: { exact: back.id } } as any, config, onOk, onNg);
        setStatus('running');
        return;
      } catch (e2: any) {
        const msg = (e2?.message || e1?.message || String(e2 || e1));
        lastErrorRef.current = msg;
        setStatus('error');
        // 失敗後に中途半端にカメラが掴まれてると次回復帰しないので、必ず掃除
        await cleanup();
      }
    }
  }, [boxSize, cleanup, ensureRegionMounted, onScanSuccess, onScanFailure]);

  // マウント時に自動起動、アンマウント時は確実に停止
  useEffect(() => {
    startScanner();
    return () => { cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タブが非表示になったら一時停止、復帰で自動再起動
  useEffect(() => {
    const onVis = async () => {
      if (document.hidden) {
        await cleanup();
      } else {
        // 権限済みなら自動で再起動
        startScanner();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [cleanup, startScanner]);

  return (
    <div className="w-full">
    {/* ▼高さを明示（ここが重要） */}
    <div
  ref={containerRef}
  className="w-full rounded-lg overflow-hidden border border-gray-200 bg-white"
  style={{ width: '100%', maxWidth: 540, height: boxSize + 40 }} // iPadでちょうど良いサイズ感
/>
    <p className="mt-2 text-xs text-gray-600">
      {status === 'starting' && 'カメラ起動中…（HTTPS必須・カメラ許可後は自動で開始）'}
      {status === 'running' && 'スキャン待機中…'}
      {status === 'stopped' && '停止中'}
      {status === 'error' && `エラー: ${lastErrorRef.current ?? '起動に失敗しました'}`}
    </p>
  </div>
  );
}
