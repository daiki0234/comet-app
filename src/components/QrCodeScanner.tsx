'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

type Props = {
  onScanSuccess: (text: string) => void;
  onScanFailure?: (err: string) => void;
  /** スキャン枠の基準サイズ(px)。正方形でレンダリングします */
  boxSize?: number;
};

const isiOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

export default function QrCodeScanner({
  onScanSuccess,
  onScanFailure,
  boxSize = 280,
}: Props) {
  const regionIdRef = useRef('qr-reader-' + Math.random().toString(36).slice(2));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);

  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'stopped' | 'error'>('idle');
  const lastErrorRef = useRef<string | null>(null);

  /** video/canvas を親ボックスにフィット（中央トリミング） */
  const fitMediaElements = useCallback(() => {
    const region = document.getElementById(regionIdRef.current);
    if (!region) return;
    const nodes = region.querySelectorAll('video,canvas') as NodeListOf<HTMLElement>;
    nodes.forEach((n) => {
      n.style.position = 'absolute';
      n.style.inset = '0';
      n.style.width = '100%';
      n.style.height = '100%';
      (n.style as any).objectFit = 'cover';
      (n.style as any).transform = 'none';
    });
  }, []);

  /** スキャナ領域(div#region)を正方形コンテナ内に絶対配置で作成 */
  const ensureRegionMounted = useCallback(() => {
    if (!containerRef.current) return;
    const existing = document.getElementById(regionIdRef.current);
    if (existing) return;

    const el = document.createElement('div');
    el.id = regionIdRef.current;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    containerRef.current.appendChild(el);
  }, []);

  /** 取りこぼしなく停止/解放 */
  const cleanup = useCallback(async () => {
    const inst = qrRef.current;
    try {
      if (inst) {
        try {
          await inst.stop(); // Promise
        } catch {
          /* ignore */
        }
        try {
          inst.clear(); // void
        } catch {
          /* ignore */
        }
      }
    } finally {
      qrRef.current = null;
      setStatus('stopped');
      if (containerRef.current) containerRef.current.innerHTML = '';
    }
  }, []);

  /** コンテナの実寸から qrbox の一辺を算出（正方形） */
  const calcBox = useCallback(() => {
    const w = containerRef.current?.clientWidth ?? boxSize;
    const h = containerRef.current?.clientHeight ?? boxSize;
    // コンテナの 85% を枠にする（余白を少し残す）
    return Math.floor(Math.min(w, h) * 0.85);
  }, [boxSize]);

  /** 起動（自動）／復帰時もここを呼ぶ */
  const startScanner = useCallback(async () => {
    setStatus('starting');
    lastErrorRef.current = null;

    await cleanup();
    ensureRegionMounted();

    const scanner = new Html5Qrcode(regionIdRef.current, { verbose: false });
    qrRef.current = scanner;

    const qrboxSize = calcBox();
    const config: any = {
      fps: 10,
      qrbox: { width: qrboxSize, height: qrboxSize }, // 常に正方形
      aspectRatio: 1.0,
      rememberLastUsedCamera: true,
    };

    const onOk = (txt: string) => onScanSuccess(txt);
    const onNg = (err: string) => onScanFailure && onScanFailure(String(err));

    // iOS Safari は facingMode が失敗しがち：まず undefined で自動選択
    const primary = isiOS() ? undefined : ({ facingMode: 'environment' } as any);

    try {
      await scanner.start(primary as any, config, onOk, onNg);
      fitMediaElements();
      setStatus('running');
      return;
    } catch (e1: any) {
      try {
        // フォールバック：カメラ列挙 → 背面/先頭を exact 指定
        const cams = await Html5Qrcode.getCameras();
        if (!cams || cams.length === 0) throw new Error('カメラが見つかりません（ブラウザのカメラ許可を確認）');
        const back = cams.find((c) => /back|environment|rear/i.test(c.label)) ?? cams[0];
        await scanner.start({ deviceId: { exact: back.id } } as any, config, onOk, onNg);
        fitMediaElements();
        setStatus('running');
        return;
      } catch (e2: any) {
        const msg = e2?.message || e1?.message || String(e2 || e1);
        lastErrorRef.current = msg;
        setStatus('error');
        await cleanup(); // 半端に掴んだカメラを解放
      }
    }
  }, [calcBox, cleanup, ensureRegionMounted, fitMediaElements, onScanFailure, onScanSuccess]);

  /** マウント時に自動起動／アンマウントで停止 */
  useEffect(() => {
    startScanner();
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** タブが非表示→停止、復帰→自動再起動 */
  useEffect(() => {
    const onVis = async () => {
      if (document.hidden) {
        await cleanup();
      } else {
        startScanner();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [cleanup, startScanner]);

  /** 端末回転でレイアウトが変わるので再調整（qrbox再計算 & fit） */
  useEffect(() => {
    const onResize = () => {
      // 実機では再起動が安定
      startScanner();
    };
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('resize', onResize);
    };
  }, [startScanner]);

  return (
    <div className="w-full">
      <div className="w-full max-w-[540px] mx-auto">
        {/* 正方形の入れ物。中に #region を絶対配置 */}
        <div ref={containerRef} className="relative aspect-square rounded-2xl overflow-hidden border border-gray-200 bg-black/5" />
      </div>

      <p className="mt-2 text-xs text-gray-600">
        {status === 'starting' && 'カメラ起動中…（HTTPS必須・カメラ許可後は自動開始）'}
        {status === 'running' && 'スキャン待機中…'}
        {status === 'stopped' && '停止中'}
        {status === 'error' && `エラー: ${lastErrorRef.current ?? '起動に失敗しました'}`}
      </p>
    </div>
  );
}