import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, query, where, collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import * as Sentry from '@sentry/react';

interface RolYetkileri {
  [key: string]: string[];
}

interface RoleContextType {
  rol: RolYetkileri | null;
  loading: boolean;
  user: any;
  authReady: boolean;
}

const ROLE_CACHE_KEY = "cached_rol";

const RoleContext = createContext<RoleContextType>({ rol: null, loading: true, user: null, authReady: false });

// Cache'den hızlı yükle (sayfa yenilemede anında göster)
function getCachedRol(): RolYetkileri | null {
  try {
    const cached = localStorage.getItem(ROLE_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return null;
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  
  // Cache varsa hemen yükle → loading = false → sayfa anında açılır
  const cachedRol = getCachedRol();
  const [rol, setRol] = useState<RolYetkileri | null>(cachedRol);
  const [loading, setLoading] = useState(cachedRol === null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Auth henüz hazır değilse bekle
    if (!authReady) return;

    (async () => {
      if (user?.email === undefined || user?.email === null) {
        setRol(null);
        setLoading(false);
        localStorage.removeItem(ROLE_CACHE_KEY);
        return;
      }

      // Cache yoksa loading göster, varsa arka planda güncelle
      if (!cachedRol) setLoading(true);

      try {
        // 1. Kullanıcının rolünü al
        const personelQuery = query(
          collection(db, "personnel"),
          where("email", "==", user.email)
        );
        const personelSnapshot = await getDocs(personelQuery);
        
        if (personelSnapshot.empty) {
          throw new Error("personel bulunamadı");
        }

        const personelData = personelSnapshot.docs[0].data();
        const kullaniciTuru = personelData.kullaniciTuru;
        
        if (kullaniciTuru === undefined || kullaniciTuru === null) {
          throw new Error("kullaniciTuru yok");
        }

        // 2. Rol yetkilerini al
        const permissionsSnap = await getDoc(doc(db, "settings", "permissions"));
        
        let menuItems: string[] = [];
        
        if (permissionsSnap.exists()) {
          const permissions = permissionsSnap.data() as RolYetkileri;
          menuItems = permissions[kullaniciTuru] || permissions["Personel"] || [];
        } else {
          const defaultPermissions: RolYetkileri = {
            "Kurucu": ["genel-bakis", "giris-cikis-islemleri", "duyurular", "gorevler", "takvim", "personel", "izinler", "raporlar", "ayarlar", "yonetim-paneli"],
            "Yönetici": ["genel-bakis", "giris-cikis-islemleri", "duyurular", "gorevler", "takvim", "personel", "izinler", "raporlar", "ayarlar"],
            "Personel": ["genel-bakis", "qr-giris", "duyurular", "gorevler", "takvim", "izinler"]
          };
          menuItems = defaultPermissions[kullaniciTuru] || defaultPermissions["Personel"] || [];
        }
        
        if (cancelled === false) {
          const newRol = { [kullaniciTuru]: menuItems };
          setRol(newRol);
          localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(newRol));
        }
      } catch (e) {
        Sentry.captureException(e);
        if (cancelled === false) {
          setRol(null);
          localStorage.removeItem(ROLE_CACHE_KEY);
        }
      } finally {
        if (cancelled === false) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.email, authReady]);

  const value = useMemo(() => ({ rol, loading, user, authReady }), [rol, loading, user, authReady]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

export function useAuth() {
  const { user } = useContext(RoleContext);
  return user;
}
