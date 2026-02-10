import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, updateDoc, addDoc, increment } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth, useRole } from "../context/RoleProvider";
import { bildirimYazCoklu } from "../lib/bildirimHelper";

type Sekme = "izin" | "profil" | "oneri" | "avans";

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

interface IzinTalebi {
  id: string;
  personelId: string;
  personelEmail?: string;
  personelAd: string;
  personelSoyad: string;
  izinTuru: string;
  baslangic: string;
  bitis: string;
  gunSayisi: number;
  aciklama?: string;
  durum: string;
  talepTarihi: string;
  whatsappOnayVerildi?: boolean;
  dilekceVerildi?: boolean;
}

export default function TaleplerMerkezi() {
  const user = useAuth();
  const { personelData } = useRole();
  const [aktifSekme, setAktifSekme] = useState<Sekme>("izin");
  const [filtre, setFiltre] = useState<"bekliyor" | "tumu">("bekliyor");
  const [islemYapilan, setIslemYapilan] = useState<string | null>(null);

  const [profilTalepleri, setProfilTalepleri] = useState<ProfilTalebi[]>([]);
  const [oneriTalepleri, setOneriTalepleri] = useState<OneriTalebi[]>([]);
  const [avansTalepleri, setAvansTalepleri] = useState<AvansTalebi[]>([]);
  const [izinTalepleri, setIzinTalepleri] = useState<IzinTalebi[]>([]);
  const [kurucuTeyit, setKurucuTeyit] = useState<Record<string, { wa: boolean; dilekce: boolean }>>({});

  const isKurucu = personelData?.kullaniciTuru === "Kurucu";
  const kurucuAd = personelData ? `${personelData.ad} ${personelData.soyad}` : "Kurucu";

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(query(collection(db, "izinTalepleri"), orderBy("talepTarihi", "desc")),
      (snap) => setIzinTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as IzinTalebi))), () => {}));

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

  // İzin talebi onayla
  const handleIzinOnayla = async (talep: IzinTalebi) => {
    if (!confirm(`${talep.personelAd} ${talep.personelSoyad} için ${talep.gunSayisi} günlük ${talep.izinTuru} onaylansın mı?`)) return;
    setIslemYapilan(talep.id);
    try {
      await updateDoc(doc(db, "izinTalepleri", talep.id), {
        durum: "Onaylandı",
        onaylayanYonetici: user?.email?.split("@")[0] || "",
        onayTarihi: new Date().toISOString(),
        ...(talep.izinTuru === "Yıllık İzin" && { kurucuWaTeyit: true, kurucuDilekceTeyit: true }),
      });
      // İzin kaydı oluştur
      await addDoc(collection(db, "izinler"), {
        personelId: talep.personelId,
        personelAd: talep.personelAd,
        personelSoyad: talep.personelSoyad,
        izinTuru: talep.izinTuru,
        baslangic: talep.baslangic,
        bitis: talep.bitis,
        gunSayisi: talep.gunSayisi,
        aciklama: talep.aciklama || "",
        olusturanYonetici: user?.email?.split("@")[0] || "",
        olusturulmaTarihi: new Date().toISOString(),
        durum: "Onaylandı",
        talepId: talep.id,
      });
      // Personelin izin kullanımını güncelle
      const personelRef = doc(db, "personnel", talep.personelId);
      if (talep.izinTuru === "Yıllık İzin") {
        await updateDoc(personelRef, { kullanilanYillik: increment(talep.gunSayisi) });
      } else if (talep.izinTuru === "Raporlu") {
        await updateDoc(personelRef, { raporlu: increment(talep.gunSayisi) });
      } else if (talep.izinTuru === "Mazeret ve Diğer Ücretli İzinler") {
        await updateDoc(personelRef, { digerIzinler: increment(talep.gunSayisi) });
      }
      if (talep.personelEmail) {
        await bildirimPersonele(talep.personelEmail, "İzin Talebi Onaylandı", `${talep.gunSayisi} günlük ${talep.izinTuru} talebiniz onaylandı`);
      }
    } catch (err) { Sentry.captureException(err); alert("Hata!"); }
    finally { setIslemYapilan(null); }
  };

  // İzin talebi reddet
  const handleIzinReddet = async (talep: IzinTalebi) => {
    const sebep = prompt("Reddetme sebebi (opsiyonel):");
    if (sebep === null) return;
    setIslemYapilan(talep.id);
    try {
      await updateDoc(doc(db, "izinTalepleri", talep.id), {
        durum: "Reddedildi",
        reddedenYonetici: user?.email?.split("@")[0] || "",
        redTarihi: new Date().toISOString(),
        redSebebi: sebep || "",
      });
      if (talep.personelEmail) {
        await bildirimPersonele(talep.personelEmail, "İzin Talebi Reddedildi", sebep ? `Talebiniz reddedildi: ${sebep}` : "Talebiniz reddedildi");
      }
    } catch (err) { Sentry.captureException(err); alert("Hata!"); }
    finally { setIslemYapilan(null); }
  };

  // Genel onayla/reddet (profil, avans)
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
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  const durumBadge = (durum: string) => {
    const d = durum.toLowerCase();
    if (d === "bekliyor" || d === "beklemede") return "bg-amber-100 text-amber-700";
    if (d === "onaylandi" || d === "onaylandı") return "bg-emerald-100 text-emerald-700";
    return "bg-red-100 text-red-700";
  };
  const durumLabel = (durum: string) => {
    const d = durum.toLowerCase();
    if (d === "bekliyor" || d === "beklemede") return "Bekliyor";
    if (d === "onaylandi" || d === "onaylandı") return "Onaylandı";
    return "Reddedildi";
  };
  const isBekliyor = (durum: string) => {
    const d = durum.toLowerCase();
    return d === "bekliyor" || d === "beklemede";
  };

  const bekleyenIzin = izinTalepleri.filter(t => isBekliyor(t.durum)).length;
  const bekleyenProfil = profilTalepleri.filter(t => isBekliyor(t.durum)).length;
  const bekleyenOneri = oneriTalepleri.filter(t => isBekliyor(t.durum)).length;
  const bekleyenAvans = avansTalepleri.filter(t => isBekliyor(t.durum)).length;
  const toplamBekleyen = bekleyenIzin + bekleyenProfil + bekleyenOneri + bekleyenAvans;

  const sekmeler: { id: Sekme; label: string; sayi: number }[] = [
    { id: "izin", label: "İzin Talepleri", sayi: bekleyenIzin },
    { id: "profil", label: "Profil Değişiklikleri", sayi: bekleyenProfil },
    { id: "oneri", label: "Öneri & Şikayetler", sayi: bekleyenOneri },
    { id: "avans", label: "Avans Talepleri", sayi: bekleyenAvans },
  ];

  if (!isKurucu) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-stone-500">Bu sayfaya erişim yetkiniz yok.</p></div>);
  }

  // Filtreleme
  const izinFiltreli = filtre === "bekliyor" ? izinTalepleri.filter(t => isBekliyor(t.durum)) : izinTalepleri;
  const profilFiltreli = filtre === "bekliyor" ? profilTalepleri.filter(t => isBekliyor(t.durum)) : profilTalepleri;
  const oneriFiltreli = filtre === "bekliyor" ? oneriTalepleri.filter(t => isBekliyor(t.durum)) : oneriTalepleri;
  const avansFiltreli = filtre === "bekliyor" ? avansTalepleri.filter(t => isBekliyor(t.durum)) : avansTalepleri;

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

  const PersonelAvatar = ({ ad, email }: { ad: string; email?: string }) => (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 bg-stone-200 rounded-full flex items-center justify-center">
        <span className="text-[10px] font-bold text-stone-500">{ad?.split(' ').map(n => n[0]).join('')}</span>
      </div>
      <div>
        <p className="text-xs font-semibold text-stone-800">{ad}</p>
        {email && <p className="text-[10px] text-stone-400">{email}</p>}
      </div>
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

        {/* ====== İZİN TALEPLERİ ====== */}
        {aktifSekme === "izin" && (
          izinFiltreli.length === 0 ? <BosState /> : izinFiltreli.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <PersonelAvatar ad={`${t.personelAd} ${t.personelSoyad}`} email={t.personelEmail} />
                <div className="text-right">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                  <p className="text-[10px] text-stone-400 mt-0.5">{formatTimestamp(t.talepTarihi)}</p>
                </div>
              </div>
              <div className="bg-stone-50/60 rounded-lg px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-800">{t.izinTuru}</span>
                  <span className="text-sm font-bold text-amber-600">{t.gunSayisi} gün</span>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">{formatDate(t.baslangic)} — {formatDate(t.bitis)}</p>
                {t.aciklama && <p className="text-[10px] text-stone-500 mt-1 pt-1 border-t border-stone-200/50">{t.aciklama}</p>}
              </div>
              {/* Yıllık İzin: Personel Beyanları */}
              {t.izinTuru === "Yıllık İzin" && (t.whatsappOnayVerildi || t.dilekceVerildi) && (
                <div className="bg-blue-50/50 border border-blue-100/60 rounded-lg px-3 py-2 mt-2">
                  <p className="text-[10px] font-semibold text-blue-600 mb-1.5">📋 Personel Beyanı</p>
                  <div className="flex flex-wrap gap-2">
                    {t.whatsappOnayVerildi && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">✅ WA Onay Aldım</span>
                    )}
                    {t.dilekceVerildi && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">✅ Dilekçe Teslim Ettim</span>
                    )}
                  </div>
                </div>
              )}
              {/* Yıllık İzin: Kurucu Teyit Paneli */}
              {t.izinTuru === "Yıllık İzin" && isBekliyor(t.durum) && (
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-lg px-3 py-2.5 mt-2">
                  <p className="text-[10px] font-semibold text-amber-700 mb-2">⚠️ Onaylamadan önce teyit edin</p>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer group">
                      <input type="checkbox" checked={kurucuTeyit[t.id]?.wa || false}
                        onChange={(e) => setKurucuTeyit(prev => ({ ...prev, [t.id]: { ...prev[t.id], wa: e.target.checked, dilekce: prev[t.id]?.dilekce || false } }))}
                        className="mt-0.5 w-3.5 h-3.5 text-amber-500 rounded border-stone-300 focus:ring-amber-400 shrink-0" />
                      <span className={`text-[11px] leading-snug ${kurucuTeyit[t.id]?.wa ? 'text-stone-800' : 'text-stone-500'}`}>
                        WhatsApp üzerinden uygunluk onayı verildiğini teyit ediyorum.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer group">
                      <input type="checkbox" checked={kurucuTeyit[t.id]?.dilekce || false}
                        onChange={(e) => setKurucuTeyit(prev => ({ ...prev, [t.id]: { wa: prev[t.id]?.wa || false, dilekce: e.target.checked } }))}
                        className="mt-0.5 w-3.5 h-3.5 text-amber-500 rounded border-stone-300 focus:ring-amber-400 shrink-0" />
                      <span className={`text-[11px] leading-snug ${kurucuTeyit[t.id]?.dilekce ? 'text-stone-800' : 'text-stone-500'}`}>
                        Yıllık izin dilekçesi masama ulaştı, teyit ediyorum.
                      </span>
                    </label>
                  </div>
                </div>
              )}
              {isBekliyor(t.durum) && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-stone-100">
                  <button onClick={() => handleIzinOnayla(t)} disabled={islemYapilan === t.id || (t.izinTuru === "Yıllık İzin" && (!kurucuTeyit[t.id]?.wa || !kurucuTeyit[t.id]?.dilekce))}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {islemYapilan === t.id ? "..." : t.izinTuru === "Yıllık İzin" && (!kurucuTeyit[t.id]?.wa || !kurucuTeyit[t.id]?.dilekce) ? "🔒 Önce teyit edin" : "Onayla"}
                  </button>
                  <button onClick={() => handleIzinReddet(t)} disabled={islemYapilan === t.id}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50">
                    Reddet
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        {/* ====== PROFİL DEĞİŞİKLİKLERİ ====== */}
        {aktifSekme === "profil" && (
          profilFiltreli.length === 0 ? <BosState /> : profilFiltreli.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <PersonelAvatar ad={t.personelAd} email={t.personelEmail} />
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
              {isBekliyor(t.durum) && <AksiyonButonlar col="profilDegisiklikleri" id={t.id} email={t.personelEmail} tip="Profil Değişikliği" />}
            </div>
          ))
        )}

        {/* ====== ÖNERİ & ŞİKAYETLER ====== */}
        {aktifSekme === "oneri" && (
          oneriFiltreli.length === 0 ? <BosState /> : oneriFiltreli.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                {t.anonim ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-stone-300 rounded-full flex items-center justify-center"><span className="text-[10px] text-white">?</span></div>
                    <p className="text-xs font-semibold text-stone-800">Anonim</p>
                  </div>
                ) : (
                  <PersonelAvatar ad={t.personelAd} email={t.personelEmail} />
                )}
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
              {isBekliyor(t.durum) && (
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
                <PersonelAvatar ad={t.personelAd} email={t.personelEmail} />
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
              {isBekliyor(t.durum) && <AksiyonButonlar col="avansTalepleri" id={t.id} email={t.personelEmail} tip="Avans Talebi" />}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
