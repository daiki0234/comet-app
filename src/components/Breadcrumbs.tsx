"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const breadcrumbNameMap: { [key: string]: string } = {
  '/dashboard': 'ダッシュボード',
  '/users': '利用者管理',
  '/users/new': '新規登録',
  '/calendar': 'カレンダー',
  '/attendance': '出欠記録',
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
          
          // IDなどの動的なセグメントは、今のところ「詳細」と表示します
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