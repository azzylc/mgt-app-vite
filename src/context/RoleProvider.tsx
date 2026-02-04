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
        // 1. Kullanıcının rolünü al (personnel document'inden)
        const personelSnap = await getDoc(doc(db, "personnel", user.email));
        if (personelSnap.exists() === false) {
          throw new Error("personel bulunamadı");
        }

        const kullaniciTuru = personelSnap.data().kullaniciTuru;
        if (kullaniciTuru === undefined || kullaniciTuru === null) {
          throw new Error("kullaniciTuru yok");
        }

        console.log("✅ [ROLE] Kullanıcı türü:", kullaniciTuru);

        // 2. Rol yetkilerini al (settings/permissions document'inden)
        const permissionsSnap = await getDoc(doc(db, "settings", "permissions"));
        
        let menuItems: string[] = [];
        
        if (permissionsSnap.exists()) {
          const permissions = permissionsSnap.data() as RolYetkileri;
          menuItems = permissions[kullaniciTuru] || [];
          console.log("✅ [ROLE] Firestore'dan yetkiler:", menuItems);
        } else {
          // Fallback: Firestore'da yoksa default yetkiler
          console.log("⚠️ [ROLE] settings/permissions bulunamadı, default yetkiler kullanılıyor");
          const defaultPermissions: RolYetkileri = {
            "Kurucu": ["personel", "takvim", "izinler", "gorevler", "girisCikis", "raporlar", "ayarlar"],
            "Yönetici": ["personel", "takvim", "izinler", "gorevler", "girisCikis", "raporlar"],
            "Personel": ["takvim", "izinler", "gorevler", "girisCikis"]
          };
          menuItems = defaultPermissions[kullaniciTuru] || [];
          console.log("✅ [ROLE] Default yetkiler:", menuItems);
        }
        
        if (cancelled === false) {
          setRol({ [kullaniciTuru]: menuItems });
          console.log("✅ [ROLE] Rol set edildi:", { [kullaniciTuru]: menuItems });
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
