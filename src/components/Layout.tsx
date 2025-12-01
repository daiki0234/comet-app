"use client";

import React, { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/firebase';
import { signOut } from 'firebase/auth';
import { Breadcrumbs } from './Breadcrumbs';
import { Toaster } from 'react-hot-toast';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext'; // Contextを利用

// --- アイコン定義 (変更なし) ---
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
const CheckSquareIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>;
const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>;
// ログアウトアイコン (ヘッダー用に少し小さく調整)
const LogOutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>;

const ChevronLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>;
const ChevronRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>;

const UserXIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
  <circle cx="8.5" cy="7" r="4" />
  <line x1="18" y1="8" x2="23" y2="13" />
  <line x1="23" y1="8" x2="18" y2="13" />
</svg>;

// 他のアイコン定義の並びに以下を追加
const FileTextIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>;

export function AppLayout({ children, pageTitle }: { children: ReactNode, pageTitle: string }) {
  const pathname = usePathname();
  const router = useRouter();
  // ★ Contextからユーザー情報と権限を取得
  const { currentUser, isAdmin, isLoggedIn, isLoading } = useAuth(); 

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('sidebar:collapsed') : null;
    if (saved !== null) setCollapsed(saved === '1');
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('sidebar:collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("ログアウトエラー:", error);
    }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center">読み込み中...</div>;
  if (!isLoggedIn) {
    router.replace('/');
    return null;
  }

  const menuItems = [
    { href: '/dashboard', label: 'ダッシュボード', icon: <HomeIcon /> },
    { href: '/calendar', label: 'カレンダー', icon: <CalendarIcon /> },
    {
      href: '/attendance',
      label: '出欠記録',
      icon: <CheckSquareIcon />,
      subMenu: [
        { href: '/attendance/register-absence', label: '別日の欠席登録' },
        { href: '/attendance/user-status', label: '利用者別の出欠状況' },
      ]
    },
    // ★★★ ここに追加 ★★★
    { href: '/absence-management', label: '欠席管理', icon: <UserXIcon /> },
    // ★★★ 追加ここまで ★★★
    // ★★★ ここに追加: 支援管理メニュー ★★★
    {
      href: '/support',
      label: '支援管理',
      icon: <FileTextIcon />, // 新しく定義したアイコン
      subMenu: [
        { href: '/support/records', label: '支援記録' },
        { href: '/support/plans', label: '個別支援計画' },
        { href: '/support/monitoring', label: 'モニタリング' },
      ]
    },
    { href: '/business-journal', label: '業務日誌', icon: <FileTextIcon /> },
    // ★★★ 追加ここまで ★★★
    { href: '/users', label: '利用者管理', icon: <UsersIcon /> },
    
    // 管理者メニュー
    ...(isAdmin ? [
      { href: '/masters', label: 'サービス情報マスタ', icon: <SettingsIcon /> },
      { href: '/admin-settings', label: '職員管理', icon: <UsersIcon /> },
    ] : []),
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      <Toaster position="top-right" reverseOrder={false} />

      {/* サイドバー */}
      <aside
        className={[
          'flex-shrink-0 bg-white shadow-lg flex flex-col border-r',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-16' : 'w-64'
        ].join(' ')}
      >
        {/* ロゴエリア */}
        <div className="h-14 px-3 border-b flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded bg-blue-600 text-white font-bold w-7 h-7">C</span>
            {!collapsed && <span className="text-xl font-bold text-blue-600">Comet</span>}
          </Link>
          <button
            onClick={() => setCollapsed(v => !v)}
            className="grid place-items-center size-8 rounded hover:bg-gray-100"
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 px-2 py-3">
          <ul className="space-y-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={[
                      'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                    ].join(' ')}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={isActive ? 'text-blue-600' : 'text-gray-600'}>{item.icon}</span>
                    {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                  </Link>
                  {item.subMenu && isActive && !collapsed && (
                    <ul className="pl-10 mt-2 space-y-2">
                      {item.subMenu.map((subItem: any) => (
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
        {/* ★ サイドバー下部のログアウトボタンは削除しました ★ */}
      </aside>

      {/* メインエリア */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ヘッダー */}
        {/* ★ 修正点： justify-between を追加し、右側にユーザー情報・ログアウトを配置 ★ */}
        <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-10 px-4 md:px-6 h-14 flex items-center justify-between border-b">
          {/* ページタイトル */}
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 truncate">{pageTitle}</h2>
          
          {/* ★ 右上のユーザー情報 & ログアウトボタン ★ */}
          <div className="flex items-center gap-4">
            {/* ユーザー名 (またはEmail) */}
            <div className="hidden md:flex flex-col items-end text-sm">
              <span className="font-bold text-gray-800">
                {currentUser?.displayName || 'ユーザー'}
              </span>
              <span className="text-xs text-gray-500">
                {isAdmin ? '管理者' : '一般'}
              </span>
            </div>

            {/* ログアウトボタン */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-gray-600 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-gray-100"
              title="ログアウト"
            >
              <LogOutIcon />
              <span className="hidden sm:inline text-sm font-medium">ログアウト</span>
            </button>
          </div>
        </header>

        {/* コンテンツ */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            <Breadcrumbs />
            <AuthGuard>
              {children}
            </AuthGuard>
          </div>
        </main>
      </div>
    </div>
  );
}