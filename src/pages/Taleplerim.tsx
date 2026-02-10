import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, getDocs, serverTimestamp, query, where, onSnapshot, orderBy } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";
import { useRole } from "../context/RoleProvider";
import { bildirimYazCoklu } from "../lib/bildirimHelper";

type Sekme = "profil" | "oneri" | "avans";

interface ProfilTalebi {
  id: string;
  degisiklikler: { alan: string; mevcutDeger: string; yeniDeger: string }[];
  durum: string;
  createdAt: any;
  yanitNotu?: string;
}

interface OneriTalebi {
  id: string;
  kategori: "oneri" | "sikayet";
  mesaj: string;
  anonim: boolean;
  durum: string;
  createdAt: any;
  yanitNotu?: string;
}

interface AvansTalebi {
  id: string;
  tutar: number;
  istenilenTarih: string;
  durum: string;
  createdAt: any;
  yanitNotu?: string;
}

export default function Taleplerim() {
  const user = useAuth();
  const { personelData } = useRole();
  const [aktifSekme, setAktifSekme] = useState<Sekme>("profil");

  // Profil talepleri
  const [profilTalepleri, setProfilTalepleri] = useState<ProfilTalebi[]>([]);
  const [profilAlan, setProfilAlan] = useState("");
  const [profilYeniDeger, setProfilYeniDeger] = useState("");

  // Öneri/Şikayet
  const [oneriTalepleri, setOneriTalepleri] = useState<OneriTalebi[]>([]);
  const [oneriKategori, setOneriKategori] = useState<"oneri" | "sikayet">("oneri");
  const [oneriMesaj, setOneriMesaj] = useState("");
  const [oneriAnonim, setOneriAnonim] = useState(false);

  // Avans
  const [avansTalepleri, setAvansTalepleri] = useState<AvansTalebi[]>([]);
  const [avansTutar, setAvansTutar] = useState("");
  const [avansTarih, setAvansTarih] = useState("");

  const [gonderiliyor, setGonderiliyor] = useState(false);

  const fullName = personelData ? `${personelData.ad} ${personelData.soyad}` : "";

  // Profil talepleri dinle
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "profilDegisiklikleri"), where("personelEmail", "==", user.email), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setProfilTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProfilTalebi)));
    }, () => {});
    return () => unsub();
  }, [user?.email]);

  // Öneri talepleri dinle
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "oneriler"), where("personelEmail", "==", user.email), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setOneriTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as OneriTalebi)));
    }, () => {});
    return () => unsub();
  }, [user?.email]);

  // Avans talepleri dinle
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "avansTalepleri"), where("personelEmail", "==", user.email), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setAvansTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as AvansTalebi)));
    }, () => {});
    return () => unsub();
  }, [user?.email]);

  // Kurucuya bildirim helper
  const bildirimKurucuya = async (baslik: string, mesaj: string) => {
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
  };

  // Profil değişikliği gönder
  const handleProfilGonder = async () => {
    if (!profilAlan || !profilYeniDeger.trim()) { alert("Alan ve yeni değer gerekli!"); return; }
    setGonderiliyor(true);
    try {
      // Mevcut değeri bul
      const mevcutMap: Record<string, string> = {
        "Ad": personelData?.ad || "", "Soyad": personelData?.soyad || "",
        "Telefon": (personelData as any)?.telefon || "",
        "Doğum Tarihi": (personelData as any)?.dogumGunu || "",
      };
      await addDoc(collection(db, "profilDegisiklikleri"), {
        personelEmail: user?.email, personelAd: fullName,
        degisiklikler: [{ alan: profilAlan, mevcutDeger: mevcutMap[profilAlan] || "", yeniDeger: profilYeniDeger }],
        durum: "bekliyor", createdAt: serverTimestamp(),
      });
      await bildirimKurucuya("Profil Değişiklik Talebi", `${fullName} profil bilgilerinde değişiklik talep etti`);
      setProfilAlan(""); setProfilYeniDeger("");
      alert("Talep gönderildi!");
    } catch (err) { Sentry.captureException(err); alert("Gönderilemedi!"); }
    finally { setGonderiliyor(false); }
  };

  // Öneri/Şikayet gönder
  const handleOneriGonder = async () => {
    if (!oneriMesaj.trim()) { alert("Mesaj gerekli!"); return; }
    setGonderiliyor(true);
    try {
      await addDoc(collection(db, "oneriler"), {
        personelEmail: user?.email, personelAd: fullName,
        kategori: oneriKategori, mesaj: oneriMesaj.trim(), anonim: oneriAnonim,
        durum: "bekliyor", createdAt: serverTimestamp(),
      });
      const kimden = oneriAnonim ? "Anonim" : fullName;
      const tip = oneriKategori === "oneri" ? "öneri" : "şikayet";
      await bildirimKurucuya(`Yeni ${tip}`, `${kimden} bir ${tip} gönderdi`);
      setOneriMesaj(""); setOneriAnonim(false);
      alert("Gönderildi!");
    } catch (err) { Sentry.captureException(err); alert("Gönderilemedi!"); }
    finally { setGonderiliyor(false); }
  };

  // Avans talebi gönder
  const handleAvansGonder = async () => {
    const tutar = parseFloat(avansTutar);
    if (!tutar || tutar <= 0) { alert("Geçerli bir tutar girin!"); return; }
    if (!avansTarih) { alert("İstenilen tarih gerekli!"); return; }
    setGonderiliyor(true);
    try {
      await addDoc(collection(db, "avansTalepleri"), {
        personelEmail: user?.email, personelAd: fullName,
        tutar, istenilenTarih: avansTarih,
        durum: "bekliyor", createdAt: serverTimestamp(),
      });
      await bildirimKurucuya("Avans Talebi", `${fullName} ${tutar.toLocaleString('tr-TR')} ₺ avans talep etti`);
      setAvansTutar(""); setAvansTarih("");
      alert("Avans talebi gönderildi!");
    } catch (err) { Sentry.captureException(err); alert("Gönderilemedi!"); }
    finally { setGonderiliyor(false); }
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

  const sekmeler: { id: Sekme; label: string; sayi: number }[] = [
    { id: "profil", label: "Profil Değişikliği", sayi: profilTalepleri.filter(t => t.durum === "bekliyor").length },
    { id: "oneri", label: "Öneri / Şikayet", sayi: oneriTalepleri.filter(t => t.durum === "bekliyor").length },
    { id: "avans", label: "Avans Talebi", sayi: avansTalepleri.filter(t => t.durum === "bekliyor").length },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-lg md:text-xl font-bold text-stone-800">Taleplerim</h1>
        <p className="text-xs text-stone-500">Taleplerini oluştur ve takip et</p>
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
      </div>

      <main className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">

        {/* ====== PROFİL DEĞİŞİKLİĞİ ====== */}
        {aktifSekme === "profil" && (
          <>
            <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-stone-800">Yeni Talep</h3>
              <select value={profilAlan} onChange={(e) => setProfilAlan(e.target.value)}
                className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">Alan seçin...</option>
                {["Ad", "Soyad", "Telefon", "Doğum Tarihi", "Diğer"].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <input type="text" placeholder="Yeni değer..." value={profilYeniDeger}
                onChange={(e) => setProfilYeniDeger(e.target.value)}
                className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <button onClick={handleProfilGonder} disabled={gonderiliyor}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>

            {profilTalepleri.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100">
                  <span className="text-sm font-semibold text-stone-800">Geçmiş Talepler</span>
                </div>
                <div className="divide-y divide-stone-50">
                  {profilTalepleri.slice(0, 10).map(t => (
                    <div key={t.id} className="px-5 py-3 hover:bg-stone-50/50 transition">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                        <span className="text-[10px] text-stone-400">{formatTimestamp(t.createdAt)}</span>
                      </div>
                      {t.degisiklikler?.map((d, i) => (
                        <p key={i} className="text-xs text-stone-600">
                          <span className="font-medium">{d.alan}:</span> <span className="text-stone-400 line-through">{d.mevcutDeger || "—"}</span> → <span className="font-semibold text-stone-800">{d.yeniDeger}</span>
                        </p>
                      ))}
                      {t.yanitNotu && <p className="text-[10px] text-stone-500 mt-1">{t.yanitNotu}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ====== ÖNERİ / ŞİKAYET ====== */}
        {aktifSekme === "oneri" && (
          <>
            <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-stone-800">Yeni Öneri / Şikayet</h3>

              <div className="flex gap-2">
                <button onClick={() => setOneriKategori("oneri")}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition ${
                    oneriKategori === "oneri" ? "bg-emerald-500 text-white" : "bg-stone-100 text-stone-500"
                  }`}>Öneri</button>
                <button onClick={() => setOneriKategori("sikayet")}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition ${
                    oneriKategori === "sikayet" ? "bg-red-500 text-white" : "bg-stone-100 text-stone-500"
                  }`}>Şikayet</button>
              </div>

              <textarea placeholder="Mesajınız..." value={oneriMesaj} onChange={(e) => setOneriMesaj(e.target.value)}
                rows={4} className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={oneriAnonim} onChange={(e) => setOneriAnonim(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400" />
                <span className="text-xs text-stone-600">Anonim olarak gönder</span>
              </label>
              {oneriAnonim && <p className="text-[10px] text-stone-400">İsminiz kurucu tarafından görülmeyecektir.</p>}

              <button onClick={handleOneriGonder} disabled={gonderiliyor}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>

            {oneriTalepleri.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100">
                  <span className="text-sm font-semibold text-stone-800">Gönderdiklerim</span>
                </div>
                <div className="divide-y divide-stone-50">
                  {oneriTalepleri.slice(0, 10).map(t => (
                    <div key={t.id} className="px-5 py-3 hover:bg-stone-50/50 transition">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.kategori === "oneri" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {t.kategori === "oneri" ? "Öneri" : "Şikayet"}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                          {t.anonim && <span className="text-[10px] text-stone-400">Anonim</span>}
                        </div>
                        <span className="text-[10px] text-stone-400">{formatTimestamp(t.createdAt)}</span>
                      </div>
                      <p className="text-xs text-stone-700">{t.mesaj}</p>
                      {t.yanitNotu && <p className="text-[10px] text-stone-500 mt-1 pt-1 border-t border-stone-100">Yanıt: {t.yanitNotu}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ====== AVANS TALEBİ ====== */}
        {aktifSekme === "avans" && (
          <>
            <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-stone-800">Yeni Avans Talebi</h3>

              <div className="relative">
                <input type="number" placeholder="Tutar" value={avansTutar}
                  onChange={(e) => setAvansTutar(e.target.value)}
                  className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400 pr-10" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-stone-400 font-medium">₺</span>
              </div>

              <div>
                <label className="text-xs text-stone-500 mb-1 block">İstenilen Tarih</label>
                <input type="date" value={avansTarih} onChange={(e) => setAvansTarih(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>

              <button onClick={handleAvansGonder} disabled={gonderiliyor}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>

            {avansTalepleri.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100">
                  <span className="text-sm font-semibold text-stone-800">Geçmiş Talepler</span>
                </div>
                <div className="divide-y divide-stone-50">
                  {avansTalepleri.slice(0, 10).map(t => (
                    <div key={t.id} className="px-5 py-3 hover:bg-stone-50/50 transition">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-bold text-stone-800">{t.tutar?.toLocaleString('tr-TR')} ₺</span>
                          <span className="text-[10px] text-stone-400 ml-2">{t.istenilenTarih}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                          <span className="text-[10px] text-stone-400">{formatTimestamp(t.createdAt)}</span>
                        </div>
                      </div>
                      {t.yanitNotu && <p className="text-[10px] text-stone-500 mt-1">Yanıt: {t.yanitNotu}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
