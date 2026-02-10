import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, getDocs, serverTimestamp, query, where, onSnapshot, orderBy } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";
import { useRole } from "../context/RoleProvider";
import { bildirimYazCoklu } from "../lib/bildirimHelper";

type Sekme = "izin" | "profil" | "oneri" | "avans";

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

interface IzinTalebi {
  id: string;
  personelAd: string;
  personelSoyad: string;
  izinTuru: string;
  baslangic: string;
  bitis: string;
  gunSayisi: number;
  aciklama?: string;
  durum: string;
  talepTarihi: string;
  redSebebi?: string;
}

function gunFarkiHesapla(bas: string, bit: string): number {
  if (!bas || !bit) return 0;
  const d1 = new Date(bas);
  const d2 = new Date(bit);
  const fark = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return fark > 0 ? fark : 0;
}

export default function Taleplerim() {
  const user = useAuth();
  const { personelData } = useRole();
  const [aktifSekme, setAktifSekme] = useState<Sekme>("izin");

  const [profilTalepleri, setProfilTalepleri] = useState<ProfilTalebi[]>([]);
  const [profilAlan, setProfilAlan] = useState("");
  const [profilYeniDeger, setProfilYeniDeger] = useState("");

  const [oneriTalepleri, setOneriTalepleri] = useState<OneriTalebi[]>([]);
  const [oneriKategori, setOneriKategori] = useState<"oneri" | "sikayet">("oneri");
  const [oneriMesaj, setOneriMesaj] = useState("");
  const [oneriAnonim, setOneriAnonim] = useState(false);

  const [avansTalepleri, setAvansTalepleri] = useState<AvansTalebi[]>([]);
  const [avansTutar, setAvansTutar] = useState("");
  const [avansTarih, setAvansTarih] = useState("");

  const [izinTalepleri, setIzinTalepleri] = useState<IzinTalebi[]>([]);
  const [izinTuru, setIzinTuru] = useState("");
  const [izinBaslangic, setIzinBaslangic] = useState("");
  const [izinBitis, setIzinBitis] = useState("");
  const [izinAciklama, setIzinAciklama] = useState("");
  const [personelDocId, setPersonelDocId] = useState<string | null>(null);

  const [gonderiliyor, setGonderiliyor] = useState(false);

  const fullName = personelData ? `${personelData.ad} ${personelData.soyad}` : "";

  // Personel doc ID bul
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "personnel"), where("email", "==", user.email));
    getDocs(q).then(snap => {
      if (!snap.empty) setPersonelDocId(snap.docs[0].id);
    }).catch(() => {});
  }, [user?.email]);

  // Profil talepleri
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "profilDegisiklikleri"), where("personelEmail", "==", user.email), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setProfilTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProfilTalebi)));
    }, () => {});
    return () => unsub();
  }, [user?.email]);

  // Öneri talepleri
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "oneriler"), where("personelEmail", "==", user.email), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setOneriTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as OneriTalebi)));
    }, () => {});
    return () => unsub();
  }, [user?.email]);

  // Avans talepleri
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "avansTalepleri"), where("personelEmail", "==", user.email), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setAvansTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as AvansTalebi)));
    }, () => {});
    return () => unsub();
  }, [user?.email]);

  // İzin talepleri
  useEffect(() => {
    if (!personelDocId) return;
    const q = query(collection(db, "izinTalepleri"), where("personelId", "==", personelDocId), orderBy("talepTarihi", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setIzinTalepleri(snap.docs.map(d => ({ id: d.id, ...d.data() } as IzinTalebi)));
    }, () => {});
    return () => unsub();
  }, [personelDocId]);

  // Kurucuya bildirim
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

  const handleProfilGonder = async () => {
    if (!profilAlan || !profilYeniDeger.trim()) { alert("Alan ve yeni değer gerekli!"); return; }
    setGonderiliyor(true);
    try {
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

  const handleIzinGonder = async () => {
    if (!izinTuru) { alert("İzin türü seçin!"); return; }
    if (!izinBaslangic || !izinBitis) { alert("Tarih aralığı seçin!"); return; }
    if (new Date(izinBitis) < new Date(izinBaslangic)) { alert("Bitiş tarihi başlangıçtan önce olamaz!"); return; }
    if (!personelDocId) { alert("Personel bilgisi bulunamadı!"); return; }
    const gunSayisi = gunFarkiHesapla(izinBaslangic, izinBitis);
    setGonderiliyor(true);
    try {
      await addDoc(collection(db, "izinTalepleri"), {
        personelId: personelDocId,
        personelAd: personelData?.ad || "",
        personelSoyad: personelData?.soyad || "",
        personelEmail: user?.email,
        izinTuru, baslangic: izinBaslangic, bitis: izinBitis, gunSayisi,
        aciklama: izinAciklama.trim(),
        talepTarihi: new Date().toISOString(),
        durum: "Beklemede",
      });
      await bildirimKurucuya("İzin Talebi", `${fullName} ${gunSayisi} günlük ${izinTuru} talep etti`);
      setIzinTuru(""); setIzinBaslangic(""); setIzinBitis(""); setIzinAciklama("");
      alert("İzin talebi gönderildi!");
    } catch (err) { Sentry.captureException(err); alert("Gönderilemedi!"); }
    finally { setGonderiliyor(false); }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
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

  const izinTurleri = ["Yıllık İzin", "Raporlu", "Mazeret ve Diğer Ücretli İzinler", "Ücretsiz İzin", "Evlilik İzni", "Doğum İzni", "Ölüm İzni"];

  const bekleyenIzin = izinTalepleri.filter(t => t.durum === "Beklemede").length;
  const bekleyenProfil = profilTalepleri.filter(t => t.durum === "bekliyor").length;
  const bekleyenOneri = oneriTalepleri.filter(t => t.durum === "bekliyor").length;
  const bekleyenAvans = avansTalepleri.filter(t => t.durum === "bekliyor").length;

  const sekmeler: { id: Sekme; label: string; sayi: number }[] = [
    { id: "izin", label: "İzin Talebi", sayi: bekleyenIzin },
    { id: "profil", label: "Profil Değişikliği", sayi: bekleyenProfil },
    { id: "oneri", label: "Öneri / Şikayet", sayi: bekleyenOneri },
    { id: "avans", label: "Avans Talebi", sayi: bekleyenAvans },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-lg md:text-xl font-bold text-stone-800">Taleplerim</h1>
        <p className="text-xs text-stone-500">Taleplerini oluştur ve takip et</p>
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
      </div>

      <main className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">

        {/* ====== İZİN TALEBİ ====== */}
        {aktifSekme === "izin" && (
          <>
            <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-stone-800">Yeni İzin Talebi</h3>
              <select value={izinTuru} onChange={(e) => setIzinTuru(e.target.value)}
                className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">İzin türü seçin...</option>
                {izinTurleri.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">Başlangıç</label>
                  <input type="date" value={izinBaslangic} onChange={(e) => setIzinBaslangic(e.target.value)}
                    className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">Bitiş</label>
                  <input type="date" value={izinBitis} onChange={(e) => setIzinBitis(e.target.value)}
                    min={izinBaslangic || undefined}
                    className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
              {izinBaslangic && izinBitis && new Date(izinBitis) >= new Date(izinBaslangic) && (
                <div className="bg-amber-50 rounded-xl px-3 py-2 text-center">
                  <span className="text-sm font-bold text-amber-700">{gunFarkiHesapla(izinBaslangic, izinBitis)} gün</span>
                </div>
              )}
              <textarea placeholder="Açıklama (opsiyonel)..." value={izinAciklama} onChange={(e) => setIzinAciklama(e.target.value)}
                rows={2} className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
              <button onClick={handleIzinGonder} disabled={gonderiliyor}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>

            {izinTalepleri.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100">
                  <span className="text-sm font-semibold text-stone-800">Geçmiş Talepler</span>
                </div>
                <div className="divide-y divide-stone-50">
                  {izinTalepleri.slice(0, 10).map(t => (
                    <div key={t.id} className="px-5 py-3 hover:bg-stone-50/50 transition">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                          <span className="text-xs font-medium text-stone-700">{t.izinTuru}</span>
                        </div>
                        <span className="text-[10px] text-stone-400">{formatTimestamp(t.talepTarihi)}</span>
                      </div>
                      <p className="text-xs text-stone-600">
                        {formatDate(t.baslangic)} — {formatDate(t.bitis)} <span className="text-stone-400">({t.gunSayisi} gün)</span>
                      </p>
                      {t.aciklama && <p className="text-[10px] text-stone-500 mt-0.5">{t.aciklama}</p>}
                      {t.redSebebi && <p className="text-[10px] text-red-500 mt-0.5">Red sebebi: {t.redSebebi}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

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
                <div className="px-5 py-3 border-b border-stone-100"><span className="text-sm font-semibold text-stone-800">Geçmiş Talepler</span></div>
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
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition ${oneriKategori === "oneri" ? "bg-emerald-500 text-white" : "bg-stone-100 text-stone-500"}`}>Öneri</button>
                <button onClick={() => setOneriKategori("sikayet")}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition ${oneriKategori === "sikayet" ? "bg-red-500 text-white" : "bg-stone-100 text-stone-500"}`}>Şikayet</button>
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
                <div className="px-5 py-3 border-b border-stone-100"><span className="text-sm font-semibold text-stone-800">Gönderdiklerim</span></div>
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
                <div className="px-5 py-3 border-b border-stone-100"><span className="text-sm font-semibold text-stone-800">Geçmiş Talepler</span></div>
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
