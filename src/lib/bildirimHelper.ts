import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  writeBatch,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import * as Sentry from "@sentry/react";

// ─── Bildirim Tipleri ───────────────────────────────────────────
export type BildirimTip =
  | "gorev_atama"     // Görev atandı
  | "gorev_tamam"     // Görev tamamlandı
  | "gorev_yorum"     // Göreve yorum yapıldı
  | "duyuru"          // Yeni duyuru
  | "izin"            // İzin talebi / onay / red
  | "sistem";         // Sistem bildirimi

export interface Bildirim {
  id: string;
  alici: string;          // alıcı email
  baslik: string;
  mesaj: string;
  tip: BildirimTip;
  okundu: boolean;
  tarih: Timestamp;
  route?: string;         // tıklayınca nereye gitsin
  gonderen?: string;      // gönderen email
  gonderenAd?: string;    // gönderen adı
}

export interface BildirimYazParams {
  alici: string;          // alıcı email
  baslik: string;
  mesaj: string;
  tip: BildirimTip;
  route?: string;
  gonderen?: string;
  gonderenAd?: string;
}

// ─── Bildirim Tip Ayarları ──────────────────────────────────────
export const BILDIRIM_AYARLARI: Record<BildirimTip, { ikon: string; renk: string }> = {
  gorev_atama:  { ikon: "📋", renk: "bg-blue-50 text-blue-600" },
  gorev_tamam:  { ikon: "✅", renk: "bg-[#EAF2ED] text-[#8FAF9A]" },
  gorev_yorum:  { ikon: "💬", renk: "bg-purple-50 text-purple-600" },
  duyuru:       { ikon: "📢", renk: "bg-[#EAF2ED] text-[#8FAF9A]" },
  izin:         { ikon: "🏖️", renk: "bg-teal-50 text-teal-600" },
  sistem:       { ikon: "⚙️", renk: "bg-[#F7F7F7] text-[#2F2F2F]" },
};

// ─── Bildirim Yaz ───────────────────────────────────────────────
// Tek bir alıcıya bildirim yazar
export async function bildirimYaz(params: BildirimYazParams): Promise<void> {
  try {
    await addDoc(collection(db, "bildirimler"), {
      alici: params.alici,
      baslik: params.baslik,
      mesaj: params.mesaj,
      tip: params.tip,
      okundu: false,
      tarih: serverTimestamp(),
      route: params.route || null,
      gonderen: params.gonderen || null,
      gonderenAd: params.gonderenAd || null,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "bildirim", action: "yaz" } });
  }
}

// Birden fazla alıcıya aynı bildirimi yazar (duyuru gibi)
export async function bildirimYazCoklu(
  alicilar: string[],
  params: Omit<BildirimYazParams, "alici">
): Promise<void> {
  // Firestore batch max 500 - 12 kişilik ekip için sorun olmaz
  const batch = writeBatch(db);

  for (const alici of alicilar) {
    const ref = doc(collection(db, "bildirimler"));
    batch.set(ref, {
      alici,
      baslik: params.baslik,
      mesaj: params.mesaj,
      tip: params.tip,
      okundu: false,
      tarih: serverTimestamp(),
      route: params.route || null,
      gonderen: params.gonderen || null,
      gonderenAd: params.gonderenAd || null,
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "bildirim", action: "yazCoklu" } });
  }
}

// ─── Okundu Yap ─────────────────────────────────────────────────
export async function bildirimOkunduYap(bildirimId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "bildirimler", bildirimId), {
      okundu: true,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "bildirim", action: "okundu" } });
  }
}

// Tümünü okundu yap (batch)
export async function bildirimTumunuOkunduYap(userEmail: string): Promise<void> {
  try {
    const q = query(
      collection(db, "bildirimler"),
      where("alici", "==", userEmail),
      where("okundu", "==", false)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
      batch.update(d.ref, { okundu: true });
    });
    await batch.commit();
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "bildirim", action: "topluOkundu" } });
  }
}

// ─── Bildirim Sil ───────────────────────────────────────────────
export async function bildirimSil(bildirimId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "bildirimler", bildirimId));
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "bildirim", action: "sil" } });
  }
}

// ─── Zaman Formatlama ───────────────────────────────────────────
// "az önce", "3dk", "2 saat", "dün", "3 gün önce" formatı
export function zamanFormat(tarih: Timestamp | null): string {
  if (!tarih) return "";

  const simdi = Date.now();
  const bildirimZaman = tarih.toMillis();
  const fark = simdi - bildirimZaman;

  const dakika = Math.floor(fark / 60000);
  const saat = Math.floor(fark / 3600000);
  const gun = Math.floor(fark / 86400000);

  if (dakika < 1) return "az önce";
  if (dakika < 60) return `${dakika}dk`;
  if (saat < 24) return `${saat} saat`;
  if (gun === 1) return "dün";
  if (gun < 7) return `${gun} gün önce`;
  if (gun < 30) return `${Math.floor(gun / 7)} hafta önce`;
  return `${Math.floor(gun / 30)} ay önce`;
}
