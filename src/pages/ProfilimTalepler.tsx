import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, updateDoc, getDocs, where } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";
import { useRole } from "../context/RoleProvider";
import { bildirimYazCoklu } from "../lib/bildirimHelper";

interface DegisiklikTalebi {
  id: string;
  personelEmail: string;
  personelAd: string;
  degisiklikler: { alan: string; mevcutDeger: string; yeniDeger: string }[];
  durum: "bekliyor" | "onaylandi" | "reddedildi";
  createdAt: any;
  yanitNotu?: string;
}

type Filtre = "bekliyor" | "tumu";

export default function ProfilimTalepler() {
  const user = useAuth();
  const { personelData } = useRole();
  const [talepler, setTalepler] = useState<DegisiklikTalebi[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>("bekliyor");
  const [islemYapilan, setIslemYapilan] = useState<string | null>(null);

  const isKurucu = personelData?.kullaniciTuru === "Kurucu";

  useEffect(() => {
    const q = query(collection(db, "profilDegisiklikleri"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setTalepler(snap.docs.map(d => ({ id: d.id, ...d.data() } as DegisiklikTalebi)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const filtrelenmis = filtre === "bekliyor"
    ? talepler.filter(t => t.durum === "bekliyor")
    : talepler;

  const handleOnayla = async (talep: DegisiklikTalebi) => {
    if (!confirm(`${talep.personelAd} talebini onaylamak istediğinize emin misiniz?\n\nBu işlem bilgileri otomatik değiştirmez, sadece talebi onaylandı olarak işaretler.`)) return;

    setIslemYapilan(talep.id);
    try {
      await updateDoc(doc(db, "profilDegisiklikleri", talep.id), {
        durum: "onaylandi",
        yanitNotu: "Kurucu tarafından onaylandı",
      });

      // Personele bildirim
      bildirimYazCoklu([talep.personelEmail], {
        baslik: "Profil Talebi Onaylandı",
        mesaj: "Profil değişiklik talebiniz onaylandı",
        tip: "sistem",
        route: "/profilim",
        gonderen: user?.email || "",
        gonderenAd: personelData?.ad ? `${personelData.ad} ${personelData.soyad}` : "Kurucu",
      });
    } catch (err) {
      Sentry.captureException(err);
      alert("İşlem başarısız!");
    } finally { setIslemYapilan(null); }
  };

  const handleReddet = async (talep: DegisiklikTalebi) => {
    const notu = prompt("Reddetme sebebi (opsiyonel):");
    if (notu === null) return; // iptal

    setIslemYapilan(talep.id);
    try {
      await updateDoc(doc(db, "profilDegisiklikleri", talep.id), {
        durum: "reddedildi",
        yanitNotu: notu || "Kurucu tarafından reddedildi",
      });

      bildirimYazCoklu([talep.personelEmail], {
        baslik: "Profil Talebi Reddedildi",
        mesaj: notu ? `Talebiniz reddedildi: ${notu}` : "Profil değişiklik talebiniz reddedildi",
        tip: "sistem",
        route: "/profilim",
        gonderen: user?.email || "",
        gonderenAd: personelData?.ad ? `${personelData.ad} ${personelData.soyad}` : "Kurucu",
      });
    } catch (err) {
      Sentry.captureException(err);
      alert("İşlem başarısız!");
    } finally { setIslemYapilan(null); }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const bekleyenSayisi = talepler.filter(t => t.durum === "bekliyor").length;

  if (!isKurucu) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-stone-500">Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-stone-800">Profil Değişiklik Talepleri</h1>
            <p className="text-xs md:text-sm text-stone-500">Personel bilgi değişiklik taleplerini yönet</p>
          </div>
          {bekleyenSayisi > 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full font-semibold">
              {bekleyenSayisi} bekliyor
            </span>
          )}
        </div>

        <div className="flex gap-1 bg-stone-100 rounded-lg p-1 w-fit mt-3">
          <button onClick={() => setFiltre("bekliyor")}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${
              filtre === "bekliyor" ? "bg-white text-stone-800 shadow-sm" : "text-stone-500"
            }`}>
            Bekleyenler ({bekleyenSayisi})
          </button>
          <button onClick={() => setFiltre("tumu")}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${
              filtre === "tumu" ? "bg-white text-stone-800 shadow-sm" : "text-stone-500"
            }`}>
            Tümü ({talepler.length})
          </button>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-3xl mx-auto">
        {filtrelenmis.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center text-stone-500 border border-stone-100">
            <p className="text-4xl mb-3">✓</p>
            <p className="text-lg font-medium">Bekleyen talep yok</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtrelenmis.map(talep => (
              <div key={talep.id} className={`bg-white rounded-xl border overflow-hidden ${
                talep.durum === "bekliyor" ? "border-amber-200" :
                talep.durum === "onaylandi" ? "border-emerald-200" : "border-red-200"
              }`}>
                {/* Header */}
                <div className={`px-4 py-2.5 flex items-center justify-between ${
                  talep.durum === "bekliyor" ? "bg-amber-50/50" :
                  talep.durum === "onaylandi" ? "bg-emerald-50/50" : "bg-red-50/50"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-stone-200 rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-stone-500">{talep.personelAd.split(' ').map(n => n[0]).join('')}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-stone-800">{talep.personelAd}</p>
                      <p className="text-[10px] text-stone-400">{talep.personelEmail} · {formatTimestamp(talep.createdAt)}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    talep.durum === "bekliyor" ? "bg-amber-100 text-amber-700" :
                    talep.durum === "onaylandi" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}>
                    {talep.durum === "bekliyor" ? "Bekliyor" : talep.durum === "onaylandi" ? "Onaylandı" : "Reddedildi"}
                  </span>
                </div>

                {/* Değişiklikler */}
                <div className="p-4 space-y-2">
                  {talep.degisiklikler.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 bg-stone-50/60 rounded-lg px-3 py-2">
                      <span className="text-xs text-stone-500 font-medium min-w-[80px]">{d.alan}</span>
                      <span className="text-xs text-stone-400 line-through">{d.mevcutDeger || "—"}</span>
                      <span className="text-stone-300">→</span>
                      <span className="text-xs text-stone-800 font-semibold">{d.yeniDeger}</span>
                    </div>
                  ))}

                  {talep.yanitNotu && (
                    <p className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2 mt-2">{talep.yanitNotu}</p>
                  )}
                </div>

                {/* Aksiyonlar — sadece bekleyenler için */}
                {talep.durum === "bekliyor" && (
                  <div className="px-4 py-3 border-t border-stone-100 flex gap-2">
                    <button onClick={() => handleOnayla(talep)} disabled={islemYapilan === talep.id}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-xs font-medium transition disabled:opacity-50">
                      {islemYapilan === talep.id ? "..." : "Onayla"}
                    </button>
                    <button onClick={() => handleReddet(talep)} disabled={islemYapilan === talep.id}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-xs font-medium transition disabled:opacity-50">
                      Reddet
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
