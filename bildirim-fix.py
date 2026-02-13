#!/usr/bin/env python3
"""
Bildirim Routing Fix — Python Patch Script
Kullanım: cd ~/Desktop/mgt-app-vite && python3 bildirim-fix.py
"""
import re
import os

BASE = os.path.expanduser("~/Desktop/mgt-app-vite/src")

def patch_file(path, replacements):
    """replacements: list of (old, new) tuples"""
    full = os.path.join(BASE, path)
    with open(full, "r", encoding="utf-8") as f:
        content = f.read()
    
    for old, new in replacements:
        if old not in content:
            print(f"  ⚠️  BULUNAMADI: {old[:60]}...")
            continue
        content = content.replace(old, new, 1)
        print(f"  ✅ Değiştirildi: {old[:60]}...")
    
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  📝 Kaydedildi: {path}")

# =====================================================
# 1) TaleplerMerkezi.tsx
# =====================================================
print("\n🔧 TaleplerMerkezi.tsx")
patch_file("pages/TaleplerMerkezi.tsx", [
    # 1a: Import ekle
    (
        'import { useAuth, useRole } from "../context/RoleProvider";',
        'import { useAuth, useRole } from "../context/RoleProvider";\nimport { useSearchParams } from "react-router-dom";'
    ),
    # 1b: bildirimPersonele fonksiyonunu güncelle
    (
        '''const bildirimPersonele = async (email: string, baslik: string, mesaj: string) => {
    try {
      bildirimYazCoklu([email], {
        baslik, mesaj, tip: "sistem", route: "/taleplerim",
        gonderen: user?.email || "", gonderenAd: kurucuAd,
      });
    } catch (err) { console.warn(err); }
  };''',
        '''const bildirimPersonele = async (
    email: string,
    baslik: string,
    mesaj: string,
    bildirimTip: "sistem" | "izin" = "sistem",
    bildirimRoute: string = "/taleplerim"
  ) => {
    try {
      bildirimYazCoklu([email], {
        baslik, mesaj, tip: bildirimTip, route: bildirimRoute,
        gonderen: user?.email || "", gonderenAd: kurucuAd,
      });
    } catch (err) { console.warn(err); }
  };'''
    ),
    # 1c: İzin onay bildirimini düzelt
    (
        'await bildirimPersonele(talep.personelEmail, "İzin Talebi Onaylandı", `${talep.gunSayisi} günlük ${talep.izinTuru} talebiniz onaylandı`);',
        '''await bildirimPersonele(
          talep.personelEmail,
          "İzin Talebi Onaylandı",
          `${talep.gunSayisi} günlük ${talep.izinTuru} talebiniz onaylandı`,
          "izin",
          "/taleplerim?tab=izin"
        );'''
    ),
    # 1d: İzin red bildirimini düzelt
    (
        'await bildirimPersonele(talep.personelEmail, "İzin Talebi Reddedildi", sebep ? `Talebiniz reddedildi: ${sebep}` : "Talebiniz reddedildi");',
        '''await bildirimPersonele(
          talep.personelEmail,
          "İzin Talebi Reddedildi",
          sebep ? `Talebiniz reddedildi: ${sebep}` : "Talebiniz reddedildi",
          "izin",
          "/taleplerim?tab=izin"
        );'''
    ),
    # 1e: URL'den tab parametresini oku
    (
        'const [aktifSekme, setAktifSekme] = useState<Sekme>("izin");',
        '''const [searchParams, setSearchParams] = useSearchParams();
  const [aktifSekme, setAktifSekme] = useState<Sekme>("izin");

  // URL'den ?tab=izin parametresini oku → bildirimden gelince doğru sekme açılır
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["izin", "profil", "oneri", "avans"].includes(tabParam)) {
      setAktifSekme(tabParam as Sekme);
      searchParams.delete("tab");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);'''
    ),
])

# =====================================================
# 2) Taleplerim.tsx
# =====================================================
print("\n🔧 Taleplerim.tsx")
patch_file("pages/Taleplerim.tsx", [
    # 2a: Import ekle
    (
        'import { useState, useEffect, useRef } from "react";',
        'import { useState, useEffect, useRef } from "react";\nimport { useSearchParams } from "react-router-dom";'
    ),
    # 2b: aktifSekme + useEffect ekle
    (
        'const [aktifSekme, setAktifSekme] = useState<Sekme>("izin");',
        '''const [searchParams, setSearchParams] = useSearchParams();
  const [aktifSekme, setAktifSekme] = useState<Sekme>("izin");

  // URL'den ?tab=izin parametresini oku → bildirimden gelince doğru sekme açılır
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["izin", "profil", "oneri", "avans"].includes(tabParam)) {
      setAktifSekme(tabParam as Sekme);
      searchParams.delete("tab");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);'''
    ),
    # 2c: bildirimKurucuya fonksiyonunu güncelle
    (
        '''const bildirimKurucuya = async (baslik: string, mesaj: string) => {
    try {
      const kurucuQ = query(collection(db, "personnel"), where("kullaniciTuru", "==", "Kurucu"), where("aktif", "==", true));
      const kurucuSnap = await getDocs(kurucuQ);
      const alicilar = kurucuSnap.docs.map(d => d.data().email as string).filter(e => e && e !== user?.email);
      if (alicilar.length > 0) {
        bildirimYazCoklu(alicilar, {
          baslik, mesaj, tip: "sistem", route: "/talepler-merkezi",
          gonderen: user?.email || "", gonderenAd: fullName,
        });
      }
    } catch (err) { console.warn("Bildirim gönderilemedi:", err); }
  };''',
        '''const bildirimKurucuya = async (
    baslik: string,
    mesaj: string,
    bildirimTip: "sistem" | "izin" = "sistem",
    bildirimRoute: string = "/talepler-merkezi"
  ) => {
    try {
      const kurucuQ = query(collection(db, "personnel"), where("kullaniciTuru", "==", "Kurucu"), where("aktif", "==", true));
      const kurucuSnap = await getDocs(kurucuQ);
      const alicilar = kurucuSnap.docs.map(d => d.data().email as string).filter(e => e && e !== user?.email);
      if (alicilar.length > 0) {
        bildirimYazCoklu(alicilar, {
          baslik, mesaj, tip: bildirimTip, route: bildirimRoute,
          gonderen: user?.email || "", gonderenAd: fullName,
        });
      }
    } catch (err) { console.warn("Bildirim gönderilemedi:", err); }
  };'''
    ),
    # 2d: İzin talebi gönderiminde doğru tip
    (
        'await bildirimKurucuya("İzin Talebi", `${fullName} ${gunSayisi} günlük ${izinTuru} talep etti`);',
        '''await bildirimKurucuya(
        "İzin Talebi",
        `${fullName} ${gunSayisi} günlük ${izinTuru} talep etti`,
        "izin",
        "/talepler-merkezi?tab=izin"
      );'''
    ),
])

print("\n" + "="*50)
print("✅ Tüm patch'ler uygulandı!")
print("="*50)
print("\n⚠️  BildirimPaneli.tsx ayrı cat komutuyla yazıldı.")
print("📦 Şimdi build test: npm run build")
