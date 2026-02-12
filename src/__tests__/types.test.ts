/**
 * types.ts — Görev helper fonksiyonları testleri
 *
 * Test edilen fonksiyonlar:
 *   sanitizeEmail, compositeGorevId,
 *   oncelikRenk, durumBadge, durumEmojiyon, durumLabel
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeEmail,
  compositeGorevId,
  oncelikRenk,
  durumBadge,
  durumEmojiyon,
  durumLabel,
} from "../components/gorevler/types";

// ─── sanitizeEmail ──────────────────────────────────────────────
describe("sanitizeEmail", () => {
  it("@ ve . karakterlerini _ ile değiştirir", () => {
    expect(sanitizeEmail("test@gmail.com")).toBe("test_gmail_com");
  });

  it("boş string'de hata vermez", () => {
    expect(sanitizeEmail("")).toBe("");
  });

  it("özel karakterleri temizler (- + !)", () => {
    expect(sanitizeEmail("ali-veli+test@mail.co")).toBe("ali_veli_test_mail_co");
  });

  it("sadece alfanumerik içeren string'i olduğu gibi döndürür", () => {
    expect(sanitizeEmail("testuser123")).toBe("testuser123");
  });
});

// ─── compositeGorevId ───────────────────────────────────────────
describe("compositeGorevId", () => {
  it("gelinId_gorevTuru_sanitizedEmail formatında ID üretir", () => {
    const result = compositeGorevId("gelin123", "yorumIstesinMi", "ali@test.com");
    expect(result).toBe("gelin123_yorumIstesinMi_ali_test_com");
  });

  it("farklı parametreler farklı ID üretir", () => {
    const id1 = compositeGorevId("g1", "paylasimIzni", "a@b.com");
    const id2 = compositeGorevId("g2", "paylasimIzni", "a@b.com");
    expect(id1).not.toBe(id2);
  });

  it("aynı parametreler aynı ID üretir (deterministic)", () => {
    const id1 = compositeGorevId("g1", "odemeTakip", "x@y.com");
    const id2 = compositeGorevId("g1", "odemeTakip", "x@y.com");
    expect(id1).toBe(id2);
  });
});

// ─── oncelikRenk ────────────────────────────────────────────────
describe("oncelikRenk", () => {
  it("acil → kırmızı border", () => {
    expect(oncelikRenk("acil")).toContain("D96C6C");
  });

  it("yuksek → sarı border", () => {
    expect(oncelikRenk("yuksek")).toContain("E6B566");
  });

  it("normal → mavi border", () => {
    expect(oncelikRenk("normal")).toContain("sky");
  });

  it("dusuk → gri border", () => {
    expect(oncelikRenk("dusuk")).toContain("8A8A8A");
  });

  it("bilinmeyen değer → default border", () => {
    expect(oncelikRenk("xxx")).toContain("E5E5E5");
  });
});

// ─── durumBadge ─────────────────────────────────────────────────
describe("durumBadge", () => {
  it("bekliyor → sarı badge", () => {
    expect(durumBadge("bekliyor")).toContain("E6B566");
  });

  it("devam-ediyor → mavi badge", () => {
    expect(durumBadge("devam-ediyor")).toContain("blue");
  });

  it("tamamlandi → yeşil badge", () => {
    expect(durumBadge("tamamlandi")).toContain("8FAF9A");
  });

  it("iptal → gri badge", () => {
    expect(durumBadge("iptal")).toContain("F7F7F7");
  });

  it("bilinmeyen durum → default gri", () => {
    expect(durumBadge("random")).toContain("F7F7F7");
  });
});

// ─── durumEmojiyon ──────────────────────────────────────────────
describe("durumEmojiyon", () => {
  it("bekliyor → ⏳", () => {
    expect(durumEmojiyon("bekliyor")).toBe("⏳");
  });

  it("devam-ediyor → 🔄", () => {
    expect(durumEmojiyon("devam-ediyor")).toBe("🔄");
  });

  it("tamamlandi → ✅", () => {
    expect(durumEmojiyon("tamamlandi")).toBe("✅");
  });

  it("iptal → ❌", () => {
    expect(durumEmojiyon("iptal")).toBe("❌");
  });

  it("bilinmeyen → 📋", () => {
    expect(durumEmojiyon("xxx")).toBe("📋");
  });
});

// ─── durumLabel ─────────────────────────────────────────────────
describe("durumLabel", () => {
  it("devam-ediyor → 'Devam'", () => {
    expect(durumLabel("devam-ediyor")).toBe("Devam");
  });

  it("bekliyor → 'Bekliyor' (capitalize)", () => {
    expect(durumLabel("bekliyor")).toBe("Bekliyor");
  });

  it("tamamlandi → 'Tamamlandi' (capitalize)", () => {
    expect(durumLabel("tamamlandi")).toBe("Tamamlandi");
  });

  it("iptal → 'İptal' (capitalize)", () => {
    // "iptal" → "I" + "ptal" (Turkish I edge case)
    expect(durumLabel("iptal")).toBe("Iptal");
  });
});
