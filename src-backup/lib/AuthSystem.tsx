'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/app/lib/firebase';

type AuthCtx = { user: User | null; loading: boolean };
const Ctx = createContext<AuthCtx>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔥 [APP] AuthProvider mounting...');
    
    const timeout = setTimeout(() => {
      console.warn('⚠️ [AUTH] Observer timeout, assuming guest');
      setUser(null);
      setLoading(false);
    }, 1500);

    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimeout(timeout);
      console.log('🌐 [AUTH] State Changed:', u ? 'User' : 'Guest');
      setUser(u);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  return <Ctx.Provider value={{ user, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (loading) return;

    const isLoginPage = pathname === '/login' || pathname === '/login/';

    console.log('🔥 [GUARD]', { pathname, user: !!user });

    // User yok + login değilse → HEMEN REDIRECT (window.location!)
    if (!user && !isLoginPage) {
      console.warn('⚠️ [GUARD] Redirecting to /login/ (window.location)');
      setShouldRender(false);
      // trailingSlash: true olduğu için /login/ kullan!
      window.location.replace('/login/');
      return;
    }

    // User var + login'deyse → HEMEN REDIRECT
    if (user && isLoginPage) {
      console.log('✅ [GUARD] Redirecting to / (window.location)');
      setShouldRender(false);
      window.location.replace('/');
      return;
    }

    // Her şey OK → Render et
    setShouldRender(true);
  }, [loading, user, pathname]);

  // Loading veya redirect oluyorsa HİÇBİR ŞEY gösterme!
  if (loading || !shouldRender) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
      </div>
    );
  }

  return <>{children}</>;
}
