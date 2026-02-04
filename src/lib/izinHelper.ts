/**
 * İzin Yönetimi Helper Functions
 * 
 * GMT App'te izinler 2 farklı collection'da tutulmaktadır:
 * 1. "izinler" - İzin Ekle sayfasından eklenen normal izinler
 * 2. "vardiyaPlan" - Vardiya planından eklenen hafta tatilleri
 * 
 * Bu helper, her iki kaynaktan da izinleri birleştirerek tek bir arayüz sunar.
 */

import { collection, getDocs, query, where, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

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
export async function tumIzinleriGetir(): Promise<IzinKaydi[]> {
  const tumIzinler: IzinKaydi[] = [];

  try {
    // 1. İzinler collection'ından
    const izinSnap = await getDocs(collection(db, "izinler"));
    izinSnap.forEach(doc => {
      const d = doc.data();
      // Sadece onaylanmış izinleri al
      const durum = (d.durum || "").toLowerCase();
      if (durum === "onaylandı" || durum === "onaylandi") {
        tumIzinler.push({
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

    // 2. VardiyaPlan'dan hafta tatilleri
    const vardiyaSnap = await getDocs(collection(db, "vardiyaPlan"));
    vardiyaSnap.forEach(doc => {
      const d = doc.data();
      if (d.haftaTatili === true) {
        tumIzinler.push({
          id: doc.id,
          personelId: d.personelId || "",
          personelAd: d.personelAd || "",
          baslangicTarihi: d.tarih || "",
          bitisTarihi: d.tarih || "", // Tek günlük
          izinTuru: "Haftalık İzin",
          durum: "Onaylandı",
          aciklama: "Hafta tatili",
          kaynak: "vardiyaPlan",
        });
      }
    });

    console.log(`✅ Toplam izin: ${tumIzinler.length} (${tumIzinler.filter(i => i.kaynak === "izinler").length} izinler + ${tumIzinler.filter(i => i.kaynak === "vardiyaPlan").length} hafta tatili)`);
    
  } catch (error) {
    console.error("❌ İzinleri getirirken hata:", error);
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
  const tumIzinler = await tumIzinleriGetir();
  return tumIzinler.filter(izin => 
    izin.baslangicTarihi <= bitis && izin.bitisTarihi >= baslangic
  );
}

/**
 * Belirli bir günde izinli olan personelleri getirir
 */
export async function gunIzinlileriGetir(tarih: string): Promise<IzinKaydi[]> {
  const tumIzinler = await tumIzinleriGetir();
  return tumIzinler.filter(izin => 
    izin.baslangicTarihi <= tarih && izin.bitisTarihi >= tarih
  );
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
  const tumIzinler = await tumIzinleriGetir();

  tumIzinler.forEach(izin => {
    const start = new Date(izin.baslangicTarihi);
    const end = new Date(izin.bitisTarihi);

    // Geçersiz tarih kontrolü
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.warn(`⚠️ Geçersiz tarih: ${izin.personelAd} - ${izin.baslangicTarihi} → ${izin.bitisTarihi}`);
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
  const izinlerUnsubscribe = onSnapshot(
    collection(db, "izinler"),
    (snapshot) => {
      const tumIzinler: IzinKaydi[] = [];
      
      // İzinler
      snapshot.forEach(doc => {
        const d = doc.data();
        const durum = (d.durum || "").toLowerCase();
        if (durum === "onaylandı" || durum === "onaylandi") {
          tumIzinler.push({
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
      
      // VardiyaPlan'ı da dinle
      const vardiyaUnsubscribe = onSnapshot(
        collection(db, "vardiyaPlan"),
        (vardiyaSnap) => {
          vardiyaSnap.forEach(doc => {
            const d = doc.data();
            if (d.haftaTatili === true) {
              tumIzinler.push({
                id: doc.id,
                personelId: d.personelId || "",
                personelAd: d.personelAd || "",
                baslangicTarihi: d.tarih || "",
                bitisTarihi: d.tarih || "",
                izinTuru: "Haftalık İzin",
                durum: "Onaylandı",
                aciklama: "Hafta tatili",
                kaynak: "vardiyaPlan",
              });
            }
          });
          
          callback(tumIzinler);
        }
      );
    }
  );
  
  // Cleanup function
  return () => {
    izinlerUnsubscribe();
  };
}