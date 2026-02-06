/**
 * İzin Yönetimi Helper Functions
 * 
 * GMT App'te izinler 2 farklı collection'da tutulmaktadır:
 * 1. "izinler" - İzin Ekle sayfasından eklenen normal izinler
 * 2. "attendance" (tip: "haftaTatili") - Puantajdan eklenen hafta tatilleri
 * 
 * Bu helper, her iki kaynaktan da izinleri birleştirerek tek bir arayüz sunar.
 */

import { collection, getDocs, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import * as Sentry from '@sentry/react';

export interface IzinKaydi {
  id: string;
  personelId: string;
  personelAd: string;
  baslangicTarihi: string;
  bitisTarihi: string;
  izinTuru: string;
  durum: string;
  aciklama?: string;
  kaynak: "izinler" | "vardiyaPlan"; // Nereden geldiğini takip et
}

/**
 * Tüm izinleri getirir (hem izinler collection hem vardiyaPlan'daki hafta tatilleri)
 * @returns Promise<IzinKaydi[]>
 */
export async function tumIzinleriGetir(
  aralikBas?: string,
  aralikBit?: string
): Promise<IzinKaydi[]> {
  const tumIzinler: IzinKaydi[] = [];

  try {
    // 1. İzinler collection'ından
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

    // 2. Attendance'dan hafta tatilleri (tip: "haftaTatili")
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
      const tarihStr = tarih.toISOString().split("T")[0];
      tumIzinler.push({
        id: doc.id,
        personelId: d.personelId || "",
        personelAd: d.personelAd || "",
        baslangicTarihi: tarihStr,
        bitisTarihi: tarihStr,
        izinTuru: "Haftalık İzin",
        durum: "Onaylandı",
        aciklama: "Hafta tatili",
        kaynak: "vardiyaPlan", // uyumluluk için
      });
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
  
  const aralikBas = baslangicTarihi.toISOString().split('T')[0];
  const aralikBit = bitisTarihi.toISOString().split('T')[0];
  
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
          tarihKey = date.toISOString().split('T')[0];
        }
        
        const key = `${izin.personelId}-${tarihKey}`;
        izinMap.set(key, izin.izinTuru);
      }
    }
  });

  return izinMap;
}

/**
 * Real-time izin dinleyici (onSnapshot)
 * Ana sayfa gibi real-time güncelleme gereken yerlerde kullan
 */
export function izinleriDinle(
  callback: (izinler: IzinKaydi[]) => void
): () => void {
  let izinlerData: IzinKaydi[] = [];
  let vardiyaData: IzinKaydi[] = [];

  const mergeAndCallback = () => {
    callback([...izinlerData, ...vardiyaData]);
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
      vardiyaData = [];
      haftaSnap.forEach(doc => {
        const d = doc.data();
        const tarih = d.tarih?.toDate ? d.tarih.toDate() : new Date(d.tarih);
        const tarihStr = tarih.toISOString().split("T")[0];
        vardiyaData.push({
          id: doc.id,
          personelId: d.personelId || "",
          personelAd: d.personelAd || "",
          baslangicTarihi: tarihStr,
          bitisTarihi: tarihStr,
          izinTuru: "Haftalık İzin",
          durum: "Onaylandı",
          aciklama: "Hafta tatili",
          kaynak: "vardiyaPlan",
        });
      });
      mergeAndCallback();
    }
  );
  
  // Cleanup: İKİ listener'ı da kapat
  return () => {
    izinlerUnsubscribe();
    haftaUnsubscribe();
  };
}