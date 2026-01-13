'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { auth, db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

// ★修正: guestを追加
type Role = "admin" | "user" | "guest";

interface AuthContextType {
  currentUser: FirebaseUser | null;
  currentRole: Role | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isGuest: boolean; // ★追加
  isUnauthorized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  const fetchUserRole = async (user: FirebaseUser) => {
    if (!user.email) {
      setCurrentRole(null);
      setIsUnauthorized(true);
      return;
    }
    try {
      const docRef = doc(db, 'admins', user.email);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        // DB上の値が不正でも安全にキャスト、デフォルトはuser
        const roleFromDb = (['admin', 'user', 'guest'].includes(data.role) ? data.role : 'user') as Role;
        setCurrentRole(roleFromDb);
        setIsUnauthorized(false);
      } else {
        // 未登録ユーザー
        setCurrentRole(null);
        setIsUnauthorized(true);
      }
    } catch (error) {
      console.error("Failed to fetch user role:", error);
      setCurrentRole(null);
      setIsUnauthorized(true);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsLoading(true);
      if (user) {
        setCurrentUser(user);
        await fetchUserRole(user);
      } else {
        setCurrentUser(null);
        setCurrentRole(null);
        setIsUnauthorized(false);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = useMemo(() => currentRole === 'admin', [currentRole]);
  const isGuest = useMemo(() => currentRole === 'guest', [currentRole]); // ★追加
  const isLoggedIn = useMemo(() => !!currentUser && !!currentRole, [currentUser, currentRole]);
  
  const value = { currentUser, currentRole, isLoading, isLoggedIn, isAdmin, isGuest, isUnauthorized };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};