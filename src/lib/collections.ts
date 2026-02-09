/**
 * Firestore Koleksiyon İsimleri — Tek kaynak (Single Source of Truth)
 * 
 * Tüm collection() çağrılarında string literal yerine bu sabitleri kullanın.
 * Typo riski sıfırlanır, rename kolaylaşır, IDE autocomplete çalışır.
 * 
 * Kullanım:
 *   import { COLLECTIONS } from "../lib/collections";
 *   collection(db, COLLECTIONS.PERSONNEL)
 *   doc(db, COLLECTIONS.GOREVLER, gorevId)
 */

export const COLLECTIONS = {
  // Ana koleksiyonlar
  PERSONNEL: "personnel",
  GELINLER: "gelinler",
  GOREVLER: "gorevler",
  ANNOUNCEMENTS: "announcements",

  // Giriş-çıkış
  ATTENDANCE: "attendance",
  ATTENDANCE_CHANGES: "attendanceChanges",

  // İzinler
  IZINLER: "izinler",
  IZIN_DEGISIKLIK_KAYITLARI: "izinDegisiklikKayitlari",
  IZIN_HAK_DEGISIKLIKLERI: "izinHakDegisiklikleri",
  IZIN_TALEPLERI: "izinTalepleri",

  // Organizasyon
  COMPANIES: "companies",
  GROUP_TAGS: "groupTags",
  LOCATIONS: "locations",

  // Vardiya & Çalışma
  VARDIYA_PLAN: "vardiyaPlan",
  SHIFTS: "shifts",
  WORK_HOURS: "workHours",

  // Ayarlar & Hedefler
  SETTINGS: "settings",
  MONTHLY_TARGETS: "monthlyTargets",

  // Push & Sistem
  PUSH_TOKENS: "pushTokens",
  SYSTEM: "system",
  WEBHOOK_CHANNELS: "webhookChannels",
} as const;

// Type helper — koleksiyon isimlerinin union type'ı
export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];
