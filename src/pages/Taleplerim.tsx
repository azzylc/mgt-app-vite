import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { collection, addDoc, getDocs, serverTimestamp, query, where, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
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
  createdAt: Timestamp | Date;
  yanitNotu?: string;
}

interface OneriTalebi {
  id: string;
  kategori: "oneri" | "sikayet";
  mesaj: string;
  anonim: boolean;
  durum: string;
  createdAt: Timestamp | Date;
  yanitNotu?: string;
}

interface AvansTalebi {
  id: string;
  tutar: number;
  istenilenTarih: string;
  durum: string;
  createdAt: Timestamp | Date;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [aktifSekme, setAktifSekme] = useState<Sekme>("izin");

  // URL'den ?tab=izin parametresini oku → bildirimden gelince doğru sekme açılır
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["izin", "profil", "oneri", "avans"].includes(tabParam)) {
      setAktifSekme(tabParam as Sekme);
      searchParams.delete("tab");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

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
  const [dilekceDosya, setDilekceDosya] = useState<string | null>(null);
  const [dilekceDosyaMime, setDilekceDosyaMime] = useState<string>("");
  const [dilekceDriveUrl, setDilekceDriveUrl] = useState<string | null>(null);
  const [dilekceDriveFileId, setDilekceDriveFileId] = useState<string | null>(null);
  const [dilekceTeslimKisi, setDilekceTeslimKisi] = useState("");
  const [dilekceYukleniyor, setDilekceYukleniyor] = useState(false);
  const dilekceInputRef = useRef<HTMLInputElement>(null);
  const yillikIzinKosullariTamam = izinTuru !== "Yıllık İzin" || (whatsappOnay && (!!dilekceDriveUrl || !!dilekceTeslimKisi));

  // Raporlu izin dosya yükleme
  const [raporDosya, setRaporDosya] = useState<string | null>(null); // base64 preview
  const [raporDosyaMime, setRaporDosyaMime] = useState<string>("");
  const [raporDriveUrl, setRaporDriveUrl] = useState<string | null>(null);
  const [raporDriveFileId, setRaporDriveFileId] = useState<string | null>(null);
  const [raporTeslimKisi, setRaporTeslimKisi] = useState("");
  const [raporYukleniyor, setRaporYukleniyor] = useState(false);
  const raporInputRef = useRef<HTMLInputElement>(null);
  const raporluKosulTamam = izinTuru !== "Raporlu" || (!!raporDriveUrl || !!raporTeslimKisi);
  const [yoneticiler, setYoneticiler] = useState<{ id: string; ad: string; soyad: string }[]>([]);

  // Fotoğraf sıkıştırma
  const compressImage = (file: File, maxWidth = 800, quality = 0.5): Promise<{ base64: string; mime: string }> => {
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
      const fileName = `${tarih}-rapor_${ad}_${soyad}.${ext}`;

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

  // Dilekçe Drive'a yükle
  const handleDilekceYukle = async (file: File) => {
    setDilekceYukleniyor(true);
    try {
      let base64: string;
      let mime: string;

      if (file.type === "application/pdf") {
        const buffer = await file.arrayBuffer();
        base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        mime = "application/pdf";
      } else {
        const result = await compressImage(file);
        base64 = result.base64;
        mime = result.mime;
      }

      setDilekceDosya(`data:${mime};base64,${base64}`);
      setDilekceDosyaMime(mime);

      const uploadFn = httpsCallable(functions, "uploadToDrive");
      const ad = personelData?.ad || "personel";
      const soyad = personelData?.soyad || "";
      const tarih = new Date().toISOString().split("T")[0];
      const ext = mime === "application/pdf" ? "pdf" : "jpg";
      const fileName = `${tarih}-dilekce_${ad}_${soyad}.${ext}`;

      const result = await uploadFn({ base64Data: base64, mimeType: mime, fileName, folderKey: "yillikIzinler" });
      const data = result.data as { success: boolean; fileId: string; webViewLink: string; thumbnailLink: string };

      if (data.success) {
        setDilekceDriveUrl(data.webViewLink);
        setDilekceDriveFileId(data.fileId);
      } else {
        throw new Error("Yükleme başarısız");
      }
    } catch (err) {
      console.error("Dilekçe yükleme hatası:", err);
      Sentry.captureException(err);
      alert("Dilekçe yüklenemedi! Lütfen tekrar deneyin.");
      setDilekceDosya(null);
    } finally {
      setDilekceYukleniyor(false);
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

  // Yönetici/Kurucu listesi (rapor teslim dropdown)
  useEffect(() => {
    const q = query(collection(db, "personnel"), where("kullaniciTuru", "in", ["Kurucu", "Yönetici"]), where("aktif", "==", true));
    getDocs(q).then(snap => {
      setYoneticiler(snap.docs.map(d => ({ id: d.id, ad: d.data().ad, soyad: d.data().soyad })));
    }).catch(() => {});
  }, []);

  // Kurucuya bildirim
  const bildirimKurucuya = async (
    baslik: string,
    mesaj: string,
    bildirimTip: "sistem" | "izin" = "sistem",
    bildirimRoute: string = "/talepler-merkezi"
  ) => {
    try {
      const kurucuQ = query(collection(db, "personnel"), where("kullaniciTuru", "==", "Kurucu"), where("aktif", "==", true));
      const kurucuSnap = await getDocs(kurucuQ);
      const alicilar = kurucuSnap.docs.map(d => d.data().email as string).filter(e => e && e !== user?.email);
      if (alicilar.length > 0) {
        bildirimYazCoklu(alicilar, {
          baslik, mesaj, tip: bildirimTip, route: bildirimRoute,
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
        "Telefon": ((personelData as unknown) as Record<string, string>)?.telefon || "",
        "Doğum Tarihi": ((personelData as unknown) as Record<string, string>)?.dogumGunu || "",
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
    if (izinTuru === "Yıllık İzin" && (!whatsappOnay || (!dilekceDriveUrl && !dilekceTeslimKisi))) { alert("Yıllık izin için ön koşulları sağlamanız gerekmektedir."); return; }
    if (izinTuru === "Raporlu" && !raporDriveUrl && !raporTeslimKisi) { alert("Raporlu izin için rapor yüklemeniz veya teslim ettiğinizi belirtmeniz gerekmektedir."); return; }
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
        ...(izinTuru === "Yıllık İzin" && {
          whatsappOnayVerildi: true,
          dilekceDriveUrl: dilekceDriveUrl || null,
          dilekceDriveFileId: dilekceDriveFileId || null,
          dilekceTeslimKisi: dilekceTeslimKisi || null,
        }),
        ...(izinTuru === "Raporlu" && {
          raporDriveUrl: raporDriveUrl || null,
          raporDriveFileId: raporDriveFileId || null,
          raporTeslimKisi: raporTeslimKisi || null,
        }),
      });
      await bildirimKurucuya(
        "İzin Talebi",
        `${fullName} ${gunSayisi} günlük ${izinTuru} talep etti`,
        "izin",
        "/talepler-merkezi?tab=izin"
      );
      setIzinTuru(""); setIzinBaslangic(""); setIzinBitis(""); setIzinAciklama("");
      setWhatsappOnay(false); setDilekceDosya(null); setDilekceDriveUrl(null); setDilekceDriveFileId(null); setDilekceTeslimKisi("");
      setRaporDosya(null); setRaporDriveUrl(null); setRaporDriveFileId(null); setRaporTeslimKisi("");
      alert("İzin talebi gönderildi!");
    } catch (err) { Sentry.captureException(err); alert("Gönderilemedi!"); }
    finally { setGonderiliyor(false); }
  };

  const formatTimestamp = (ts: Timestamp | Date | string | null | undefined) => {
    if (!ts) return "";
    const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const durumBadge = (durum: string) => {
    const d = durum.toLowerCase();
    if (d === "bekliyor" || d === "beklemede") return "bg-[#EAF2ED] text-[#2F2F2F]";
    if (d === "onaylandi" || d === "onaylandı") return "bg-[#EAF2ED] text-[#8FAF9A]";
    return "bg-[#D96C6C]/20 text-[#D96C6C]";
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
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-lg md:text-xl font-bold text-[#2F2F2F]">Taleplerim</h1>
        <p className="text-xs text-[#8A8A8A]">Taleplerini oluştur ve takip et</p>
      </header>

      <div className="bg-white border-b px-4 md:px-6">
        <div className="flex gap-1 overflow-x-auto py-2">
          {sekmeler.map(s => (
            <button key={s.id} onClick={() => setAktifSekme(s.id)}
              className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                aktifSekme === s.id ? "bg-[#2F2F2F] text-white" : "text-[#8A8A8A] hover:bg-[#F7F7F7]"
              }`}>
              {s.label}
              {s.sayi > 0 && <span className="ml-1.5 bg-[#8FAF9A] text-[#2F2F2F] text-[10px] px-1.5 py-0.5 rounded-full">{s.sayi}</span>}
            </button>
          ))}
        </div>
      </div>

      <main className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">

        {/* ====== İZİN TALEBİ ====== */}
        {aktifSekme === "izin" && (
          <>
            <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#2F2F2F]">Yeni İzin Talebi</h3>
              <select value={izinTuru} onChange={(e) => { setIzinTuru(e.target.value); setWhatsappOnay(false); setDilekceDosya(null); setDilekceDriveUrl(null); setDilekceDriveFileId(null); setDilekceTeslimKisi(""); setRaporDosya(null); setRaporDriveUrl(null); setRaporDriveFileId(null); setRaporTeslimKisi(""); }}
                className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]">
                <option value="">İzin türü seçin...</option>
                {izinTurleri.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[#8A8A8A] mb-1 block">Başlangıç</label>
                  <input type="date" value={izinBaslangic} onChange={(e) => setIzinBaslangic(e.target.value)}
                    className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]" />
                </div>
                <div>
                  <label className="text-xs text-[#8A8A8A] mb-1 block">Bitiş</label>
                  <input type="date" value={izinBitis} onChange={(e) => setIzinBitis(e.target.value)}
                    min={izinBaslangic || undefined}
                    className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]" />
                </div>
              </div>
              {izinBaslangic && izinBitis && new Date(izinBitis) >= new Date(izinBaslangic) && (
                <div className="bg-[#EAF2ED] rounded-xl px-3 py-2 text-center">
                  <span className="text-sm font-bold text-[#2F2F2F]">{gunFarkiHesapla(izinBaslangic, izinBitis)} gün</span>
                </div>
              )}
              <textarea placeholder="Açıklama (opsiyonel)..." value={izinAciklama} onChange={(e) => setIzinAciklama(e.target.value)}
                rows={2} className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] resize-none" />
              {/* Yıllık İzin Ön Koşulları */}
              {izinTuru === "Yıllık İzin" && (
                <div className="bg-[#EAF2ED]/60 border border-[#8FAF9A]/30/60 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[#E6B566] text-sm">⚠️</span>
                    <p className="text-xs font-semibold text-[#2F2F2F]">Yıllık izin talebinde bulunabilmek için aşağıdaki koşulların sağlanması zorunludur.</p>
                  </div>
                  <div className="space-y-3">
                    {/* 1. WhatsApp onay */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={whatsappOnay} onChange={(e) => setWhatsappOnay(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-[#E6B566] rounded border-[#E5E5E5] focus:ring-[#8FAF9A] shrink-0" />
                      <span className={`text-sm leading-snug transition-colors ${whatsappOnay ? 'text-[#2F2F2F]' : 'text-[#8A8A8A] group-hover:text-[#2F2F2F]'}`}>
                        Yöneticimden <strong>WhatsApp üzerinden</strong> izin için uygunluk onayı aldım.
                      </span>
                    </label>
                    {/* 2. Dilekçe: Fotoğraf yükle VEYA teslim dropdown */}
                    <div className="bg-white/50 rounded-lg p-3 border border-[#EAF2ED]/60">
                      <p className="text-[11px] font-semibold text-[#2F2F2F] mb-2">📝 Yıllık izin dilekçesi</p>
                      {/* Seçenek 1: Fotoğraf yükle */}
                      <div className="bg-white/70 rounded-lg p-3 border border-[#EAF2ED]/60 mb-2">
                        <p className="text-[11px] font-semibold text-[#2F2F2F] mb-2">📸 Seçenek 1: Dilekçe fotoğrafını yükle</p>
                        <input
                          type="file" accept="image/*,application/pdf" className="hidden"
                          ref={dilekceInputRef}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            await handleDilekceYukle(file);
                            e.target.value = "";
                          }}
                        />
                        {!dilekceDosya && !dilekceDriveUrl && (
                          <button type="button"
                            onClick={() => dilekceInputRef.current?.click()}
                            disabled={dilekceYukleniyor}
                            className="w-full py-2 border-2 border-dashed border-[#8FAF9A]/30 rounded-lg text-xs text-[#8FAF9A] hover:bg-[#EAF2ED] transition disabled:opacity-50">
                            {dilekceYukleniyor ? "⏳ Yükleniyor..." : "📎 Dilekçe fotoğrafı seç"}
                          </button>
                        )}
                        {dilekceDosya && (
                          <div className="relative">
                            {dilekceDosyaMime !== "application/pdf" && (
                              <img src={dilekceDosya} alt="Dilekçe" className="w-full max-h-40 object-contain rounded-lg border border-[#E5E5E5]/60" />
                            )}
                            {dilekceDosyaMime === "application/pdf" && (
                              <div className="flex items-center gap-2 bg-[#F7F7F7] rounded-lg p-2 border border-[#E5E5E5]/60">
                                <span className="text-lg">📄</span>
                                <span className="text-xs text-[#2F2F2F]">PDF yüklendi</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-1.5">
                              {dilekceDriveUrl ? (
                                <span className="text-[10px] text-[#8FAF9A] font-medium">✅ Drive'a yüklendi</span>
                              ) : (
                                <span className="text-[10px] text-[#E6B566]">⏳ Yükleniyor...</span>
                              )}
                              <button type="button" className="text-[10px] text-[#D96C6C] hover:text-[#D96C6C]"
                                onClick={() => { setDilekceDosya(null); setDilekceDriveUrl(null); setDilekceDriveFileId(null); }}
                              >Kaldır</button>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Ayırıcı */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 border-t border-[#8FAF9A]/30/60" />
                        <span className="text-[10px] text-[#E6B566] font-medium">VEYA</span>
                        <div className="flex-1 border-t border-[#8FAF9A]/30/60" />
                      </div>
                      {/* Seçenek 2: Teslim dropdown */}
                      <div className="bg-white/70 rounded-lg p-3 border border-[#EAF2ED]/60 mt-2">
                        <p className="text-[11px] font-semibold text-[#2F2F2F] mb-2">📋 Seçenek 2: Fiziksel dilekçe teslimi</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-[#2F2F2F]">Dilekçeyi</span>
                          <select
                            value={dilekceTeslimKisi}
                            onChange={(e) => setDilekceTeslimKisi(e.target.value)}
                            className="flex-1 min-w-[140px] px-2.5 py-1.5 border border-[#E5E5E5] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]/40 focus:border-[#8FAF9A]"
                          >
                            <option value="">Kişi seçin...</option>
                            {yoneticiler.map(y => (
                              <option key={y.id} value={`${y.ad} ${y.soyad}`}>{y.ad} {y.soyad}</option>
                            ))}
                          </select>
                          <span className="text-sm text-[#2F2F2F]">masasına bıraktım.</span>
                        </div>
                        <p className="text-[10px] text-[#8A8A8A] mt-1.5">Fiziksel dilekçe teslim edildiyse kişiyi seçin.</p>
                      </div>
                    </div>
                  </div>
                  {(!whatsappOnay || (!dilekceDriveUrl && !dilekceTeslimKisi)) && (
                    <p className="mt-3 pt-3 border-t border-[#8FAF9A]/30/40 text-[11px] text-[#8FAF9A]/80">
                      🔒 WhatsApp onayı ve dilekçe teslimi/yüklemesi sağlanmadan izin talebi gönderilemez.
                    </p>
                  )}
                  {whatsappOnay && (!!dilekceDriveUrl || !!dilekceTeslimKisi) && (
                    <p className="mt-3 pt-3 border-t border-green-200/40 text-[11px] text-[#8FAF9A]">
                      ✅ Tüm koşullar sağlandı. Talep gönderilebilir.
                    </p>
                  )}
                </div>
              )}
              {/* Raporlu İzin Koşulları */}
              {izinTuru === "Raporlu" && (
                <div className="bg-[#EAF2ED]/60 border border-[#8FAF9A]/30/60 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[#E6B566] text-sm">🏥</span>
                    <p className="text-xs font-semibold text-[#2F2F2F]">Raporlu izin için aşağıdakilerden en az birini yapmanız gerekmektedir.</p>
                  </div>
                  <div className="space-y-3">
                    {/* Seçenek 1: Rapor fotoğrafı yükle */}
                    <div className="bg-white/70 rounded-lg p-3 border border-[#EAF2ED]/60">
                      <p className="text-[11px] font-semibold text-[#2F2F2F] mb-2">📸 Seçenek 1: Rapor fotoğrafını yükle</p>
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
                          className="w-full border-2 border-dashed border-[#8FAF9A] rounded-lg py-4 text-xs text-[#8FAF9A] hover:bg-[#EAF2ED] transition flex flex-col items-center gap-1"
                        >
                          <span className="text-lg">📄</span>
                          <span>Fotoğraf veya PDF seç</span>
                          <span className="text-[10px] text-[#8A8A8A]">Max 10MB</span>
                        </button>
                      )}
                      {raporYukleniyor && (
                        <div className="w-full py-4 text-center">
                          <div className="inline-block w-5 h-5 border-2 border-[#8FAF9A] border-t-transparent rounded-full animate-spin mb-1" />
                          <p className="text-xs text-[#8FAF9A]">Drive'a yükleniyor...</p>
                        </div>
                      )}
                      {raporDriveUrl && (
                        <div className="space-y-2">
                          {raporDosya && raporDosyaMime !== "application/pdf" && (
                            <img src={raporDosya} alt="Rapor" className="w-full h-32 object-cover rounded-lg" />
                          )}
                          {raporDosya && raporDosyaMime === "application/pdf" && (
                            <div className="bg-[#D96C6C]/10 rounded-lg px-3 py-2 flex items-center gap-2">
                              <span>📋</span>
                              <span className="text-xs text-[#D96C6C] font-medium">PDF yüklendi</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[#8FAF9A] font-medium">✅ Drive'a yüklendi</span>
                            <button
                              type="button"
                              onClick={() => { setRaporDosya(null); setRaporDriveUrl(null); setRaporDriveFileId(null); }}
                              className="text-[10px] text-[#D96C6C] hover:text-[#D96C6C]"
                            >Kaldır</button>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Ayırıcı */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border-t border-[#8FAF9A]/30/60" />
                      <span className="text-[10px] text-[#E6B566] font-medium">VEYA</span>
                      <div className="flex-1 border-t border-[#8FAF9A]/30/60" />
                    </div>
                    {/* Seçenek 2: Masaya bıraktım */}
                    <div className="bg-white/70 rounded-lg p-3 border border-[#EAF2ED]/60">
                      <p className="text-[11px] font-semibold text-[#2F2F2F] mb-2">📋 Seçenek 2: Fiziksel rapor teslimi</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-[#2F2F2F]">Raporu</span>
                        <select
                          value={raporTeslimKisi}
                          onChange={(e) => setRaporTeslimKisi(e.target.value)}
                          className="flex-1 min-w-[140px] px-2.5 py-1.5 border border-[#E5E5E5] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]/40 focus:border-[#8FAF9A]"
                        >
                          <option value="">Kişi seçin...</option>
                          {yoneticiler.map(y => (
                            <option key={y.id} value={`${y.ad} ${y.soyad}`}>{y.ad} {y.soyad}</option>
                          ))}
                        </select>
                        <span className="text-sm text-[#2F2F2F]">masasına bıraktım.</span>
                      </div>
                      <p className="text-[10px] text-[#8A8A8A] mt-1.5">Fiziksel rapor teslim edildiyse kişiyi seçin.</p>
                    </div>
                  </div>
                  {!raporDriveUrl && !raporTeslimKisi && (
                    <p className="mt-3 pt-3 border-t border-[#8FAF9A]/30/40 text-[11px] text-[#8FAF9A]/80">
                      🔒 Rapor yüklemeden veya teslim etmeden izin talebi gönderilemez.
                    </p>
                  )}
                  {(!!raporDriveUrl || !!raporTeslimKisi) && (
                    <p className="mt-3 pt-3 border-t border-green-200/40 text-[11px] text-[#8FAF9A]">
                      ✅ Koşul sağlandı. Talep gönderilebilir.
                    </p>
                  )}
                </div>
              )}
              <button onClick={handleIzinGonder} disabled={gonderiliyor || !yillikIzinKosullariTamam || !raporluKosulTamam || raporYukleniyor || dilekceYukleniyor}
                className="w-full bg-[#2F2F2F] hover:bg-[#2F2F2F] text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>

            {izinTalepleri.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[#E5E5E5]">
                  <span className="text-sm font-semibold text-[#2F2F2F]">Geçmiş Talepler</span>
                </div>
                <div className="divide-y divide-[#E5E5E5]/50">
                  {izinTalepleri.slice(0, 10).map(t => (
                    <div key={t.id} className="px-5 py-3 hover:bg-[#F7F7F7] transition">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                          <span className="text-xs font-medium text-[#2F2F2F]">{t.izinTuru}</span>
                        </div>
                        <span className="text-[10px] text-[#8A8A8A]">{formatTimestamp(t.talepTarihi)}</span>
                      </div>
                      <p className="text-xs text-[#2F2F2F]">
                        {formatDate(t.baslangic)} — {formatDate(t.bitis)} <span className="text-[#8A8A8A]">({t.gunSayisi} gün)</span>
                      </p>
                      {t.aciklama && <p className="text-[10px] text-[#8A8A8A] mt-0.5">{t.aciklama}</p>}
                      {t.redSebebi && <p className="text-[10px] text-[#D96C6C] mt-0.5">Red sebebi: {t.redSebebi}</p>}
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
            <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#2F2F2F]">Yeni Talep</h3>
              <select value={profilAlan} onChange={(e) => setProfilAlan(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]">
                <option value="">Alan seçin...</option>
                {["Ad", "Soyad", "Telefon", "Doğum Tarihi", "Diğer"].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <input type="text" placeholder="Yeni değer..." value={profilYeniDeger}
                onChange={(e) => setProfilYeniDeger(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]" />
              <button onClick={handleProfilGonder} disabled={gonderiliyor}
                className="w-full bg-[#2F2F2F] hover:bg-[#2F2F2F] text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>
            {profilTalepleri.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[#E5E5E5]"><span className="text-sm font-semibold text-[#2F2F2F]">Geçmiş Talepler</span></div>
                <div className="divide-y divide-[#E5E5E5]/50">
                  {profilTalepleri.slice(0, 10).map(t => (
                    <div key={t.id} className="px-5 py-3 hover:bg-[#F7F7F7] transition">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                        <span className="text-[10px] text-[#8A8A8A]">{formatTimestamp(t.createdAt)}</span>
                      </div>
                      {t.degisiklikler?.map((d, i) => (
                        <p key={i} className="text-xs text-[#2F2F2F]">
                          <span className="font-medium">{d.alan}:</span> <span className="text-[#8A8A8A] line-through">{d.mevcutDeger || "—"}</span> → <span className="font-semibold text-[#2F2F2F]">{d.yeniDeger}</span>
                        </p>
                      ))}
                      {t.yanitNotu && <p className="text-[10px] text-[#8A8A8A] mt-1">{t.yanitNotu}</p>}
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
            <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#2F2F2F]">Yeni Öneri / Şikayet</h3>
              <div className="flex gap-2">
                <button onClick={() => setOneriKategori("oneri")}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition ${oneriKategori === "oneri" ? "bg-[#8FAF9A] text-white" : "bg-[#F7F7F7] text-[#8A8A8A]"}`}>Öneri</button>
                <button onClick={() => setOneriKategori("sikayet")}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition ${oneriKategori === "sikayet" ? "bg-[#D96C6C] text-white" : "bg-[#F7F7F7] text-[#8A8A8A]"}`}>Şikayet</button>
              </div>
              <textarea placeholder="Mesajınız..." value={oneriMesaj} onChange={(e) => setOneriMesaj(e.target.value)}
                rows={4} className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] resize-none" />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={oneriAnonim} onChange={(e) => setOneriAnonim(e.target.checked)}
                  className="w-4 h-4 rounded border-[#E5E5E5] text-[#E6B566] focus:ring-[#8FAF9A]" />
                <span className="text-xs text-[#2F2F2F]">Anonim olarak gönder</span>
              </label>
              {oneriAnonim && <p className="text-[10px] text-[#8A8A8A]">İsminiz kurucu tarafından görülmeyecektir.</p>}
              <button onClick={handleOneriGonder} disabled={gonderiliyor}
                className="w-full bg-[#2F2F2F] hover:bg-[#2F2F2F] text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>
            {oneriTalepleri.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[#E5E5E5]"><span className="text-sm font-semibold text-[#2F2F2F]">Gönderdiklerim</span></div>
                <div className="divide-y divide-[#E5E5E5]/50">
                  {oneriTalepleri.slice(0, 10).map(t => (
                    <div key={t.id} className="px-5 py-3 hover:bg-[#F7F7F7] transition">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.kategori === "oneri" ? "bg-[#EAF2ED] text-[#8FAF9A]" : "bg-[#D96C6C]/20 text-[#D96C6C]"}`}>
                            {t.kategori === "oneri" ? "Öneri" : "Şikayet"}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                          {t.anonim && <span className="text-[10px] text-[#8A8A8A]">Anonim</span>}
                        </div>
                        <span className="text-[10px] text-[#8A8A8A]">{formatTimestamp(t.createdAt)}</span>
                      </div>
                      <p className="text-xs text-[#2F2F2F]">{t.mesaj}</p>
                      {t.yanitNotu && <p className="text-[10px] text-[#8A8A8A] mt-1 pt-1 border-t border-[#E5E5E5]">Yanıt: {t.yanitNotu}</p>}
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
            <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#2F2F2F]">Yeni Avans Talebi</h3>
              <div className="relative">
                <input type="number" placeholder="Tutar" value={avansTutar}
                  onChange={(e) => setAvansTutar(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] pr-10" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#8A8A8A] font-medium">₺</span>
              </div>
              <div>
                <label className="text-xs text-[#8A8A8A] mb-1 block">İstenilen Tarih</label>
                <input type="date" value={avansTarih} onChange={(e) => setAvansTarih(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]" />
              </div>
              <button onClick={handleAvansGonder} disabled={gonderiliyor}
                className="w-full bg-[#2F2F2F] hover:bg-[#2F2F2F] text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>
            {avansTalepleri.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[#E5E5E5]"><span className="text-sm font-semibold text-[#2F2F2F]">Geçmiş Talepler</span></div>
                <div className="divide-y divide-[#E5E5E5]/50">
                  {avansTalepleri.slice(0, 10).map(t => (
                    <div key={t.id} className="px-5 py-3 hover:bg-[#F7F7F7] transition">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-bold text-[#2F2F2F]">{t.tutar?.toLocaleString('tr-TR')} ₺</span>
                          <span className="text-[10px] text-[#8A8A8A] ml-2">{t.istenilenTarih}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${durumBadge(t.durum)}`}>{durumLabel(t.durum)}</span>
                          <span className="text-[10px] text-[#8A8A8A]">{formatTimestamp(t.createdAt)}</span>
                        </div>
                      </div>
                      {t.yanitNotu && <p className="text-[10px] text-[#8A8A8A] mt-1">Yanıt: {t.yanitNotu}</p>}
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
