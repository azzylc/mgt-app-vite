import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, increment, Timestamp } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../../context/RoleProvider";

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
      alert("Yıllık izin için ön koşulları sağlamanız gerekmektedir.");
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
              disabled={saving || !yillikIzinKosullariTamam}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span>💾</span>
              <span>Kaydet & Geri dön</span>
            </button>
            <button
              onClick={() => handleSave("new")}
              disabled={saving || !yillikIzinKosullariTamam}
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
                    <p className="text-xs font-semibold text-amber-700">Yıllık izin talebinde bulunabilmek için aşağıdaki koşulların sağlanması zorunludur.</p>
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
                        Yöneticimden <strong>WhatsApp üzerinden</strong> izin için uygunluk onayı aldım.
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
                        Yıllık izin dilekçesini doldurdum ve <strong>Aziz Erkan Yolcu</strong>'ya teslim ettim.
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
            disabled={saving || !yillikIzinKosullariTamam}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span>💾</span>
            <span>Kaydet & Geri dön</span>
          </button>
          <button
            onClick={() => handleSave("new")}
            disabled={saving || !yillikIzinKosullariTamam}
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