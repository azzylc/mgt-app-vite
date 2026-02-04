import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

interface RolYetkileri {
  [key: string]: string[];
}

interface RoleContextType {
  rol: RolYetkileri | null;
  loading: boolean;
}

const RoleContext = createContext<RoleContextType>({ rol: null, loading: true });

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [rol, setRol] = useState<RolYetkileri | null>(null);
  const [loading, setLoading] = useState(true);

  console.log("🔵 [DEBUG] RoleProvider mounted!");

  useEffect(() => {
    console.log("🔵 [DEBUG] Setting up auth observer...");
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log("🔵 [DEBUG] Auth state changed:", currentUser?.email);
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (user?.email === undefined || user?.email === null) {
        setRol(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const personelSnap = await getDoc(doc(db, "personnel", user.email));
        if (personelSnap.exists() === false) {
          throw new Error("personel bulunamadı");
        }

        const kullaniciTuru = personelSnap.data().kullaniciTuru;
        if (kullaniciTuru === undefined || kullaniciTuru === null) {
          throw new Error("kullaniciTuru yok");
        }

        // Hardcoded rol yetkileri - Firestore'a gerek yok!
        const getMenuItemsForRole = (role: string): string[] => {
          switch(role) {
            case "Kurucu":
              return ["personel", "takvim", "izinler", "gorevler", "vardiya", "girisCikis", "raporlar", "ayarlar"];
            case "Yönetici":
              return ["personel", "takvim", "izinler", "gorevler", "vardiya", "girisCikis", "raporlar"];
            case "Personel":
              return ["takvim", "izinler", "gorevler", "girisCikis"];
            default:
              return [];
          }
        };

        const menuItems = getMenuItemsForRole(kullaniciTuru);
        
        if (cancelled === false) {
          setRol({ [kullaniciTuru]: menuItems });
          console.log("✅ [ROLE] Yetkiler yüklendi:", kullaniciTuru, menuItems);
        }
      } catch (e) {
        console.error("❌ [ROLE] Rol yetkileri yüklenemedi:", e);
        if (cancelled === false) setRol(null);
      } finally {
        if (cancelled === false) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.email]);

  const value = useMemo(() => ({ rol, loading }), [rol, loading]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
