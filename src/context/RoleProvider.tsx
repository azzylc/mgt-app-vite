import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import * as Sentry from '@sentry/react';

interface RolYetkileri {
  [key: string]: string[];
}

export interface PersonelData {
  ad: string;
  soyad: string;
  email: string;
  kullaniciTuru: string;
  firmalar: string[];
  yonettigiFirmalar: string[];
  grupEtiketleri: string[];
  foto?: string;
  aktif: boolean;
}

interface RoleContextType {
  rol: RolYetkileri | null;
  loading: boolean;
  user: any;
  authReady: boolean;
  personelData: PersonelData | null;
}

const ROLE_CACHE_KEY = "cached_rol";
const PERSONEL_CACHE_KEY = "cached_personel";

const RoleContext = createContext<RoleContextType>({
  rol: null, loading: true, user: null, authReady: false, personelData: null
});

// Cache'den hızlı yükle (sayfa yenilemede anında göster)
function getCachedRol(): RolYetkileri | null {
  try {
    const cached = localStorage.getItem(ROLE_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return null;
}

function getCachedPersonel(): PersonelData | null {
  try {
    const cached = localStorage.getItem(PERSONEL_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return null;
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  
  // Cache varsa hemen yükle → loading = false → sayfa anında açılır
  const cachedRol = getCachedRol();
  const cachedPersonel = getCachedPersonel();
  const [rol, setRol] = useState<RolYetkileri | null>(cachedRol);
  const [personelData, setPersonelData] = useState<PersonelData | null>(cachedPersonel);
  const [loading, setLoading] = useState(cachedRol === null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  // Personnel + permissions — tek onSnapshot
  useEffect(() => {
    if (!authReady) return;

    if (!user?.email) {
      setRol(null);
      setPersonelData(null);
      setLoading(false);
      localStorage.removeItem(ROLE_CACHE_KEY);
      localStorage.removeItem(PERSONEL_CACHE_KEY);
      return;
    }

    if (!cachedRol) setLoading(true);

    const q = query(
      collection(db, "personnel"),
      where("email", "==", user.email)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        try {
          let pData: PersonelData;

          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            pData = {
              ad: data.ad || "",
              soyad: data.soyad || "",
              email: data.email || user.email,
              kullaniciTuru: data.kullaniciTuru || "Personel",
              firmalar: data.firmalar || [],
              yonettigiFirmalar: data.yonettigiFirmalar || [],
              grupEtiketleri: data.grupEtiketleri || [],
              foto: data.foto || undefined,
              aktif: data.aktif !== false,
            };
          } else {
            // Personel bulunamadı — fallback
            pData = {
              ad: user.email?.split("@")[0] || "Kullanıcı",
              soyad: "",
              email: user.email,
              kullaniciTuru: "Personel",
              firmalar: [],
              yonettigiFirmalar: [],
              grupEtiketleri: [],
              aktif: true,
            };
          }

          setPersonelData(pData);
          localStorage.setItem(PERSONEL_CACHE_KEY, JSON.stringify(pData));

          // Rol yetkilerini al
          const kullaniciTuru = pData.kullaniciTuru;
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

          const newRol = { [kullaniciTuru]: menuItems };
          setRol(newRol);
          localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(newRol));
        } catch (e) {
          Sentry.captureException(e);
          setRol(null);
          setPersonelData(null);
          localStorage.removeItem(ROLE_CACHE_KEY);
          localStorage.removeItem(PERSONEL_CACHE_KEY);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        Sentry.captureException(error, { tags: { module: "RoleProvider", collection: "personnel" } });
        setRol(null);
        setPersonelData(null);
        setLoading(false);
        localStorage.removeItem(ROLE_CACHE_KEY);
        localStorage.removeItem(PERSONEL_CACHE_KEY);
      }
    );

    return () => unsubscribe();
  }, [user?.email, authReady]);

  const value = useMemo(
    () => ({ rol, loading, user, authReady, personelData }),
    [rol, loading, user, authReady, personelData]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

export function useAuth() {
  const { user } = useContext(RoleContext);
  return user;
}

// Convenience hook — kullanıcı rolü ve bilgileri
export function usePersonelData() {
  const { personelData } = useContext(RoleContext);
  return personelData;
}
