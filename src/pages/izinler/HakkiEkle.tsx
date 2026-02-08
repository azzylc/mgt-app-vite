import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useSearchParams , useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, increment } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../../context/RoleProvider";

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  iseBaslama?: string;
  aktif: boolean;
}

function IzinHakkiEkleContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedPersonel = searchParams.get("personel") || "";

  const user = useAuth();
  const [saving, setSaving] = useState(false);
  const [personeller, setPersoneller] = useState<Personel[]>([]);

  const [selectedPersonel, setSelectedPersonel] = useState(preSelectedPersonel || "");
  const [hakGunu, setHakGunu] = useState("");
  const [aciklama, setAciklama] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      handleSave("back");
    }
  };

  const seciliPersonel = personeller.find(p => p.id === selectedPersonel);

  const hesaplaCalismaYili = (iseBaslama: string) => {
    if (!iseBaslama) return 0;
    const baslangic = new Date(iseBaslama);
    const bugun = new Date();
    const yil = bugun.getFullYear() - baslangic.getFullYear();
    const ayFarki = bugun.getMonth() - baslangic.getMonth();
    if (ayFarki < 0 || (ayFarki === 0 && bugun.getDate() < baslangic.getDate())) {
      return yil - 1;
    }
    return yil;
  };

  const hesaplaIzinHakki = (calismaYili: number) => {
    let toplam = 0;
    for (let yil = 1; yil <= calismaYili; yil++) {
      if (yil <= 5) toplam += 14;
      else if (yil <= 15) toplam += 20;
      else toplam += 26;
    }
    return toplam;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("tr-TR");
  };

  const otomatikDoldur = () => {
    if (!seciliPersonel?.iseBaslama) {
      alert("Bu personelin işe giriş tarihi tanımlı değil.");
      return;
    }
    
    const calismaYili = hesaplaCalismaYili(seciliPersonel.iseBaslama);
    const izinHakki = hesaplaIzinHakki(calismaYili);
    const iseGirisTarihi = formatDate(seciliPersonel.iseBaslama);
    const buYil = new Date().getFullYear();
    
    setHakGunu(izinHakki.toString());
    setAciklama(`${iseGirisTarihi} tarihinde işe başladığı için ${calismaYili}. yılını doldurmuştur. ${buYil} yılı için toplam ${izinHakki} gün izin hakkı eklenmiştir.`);
  };

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "personnel"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const personelList: Personel[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.aktif !== false) {
          personelList.push({
            id: doc.id,
            ad: data.ad || data.isim || "",
            soyad: data.soyad || "",
            iseBaslama: data.iseBaslama || "",
            aktif: true,
          });
        }
      });
      personelList.sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`));
      setPersoneller(personelList);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSave = async (action: "back" | "new") => {
    if (!selectedPersonel) {
      alert("Lütfen bir kullanıcı seçin.");
      return;
    }
    if (!hakGunu || parseInt(hakGunu) <= 0) {
      alert("Lütfen geçerli bir gün sayısı girin.");
      return;
    }
    if (!aciklama.trim()) {
      alert("Lütfen kısa açıklama girin.");
      return;
    }

    setSaving(true);

    try {
      const personel = personeller.find(p => p.id === selectedPersonel);

      await addDoc(collection(db, "izinHakDegisiklikleri"), {
        personelId: selectedPersonel,
        personelAd: personel?.ad || "",
        personelSoyad: personel?.soyad || "",
        eklenenGun: parseInt(hakGunu),
        aciklama: aciklama.trim(),
        islemTarihi: new Date().toISOString(),
        islemYapan: user?.email || "",
      });

      const personelRef = doc(db, "personnel", selectedPersonel);
      await updateDoc(personelRef, {
        yillikIzinHakki: increment(parseInt(hakGunu)),
      });

      if (action === "back") {
        navigate("/izinler/haklar");
      } else {
        setSelectedPersonel("");
        setHakGunu("");
        setAciklama("");
        alert("İzin hakkı başarıyla eklendi. Yeni kayıt girebilirsiniz.");
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
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-800">İzin Hakkı Ekle</h1>
            <p className="text-sm text-stone-500">
              Bu sayfada kullanıcılarınıza izin hakkı tanımlayabilirsiniz.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave("back")}
              disabled={saving}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span>💾</span>
              <span>Kaydet & Geri dön</span>
            </button>
            <button
              onClick={() => handleSave("new")}
              disabled={saving}
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

        <div className="bg-white rounded-lg shadow-sm border border-stone-100" onKeyDown={handleKeyDown}>
          <div className="border-b border-stone-100 px-6 pt-4">
            <div className="inline-block">
              <span className="text-primary-500 font-medium text-sm pb-3 block border-b-2 border-primary-500">
                Genel
              </span>
            </div>
          </div>

          <div className="p-4 md:p-6 space-y-6">
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

            {seciliPersonel && (
              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-start gap-4">
                <label className="text-sm font-medium text-stone-700">Personel Bilgisi</label>
                <div className="bg-stone-50 rounded-lg p-4 max-w-md">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-stone-500">İşe Giriş Tarihi:</span>
                      <span className="ml-2 font-medium text-stone-800">
                        {seciliPersonel.iseBaslama ? formatDate(seciliPersonel.iseBaslama) : "Tanımlı değil"}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500">Çalışma Süresi:</span>
                      <span className="ml-2 font-medium text-stone-800">
                        {seciliPersonel.iseBaslama ? `${hesaplaCalismaYili(seciliPersonel.iseBaslama)} yıl` : "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500">Toplam Hak:</span>
                      <span className="ml-2 font-semibold text-primary-600">
                        {seciliPersonel.iseBaslama ? `${hesaplaIzinHakki(hesaplaCalismaYili(seciliPersonel.iseBaslama))} gün` : "-"}
                      </span>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={otomatikDoldur}
                        className="px-3 py-1.5 bg-primary-500 text-white text-xs rounded-lg hover:bg-primary-600 transition-colors"
                      >
                        ✨ Otomatik Doldur
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-stone-200 text-xs text-stone-500">
                    📋 Her yıl eklenen: 1-5. yıl → 14 gün | 6-15. yıl → 20 gün | 16+. yıl → 26 gün
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                Hak kazandığı gün <span className="text-red-500">(*)</span>
              </label>
              <input
                type="number"
                min="1"
                value={hakGunu}
                onChange={(e) => setHakGunu(e.target.value)}
                placeholder="Örn: 14"
                className="w-full max-w-md px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-start gap-4">
              <label className="text-sm font-medium text-stone-700 pt-2">
                Kısa Açıklama <span className="text-red-500">(*)</span>
              </label>
              <textarea
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                placeholder="Örn: 2025 yılı yıllık izin hakkı"
                rows={5}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={() => handleSave("back")}
            disabled={saving}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span>💾</span>
            <span>Kaydet & Geri dön</span>
          </button>
          <button
            onClick={() => handleSave("new")}
            disabled={saving}
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

export default function IzinHakkiEkle() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    }>
      <IzinHakkiEkleContent />
    </Suspense>
  );
}