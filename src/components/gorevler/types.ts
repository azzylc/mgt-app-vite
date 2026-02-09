// ============================================
// Görevler Modülü — Ortak Tipler & Yardımcılar
// ============================================

export interface GorevYorum {
  id: string;
  yazan: string;
  yazanAd: string;
  yorum: string;
  tarih: any;
}

export interface Gorev {
  id: string;
  baslik: string;
  aciklama: string;
  atayan: string;
  atayanAd: string;
  atanan: string;
  atananAd: string;
  durum: "bekliyor" | "devam-ediyor" | "tamamlandi" | "iptal";
  oncelik: "dusuk" | "normal" | "yuksek" | "acil";
  olusturulmaTarihi: any;
  tamamlanmaTarihi?: any;
  sonTarih?: string;
  gelinId?: string;
  otomatikMi?: boolean;
  gorevTuru?: "yorumIstesinMi" | "paylasimIzni" | "yorumIstendiMi" | "odemeTakip";
  yorumlar?: GorevYorum[];
  gelinBilgi?: {
    isim: string;
    tarih: string;
    saat: string;
  };
}

export interface Gelin {
  id: string;
  isim: string;
  tarih: string;
  saat: string;
  makyaj: string;
  turban: string;
  odemeTamamlandi?: boolean;
  yorumIstesinMi?: string;
  paylasimIzni?: boolean;
  yorumIstendiMi?: boolean;
  ucret: number;
  kapora: number;
  kalan: number;
  telefon?: string;
  esiTelefon?: string;
  instagram?: string;
  fotografci?: string;
  modaevi?: string;
  kinaGunu?: string;
  not?: string;
  bilgilendirmeGonderildiMi?: boolean;
  anlasmaYazildiMi?: boolean;
  malzemeGonderildiMi?: boolean;
  yorumIstendiMi2?: boolean;
  anlastigiTarih?: string;
}

export interface Personel {
  id: string;
  ad: string;
  soyad: string;
  email: string;
  kullaniciTuru?: string;
  firmalar?: string[];
  yonettigiFirmalar?: string[];
}

export interface GorevAyari {
  aktif: boolean;
  baslangicTarihi: string;
}

export interface GorevAyarlari {
  yorumIstesinMi: GorevAyari;
  paylasimIzni: GorevAyari;
  yorumIstendiMi: GorevAyari;
  odemeTakip: GorevAyari;
}

// Composite key helper: görev ID = gelinId_gorevTuru_email
export function sanitizeEmail(email: string): string {
  return email.replace(/[^a-zA-Z0-9]/g, '_');
}

export function compositeGorevId(gelinId: string, gorevTuru: string, atananEmail: string): string {
  return `${gelinId}_${gorevTuru}_${sanitizeEmail(atananEmail)}`;
}

// UI yardımcıları
export const oncelikRenk = (oncelik: string) => {
  switch (oncelik) {
    case "acil": return "border-l-red-400";
    case "yuksek": return "border-l-amber-400";
    case "normal": return "border-l-sky-300";
    case "dusuk": return "border-l-stone-300";
    default: return "border-l-stone-200";
  }
};

export const durumBadge = (durum: string) => {
  switch (durum) {
    case "bekliyor": return "bg-yellow-50 text-yellow-700";
    case "devam-ediyor": return "bg-blue-50 text-blue-700";
    case "tamamlandi": return "bg-emerald-50 text-emerald-700";
    case "iptal": return "bg-stone-100 text-stone-600";
    default: return "bg-stone-100 text-stone-600";
  }
};

export const durumEmojiyon = (durum: string) => {
  switch (durum) {
    case "bekliyor": return "⏳";
    case "devam-ediyor": return "🔄";
    case "tamamlandi": return "✅";
    case "iptal": return "❌";
    default: return "📋";
  }
};

export const durumLabel = (durum: string) => {
  return durum === "devam-ediyor" ? "Devam" : durum.charAt(0).toUpperCase() + durum.slice(1);
};
