import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, query, where, collection, getDocs } from "firebase/firestore";
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
        // 1. Kullanıcının rolünü al (EMAIL FIELD'INDAN QUERY ile)
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
            "Kurucu": ["genel-bakis", "personel", "takvim", "izinler", "gorevler", "giris-cikis-islemleri", "raporlar", "ayarlar", "yonetim-paneli"],
            "Yönetici": ["genel-bakis", "personel", "takvim", "izinler", "gorevler", "giris-cikis-islemleri", "raporlar"],
            "Personel": ["genel-bakis", "takvim", "izinler", "gorevler", "qr-giris"]
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
