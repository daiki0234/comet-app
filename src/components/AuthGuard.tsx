'use client';
import { ReactNode, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import { auth } from '@/lib/firebase/firebase';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        const returnTo = encodeURIComponent(pathname || '/');
        router.replace(`/?returnTo=${returnTo}`);
      } else {
        setReady(true);
      }
    });
    return () => unsub();
  }, [router, pathname]);

  if (!ready) {
    return <div className="grid place-items-center h-[50vh] text-gray-600 text-sm">認証を確認しています…</div>;
  }
  return <>{children}</>;
}