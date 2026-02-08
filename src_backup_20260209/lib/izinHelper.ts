/**
 * İzin Yönetimi Helper Functions
 * 
 * GMT App'te izinler 3 farklı kaynakta tutulmaktadır:
 * 1. "izinler" - İzin Ekle sayfasından eklenen normal izinler
 * 2. "attendance" (tip: "haftaTatili") - Puantajdan eklenen hafta tatilleri
 * 3. "vardiyaPlan" (haftaTatili: true) - Vardiya Planından eklenen hafta tatilleri
 * 
 * Bu helper, her üç kaynaktan da izinleri birleştirerek tek bir arayüz sunar.
 * Aynı personel+tarih için mükerrer kayıt varsa tekini alır.
 */

import { collection, getDocs, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import * as Sentry from '@sentry/react';

/** Tarihi local timezone'da YYYY-MM-DD formatına çevir (UTC kayması yok) */
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface IzinKaydi {
  id: string;
  personelId: string;
  personelAd: string;
  baslangicTarihi: string;
  bitisTarihi: string;
  izinTuru: string;
  durum: string;
  aciklama?: string;
  kaynak: "izinler" | "attendance" | "vardiyaPlan";
}

/**
 * Tüm izinleri getirir (izinler + attendance haftaTatili + vardiyaPlan haftaTatili)
 * @returns Promise<IzinKaydi[]>
 */
export async function tumIzinleriGetir(
  aralikBas?: string,
  aralikBit?: string
): Promise<IzinKaydi[]> {
  const tumIzinler: IzinKaydi[] = [];
  // Mükerrer kontrol: personelId_tarih → true
  const eklenenler = new Set<string>();

  try {
    // ============================
    // 1. İzinler collection
    // ============================
    let izinQuery;
    if (aralikBas) {
      izinQuery = query(
        collection(db, "izinler"),
        where("bitis", ">=", aralikBas)
      );
    } else {
      izinQuery = query(collection(db, "izinler"));
    }

    const izinSnap = await getDocs(izinQuery);
    izinSnap.forEach(doc => {
      const d = doc.data() as any;
      const durum = (d.durum || "").toLowerCase();
      if (durum === "onaylandı" || durum === "onaylandi") {
        const baslangic = d.baslangic || "";
        const bitis = d.bitis || "";

        // JS'te ikinci koşul: baslangic <= aralikBit
        if (aralikBit && baslangic > aralikBit) return;

        tumIzinler.push({
          id: doc.id,
          personelId: d.personelId || "",
          personelAd: d.personelAd || "",
          baslangicTarihi: baslangic,
          bitisTarihi: bitis,
          izinTuru: d.izinTuru || "Yıllık İzin",
          durum: d.durum || "",
          aciklama: d.aciklama || "",
          kaynak: "izinler",
        });
      }
    });

    // ============================
    // 2. Attendance'dan hafta tatilleri (tip: "haftaTatili")
    // ============================
    let haftaQuery;
    if (aralikBas && aralikBit) {
      const basDate = new Date(aralikBas + "T00:00:00");
      const bitDate = new Date(aralikBit + "T23:59:59");
      haftaQuery = query(
        collection(db, "attendance"),
        where("tip", "==", "haftaTatili"),
        where("tarih", ">=", basDate),
        where("tarih", "<=", bitDate)
      );
    } else if (aralikBas) {
      const basDate = new Date(aralikBas + "T00:00:00");
      haftaQuery = query(
        collection(db, "attendance"),
        where("tip", "==", "haftaTatili"),
        where("tarih", ">=", basDate)
      );
    } else {
      haftaQuery = query(
        collection(db, "attendance"),
        where("tip", "==", "haftaTatili")
      );
    }

    const haftaSnap = await getDocs(haftaQuery);
    haftaSnap.forEach(doc => {
      const d = doc.data() as any;
      const tarih = d.tarih?.toDate ? d.tarih.toDate() : new Date(d.tarih);
      const tarihStr = toLocalDateStr(tarih);
      const dedupKey = `${d.personelId}_${tarihStr}`;
      
      if (!eklenenler.has(dedupKey)) {
        eklenenler.add(dedupKey);
        tumIzinler.push({
          id: doc.id,
          personelId: d.personelId || "",
          personelAd: d.personelAd || "",
          baslangicTarihi: tarihStr,
          bitisTarihi: tarihStr,
          izinTuru: "Haftalık İzin",
          durum: "Onaylandı",
          aciklama: "Hafta tatili (Puantaj)",
          kaynak: "attendance",
        });
      }
    });

    // ============================
    // 3. VardiyaPlan'dan hafta tatilleri (haftaTatili: true)
    // ============================
    let vardiyaQuery;
    if (aralikBas && aralikBit) {
      vardiyaQuery = query(
        collection(db, "vardiyaPlan"),
        where("haftaTatili", "==", true),
        where("tarih", ">=", aralikBas),
        where("tarih", "<=", aralikBit)
      );
    } else if (aralikBas) {
      vardiyaQuery = query(
        collection(db, "vardiyaPlan"),
        where("haftaTatili", "==", true),
        where("tarih", ">=", aralikBas)
      );
    } else {
      vardiyaQuery = query(
        collection(db, "vardiyaPlan"),
        where("haftaTatili", "==", true)
      );
    }

    const vardiyaSnap = await getDocs(vardiyaQuery);
    vardiyaSnap.forEach(doc => {
      const d = doc.data() as any;
      const tarihStr = d.tarih || "";
      const dedupKey = `${d.personelId}_${tarihStr}`;
      
      // Aynı personel+tarih attendance'da zaten varsa ekleme (mükerrer önleme)
      if (!eklenenler.has(dedupKey)) {
        eklenenler.add(dedupKey);
        tumIzinler.push({
          id: doc.id,
          personelId: d.personelId || "",
          personelAd: d.personelAd || "",
          baslangicTarihi: tarihStr,
          bitisTarihi: tarihStr,
          izinTuru: "Haftalık İzin",
          durum: "Onaylandı",
          aciklama: "Hafta tatili (Vardiya Planı)",
          kaynak: "vardiyaPlan",
        });
      }
    });

    
  } catch (error) {
    Sentry.captureException(error);
  }

  return tumIzinler;
}

/**
 * Belirli bir tarih aralığındaki izinleri getirir
 */
export async function tarihAraligiIzinleriGetir(
  baslangic: string, 
  bitis: string
): Promise<IzinKaydi[]> {
  return await tumIzinleriGetir(baslangic, bitis);
}

/**
 * Belirli bir günde izinli olan personelleri getirir
 */
export async function gunIzinlileriGetir(tarih: string): Promise<IzinKaydi[]> {
  return await tumIzinleriGetir(tarih, tarih);
}

/**
 * İzin Map'i oluştur (personelId-tarih → izin türü)
 * Puantaj ve raporlar için optimize edilmiş
 * 
 * @param baslangicTarihi Başlangıç tarihi
 * @param bitisTarihi Bitiş tarihi  
 * @param gunFormati Gün formatı ("gun" = sadece gün numarası, "full" = tam tarih)
 * @returns Map<string, string> key: "personelId-tarih", value: "izin türü"
 */
export async function izinMapOlustur(
  baslangicTarihi: Date,
  bitisTarihi: Date,
  gunFormati: "gun" | "full" = "full"
): Promise<Map<string, string>> {
  const izinMap = new Map<string, string>();
  
  const aralikBas = toLocalDateStr(baslangicTarihi);
  const aralikBit = toLocalDateStr(bitisTarihi);
  
  const izinler = await tumIzinleriGetir(aralikBas, aralikBit);

  izinler.forEach(izin => {
    const start = new Date(izin.baslangicTarihi);
    const end = new Date(izin.bitisTarihi);

    // Geçersiz tarih kontrolü
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return;
    }

    // Tarih aralığındaki her gün için map'e ekle
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      if (date >= baslangicTarihi && date <= bitisTarihi) {
        let tarihKey: string;
        
        if (gunFormati === "gun") {
          // Sadece gün numarası (aylık puantaj için)
          tarihKey = date.getDate().toString();
        } else {
          // Tam tarih (haftalık raporlar için)
          tarihKey = toLocalDateStr(date);
        }
        
        const key = `${izin.personelId}-${tarihKey}`;
        // İlk gelen kazanır (mükerrer varsa üzerine yazma)
        if (!izinMap.has(key)) {
          izinMap.set(key, izin.izinTuru);
        }
      }
    }
  });

  return izinMap;
}

/**
 * Real-time izin dinleyici (onSnapshot)
 * Ana sayfa gibi real-time güncelleme gereken yerlerde kullan
 * 3 kaynağı dinler: izinler + attendance haftaTatili + vardiyaPlan haftaTatili
 */
export function izinleriDinle(
  callback: (izinler: IzinKaydi[]) => void
): () => void {
  let izinlerData: IzinKaydi[] = [];
  let attendanceData: IzinKaydi[] = [];
  let vardiyaPlanData: IzinKaydi[] = [];

  const mergeAndCallback = () => {
    // Mükerrer kontrol: personelId_tarih bazında
    const seen = new Set<string>();
    const merged: IzinKaydi[] = [];

    // Önce izinler (en yüksek öncelik)
    for (const izin of izinlerData) {
      merged.push(izin);
      // İzinler çok günlü olabilir, her gün için set'e eklemeye gerek yok
      // Çünkü izin türü farklı (Yıllık İzin vs Haftalık İzin)
    }

    // Sonra attendance haftaTatili
    for (const kayit of attendanceData) {
      const dedupKey = `${kayit.personelId}_${kayit.baslangicTarihi}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        merged.push(kayit);
      }
    }

    // Son olarak vardiyaPlan haftaTatili (mükerrer değilse)
    for (const kayit of vardiyaPlanData) {
      const dedupKey = `${kayit.personelId}_${kayit.baslangicTarihi}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        merged.push(kayit);
      }
    }

    callback(merged);
  };

  // 1. İzinler collection listener
  const izinlerUnsubscribe = onSnapshot(
    collection(db, "izinler"),
    (snapshot) => {
      izinlerData = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        const durum = (d.durum || "").toLowerCase();
        if (durum === "onaylandı" || durum === "onaylandi") {
          izinlerData.push({
            id: doc.id,
            personelId: d.personelId || "",
            personelAd: d.personelAd || "",
            baslangicTarihi: d.baslangic || "",
            bitisTarihi: d.bitis || "",
            izinTuru: d.izinTuru || "Yıllık İzin",
            durum: d.durum || "",
            aciklama: d.aciklama || "",
            kaynak: "izinler",
          });
        }
      });
      mergeAndCallback();
    }
  );

  // 2. Attendance hafta tatili listener
  const haftaUnsubscribe = onSnapshot(
    query(collection(db, "attendance"), where("tip", "==", "haftaTatili")),
    (haftaSnap) => {
      attendanceData = [];
      haftaSnap.forEach(doc => {
        const d = doc.data();
        const tarih = d.tarih?.toDate ? d.tarih.toDate() : new Date(d.tarih);
        const tarihStr = toLocalDateStr(tarih);
        attendanceData.push({
          id: doc.id,
          personelId: d.personelId || "",
          personelAd: d.personelAd || "",
          baslangicTarihi: tarihStr,
          bitisTarihi: tarihStr,
          izinTuru: "Haftalık İzin",
          durum: "Onaylandı",
          aciklama: "Hafta tatili (Puantaj)",
          kaynak: "attendance",
        });
      });
      mergeAndCallback();
    }
  );

  // 3. VardiyaPlan hafta tatili listener
  const vardiyaUnsubscribe = onSnapshot(
    query(collection(db, "vardiyaPlan"), where("haftaTatili", "==", true)),
    (vardiyaSnap) => {
      vardiyaPlanData = [];
      vardiyaSnap.forEach(doc => {
        const d = doc.data();
        const tarihStr = d.tarih || "";
        vardiyaPlanData.push({
          id: doc.id,
          personelId: d.personelId || "",
          personelAd: d.personelAd || "",
          baslangicTarihi: tarihStr,
          bitisTarihi: tarihStr,
          izinTuru: "Haftalık İzin",
          durum: "Onaylandı",
          aciklama: "Hafta tatili (Vardiya Planı)",
          kaynak: "vardiyaPlan",
        });
      });
      mergeAndCallback();
    }
  );
  
  // Cleanup: ÜÇ listener'ı da kapat
  return () => {
    izinlerUnsubscribe();
    haftaUnsubscribe();
    vardiyaUnsubscribe();
  };
}