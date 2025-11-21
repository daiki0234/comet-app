'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { auth, db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

type Role = "admin" | "user";

interface AuthContextType {
  currentUser: FirebaseUser | null;
  currentRole: Role | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  isAdmin: boolean;
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
        const roleFromDb = (data.role as Role) || 'user';
        setCurrentRole(roleFromDb);
        setIsUnauthorized(false);
      } else {
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
  const isLoggedIn = useMemo(() => !!currentUser && !!currentRole, [currentUser, currentRole]);
  
  const value = { currentUser, currentRole, isLoading, isLoggedIn, isAdmin, isUnauthorized };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};