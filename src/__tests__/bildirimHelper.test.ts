/**
 * bildirimHelper.ts — Bildirim yardımcı fonksiyonları testleri
 *
 * Test edilen:
 *   zamanFormat (zaman farkı hesaplama)
 *   BILDIRIM_AYARLARI (sabit veriler)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { zamanFormat, BILDIRIM_AYARLARI } from "../lib/bildirimHelper";
import type { BildirimTip } from "../lib/bildirimHelper";

// Mock Timestamp helper
function mockTimestamp(date: Date) {
  return {
    toMillis: () => date.getTime(),
    toDate: () => date,
  };
}

// ─── zamanFormat ────────────────────────────────────────────────
describe("zamanFormat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Sabit: 15 Şubat 2026 12:00:00
    vi.setSystemTime(new Date(2026, 1, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("null → boş string", () => {
    expect(zamanFormat(null)).toBe("");
  });

  it("30 saniye önce → 'az önce'", () => {
    const ts = mockTimestamp(new Date(2026, 1, 15, 11, 59, 30));
    expect(zamanFormat(ts as any)).toBe("az önce");
  });

  it("5 dakika önce → '5dk'", () => {
    const ts = mockTimestamp(new Date(2026, 1, 15, 11, 55, 0));
    expect(zamanFormat(ts as any)).toBe("5dk");
  });

  it("45 dakika önce → '45dk'", () => {
    const ts = mockTimestamp(new Date(2026, 1, 15, 11, 15, 0));
    expect(zamanFormat(ts as any)).toBe("45dk");
  });

  it("2 saat önce → '2 saat'", () => {
    const ts = mockTimestamp(new Date(2026, 1, 15, 10, 0, 0));
    expect(zamanFormat(ts as any)).toBe("2 saat");
  });

  it("23 saat önce → '23 saat'", () => {
    const ts = mockTimestamp(new Date(2026, 1, 14, 13, 0, 0));
    expect(zamanFormat(ts as any)).toBe("23 saat");
  });

  it("dün → 'dün'", () => {
    const ts = mockTimestamp(new Date(2026, 1, 14, 10, 0, 0));
    expect(zamanFormat(ts as any)).toBe("dün");
  });

  it("3 gün önce → '3 gün önce'", () => {
    const ts = mockTimestamp(new Date(2026, 1, 12, 12, 0, 0));
    expect(zamanFormat(ts as any)).toBe("3 gün önce");
  });

  it("10 gün önce → '1 hafta önce'", () => {
    const ts = mockTimestamp(new Date(2026, 1, 5, 12, 0, 0));
    expect(zamanFormat(ts as any)).toBe("1 hafta önce");
  });

  it("45 gün önce → '1 ay önce'", () => {
    const ts = mockTimestamp(new Date(2026, 0, 1, 12, 0, 0));
    expect(zamanFormat(ts as any)).toBe("1 ay önce");
  });
});

// ─── BILDIRIM_AYARLARI ──────────────────────────────────────────
describe("BILDIRIM_AYARLARI", () => {
  const tipler: BildirimTip[] = [
    "gorev_atama",
    "gorev_tamam",
    "gorev_yorum",
    "duyuru",
    "izin",
    "sistem",
  ];

  it("tüm bildirim tiplerinin ayarları tanımlı", () => {
    tipler.forEach((tip) => {
      expect(BILDIRIM_AYARLARI[tip]).toBeDefined();
    });
  });

  it("her tip'te ikon ve renk alanı var", () => {
    tipler.forEach((tip) => {
      const ayar = BILDIRIM_AYARLARI[tip];
      expect(ayar.ikon).toBeTruthy();
      expect(ayar.renk).toBeTruthy();
    });
  });

  it("renk alanları Tailwind class formatında", () => {
    tipler.forEach((tip) => {
      const ayar = BILDIRIM_AYARLARI[tip];
      expect(ayar.renk).toMatch(/bg-|text-/);
    });
  });
});
