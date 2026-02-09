// İzin tipleri
export type IzinTuru = 'yillik' | 'mazeret' | 'hastalik' | 'ucretsiz' | 'diger';

export interface Izin {
  id: string;
  personelId: string;
  baslangic: string;
  bitis: string;
  tur: IzinTuru;
  aciklama: string;
  onayDurumu: 'beklemede' | 'onaylandi' | 'reddedildi';
  olusturmaTarihi: string;
}

// Duyuru
export interface Duyuru {
  id: string;
  baslik: string;
  icerik: string;
  tarih: string;
  yazar: string;
  onemli: boolean;
  okundu: boolean;
}

// Örnek duyurular
export const duyurular: Duyuru[] = [
  { 
    id: "1",
    baslik: "Şubat Ayı Toplantısı",
    icerik: "1 Şubat Cumartesi saat 10:00'da ofiste toplantımız var. Herkesin katılması önemli. Gündem: Şubat ayı planlaması ve yeni ürünler.",
    tarih: "2026-01-28T10:00:00",
    yazar: "Gizem",
    onemli: true,
    okundu: false
  },
  { 
    id: "2",
    baslik: "Yeni Ürünler Geldi",
    icerik: "MAC ve Bobbi Brown'dan yeni ürünler geldi. Depoda kontrol edebilirsiniz. Özellikle yeni fondöten serisini mutlaka deneyin.",
    tarih: "2026-01-25T14:30:00",
    yazar: "Gizem",
    onemli: false,
    okundu: true
  },
  { 
    id: "3",
    baslik: "Fiyat Güncellemesi",
    icerik: "1 Şubat'tan itibaren geçerli olacak yeni fiyat listesi ekte paylaşılmıştır. Lütfen inceleyin.",
    tarih: "2026-01-22T09:00:00",
    yazar: "Gizem",
    onemli: true,
    okundu: true
  },
  { 
    id: "4",
    baslik: "Temizlik Malzemeleri",
    icerik: "Fırça temizleyici ve dezenfektan stoklarımız azaldı. Bu hafta içinde temin edilecek.",
    tarih: "2026-01-18T11:00:00",
    yazar: "Saliha",
    onemli: false,
    okundu: true
  },
];

/**
 * Yaklaşan doğum günlerini hesapla (Firebase personel verisi gerekli)
 */
interface PersonelDogumGunu {
  id: string;
  isim: string;
  emoji: string;
  yaklasanTarih: string;
  kalanGun: number;
}

interface PersonelWithBirthday {
  id: string;
  ad: string;
  soyad: string;
  dogumTarihi?: string;
  emoji?: string;
  aktif: boolean;
}

export function getYaklasanDogumGunleri(personeller: PersonelWithBirthday[]): PersonelDogumGunu[] {
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  
  return personeller
    .filter(p => p.dogumTarihi && p.aktif)
    .map(p => {
      const dogumTarihi = new Date(p.dogumTarihi!);
      const buYil = bugun.getFullYear();
      
      // Bu yıl doğum günü
      let yaklasanDogumGunu = new Date(buYil, dogumTarihi.getMonth(), dogumTarihi.getDate());
      
      // Eğer geçmişse gelecek yıl
      if (yaklasanDogumGunu < bugun) {
        yaklasanDogumGunu = new Date(buYil + 1, dogumTarihi.getMonth(), dogumTarihi.getDate());
      }
      
      const kalanGun = Math.floor((yaklasanDogumGunu.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        id: p.id,
        isim: `${p.ad} ${p.soyad}`,
        emoji: p.emoji || '🎂',
        yaklasanTarih: `${yaklasanDogumGunu.getFullYear()}-${String(yaklasanDogumGunu.getMonth()+1).padStart(2,'0')}-${String(yaklasanDogumGunu.getDate()).padStart(2,'0')}`,
        kalanGun
      };
    })
    .filter(p => p.kalanGun <= 365) // 365 gün içindekiler
    .sort((a, b) => a.kalanGun - b.kalanGun);
}

// Resmi tatiller
export interface ResmiTatil {
  tarih: string;
  isim: string;
  sure: number; // gün sayısı
}

export const resmiTatiller: ResmiTatil[] = [
  // 2026 Tatilleri
  { tarih: "2026-01-01", isim: "Yılbaşı", sure: 1 },
  { tarih: "2026-03-20", isim: "Ramazan Bayramı", sure: 3 },
  { tarih: "2026-04-23", isim: "Ulusal Egemenlik ve Çocuk Bayramı", sure: 1 },
  { tarih: "2026-05-01", isim: "Emek ve Dayanışma Günü", sure: 1 },
  { tarih: "2026-05-19", isim: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", sure: 1 },
  { tarih: "2026-05-27", isim: "Kurban Bayramı", sure: 4 },
  { tarih: "2026-07-15", isim: "Demokrasi ve Milli Birlik Günü", sure: 1 },
  { tarih: "2026-08-30", isim: "Zafer Bayramı", sure: 1 },
  { tarih: "2026-10-29", isim: "Cumhuriyet Bayramı", sure: 1 },
  // 2027 Tatilleri
  { tarih: "2027-01-01", isim: "Yılbaşı", sure: 1 },
  { tarih: "2027-03-09", isim: "Ramazan Bayramı", sure: 3 },
  { tarih: "2027-04-23", isim: "Ulusal Egemenlik ve Çocuk Bayramı", sure: 1 },
  { tarih: "2027-05-01", isim: "Emek ve Dayanışma Günü", sure: 1 },
  { tarih: "2027-05-16", isim: "Kurban Bayramı", sure: 4 },
  { tarih: "2027-05-19", isim: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", sure: 1 },
  { tarih: "2027-07-15", isim: "Demokrasi ve Milli Birlik Günü", sure: 1 },
  { tarih: "2027-08-30", isim: "Zafer Bayramı", sure: 1 },
  { tarih: "2027-10-29", isim: "Cumhuriyet Bayramı", sure: 1 },
];

// Yaklaşan resmi tatilleri getir (önümüzdeki 10 ay)
export const getYaklasanTatiller = () => {
  const bugun = new Date();
  const onAySonra = new Date();
  onAySonra.setMonth(bugun.getMonth() + 10);
  
  const _fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const bugunStr = _fmt(bugun);
  const onAySonraStr = _fmt(onAySonra);
  
  return resmiTatiller
    .filter(t => t.tarih >= bugunStr && t.tarih <= onAySonraStr)
    .sort((a, b) => a.tarih.localeCompare(b.tarih));
};

// ============================================
// Anma / Yas Günleri
// ============================================
export interface AnmaGunu {
  ay: number;   // 1-12
  gun: number;  // 1-31
  isim: string;
  emoji: string;
}

export const anmaGunleri: AnmaGunu[] = [
  { ay: 11, gun: 10, isim: "Atatürk'ü Anma Günü", emoji: "🇹🇷" },
  { ay: 3,  gun: 18, isim: "Çanakkale Zaferi ve Şehitleri Anma Günü", emoji: "🇹🇷" },
  { ay: 8,  gun: 26, isim: "Büyük Taarruz Günü", emoji: "🇹🇷" },
  { ay: 7,  gun: 15, isim: "15 Temmuz Şehitlerini Anma", emoji: "🕯️" },
];

// Yaklaşan anma günlerini getir (60 gün içindekiler)
export const getYaklasanAnmaGunleri = () => {
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  const buYil = bugun.getFullYear();

  return anmaGunleri
    .map(a => {
      let tarih = new Date(buYil, a.ay - 1, a.gun);
      // Geçmişse gelecek yıla al
      if (tarih < bugun) {
        tarih = new Date(buYil + 1, a.ay - 1, a.gun);
      }
      const kalanGun = Math.floor((tarih.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
      const tarihStr = `${tarih.getFullYear()}-${String(tarih.getMonth()+1).padStart(2,'0')}-${String(tarih.getDate()).padStart(2,'0')}`;
      return { ...a, tarihStr, kalanGun };
    })
    .filter(a => a.kalanGun <= 365)
    .sort((a, b) => a.kalanGun - b.kalanGun);
};