import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, getDocs, serverTimestamp, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";
import { useRole } from "../context/RoleProvider";
import { bildirimYazCoklu } from "../lib/bildirimHelper";

const functions = getFunctions(undefined, "europe-west1");

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

  // Yıllık izin ön koşulları
  const [whatsappOnay, setWhatsappOnay] = useState(false);
  const [dilekceOnay, setDilekceOnay] = useState(false);
  const yillikIzinKosullariTamam = izinTuru !== "Yıllık İzin" || (whatsappOnay && dilekceOnay);

  // Raporlu izin dosya yükleme
  const [raporDosya, setRaporDosya] = useState<string | null>(null); // base64 preview
  const [raporDosyaMime, setRaporDosyaMime] = useState<string>("");
  const [raporDriveUrl, setRaporDriveUrl] = useState<string | null>(null);
  const [raporDriveFileId, setRaporDriveFileId] = useState<string | null>(null);
  const [raporMasayaBirakildi, setRaporMasayaBirakildi] = useState(false);
  const [raporYukleniyor, setRaporYukleniyor] = useState(false);
  const raporInputRef = useRef<HTMLInputElement>(null);
  const raporluKosulTamam = izinTuru !== "Raporlu" || (!!raporDriveUrl || raporMasayaBirakildi);

  // Fotoğraf sıkıştırma
  const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<{ base64: string; mime: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject("Canvas context yok"); return; }
          ctx.drawImage(img, 0, 0, w, h);
          const mime = "image/jpeg";
          const dataUrl = canvas.toDataURL(mime, quality);
          const base64 = dataUrl.split(",")[1];
          resolve({ base64, mime });
        };
        img.onerror = () => reject("Resim okunamadı");
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject("Dosya okunamadı");
      reader.readAsDataURL(file);
    });
  };

  // Drive'a yükle
  const handleRaporYukle = async (file: File) => {
    setRaporYukleniyor(true);
    try {
      let base64: string;
      let mime: string;

      if (file.type === "application/pdf") {
        // PDF direkt base64
        const buffer = await file.arrayBuffer();
        base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        mime = "application/pdf";
      } else {
        // Resim sıkıştır
        const result = await compressImage(file);
        base64 = result.base64;
        mime = result.mime;
      }

      // Preview için sakla
      setRaporDosya(`data:${mime};base64,${base64}`);
      setRaporDosyaMime(mime);

      // Cloud Function çağır
      const uploadFn = httpsCallable(functions, "uploadToDrive");
      const ad = personelData?.ad || "personel";
      const soyad = personelData?.soyad || "";
      const tarih = new Date().toISOString().split("T")[0];
      const ext = mime === "application/pdf" ? "pdf" : "jpg";
      const fileName = `rapor_${ad}_${soyad}_${tarih}.${ext}`;

      const result = await uploadFn({ base64Data: base64, mimeType: mime, fileName, folderKey: "raporlar" });
      const data = result.data as { success: boolean; fileId: string; webViewLink: string; thumbnailLink: string };

      if (data.success) {
        setRaporDriveUrl(data.webViewLink);
        setRaporDriveFileId(data.fileId);
      } else {
        throw new Error("Yükleme başarısız");
      }
    } catch (err) {
      console.error("Rapor yükleme hatası:", err);
      Sentry.captureException(err);
      alert("Rapor yüklenemedi! Lütfen tekrar deneyin.");
      setRaporDosya(null);
    } finally {
      setRaporYukleniyor(false);
    }
  };

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
    if (izinTuru === "Yıllık İzin" && (!whatsappOnay || !dilekceOnay)) { alert("Yıllık izin için ön koşulları sağlamanız gerekmektedir."); return; }
    if (izinTuru === "Raporlu" && !raporDriveUrl && !raporMasayaBirakildi) { alert("Raporlu izin için rapor yüklemeniz veya teslim ettiğinizi belirtmeniz gerekmektedir."); return; }
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
        ...(izinTuru === "Yıllık İzin" && { whatsappOnayVerildi: true, dilekceVerildi: true }),
        ...(izinTuru === "Raporlu" && {
          raporDriveUrl: raporDriveUrl || null,
          raporDriveFileId: raporDriveFileId || null,
          raporMasayaBirakildi: raporMasayaBirakildi,
        }),
      });
      await bildirimKurucuya("İzin Talebi", `${fullName} ${gunSayisi} günlük ${izinTuru} talep etti`);
      setIzinTuru(""); setIzinBaslangic(""); setIzinBitis(""); setIzinAciklama("");
      setWhatsappOnay(false); setDilekceOnay(false);
      setRaporDosya(null); setRaporDriveUrl(null); setRaporDriveFileId(null); setRaporMasayaBirakildi(false);
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
              <select value={izinTuru} onChange={(e) => { setIzinTuru(e.target.value); setWhatsappOnay(false); setDilekceOnay(false); setRaporDosya(null); setRaporDriveUrl(null); setRaporDriveFileId(null); setRaporMasayaBirakildi(false); }}
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
              {/* Yıllık İzin Ön Koşulları */}
              {izinTuru === "Yıllık İzin" && (
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-amber-500 text-sm">⚠️</span>
                    <p className="text-xs font-semibold text-amber-700">Yıllık izin talebinde bulunabilmek için aşağıdaki koşulların sağlanması zorunludur.</p>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={whatsappOnay} onChange={(e) => setWhatsappOnay(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-amber-500 rounded border-stone-300 focus:ring-amber-400 shrink-0" />
                      <span className={`text-sm leading-snug transition-colors ${whatsappOnay ? 'text-stone-800' : 'text-stone-500 group-hover:text-stone-700'}`}>
                        Yöneticimden <strong>WhatsApp üzerinden</strong> izin için uygunluk onayı aldım.
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={dilekceOnay} onChange={(e) => setDilekceOnay(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-amber-500 rounded border-stone-300 focus:ring-amber-400 shrink-0" />
                      <span className={`text-sm leading-snug transition-colors ${dilekceOnay ? 'text-stone-800' : 'text-stone-500 group-hover:text-stone-700'}`}>
                        Yıllık izin dilekçesini doldurdum ve <strong>Aziz Erkan Yolcu</strong>'ya teslim ettim.
                      </span>
                    </label>
                  </div>
                  {(!whatsappOnay || !dilekceOnay) && (
                    <p className="mt-3 pt-3 border-t border-amber-200/40 text-[11px] text-amber-600/80">
                      🔒 Her iki koşul da sağlanmadan izin talebi gönderilemez.
                    </p>
                  )}
                  {whatsappOnay && dilekceOnay && (
                    <p className="mt-3 pt-3 border-t border-green-200/40 text-[11px] text-green-600">
                      ✅ Tüm koşullar sağlandı. Talep gönderilebilir.
                    </p>
                  )}
                </div>
              )}
              {/* Raporlu İzin Koşulları */}
              {izinTuru === "Raporlu" && (
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-amber-500 text-sm">🏥</span>
                    <p className="text-xs font-semibold text-amber-700">Raporlu izin için aşağıdakilerden en az birini yapmanız gerekmektedir.</p>
                  </div>
                  <div className="space-y-3">
                    {/* Seçenek 1: Rapor fotoğrafı yükle */}
                    <div className="bg-white/70 rounded-lg p-3 border border-amber-100/60">
                      <p className="text-[11px] font-semibold text-stone-700 mb-2">📸 Seçenek 1: Rapor fotoğrafını yükle</p>
                      <input
                        ref={raporInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleRaporYukle(file);
                          e.target.value = "";
                        }}
                      />
                      {!raporDriveUrl && !raporYukleniyor && (
                        <button
                          type="button"
                          onClick={() => raporInputRef.current?.click()}
                          className="w-full border-2 border-dashed border-amber-300 rounded-lg py-4 text-xs text-amber-600 hover:bg-amber-50 transition flex flex-col items-center gap-1"
                        >
                          <span className="text-lg">📄</span>
                          <span>Fotoğraf veya PDF seç</span>
                          <span className="text-[10px] text-stone-400">Max 10MB</span>
                        </button>
                      )}
                      {raporYukleniyor && (
                        <div className="w-full py-4 text-center">
                          <div className="inline-block w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-1" />
                          <p className="text-xs text-amber-600">Drive'a yükleniyor...</p>
                        </div>
                      )}
                      {raporDriveUrl && (
                        <div className="space-y-2">
                          {raporDosya && raporDosyaMime !== "application/pdf" && (
                            <img src={raporDosya} alt="Rapor" className="w-full h-32 object-cover rounded-lg" />
                          )}
                          {raporDosya && raporDosyaMime === "application/pdf" && (
                            <div className="bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2">
                              <span>📋</span>
                              <span className="text-xs text-red-700 font-medium">PDF yüklendi</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-emerald-600 font-medium">✅ Drive'a yüklendi</span>
                            <button
                              type="button"
                              onClick={() => { setRaporDosya(null); setRaporDriveUrl(null); setRaporDriveFileId(null); }}
                              className="text-[10px] text-red-500 hover:text-red-700"
                            >Kaldır</button>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Ayırıcı */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border-t border-amber-200/60" />
                      <span className="text-[10px] text-amber-400 font-medium">VEYA</span>
                      <div className="flex-1 border-t border-amber-200/60" />
                    </div>
                    {/* Seçenek 2: Masaya bıraktım */}
                    <label className="flex items-start gap-3 cursor-pointer group bg-white/70 rounded-lg p-3 border border-amber-100/60">
                      <input
                        type="checkbox"
                        checked={raporMasayaBirakildi}
                        onChange={(e) => setRaporMasayaBirakildi(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-amber-500 rounded border-stone-300 focus:ring-amber-400 shrink-0"
                      />
                      <div>
                        <span className={`text-sm leading-snug transition-colors ${raporMasayaBirakildi ? 'text-stone-800' : 'text-stone-500 group-hover:text-stone-700'}`}>
                          Raporu <strong>Aziz Erkan Yolcu</strong>'nun masasına bıraktım.
                        </span>
                        <p className="text-[10px] text-stone-400 mt-0.5">Fiziksel rapor teslim edildiyse işaretleyin.</p>
                      </div>
                    </label>
                  </div>
                  {!raporDriveUrl && !raporMasayaBirakildi && (
                    <p className="mt-3 pt-3 border-t border-amber-200/40 text-[11px] text-amber-600/80">
                      🔒 Rapor yüklemeden veya teslim etmeden izin talebi gönderilemez.
                    </p>
                  )}
                  {(!!raporDriveUrl || raporMasayaBirakildi) && (
                    <p className="mt-3 pt-3 border-t border-green-200/40 text-[11px] text-green-600">
                      ✅ Koşul sağlandı. Talep gönderilebilir.
                    </p>
                  )}
                </div>
              )}
              <button onClick={handleIzinGonder} disabled={gonderiliyor || !yillikIzinKosullariTamam || !raporluKosulTamam || raporYukleniyor}
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
