/**
 * collections.ts — Firestore koleksiyon sabitleri testleri
 *
 * Koleksiyon isimlerinin doğruluğunu ve tutarlılığını test eder.
 * Typo veya yanlışlıkla değişiklik yapılmasını engeller.
 */
import { describe, it, expect } from "vitest";
import { COLLECTIONS } from "../lib/collections";

describe("COLLECTIONS", () => {
  it("kritik koleksiyon isimleri doğru", () => {
    expect(COLLECTIONS.PERSONNEL).toBe("personnel");
    expect(COLLECTIONS.GELINLER).toBe("gelinler");
    expect(COLLECTIONS.GOREVLER).toBe("gorevler");
    expect(COLLECTIONS.ATTENDANCE).toBe("attendance");
    expect(COLLECTIONS.IZINLER).toBe("izinler");
    expect(COLLECTIONS.VARDIYA_PLAN).toBe("vardiyaPlan");
    expect(COLLECTIONS.SETTINGS).toBe("settings");
  });

  it("tüm değerler boş olmayan string", () => {
    Object.entries(COLLECTIONS).forEach(([key, value]) => {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    });
  });

  it("duplicate koleksiyon ismi yok", () => {
    const values = Object.values(COLLECTIONS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("koleksiyon isimleri küçük harf veya camelCase (Firestore convention)", () => {
    Object.values(COLLECTIONS).forEach((value) => {
      // İlk harf küçük olmalı
      expect(value[0]).toBe(value[0].toLowerCase());
      // Boşluk veya özel karakter olmamalı
      expect(value).toMatch(/^[a-zA-Z]+$/);
    });
  });

  it("beklenen sayıda koleksiyon var (refactor'da biri eksik kalmasın)", () => {
    const count = Object.keys(COLLECTIONS).length;
    expect(count).toBeGreaterThanOrEqual(15);
  });
});
