// Grup Etiketleri Custom Hook
// Dosya: hooks/useGrupEtiketleri.ts

import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import * as Sentry from '@sentry/react';

export interface GrupEtiketi {
  id: string;
  grupAdi: string;
  renk: string;
  sira: number;
  olusturulmaTarihi?: Timestamp | Date;
  sonDuzenleme?: Timestamp | Date;
}

export function useGrupEtiketleri() {
  const [grupEtiketleri, setGrupEtiketleri] = useState<GrupEtiketi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Firebase'den grup etiketlerini dinle (real-time)
  useEffect(() => {
    const q = query(
      collection(db, "groupTags"), 
      orderBy("grupAdi", "asc")
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          grupAdi: doc.data().grupAdi || "",
          renk: doc.data().renk || "gray", // default renk
          sira: doc.data().sira ?? 999,
          olusturulmaTarihi: doc.data().olusturulmaTarihi,
          sonDuzenleme: doc.data().sonDuzenleme
        } as GrupEtiketi));
        
        setGrupEtiketleri(data);
        setLoading(false);
      },
      (err) => {
        Sentry.captureException(err);
        setError("Grup etiketleri yüklenemedi");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Sadece grup adlarını array olarak getir (personel sayfası için)
  const grupAdlari = grupEtiketleri.map(g => g.grupAdi);

  // Grup adına göre etiket bul
  const getGrupByAd = (grupAdi: string): GrupEtiketi | undefined => {
    return grupEtiketleri.find(g => 
      g.grupAdi.toLowerCase() === grupAdi.toLowerCase()
    );
  };

  // Yeni etiket ekle
  const etiketEkle = async (grupAdi: string, renk: string) => {
    try {
      const yeniSira = grupEtiketleri.length > 0 
        ? Math.max(...grupEtiketleri.map(g => g.sira)) + 1 
        : 0;

      await addDoc(collection(db, "groupTags"), {
        grupAdi,
        renk,
        sira: yeniSira,
        olusturulmaTarihi: serverTimestamp(),
        sonDuzenleme: serverTimestamp()
      });
      return { success: true };
    } catch (err) {
      Sentry.captureException(err);
      return { success: false, error: "Etiket eklenemedi" };
    }
  };

  // Etiket güncelle
  const etiketGuncelle = async (id: string, data: Partial<GrupEtiketi>) => {
    try {
      const { id: _, ...updateData } = data as Partial<GrupEtiketi> & { id?: string };
      await updateDoc(doc(db, "groupTags", id), {
        ...updateData,
        sonDuzenleme: serverTimestamp()
      });
      return { success: true };
    } catch (err) {
      Sentry.captureException(err);
      return { success: false, error: "Etiket güncellenemedi" };
    }
  };

  // Etiket sil
  const etiketSil = async (id: string) => {
    try {
      await deleteDoc(doc(db, "groupTags", id));
      return { success: true };
    } catch (err) {
      Sentry.captureException(err);
      return { success: false, error: "Etiket silinemedi" };
    }
  };

  // Mevcut etiketlere renk ekle (migration)
  const renkMigration = async () => {
    try {
      const snapshot = await getDocs(collection(db, "groupTags"));
      const batch = writeBatch(db);
      
      const defaultRenkler: Record<string, string> = {
        "genel": "blue",
        "mg": "purple", 
        "gys": "pink",
        "tcb": "orange",
        "ekip": "green",
        "serbest": "gray"
      };

      let siraCounter = 0;
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        // Eğer renk yoksa ekle
        if (!data.renk) {
          const grupAdiLower = (data.grupAdi || "").toLowerCase();
          const renk = defaultRenkler[grupAdiLower] || "gray";
          batch.update(doc(db, "groupTags", docSnap.id), { 
            renk,
            sira: data.sira ?? siraCounter++,
            sonDuzenleme: serverTimestamp()
          });
        }
      });

      await batch.commit();
      return { success: true, message: "Migration tamamlandı" };
    } catch (err) {
      Sentry.captureException(err);
      return { success: false, error: "Migration başarısız" };
    }
  };

  return {
    grupEtiketleri,     // Tüm etiketler (GrupEtiketi[])
    grupAdlari,         // Sadece isimler (string[])
    loading,
    error,
    getGrupByAd,        // Grup adına göre bul
    etiketEkle,
    etiketGuncelle,
    etiketSil,
    renkMigration       // Mevcut etiketlere renk ekle
  };
}