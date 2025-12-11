import { ImageResponse } from 'next/og';

// 画像のメタデータ
export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

// アイコン生成関数
export default function Icon() {
  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div
        style={{
          fontSize: 24,
          background: '#2563EB', // blue-600
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          borderRadius: '8px', // 角丸
        }}
      >
        {/* SVGでロゴマークを描画 */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 32 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 白い軌跡 */}
          <path
            d="M32 20C32 28.8 24.8 36 16 36C7.2 36 0 28.8 0 20C0 11.2 7.2 4 16 4"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* 黄色い星 */}
          <circle cx="32" cy="10" r="5" fill="#FACC15" />
        </svg>
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  );
}