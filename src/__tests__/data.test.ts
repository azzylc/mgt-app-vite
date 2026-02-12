/**
 * data.ts — Tarih ve takvim yardımcı fonksiyonları testleri
 *
 * Test edilen fonksiyonlar:
 *   getYaklasanDogumGunleri, getYaklasanTatiller, getYaklasanAnmaGunleri
 *
 * ⚠️ Tüm testler sabitlenmiş tarih kullanır (vi.useFakeTimers)
 *   çünkü fonksiyonlar bugünün tarihine göre hesaplama yapar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getYaklasanDogumGunleri,
  getYaklasanTatiller,
  getYaklasanAnmaGunleri,
  resmiTatiller,
  anmaGunleri,
} from "../lib/data";

// ─── getYaklasanDogumGunleri ────────────────────────────────────
describe("getYaklasanDogumGunleri", () => {
  beforeEach(() => {
    // Sabit tarih: 1 Şubat 2026, 00:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 1, 0, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockPersoneller = [
    { id: "1", ad: "Ali", soyad: "Yılmaz", dogumTarihi: "1990-02-15", aktif: true },
    { id: "2", ad: "Ayşe", soyad: "Kaya", dogumTarihi: "1985-03-10", aktif: true },
    { id: "3", ad: "Mehmet", soyad: "Demir", dogumTarihi: "1992-01-20", aktif: true }, // Geçmiş → gelecek yıl
    { id: "4", ad: "Fatma", soyad: "Koç", dogumTarihi: "1988-06-25", aktif: false },  // Aktif değil
  ];

  it("aktif personellerin doğum günlerini döndürür", () => {
    const result = getYaklasanDogumGunleri(mockPersoneller);
    const isimler = result.map((r) => r.isim);
    expect(isimler).toContain("Ali Yılmaz");
    expect(isimler).toContain("Ayşe Kaya");
    expect(isimler).not.toContain("Fatma Koç"); // Aktif değil
  });

  it("kalan gün sırasına göre sıralar", () => {
    const result = getYaklasanDogumGunleri(mockPersoneller);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].kalanGun).toBeGreaterThanOrEqual(result[i - 1].kalanGun);
    }
  });

  it("geçmiş doğum gününü gelecek yıla taşır", () => {
    // Mehmet: 20 Ocak → 1 Şubat itibariyle geçmiş → 2027-01-20
    const result = getYaklasanDogumGunleri(mockPersoneller);
    const mehmet = result.find((r) => r.isim === "Mehmet Demir");
    expect(mehmet).toBeDefined();
    expect(mehmet!.yaklasanTarih).toBe("2027-01-20");
  });

  it("yakın doğum günü daha az kalan gün gösterir", () => {
    // Ali: 15 Şubat → 14 gün kala
    const result = getYaklasanDogumGunleri(mockPersoneller);
    const ali = result.find((r) => r.isim === "Ali Yılmaz");
    expect(ali).toBeDefined();
    expect(ali!.kalanGun).toBe(14);
  });

  it("dogumTarihi olmayan personeli atlar", () => {
    const eksikData = [
      { id: "5", ad: "Veli", soyad: "Can", aktif: true },
      { id: "1", ad: "Ali", soyad: "Yılmaz", dogumTarihi: "1990-02-15", aktif: true },
    ];
    const result = getYaklasanDogumGunleri(eksikData);
    expect(result).toHaveLength(1);
    expect(result[0].isim).toBe("Ali Yılmaz");
  });

  it("boş liste için boş array döndürür", () => {
    expect(getYaklasanDogumGunleri([])).toEqual([]);
  });

  it("emoji alanını korur, yoksa varsayılan 🎂", () => {
    const withEmoji = [
      { id: "1", ad: "Ali", soyad: "Yılmaz", dogumTarihi: "1990-02-15", emoji: "🌟", aktif: true },
    ];
    const result = getYaklasanDogumGunleri(withEmoji);
    expect(result[0].emoji).toBe("🌟");

    const withoutEmoji = [
      { id: "2", ad: "Ayşe", soyad: "Kaya", dogumTarihi: "1985-03-10", aktif: true },
    ];
    const result2 = getYaklasanDogumGunleri(withoutEmoji);
    expect(result2[0].emoji).toBe("🎂");
  });
});

// ─── getYaklasanTatiller ────────────────────────────────────────
describe("getYaklasanTatiller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 15 Şubat 2026
    vi.setSystemTime(new Date(2026, 1, 15, 0, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("boş olmayan array döndürür", () => {
    const result = getYaklasanTatiller();
    expect(result.length).toBeGreaterThan(0);
  });

  it("sadece gelecekteki tatilleri döndürür (bugünden itibaren)", () => {
    const result = getYaklasanTatiller();
    const bugunStr = "2026-02-15";
    result.forEach((t) => {
      expect(t.tarih >= bugunStr).toBe(true);
    });
  });

  it("tarih sırasına göre sıralanır", () => {
    const result = getYaklasanTatiller();
    for (let i = 1; i < result.length; i++) {
      expect(result[i].tarih >= result[i - 1].tarih).toBe(true);
    }
  });

  it("Ramazan Bayramı 2026'yı içerir", () => {
    const result = getYaklasanTatiller();
    const ramazan = result.find((t) => t.isim.includes("Ramazan"));
    expect(ramazan).toBeDefined();
    expect(ramazan!.tarih).toBe("2026-03-20");
    expect(ramazan!.sure).toBe(3);
  });

  it("10 aydan uzak tatilleri dahil etmez", () => {
    const result = getYaklasanTatiller();
    const onAySonra = new Date(2026, 1 + 10, 15);
    const limitStr = `${onAySonra.getFullYear()}-${String(onAySonra.getMonth() + 1).padStart(2, "0")}-${String(onAySonra.getDate()).padStart(2, "0")}`;
    result.forEach((t) => {
      expect(t.tarih <= limitStr).toBe(true);
    });
  });

  it("geçmiş tatilleri dahil etmez (Yılbaşı 2026)", () => {
    const result = getYaklasanTatiller();
    const yilbasi = result.find((t) => t.tarih === "2026-01-01");
    expect(yilbasi).toBeUndefined();
  });

  it("her tatilde isim ve sure alanı var", () => {
    const result = getYaklasanTatiller();
    result.forEach((t) => {
      expect(t.isim).toBeTruthy();
      expect(t.sure).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── getYaklasanAnmaGunleri ─────────────────────────────────────
describe("getYaklasanAnmaGunleri", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 1 Mart 2026
    vi.setSystemTime(new Date(2026, 2, 1, 0, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("boş olmayan array döndürür", () => {
    const result = getYaklasanAnmaGunleri();
    expect(result.length).toBeGreaterThan(0);
  });

  it("kalanGun sırasına göre sıralanır", () => {
    const result = getYaklasanAnmaGunleri();
    for (let i = 1; i < result.length; i++) {
      expect(result[i].kalanGun).toBeGreaterThanOrEqual(result[i - 1].kalanGun);
    }
  });

  it("Çanakkale Zaferi (18 Mart) yakın gelir", () => {
    const result = getYaklasanAnmaGunleri();
    const canakkale = result.find((a) => a.isim.includes("Çanakkale"));
    expect(canakkale).toBeDefined();
    expect(canakkale!.kalanGun).toBe(17); // 1 Mart → 18 Mart = 17 gün
  });

  it("geçmiş anma gününü gelecek yıla taşır", () => {
    // 1 Mart 2026'da → 10 Kasım 2025 geçmiş
    // → 10 Kasım 2026'ya taşınmalı (254 gün sonra)
    const result = getYaklasanAnmaGunleri();
    const ataturk = result.find((a) => a.isim.includes("Atatürk"));
    expect(ataturk).toBeDefined();
    expect(ataturk!.tarihStr).toContain("2026");
  });

  it("her anma gününde emoji var", () => {
    const result = getYaklasanAnmaGunleri();
    result.forEach((a) => {
      expect(a.emoji).toBeTruthy();
    });
  });

  it("365 günden uzak olanları filtrelemez (tümü 1 yıl içinde)", () => {
    const result = getYaklasanAnmaGunleri();
    result.forEach((a) => {
      expect(a.kalanGun).toBeLessThanOrEqual(365);
    });
  });
});

// ─── Statik veri tutarlılık testleri ────────────────────────────
describe("resmiTatiller veri tutarlılığı", () => {
  it("her tatilde tarih, isim ve sure alanı var", () => {
    resmiTatiller.forEach((t) => {
      expect(t.tarih).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.isim).toBeTruthy();
      expect(t.sure).toBeGreaterThanOrEqual(1);
    });
  });

  it("tarihler geçerli Date objesi oluşturur", () => {
    resmiTatiller.forEach((t) => {
      const d = new Date(t.tarih);
      expect(isNaN(d.getTime())).toBe(false);
    });
  });

  it("2026 ve 2027 tatilleri mevcut", () => {
    const yillar = resmiTatiller.map((t) => t.tarih.substring(0, 4));
    expect(yillar).toContain("2026");
    expect(yillar).toContain("2027");
  });
});

describe("anmaGunleri veri tutarlılığı", () => {
  it("ay 1-12 arasında, gün 1-31 arasında", () => {
    anmaGunleri.forEach((a) => {
      expect(a.ay).toBeGreaterThanOrEqual(1);
      expect(a.ay).toBeLessThanOrEqual(12);
      expect(a.gun).toBeGreaterThanOrEqual(1);
      expect(a.gun).toBeLessThanOrEqual(31);
    });
  });

  it("her anma gününde emoji ve isim var", () => {
    anmaGunleri.forEach((a) => {
      expect(a.isim).toBeTruthy();
      expect(a.emoji).toBeTruthy();
    });
  });
});
