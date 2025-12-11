import React from 'react';

// フルバージョンのロゴ（マーク＋文字）
export const Logo = ({ className = "h-8 w-auto" }: { className?: string }) => (
  // ★ 修正: viewBoxの左(-10)と幅(150)を広げて、左端が切れないように調整
  <svg className={className} viewBox="-10 0 150 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* マーク */}
    <path
      d="M32 20C32 28.8 24.8 36 16 36C7.2 36 0 28.8 0 20C0 11.2 7.2 4 16 4"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      className="text-blue-600" // ★ 青色指定
    />
    <circle cx="32" cy="10" r="4" className="text-yellow-400" fill="currentColor" />

    {/* 文字 */}
    <text
      x="44"
      y="28"
      fontFamily="sans-serif"
      fontWeight="800"
      fontSize="26"
      fill="currentColor"
      className="text-blue-600" // ★ 青色指定
      style={{ letterSpacing: '-0.02em' }}
    >
      Comet
    </text>
  </svg>
);

// マークのみ（閉じた時用）
export const LogoMarkOnly = ({ className = "h-8 w-auto" }: { className?: string }) => (
  // ★ 修正: こちらも左(-10)を広げて切れないように
  <svg className={className} viewBox="-10 0 50 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M32 20C32 28.8 24.8 36 16 36C7.2 36 0 28.8 0 20C0 11.2 7.2 4 16 4"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      className="text-blue-600"
    />
    <circle cx="32" cy="10" r="4" className="text-yellow-400" fill="currentColor" />
  </svg>
);