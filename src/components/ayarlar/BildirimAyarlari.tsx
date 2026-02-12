import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import * as Sentry from '@sentry/react';

// ─── Tipler ─────────────────────────────────────────────────────
interface BildirimTipAyar {
  gorev_atama: boolean;
  gorev_tamam: boolean;
  gorev_yorum: boolean;
  duyuru: boolean;
  gunluk_hatirlatma: boolean;
  otomatik_birikti: boolean;
  otomatik_hatirlatma: boolean;
}

interface SessizSaatler {
  aktif: boolean;
  baslangic: string; // "22:00"
  bitis: string;     // "08:00"
}

interface HatirlatmaSaatleri {
  gunlukGorev: string;   // "09:00"
  otomatikGorev: string; // "10:00"
}

interface BildirimAyarlari {
  tipler: BildirimTipAyar;
  sessizSaatler: SessizSaatler;
  hatirlatmaSaatleri: HatirlatmaSaatleri;
  otomatikGorevEsik: number;
}

// ─── Varsayılan Ayarlar ─────────────────────────────────────────
const VARSAYILAN: BildirimAyarlari = {
  tipler: {
    gorev_atama: true,
    gorev_tamam: true,
    gorev_yorum: true,
    duyuru: true,
    gunluk_hatirlatma: true,
    otomatik_birikti: true,
    otomatik_hatirlatma: true,
  },
  sessizSaatler: {
    aktif: false,
    baslangic: "22:00",
    bitis: "08:00",
  },
  hatirlatmaSaatleri: {
    gunlukGorev: "09:00",
    otomatikGorev: "10:00",
  },
  otomatikGorevEsik: 10,
};

// ─── Bildirim tip açıklamaları ──────────────────────────────────
const BILDIRIM_TIPLERI: { key: keyof BildirimTipAyar; label: string; icon: string; desc: string }[] = [
  { key: "gorev_atama", label: "Görev Atama", icon: "📋", desc: "Yeni görev atandığında bildirim" },
  { key: "gorev_tamam", label: "Görev Tamamlama", icon: "✅", desc: "Görev tamamlandığında bildirim" },
  { key: "gorev_yorum", label: "Görev Yorum", icon: "💬", desc: "Göreve yorum yapıldığında bildirim" },
  { key: "duyuru", label: "Duyuru", icon: "📢", desc: "Yeni duyuru paylaşıldığında bildirim" },
  { key: "gunluk_hatirlatma", label: "Günlük Hatırlatma", icon: "⏰", desc: "Son tarihi yaklaşan görevler (09:00)" },
  { key: "otomatik_birikti", label: "Otomatik Görev Birikti", icon: "📋", desc: "10+ otomatik görev biriktiğinde tek seferlik uyarı" },
  { key: "otomatik_hatirlatma", label: "Otomatik Görev Hatırlatma", icon: "🔁", desc: "10+ otomatik görevi olanlara günlük hatırlatma (10:00)" },
];

// ─── Saat seçenekleri ───────────────────────────────────────────
const SAAT_SECENEKLERI = Array.from({ length: 24 }, (_, i) => {
  const saat = String(i).padStart(2, "0") + ":00";
  return saat;
});

// ─── Component ──────────────────────────────────────────────────
export default function BildirimAyarlari() {
  const [ayarlar, setAyarlar] = useState<BildirimAyarlari>(VARSAYILAN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [degisti, setDegisti] = useState(false);

  // Firestore'dan yükle
  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "bildirimAyarlari"));
        if (snap.exists()) {
          const data = snap.data() as Partial<BildirimAyarlari>;
          setAyarlar({
            tipler: { ...VARSAYILAN.tipler, ...data.tipler },
            sessizSaatler: { ...VARSAYILAN.sessizSaatler, ...data.sessizSaatler },
            hatirlatmaSaatleri: { ...VARSAYILAN.hatirlatmaSaatleri, ...data.hatirlatmaSaatleri },
            otomatikGorevEsik: data.otomatikGorevEsik ?? VARSAYILAN.otomatikGorevEsik,
          });
        }
      } catch (err) {
        Sentry.captureException(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  // Kaydet
  const handleKaydet = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "bildirimAyarlari"), ayarlar);
      setDegisti(false);
      alert("✅ Bildirim ayarları kaydedildi!");
    } catch (err) {
      Sentry.captureException(err);
      alert("❌ Kaydetme hatası!");
    } finally {
      setSaving(false);
    }
  };

  // Tip toggle
  const toggleTip = (key: keyof BildirimTipAyar) => {
    setAyarlar(prev => ({
      ...prev,
      tipler: { ...prev.tipler, [key]: !prev.tipler[key] }
    }));
    setDegisti(true);
  };

  // Genel update helper
  const update = (patch: Partial<BildirimAyarlari>) => {
    setAyarlar(prev => ({ ...prev, ...patch }));
    setDegisti(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8FAF9A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Bildirim Tipleri ─────────────────────────────── */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E5E5E5]">
        <h2 className="text-lg font-bold text-[#2F2F2F] mb-1 flex items-center gap-2">
          <span>📱</span> Bildirim Tipleri
        </h2>
        <p className="text-xs text-[#8A8A8A] mb-4">Hangi tür bildirimlerin gönderileceğini belirleyin</p>

        <div className="space-y-1">
          {BILDIRIM_TIPLERI.map(tip => (
            <label
              key={tip.key}
              className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-[#F7F7F7] cursor-pointer transition"
            >
              <div className="relative">
                <input
                  type="checkbox"
                  checked={ayarlar.tipler[tip.key]}
                  onChange={() => toggleTip(tip.key)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-[#E5E5E5] rounded-full peer-checked:bg-[#8FAF9A] transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </div>
              <span className="text-base">{tip.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#2F2F2F]">{tip.label}</p>
                <p className="text-xs text-[#8A8A8A]">{tip.desc}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                ayarlar.tipler[tip.key]
                  ? "bg-[#EAF2ED] text-[#8FAF9A]"
                  : "bg-[#F7F7F7] text-[#8A8A8A]"
              }`}>
                {ayarlar.tipler[tip.key] ? "Açık" : "Kapalı"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* ── 2. Sessiz Saatler ──────────────────────────────── */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E5E5E5]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-[#2F2F2F] flex items-center gap-2">
            <span>🌙</span> Sessiz Saatler
          </h2>
          <label className="relative cursor-pointer">
            <input
              type="checkbox"
              checked={ayarlar.sessizSaatler.aktif}
              onChange={(e) => update({ sessizSaatler: { ...ayarlar.sessizSaatler, aktif: e.target.checked } })}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-[#E5E5E5] rounded-full peer-checked:bg-[#8FAF9A] transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
          </label>
        </div>
        <p className="text-xs text-[#8A8A8A] mb-4">
          Belirlenen saat aralığında push bildirim gönderilmez
        </p>

        <div className={`grid grid-cols-2 gap-4 transition-opacity ${ayarlar.sessizSaatler.aktif ? "" : "opacity-40 pointer-events-none"}`}>
          <div>
            <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Başlangıç</label>
            <select
              value={ayarlar.sessizSaatler.baslangic}
              onChange={(e) => update({ sessizSaatler: { ...ayarlar.sessizSaatler, baslangic: e.target.value } })}
              className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm bg-white"
            >
              {SAAT_SECENEKLERI.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Bitiş</label>
            <select
              value={ayarlar.sessizSaatler.bitis}
              onChange={(e) => update({ sessizSaatler: { ...ayarlar.sessizSaatler, bitis: e.target.value } })}
              className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm bg-white"
            >
              {SAAT_SECENEKLERI.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {ayarlar.sessizSaatler.aktif && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[#8A8A8A] bg-[#F7F7F7] px-3 py-2 rounded-lg">
            <span>💤</span>
            <span>
              Her gece <strong className="text-[#2F2F2F]">{ayarlar.sessizSaatler.baslangic}</strong> ile{" "}
              <strong className="text-[#2F2F2F]">{ayarlar.sessizSaatler.bitis}</strong> arası push bildirim gönderilmeyecek
            </span>
          </div>
        )}
      </div>

      {/* ── 3. Hatırlatma Saatleri ─────────────────────────── */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E5E5E5]">
        <h2 className="text-lg font-bold text-[#2F2F2F] mb-1 flex items-center gap-2">
          <span>⏰</span> Hatırlatma Saatleri
        </h2>
        <p className="text-xs text-[#8A8A8A] mb-4">Otomatik hatırlatma bildirimlerinin gönderim saatleri</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Günlük Görev Hatırlatma</label>
            <select
              value={ayarlar.hatirlatmaSaatleri.gunlukGorev}
              onChange={(e) => update({ hatirlatmaSaatleri: { ...ayarlar.hatirlatmaSaatleri, gunlukGorev: e.target.value } })}
              className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm bg-white"
            >
              {SAAT_SECENEKLERI.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="text-[10px] text-[#8A8A8A] mt-1">Son tarihi yaklaşan görev uyarıları</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Otomatik Görev Hatırlatma</label>
            <select
              value={ayarlar.hatirlatmaSaatleri.otomatikGorev}
              onChange={(e) => update({ hatirlatmaSaatleri: { ...ayarlar.hatirlatmaSaatleri, otomatikGorev: e.target.value } })}
              className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm bg-white"
            >
              {SAAT_SECENEKLERI.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="text-[10px] text-[#8A8A8A] mt-1">Birikmiş otomatik görev hatırlatması</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-[#8A8A8A] bg-amber-50 px-3 py-2 rounded-lg">
          <span>⚠️</span>
          <span>Saat değişikliği kayıt sonrası aktif olur. Fonksiyonlar saatlik kontrol eder.</span>
        </div>
      </div>

      {/* ── 4. Eşik Değeri ─────────────────────────────────── */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E5E5E5]">
        <h2 className="text-lg font-bold text-[#2F2F2F] mb-1 flex items-center gap-2">
          <span>🎯</span> Eşik Değeri
        </h2>
        <p className="text-xs text-[#8A8A8A] mb-4">
          Otomatik görev birikti uyarısı ve günlük hatırlatma için gereken minimum görev sayısı
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const v = Math.max(1, ayarlar.otomatikGorevEsik - 1);
              update({ otomatikGorevEsik: v });
            }}
            className="w-10 h-10 rounded-lg bg-[#F7F7F7] hover:bg-[#E5E5E5] text-[#2F2F2F] font-bold text-lg transition flex items-center justify-center"
          >
            −
          </button>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={100}
              value={ayarlar.otomatikGorevEsik}
              onChange={(e) => {
                const v = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                update({ otomatikGorevEsik: v });
              }}
              className="w-20 text-center text-2xl font-bold text-[#2F2F2F] border border-[#E5E5E5] rounded-lg py-2 focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]"
            />
            <span className="text-sm text-[#8A8A8A]">görev</span>
          </div>
          <button
            onClick={() => {
              const v = Math.min(100, ayarlar.otomatikGorevEsik + 1);
              update({ otomatikGorevEsik: v });
            }}
            className="w-10 h-10 rounded-lg bg-[#F7F7F7] hover:bg-[#E5E5E5] text-[#2F2F2F] font-bold text-lg transition flex items-center justify-center"
          >
            +
          </button>
        </div>

        <p className="text-xs text-[#8A8A8A] mt-3">
          Bir kişiye atanan otomatik görev sayısı <strong className="text-[#2F2F2F]">{ayarlar.otomatikGorevEsik}</strong>'a
          ulaştığında "birikti" bildirimi gönderilir ve günlük hatırlatma başlar.
        </p>
      </div>

      {/* ── Kaydet Butonu ──────────────────────────────────── */}
      <div className="sticky bottom-4">
        <button
          onClick={handleKaydet}
          disabled={!degisti || saving}
          className={`w-full py-3 rounded-lg text-sm font-medium transition shadow-lg ${
            degisti
              ? "bg-rose-500 hover:bg-rose-600 text-white"
              : "bg-[#E5E5E5] text-[#8A8A8A] cursor-not-allowed"
          }`}
        >
          {saving ? "Kaydediliyor..." : degisti ? "💾 Bildirim Ayarlarını Kaydet" : "✓ Kaydedildi"}
        </button>
      </div>
    </div>
  );
}
