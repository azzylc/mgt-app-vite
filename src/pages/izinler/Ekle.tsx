import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, increment, Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import * as Sentry from '@sentry/react';
import { useAuth } from "../../context/RoleProvider";

const functions = getFunctions(undefined, "europe-west1");

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  aktif: boolean;
}

export default function IzinEkle() {
  const navigate = useNavigate();
  const user = useAuth();
  const [saving, setSaving] = useState(false);
  const [personeller, setPersoneller] = useState<Personel[]>([]);

  // Form state
  const [selectedPersonel, setSelectedPersonel] = useState("");
  const [izinTuru, setIzinTuru] = useState("Yıllık İzin");
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [aciklama, setAciklama] = useState("");

  // Yıllık izin ön koşulları
  const [whatsappOnay, setWhatsappOnay] = useState(false);
  const [dilekceOnay, setDilekceOnay] = useState(false);
  const yillikIzinKosullariTamam = izinTuru !== "Yıllık İzin" || (whatsappOnay && dilekceOnay);

  // Raporlu izin dosya yükleme
  const [raporDosya, setRaporDosya] = useState<string | null>(null);
  const [raporDosyaMime, setRaporDosyaMime] = useState<string>("");
  const [raporDriveUrl, setRaporDriveUrl] = useState<string | null>(null);
  const [raporDriveFileId, setRaporDriveFileId] = useState<string | null>(null);
  const [raporTeslimAlindi, setRaporTeslimAlindi] = useState(false);
  const [raporYukleniyor, setRaporYukleniyor] = useState(false);
  const raporInputRef = useRef<HTMLInputElement>(null);
  const raporluKosulTamam = izinTuru !== "Raporlu" || (!!raporDriveUrl || raporTeslimAlindi);

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
          resolve({ base64: dataUrl.split(",")[1], mime });
        };
        img.onerror = () => reject("Resim okunamadı");
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject("Dosya okunamadı");
      reader.readAsDataURL(file);
    });
  };

  const handleRaporYukle = async (file: File) => {
    setRaporYukleniyor(true);
    try {
      let base64: string, mime: string;
      if (file.type === "application/pdf") {
        const buffer = await file.arrayBuffer();
        base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        mime = "application/pdf";
      } else {
        const result = await compressImage(file);
        base64 = result.base64; mime = result.mime;
      }
      setRaporDosya(`data:${mime};base64,${base64}`);
      setRaporDosyaMime(mime);

      const p = personeller.find(p => p.id === selectedPersonel);
      const tarih = new Date().toISOString().split("T")[0];
      const ext = mime === "application/pdf" ? "pdf" : "jpg";
      const fileName = `rapor_${p?.ad || "personel"}_${p?.soyad || ""}_${tarih}.${ext}`;

      const uploadFn = httpsCallable(functions, "uploadToDrive");
      const result = await uploadFn({ base64Data: base64, mimeType: mime, fileName, folderKey: "raporlar" });
      const data = result.data as { success: boolean; fileId: string; webViewLink: string };
      if (data.success) {
        setRaporDriveUrl(data.webViewLink);
        setRaporDriveFileId(data.fileId);
      } else throw new Error("Yükleme başarısız");
    } catch (err) {
      console.error("Rapor yükleme hatası:", err);
      Sentry.captureException(err);
      alert("Rapor yüklenemedi!");
      setRaporDosya(null);
    } finally { setRaporYukleniyor(false); }
  };

  // Enter ile kaydet (textarea hariç)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      handleSave("back");
    }
  };

  // Personelleri çek
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "personnel"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const personelList: Personel[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Sadece aktif personelleri ekle
        if (data.aktif !== false) {
          personelList.push({
            id: doc.id,
            ad: data.ad || data.isim || "",
            soyad: data.soyad || "",
            sicilNo: data.sicilNo || "",
            aktif: true,
          });
        }
      });
      personelList.sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`));
      setPersoneller(personelList);
    });

    return () => unsubscribe();
  }, [user]);

  // Gün sayısı hesapla
  const hesaplaGunSayisi = () => {
    if (!baslangic || !bitis) return 0;
    const start = new Date(baslangic);
    const end = new Date(bitis);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // Otomatik açıklama doldur
  useEffect(() => {
    if (baslangic && bitis && izinTuru) {
      const gunSayisi = hesaplaGunSayisi();
      if (gunSayisi > 0) {
        const aciklamaMetni = `${gunSayisi} günlük ${izinTuru.toLowerCase()}`;
        setAciklama(aciklamaMetni);
      }
    }
  }, [baslangic, bitis, izinTuru]);

  const handleSave = async (action: "back" | "new") => {
    // Validasyon
    if (!selectedPersonel) {
      alert("Lütfen bir kullanıcı seçin.");
      return;
    }
    if (!baslangic) {
      alert("Lütfen başlangıç tarihi girin.");
      return;
    }
    if (!bitis) {
      alert("Lütfen bitiş tarihi girin.");
      return;
    }
    if (new Date(bitis) < new Date(baslangic)) {
      alert("Bitiş tarihi başlangıç tarihinden önce olamaz.");
      return;
    }
    if (izinTuru === "Yıllık İzin" && (!whatsappOnay || !dilekceOnay)) {
      alert("Yıllık izin için ön koşulların sağlandığını onaylamanız gerekmektedir.");
      return;
    }
    if (izinTuru === "Raporlu" && !raporDriveUrl && !raporTeslimAlindi) {
      alert("Raporlu izin için rapor yüklenmeli veya teslim alındığı onaylanmalıdır.");
      return;
    }

    setSaving(true);

    try {
      const personel = personeller.find(p => p.id === selectedPersonel);
      const gunSayisi = hesaplaGunSayisi();

      if (izinTuru === "Haftalık İzin") {
        // Haftalık izin → attendance collection'a yaz (her gün için ayrı kayıt)
        const startDate = new Date(baslangic);
        const endDate = new Date(bitis);
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const tarih = new Date(d);
          tarih.setHours(0, 0, 0, 0);
          
          await addDoc(collection(db, "attendance"), {
            personelId: selectedPersonel,
            personelAd: `${personel?.ad || ""} ${personel?.soyad || ""}`.trim(),
            personelEmail: "",
            sicilNo: personel?.sicilNo || "",
            tip: "haftaTatili",
            tarih: Timestamp.fromDate(tarih),
            konumId: "",
            konumAdi: "Hafta Tatili",
            kayitOrtami: "Puantaj",
            manuelKayit: true,
            mazeretNotu: aciklama.trim(),
            ekleyenEmail: user?.email || "",
            olusturmaTarihi: Timestamp.now()
          });
        }

        // Değişiklik kaydı
        await addDoc(collection(db, "izinDegisiklikKayitlari"), {
          degisikligiYapan: `${personel?.ad} ${personel?.soyad}`,
          degisiklikTarihi: new Date().toISOString(),
          degisiklikTuru: "İzin Eklendi",
          degisiklikOncesi: "",
          degisiklikSonrasi: `Haftalık İzin | ${baslangic} - ${bitis} | ${gunSayisi} gün${aciklama ? ' | ' + aciklama : ''}`,
          kullaniciAdi: user?.email?.split("@")[0] || "",
        });
      } else {
        // Diğer izinler → izinler collection'a yaz
        await addDoc(collection(db, "izinler"), {
          personelId: selectedPersonel,
          personelAd: personel?.ad || "",
          personelSoyad: personel?.soyad || "",
          sicilNo: personel?.sicilNo || "",
          izinTuru: izinTuru,
          baslangic: baslangic,
          bitis: bitis,
          gunSayisi: gunSayisi,
          aciklama: aciklama.trim(),
          olusturanYonetici: user?.email?.split("@")[0] || "",
          olusturulmaTarihi: new Date().toISOString(),
          durum: "Onaylandı",
          ...(izinTuru === "Raporlu" && {
            raporDriveUrl: raporDriveUrl || null,
            raporDriveFileId: raporDriveFileId || null,
            raporTeslimAlindi: raporTeslimAlindi,
          }),
        });

        // Personelin izin kullanımını güncelle
        const personelRef = doc(db, "personnel", selectedPersonel);
        if (izinTuru === "Yıllık İzin") {
          await updateDoc(personelRef, {
            kullanilanYillik: increment(gunSayisi),
          });
        } else if (izinTuru === "Raporlu") {
          await updateDoc(personelRef, {
            raporlu: increment(gunSayisi),
          });
        } else if (izinTuru === "Mazeret ve Diğer Ücretli İzinler") {
          await updateDoc(personelRef, {
            digerIzinler: increment(gunSayisi),
          });
        } else if (izinTuru === "Ücretsiz İzin") {
          await updateDoc(personelRef, {
            ucretsizIzin: increment(gunSayisi),
          });
        }

        // Değişiklik kaydı
        await addDoc(collection(db, "izinDegisiklikKayitlari"), {
          degisikligiYapan: `${personel?.ad} ${personel?.soyad}`,
          degisiklikTarihi: new Date().toISOString(),
          degisiklikTuru: "İzin Eklendi",
          degisiklikOncesi: "",
          degisiklikSonrasi: `${izinTuru} | ${baslangic} - ${bitis} | ${gunSayisi} gün${aciklama ? ' | ' + aciklama : ''}`,
          kullaniciAdi: user?.email?.split("@")[0] || "",
        });
      }

      if (action === "back") {
        navigate("/izinler");
      } else {
        // Formu temizle
        setSelectedPersonel("");
        setIzinTuru("Yıllık İzin");
        setBaslangic("");
        setBitis("");
        setAciklama("");
        setWhatsappOnay(false);
        setDilekceOnay(false);
        setRaporDosya(null); setRaporDriveUrl(null); setRaporDriveFileId(null); setRaporTeslimAlindi(false);
        alert("İzin başarıyla eklendi. Yeni kayıt girebilirsiniz.");
      }
    } catch (error) {
      Sentry.captureException(error);
      alert("Kaydetme işlemi başarısız oldu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <main className="flex-1 p-4 lg:p-6 ">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-800">İzin Ekle</h1>
            <p className="text-sm text-stone-500">
              Bu sayfada kullanıcılarınıza izin tanımlayabilir / ekleyebilirsiniz.
            </p>
          </div>

          {/* Top Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave("back")}
              disabled={saving || !yillikIzinKosullariTamam || !raporluKosulTamam || raporYukleniyor}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span>💾</span>
              <span>Kaydet & Geri dön</span>
            </button>
            <button
              onClick={() => handleSave("new")}
              disabled={saving || !yillikIzinKosullariTamam || !raporluKosulTamam || raporYukleniyor}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span>+</span>
              <span>Kaydet & Yeni ekle</span>
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 transition-colors flex items-center gap-2"
            >
              <span>↩</span>
              <span>Geri dön</span>
            </button>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-lg shadow-sm border border-stone-100" onKeyDown={handleKeyDown}>
          {/* Tab Header */}
          <div className="border-b border-stone-100 px-6 pt-4">
            <div className="inline-block">
              <span className="text-primary-500 font-medium text-sm pb-3 block border-b-2 border-primary-500">
                Genel
              </span>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-4 md:p-6 space-y-6">
            {/* Kullanıcı */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                Kullanıcı <span className="text-red-500">(*)</span>
              </label>
              <select
                value={selectedPersonel}
                onChange={(e) => setSelectedPersonel(e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                <option value="">- Seçiniz -</option>
                {personeller.map((personel) => (
                  <option key={personel.id} value={personel.id}>
                    {personel.ad} {personel.soyad}
                  </option>
                ))}
              </select>
            </div>

            {/* İzin Türü */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                İzin Türü <span className="text-red-500">(*)</span>
              </label>
              <select
                value={izinTuru}
                onChange={(e) => {
                  setIzinTuru(e.target.value);
                  setWhatsappOnay(false);
                  setDilekceOnay(false);
                  setRaporDosya(null); setRaporDriveUrl(null); setRaporDriveFileId(null); setRaporTeslimAlindi(false);
                }}
                className="w-full max-w-md px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                <option value="Yıllık İzin">Yıllık İzin</option>
                <option value="Haftalık İzin">Haftalık İzin</option>
                <option value="Mazeret ve Diğer Ücretli İzinler">Mazeret ve Diğer Ücretli İzinler</option>
                <option value="Raporlu">Raporlu</option>
                <option value="Ücretsiz İzin">Ücretsiz İzin</option>
              </select>
            </div>

            {/* Başlangıç */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                Başlangıç (Dahil) <span className="text-red-500">(*)</span>
                <span className="block text-xs text-stone-400 font-normal">İzin başlangıç günü dahildir</span>
              </label>
              <input
                type="date" min="2020-01-01" max="2099-12-31"
                value={baslangic}
                onChange={(e) => setBaslangic(e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* Bitiş */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                Bitiş (Dahil)
                <span className="block text-xs text-stone-400 font-normal">İzin bitiş günü dahildir</span>
              </label>
              <input
                type="date" min="2020-01-01" max="2099-12-31"
                value={bitis}
                onChange={(e) => setBitis(e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* Gün Sayısı Gösterimi */}
            {baslangic && bitis && (
              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
                <label className="text-sm font-medium text-stone-700">Toplam Gün</label>
                <div className="px-3 py-2 bg-stone-50 rounded-lg text-sm font-semibold text-primary-600 w-fit">
                  {hesaplaGunSayisi()} gün
                </div>
              </div>
            )}

            {/* Yıllık İzin Ön Koşulları */}
            {izinTuru === "Yıllık İzin" && (
              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-start gap-4">
                <label className="text-sm font-medium text-stone-700 pt-1">
                  Ön Koşullar <span className="text-red-500">(*)</span>
                </label>
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4 max-w-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-amber-500 text-sm">⚠️</span>
                    <p className="text-xs font-semibold text-amber-700">Yıllık izin ekleyebilmek için aşağıdaki koşulların sağlanması zorunludur.</p>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={whatsappOnay}
                        onChange={(e) => setWhatsappOnay(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-primary-500 rounded border-stone-300 focus:ring-primary-500 shrink-0"
                      />
                      <span className={`text-sm leading-snug transition-colors ${whatsappOnay ? 'text-stone-800' : 'text-stone-500 group-hover:text-stone-700'}`}>
                        Personelden <strong>WhatsApp üzerinden</strong> izin için uygunluk onayı alındı.
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={dilekceOnay}
                        onChange={(e) => setDilekceOnay(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-primary-500 rounded border-stone-300 focus:ring-primary-500 shrink-0"
                      />
                      <span className={`text-sm leading-snug transition-colors ${dilekceOnay ? 'text-stone-800' : 'text-stone-500 group-hover:text-stone-700'}`}>
                        Yıllık izin dilekçesi dolduruldu ve <strong>Aziz Erkan Yolcu</strong>'ya teslim edildi.
                      </span>
                    </label>
                  </div>
                  {(!whatsappOnay || !dilekceOnay) && (
                    <p className="mt-3 pt-3 border-t border-amber-200/40 text-[11px] text-amber-600/80">
                      🔒 Her iki koşul da sağlanmadan izin kaydedilemez.
                    </p>
                  )}
                  {whatsappOnay && dilekceOnay && (
                    <p className="mt-3 pt-3 border-t border-green-200/40 text-[11px] text-green-600">
                      ✅ Tüm koşullar sağlandı. İzin kaydedilebilir.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Raporlu İzin Koşulları */}
            {izinTuru === "Raporlu" && (
              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-start gap-4">
                <label className="text-sm font-medium text-stone-700 pt-2">
                  Rapor Belgesi
                </label>
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-amber-500 text-sm">🏥</span>
                    <p className="text-xs font-semibold text-amber-700">Raporlu izin için aşağıdakilerden en az birini yapın.</p>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white/70 rounded-lg p-3 border border-amber-100/60">
                      <p className="text-[11px] font-semibold text-stone-700 mb-2">📸 Seçenek 1: Rapor fotoğrafını yükle</p>
                      <input ref={raporInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleRaporYukle(file); e.target.value = ""; }} />
                      {!raporDriveUrl && !raporYukleniyor && (
                        <button type="button" onClick={() => raporInputRef.current?.click()}
                          className="w-full border-2 border-dashed border-amber-300 rounded-lg py-4 text-xs text-amber-600 hover:bg-amber-50 transition flex flex-col items-center gap-1">
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
                            <div className="bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2"><span>📋</span><span className="text-xs text-red-700 font-medium">PDF yüklendi</span></div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-emerald-600 font-medium">✅ Drive'a yüklendi</span>
                            <button type="button" onClick={() => { setRaporDosya(null); setRaporDriveUrl(null); setRaporDriveFileId(null); }} className="text-[10px] text-red-500 hover:text-red-700">Kaldır</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border-t border-amber-200/60" />
                      <span className="text-[10px] text-amber-400 font-medium">VEYA</span>
                      <div className="flex-1 border-t border-amber-200/60" />
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer group bg-white/70 rounded-lg p-3 border border-amber-100/60">
                      <input type="checkbox" checked={raporTeslimAlindi} onChange={(e) => setRaporTeslimAlindi(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-amber-500 rounded border-stone-300 focus:ring-amber-400 shrink-0" />
                      <div>
                        <span className={`text-sm leading-snug transition-colors ${raporTeslimAlindi ? 'text-stone-800' : 'text-stone-500 group-hover:text-stone-700'}`}>
                          Rapor <strong>Aziz Erkan Yolcu</strong>'nun masasına teslim edildi.
                        </span>
                        <p className="text-[10px] text-stone-400 mt-0.5">Fiziksel rapor teslim alındıysa işaretleyin.</p>
                      </div>
                    </label>
                  </div>
                  {!raporDriveUrl && !raporTeslimAlindi && (
                    <p className="mt-3 pt-3 border-t border-amber-200/40 text-[11px] text-amber-600/80">
                      🔒 Rapor yüklemeden veya teslim almadan izin kaydedilemez.
                    </p>
                  )}
                  {(!!raporDriveUrl || raporTeslimAlindi) && (
                    <p className="mt-3 pt-3 border-t border-green-200/40 text-[11px] text-green-600">
                      ✅ Koşul sağlandı. İzin kaydedilebilir.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Kısa Açıklama */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-start gap-4">
              <label className="text-sm font-medium text-stone-700 pt-2">
                Kısa Açıklama
              </label>
              <textarea
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                placeholder="Örn: Yıllık izin kullanımı"
                rows={4}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y"
              />
            </div>
          </div>
        </div>

        {/* Bottom Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={() => handleSave("back")}
            disabled={saving || !yillikIzinKosullariTamam || !raporluKosulTamam || raporYukleniyor}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span>💾</span>
            <span>Kaydet & Geri dön</span>
          </button>
          <button
            onClick={() => handleSave("new")}
            disabled={saving || !yillikIzinKosullariTamam || !raporluKosulTamam || raporYukleniyor}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span>+</span>
            <span>Kaydet & Yeni ekle</span>
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 transition-colors flex items-center gap-2"
          >
            <span>↩</span>
            <span>Geri dön</span>
          </button>
        </div>
      </main>
    </div>
  );
}