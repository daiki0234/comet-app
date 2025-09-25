"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/firebase';
import { signOut } from 'firebase/auth';

const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
const CheckSquareIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>;
const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;

export function AppLayout({ children, pageTitle }: { children: React.ReactNode, pageTitle: string }) {
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
    { href: '/dashboard', label: 'ダッシュボード' },
    { href: '/calendar', label: 'カレンダー', icon: <CalendarIcon /> },
    { href: '/attendance', label: '出欠記録', icon: <CheckSquareIcon /> },
    { href: '/users', label: '利用者管理', icon: <UsersIcon /> },
  ];

  return (
    <div className="min-h-screen bg-ios-gray-100">
      <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-50 border-b border-ios-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="text-2xl font-bold text-ios-blue">Comet</Link>
            </div>
            <nav className="hidden md:flex space-x-4">
              {menuItems.map((item) => (
                 item.href !== '/dashboard' &&
                <Link key={item.href} href={item.href} className={`flex items-center px-3 py-2 rounded-ios text-sm font-medium transition-colors ${pathname.startsWith(item.href) ? 'bg-ios-blue text-white' : 'text-gray-600 hover:bg-ios-gray-200'}`}>
                  {item.icon}
                  <span className="ml-2">{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="flex items-center">
              <button onClick={handleLogout} className="text-gray-500 hover:text-ios-blue transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 w-full">
         <h1 className="text-3xl font-bold text-gray-900 mb-6 px-4 sm:px-0">{pageTitle}</h1>
        {children}
      </main>
    </div>
  );
}
