import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  Bildirim,
  bildirimOkunduYap,
  bildirimTumunuOkunduYap,
  bildirimSil,
} from "../lib/bildirimHelper";
import * as Sentry from "@sentry/react";

interface UseBildirimlerReturn {
  bildirimler: Bildirim[];
  okunmamisSayisi: number;
  loading: boolean;
  okunduYap: (id: string) => Promise<void>;
  tumunuOkunduYap: () => Promise<void>;
  sil: (id: string) => Promise<void>;
}

/**
 * Bildirim hook'u - real-time Firestore listener
 *
 * Firestore Index gerekli:
 *   Collection: bildirimler
 *   Fields: alici ASC, tarih DESC
 */
export function useBildirimler(
  userEmail: string | null | undefined
): UseBildirimlerReturn {
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time listener
  useEffect(() => {
    if (!userEmail) {
      setBildirimler([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "bildirimler"),
      where("alici", "==", userEmail),
      orderBy("tarih", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Bildirim[];
        setBildirimler(data);
        setLoading(false);
      },
      (error) => {
        // Index henüz oluşmadıysa hata verir, logla ve devam et
        console.warn("[Bildirimler] Listener hatası:", error.message);
        Sentry.captureException(error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userEmail]);

  // Okunmamış sayısı (memo)
  const okunmamisSayisi = useMemo(
    () => bildirimler.filter((b) => !b.okundu).length,
    [bildirimler]
  );

  // Tek bildirim okundu yap
  const okunduYap = useCallback(async (id: string) => {
    // Optimistic update
    setBildirimler((prev) =>
      prev.map((b) => (b.id === id ? { ...b, okundu: true } : b))
    );
    await bildirimOkunduYap(id);
  }, []);

  // Tümünü okundu yap
  const tumunuOkunduYap = useCallback(async () => {
    if (!userEmail) return;
    // Optimistic update
    setBildirimler((prev) => prev.map((b) => ({ ...b, okundu: true })));
    await bildirimTumunuOkunduYap(userEmail);
  }, [userEmail]);

  // Bildirim sil
  const sil = useCallback(async (id: string) => {
    // Optimistic update
    setBildirimler((prev) => prev.filter((b) => b.id !== id));
    await bildirimSil(id);
  }, []);

  return {
    bildirimler,
    okunmamisSayisi,
    loading,
    okunduYap,
    tumunuOkunduYap,
    sil,
  };
}
