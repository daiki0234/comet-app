"use client";

import React, { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/firebase';
import { signOut } from 'firebase/auth';
import { Breadcrumbs } from './Breadcrumbs';
import { Toaster } from 'react-hot-toast'; // ★ Toasterをインポート

// (アイコンSVGコンポーネントは変更なし)
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
const CheckSquareIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>;
const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;
const LogOutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>;

export function AppLayout({ children, pageTitle }: { children: ReactNode, pageTitle: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("ログアウトエラー:", error);
    }
  };

const menuItems = [
    { href: '/dashboard', label: 'ダッシュボード', icon: <HomeIcon /> },
    { href: '/calendar', label: 'カレンダー', icon: <CalendarIcon /> },
    { 
      href: '/attendance', 
      label: '出欠記録', 
      icon: <CheckSquareIcon />,
      // ★★★ サブメニューを追加 ★★★
      subMenu: [
        { href: '/attendance/register-absence', label: '別日の欠席登録' },
      ]
    },
    { href: '/users', label: '利用者管理', icon: <UsersIcon /> },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* ★★★ Toasterをここに追加 ★★★ */}
      <Toaster position="top-right" reverseOrder={false} />
      
      {/* サイドバー */}
      <aside className="w-64 flex-shrink-0 bg-white shadow-lg flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <Link href="/dashboard">
            <h1 className="text-3xl font-bold text-blue-600">Comet</h1>
          </Link>
        </div>
        <nav className="flex-1 px-4 py-4">
          <ul>
            {menuItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href} className="mb-2">
                  <Link href={item.href} className={`flex items-center p-3 rounded-lg transition-colors ${isActive ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {item.icon}
                    <span className="ml-4 text-sm font-medium">{item.label}</span>
                  </Link>
                  {/* ★★★ サブメニューの表示ロジック ★★★ */}
                  {item.subMenu && isActive && (
                    <ul className="pl-10 mt-2 space-y-2">
                      {item.subMenu.map(subItem => (
                        <li key={subItem.href}>
                          <Link href={subItem.href} className={`text-sm ${pathname === subItem.href ? 'text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-800'}`}>
                            {subItem.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button onClick={handleLogout} className="flex items-center w-full p-3 rounded-xl text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            <span className="w-6 h-6"><LogOutIcon /></span>
            <span className="ml-4 text-sm font-medium">ログアウト</span>
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-10 p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">{pageTitle}</h2>
        </header>
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <Breadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
}

