import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, updateDoc } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth, useRole } from "../context/RoleProvider";
import { bildirimYazCoklu } from "../lib/bildirimHelper";

type Sekme = "profil" | "oneri" | "avans";

interface ProfilTalebi {
  id: string;
  personelEmail: string;
  personelAd: string;
  degisiklikler: { alan: string; mevcutDeger: string; yeniDeger: string }[];
  durum: string;
  createdAt: any;
  yanitNotu?: string;
}

interface OneriTalebi {
  id: string;
  personelEmail: string;
  personelAd: string;
  kategori: "oneri" | "sikayet";
  mesaj: string;
  anonim: boolean;
  durum: string;
  createdAt: any;
  yanitNotu?: string;
}

interface AvansTalebi {
  id: string;
  personelEmail: string;
  personelAd: string;
  tutar: number;
  istenilenTarih: string;
  durum: string;
  createdAt: any;
  yanitNotu?: string;
}

export default function TaleplerMerkezi() {
  const user = useAuth();
  const { personelData } = useRole();
  const [aktifSekme, setAktifSekme] = useState<Sekme>("profil");
  const [filtre, setFiltre] = useState<"bekliyor" | "tumu">("bekliyor");
  const [islemYapilan, setIslemYapilan] = useState<string | null>(null);

  const [profilTalepleri, setProfilTalepleri] = useState<ProfilTalebi[]>([]);
  const [oneriTalepleri, setOneriTalepleri] = useState<OneriTalebi[]>([]);
  const [avansTalepleri, setAvansTalepleri] = useState<AvansTalebi[]>([]);

  const isKurucu = personelData?.kullaniciTuru === "Kurucu";
  const kurucuAd = personelData ? `${personelData.ad} ${personelData.soyad}` : "Kurucu";

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(query(collection(db, "profilDegisiklikleri"), orderBy("createdAt", "desc")),
      (snap) => setProfilTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProfilTalebi))), () => {}));

    unsubs.push(onSnapshot(query(collection(db, "oneriler"), orderBy("createdAt", "desc")),
      (snap) => setOneriTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as OneriTalebi))), () => {}));

    unsubs.push(onSnapshot(query(collection(db, "avansTalepleri"), orderBy("createdAt", "desc")),
      (snap) => setAvansTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as AvansTalebi))), () => {}));

    return () => unsubs.forEach(u => u());
  }, []);

  const bildirimPersonele = async (email: string, baslik: string, mesaj: string) => {
    try {
      bildirimYazCoklu([email], {
        baslik, mesaj, tip: "sistem", route: "/taleplerim",
        gonderen: user?.email || "", gonderenAd: kurucuAd,
      });
    } catch (err) { console.warn(err); }
  };

  // Genel onayla/reddet handler
  const handleIslem = async (col: string, id: string, personelEmail: string, islem: "onayla" | "reddet", tip: string) => {
    if (islem === "reddet") {
      const notu = prompt("Reddetme sebebi (opsiyonel):");
      if (notu === null) return;
      setIslemYapilan(id);
      try {
        await updateDoc(doc(db, col, id), { durum: "reddedildi", yanitNotu: notu || "Reddedildi" });
        await bildirimPersonele(personelEmail, `${tip} Reddedildi`, notu ? `Talebiniz reddedildi: ${notu}` : "Talebiniz reddedildi");
      } catch (err) { Sentry.captureException(err); alert("Hata!"); }
      finally { setIslemYapilan(null); }
    } else {
      setIslemYapilan(id);
      try {
        await updateDoc(doc(db, col, id), { durum: "onaylandi", yanitNotu: "Kurucu tarafından onaylandı" });
        await bildirimPersonele(personelEmail, `${tip} Onaylandı`, "Talebiniz onaylandı");
      } catch (err) { Sentry.captureException(err); alert("Hata!"); }
      finally { setIslemYapilan(null); }
    }
  };

  const handleYanit = async (col: string, id: string, personelEmail: string) => {
    const yanit = prompt("Yanıtınız:");
    if (!yanit) return;
    setIslemYapilan(id);
    try {
      await updateDoc(doc(db, col, id), { yanitNotu: yanit, durum: "onaylandi" });
      await bildirimPersonele(personelEmail, "Yanıt Geldi", yanit);
    } catch (err) { Sentry.captureException(err); alert("Hata!"); }
    finally { setIslemYapilan(null); }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const durumBadge = (durum: string) => {
    if (durum === "bekliyor") return "bg-amber-100 text-amber-700";
    if (durum === "onaylandi") return "bg-emerald-100 text-emerald-700";
    return "bg-red-100 text-red-700";
  };
  const durumLabel = (durum: string) => durum === "bekliyor" ? "Bekliyor" : durum === "onaylandi" ? "Onaylandı" : "Reddedildi";

  const bekleyenProfil = profilTalepleri.filter(t => t.durum === "bekliyor").length;
  const bekleyenOneri = oneriTalepleri.filter(t => t.durum === "bekliyor").length;
  const bekleyenAvans = avansTalepleri.filter(t => t.durum === "bekliyor").length;
  const toplamBekleyen = bekleyenProfil + bekleyenOneri + bekleyenAvans;

  const sekmeler: { id: Sekme; label: string; sayi: number }[] = [
    { id: "profil", label: "Profil Değişiklikleri", sayi: bekleyenProfil },
    { id: "oneri", label: "Öneri & Şikayetler", sayi: bekleyenOneri },
    { id: "avans", label: "Avans Talepleri", sayi: bekleyenAvans },
  ];

  if (!isKurucu) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-stone-500">Bu sayfaya erişim yetkiniz yok.</p></div>);
  }

  // Filtreleme
  const profilFiltreli = filtre === "bekliyor" ? profilTalepleri.filter(t => t.durum === "bekliyor") : profilTalepleri;
  const oneriFiltreli = filtre === "bekliyor" ? oneriTalepleri.filter(t => t.durum === "bekliyor") : oneriTalepleri;
  const avansFiltreli = filtre === "bekliyor" ? avansTalepleri.filter(t => t.durum === "bekliyor") : avansTalepleri;

  // Aksiyonlar
  const AksiyonButonlar = ({ col, id, email, tip }: { col: string; id: string; email: string; tip: string }) => (
    <div className="flex gap-2 mt-3 pt-3 border-t border-stone-100">
      <button onClick={() => handleIslem(col, id, email, "onayla", tip)} disabled={islemYapilan === id}
        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50">
        {islemYapilan === id ? "..." : "Onayla"}
      </button>
      <button onClick={() => handleIslem(col, id, email, "reddet", tip)} disabled={islemYapilan === id}
        className="flex-1 bg-red-500 hover:bg-red-600 text-white py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50">
        Reddet
      </button>
    </div>
  );

  const BosState = () => (
    <div className="bg-white rounded-2xl p-12 text-center text-stone-500 border border-stone-200/60 shadow-sm">
      <p className="text-3xl mb-2">✓</p>
      <p className="font-medium">{filtre === "bekliyor" ? "Bekleyen talep yok" : "Henüz talep yok"}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-stone-800">Talepler Merkezi</h1>
            <p className="text-xs text-stone-500">Personel taleplerini yönet</p>
          </div>
          {toplamBekleyen > 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full font-semibold animate-pulse">
              {toplamBekleyen} bekliyor
            </span>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b px-4 md:px-6">
        <div className="flex gap-1 overflow-x-auto py-2">
          {sekmeler.map(s => (
            <button key={s.id} onClick={() => setAktifSekme(s.id)}
              className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                aktifSekme === s.id ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"
              }`}>
              {s.label}
              {s.sayi > 0 && <span className="ml-1.5 bg-amber-400 text-amber-900 text-[10px] px-1.5 py-0.5 rounded-full">{s.sayi}</span>}
            </button>
          ))}
        </div>
        {/* Filtre */}
        <div className="flex gap-1 pb-2">
          <button onClick={() => setFiltre("bekliyor")}
            className={`px-3 py-1 rounded-md text-[10px] font-medium transition ${filtre === "bekliyor" ? "bg-amber-100 text-amber-700" : "text-stone-400"}`}>
            Bekleyenler
          </button>
          <button onClick={() => setFiltre("tumu")}
            className={`px-3 py-1 rounded-md text-[10px] font-medium transition ${filtre === "tumu" ? "bg-stone-200 text-stone-700" : "text-stone-400"}`}>
            Tümü
          </button>
        </div>
      </div>

      <main className="p-4 md:p-6 max-w-3xl mx-auto space-y-3">

        {/* ====== PROFİL DEĞİŞİKLİKLERİ ====== */}
        {aktifSekme === "profil" && (
          profilFiltreli.length === 0 ? <BosState /> : profilFiltreli.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-stone-200 rounded-full flex items-center justify-center">
                    <span className="text-[10px] font-bold text-stone-500">{t.personelAd?.split(' ').map(n => n[0]).join('')}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-800">{t.personelAd}</p>
                    <p className="text-[10px] text-stone-400">{t.personelEmail}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                  <p className="text-[10px] text-stone-400 mt-0.5">{formatTimestamp(t.createdAt)}</p>
                </div>
              </div>
              {t.degisiklikler?.map((d, i) => (
                <div key={i} className="bg-stone-50/60 rounded-lg px-3 py-2 mt-1.5">
                  <span className="text-xs text-stone-500 font-medium">{d.alan}: </span>
                  <span className="text-xs text-stone-400 line-through">{d.mevcutDeger || "—"}</span>
                  <span className="text-stone-300 mx-1">→</span>
                  <span className="text-xs text-stone-800 font-semibold">{d.yeniDeger}</span>
                </div>
              ))}
              {t.yanitNotu && <p className="text-[10px] text-stone-500 mt-2">{t.yanitNotu}</p>}
              {t.durum === "bekliyor" && <AksiyonButonlar col="profilDegisiklikleri" id={t.id} email={t.personelEmail} tip="Profil Değişikliği" />}
            </div>
          ))
        )}

        {/* ====== ÖNERİ & ŞİKAYETLER ====== */}
        {aktifSekme === "oneri" && (
          oneriFiltreli.length === 0 ? <BosState /> : oneriFiltreli.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {t.anonim ? (
                    <div className="w-7 h-7 bg-stone-300 rounded-full flex items-center justify-center">
                      <span className="text-[10px] text-white">?</span>
                    </div>
                  ) : (
                    <div className="w-7 h-7 bg-stone-200 rounded-full flex items-center justify-center">
                      <span className="text-[10px] font-bold text-stone-500">{t.personelAd?.split(' ').map(n => n[0]).join('')}</span>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-stone-800">{t.anonim ? "Anonim" : t.personelAd}</p>
                    {!t.anonim && <p className="text-[10px] text-stone-400">{t.personelEmail}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.kategori === "oneri" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {t.kategori === "oneri" ? "Öneri" : "Şikayet"}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                </div>
              </div>
              <p className="text-sm text-stone-700 bg-stone-50/60 rounded-lg px-3 py-2.5 leading-relaxed">{t.mesaj}</p>
              <p className="text-[10px] text-stone-400 mt-1.5">{formatTimestamp(t.createdAt)}</p>
              {t.yanitNotu && <p className="text-[10px] text-stone-500 mt-1 bg-amber-50/50 rounded px-2 py-1">Yanıt: {t.yanitNotu}</p>}
              {t.durum === "bekliyor" && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-stone-100">
                  <button onClick={() => handleYanit("oneriler", t.id, t.personelEmail)} disabled={islemYapilan === t.id}
                    className="flex-1 bg-stone-900 hover:bg-stone-800 text-white py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50">
                    Yanıtla
                  </button>
                  <button onClick={() => handleIslem("oneriler", t.id, t.personelEmail, "onayla", t.kategori === "oneri" ? "Öneri" : "Şikayet")} disabled={islemYapilan === t.id}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50">
                    Görüldü
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        {/* ====== AVANS TALEPLERİ ====== */}
        {aktifSekme === "avans" && (
          avansFiltreli.length === 0 ? <BosState /> : avansFiltreli.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-stone-200 rounded-full flex items-center justify-center">
                    <span className="text-[10px] font-bold text-stone-500">{t.personelAd?.split(' ').map(n => n[0]).join('')}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-800">{t.personelAd}</p>
                    <p className="text-[10px] text-stone-400">{t.personelEmail}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
              </div>
              <div className="bg-stone-50/60 rounded-lg px-3 py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-stone-800">{t.tutar?.toLocaleString('tr-TR')} ₺</p>
                  <p className="text-[10px] text-stone-400">İstenilen: {t.istenilenTarih}</p>
                </div>
                <p className="text-[10px] text-stone-400">{formatTimestamp(t.createdAt)}</p>
              </div>
              {t.yanitNotu && <p className="text-[10px] text-stone-500 mt-2">{t.yanitNotu}</p>}
              {t.durum === "bekliyor" && <AksiyonButonlar col="avansTalepleri" id={t.id} email={t.personelEmail} tip="Avans Talebi" />}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
