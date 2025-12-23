"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ★★★ 修正点： マップにすべてのページ定義を追加 ★★★
const breadcrumbNameMap: { [key: string]: string } = {
  '/dashboard': 'ダッシュボード',
  '/calendar': 'カレンダー',
  
  // 出欠記録関連
  '/attendance': '出欠記録',
  '/attendance/register-absence': '別日の欠席登録',
  '/attendance/user-status': '利用者別出欠状況',
  
  // 欠席管理
  '/absence-management': '欠席管理',

  // 利用者管理関連
  '/users': '利用者管理',
  '/users/new': '新規登録',
  
  // マスタ・設定関連
  '/masters': 'サービス情報マスタ',
  '/admin-settings': '職員管理',
  '/operations': '運営管理',
  
  // 支援管理関連
  '/support': '支援管理',
  
  // 支援記録
  '/support/records': '支援記録',
 '/support/records/new': '新規作成', // 支援記録の新規作成ページがある場合はコメントアウトを外してください
  
  // 個別支援計画
  '/support/plans': '個別支援計画',
  '/support/plans/new': '新規作成',
  
  // モニタリング
  '/support/monitoring': 'モニタリング',
  '/support/monitoring/new': '新規作成',
  
  // ケース担当者会議 (★追加)
  '/support/case-meetings': 'ケース担当者会議',
  '/support/case-meetings/new': '新規作成',

  '/business-journal': '業務日誌',
  '/analysis': 'AI分析',

  '/billing': '請求管理',
  '/billing/records': '実績チェック',
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const pathSegments = pathname.split('/').filter(segment => segment);

  return (
    <nav aria-label="breadcrumb" className="mb-6 text-sm text-gray-500">
      <ol className="flex items-center space-x-2">
        <li>
          <Link href="/dashboard" className="hover:underline">ホーム</Link>
        </li>
        {pathSegments.map((segment, index) => {
          const href = `/${pathSegments.slice(0, index + 1).join('/')}`;
          const isLast = index === pathSegments.length - 1;
          
          // 定義があればその名前を、なければ「詳細」を表示
          // (例: /users/abc12345 のようなID部分は '詳細' になります)
          const name = breadcrumbNameMap[href] || '詳細';

          return (
            <li key={href} className="flex items-center">
              <span className="mx-2">/</span>
              {isLast ? (
                <span className="font-semibold text-gray-800">{name}</span>
              ) : (
                <Link href={href} className="hover:underline">{name}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}