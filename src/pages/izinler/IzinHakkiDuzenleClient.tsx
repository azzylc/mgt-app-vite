import { useState, useEffect } from "react";
import { useSearchParams , useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../../context/RoleProvider";

export default function IzinHakkiDuzenleClient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kayitId = searchParams.get('id');

  const user = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [personelAd, setPersonelAd] = useState("");
  const [personelSoyad, setPersonelSoyad] = useState("");
  const [hakGunu, setHakGunu] = useState("");
  const [aciklama, setAciklama] = useState("");

  // Enter ile kaydet (textarea hariç)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      handleSave();
    }
  };

  // Kayıt verilerini çek
  useEffect(() => {
    if (!user || !kayitId) {
      if (user && !kayitId) {
        alert("Kayıt ID'si bulunamadı.");
        navigate("/izinler/haklar");
      }
      return;
    }

    const fetchKayit = async () => {
      try {
        const docRef = doc(db, "izinHakDegisiklikleri", kayitId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setPersonelAd(data.personelAd || "");
          setPersonelSoyad(data.personelSoyad || "");
          setHakGunu(data.eklenenGun?.toString() || "");
          setAciklama(data.aciklama || "");
        } else {
          alert("Kayıt bulunamadı.");
          navigate("/izinler/haklar");
        }
      } catch (error) {
        Sentry.captureException(error);
        alert("Veri yüklenirken hata oluştu.");
      } finally {
        setLoading(false);
      }
    };

    fetchKayit();
  }, [user, kayitId]);

  const handleSave = async () => {
    if (!kayitId) {
      alert("Kayıt ID'si bulunamadı.");
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
      const docRef = doc(db, "izinHakDegisiklikleri", kayitId);
      await updateDoc(docRef, {
        eklenenGun: parseInt(hakGunu),
        aciklama: aciklama.trim(),
        sonDuzenlemeTarihi: new Date().toISOString(),
        sonDuzenleyen: user?.email || "",
      });

      alert("Kayıt başarıyla güncellendi.");
      navigate("/izinler/haklar");
    } catch (error) {
      Sentry.captureException(error);
      alert("Güncelleme işlemi başarısız oldu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-neutral-warm">
      <main className="flex-1 p-4 lg:p-6 md:ml-56 pb-20 md:pb-0">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-800">İzin Hakkı Düzenle</h1>
            <p className="text-sm text-stone-500">
              İzin hakkı kaydını düzenleyebilirsiniz.
            </p>
          </div>

          {/* Top Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span>💾</span>
              <span>Kaydet</span>
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
          <div className="p-6 space-y-6">
            {/* Kullanıcı (readonly) */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                Kullanıcı
              </label>
              <div className="px-3 py-2 bg-stone-100 rounded-lg text-sm text-stone-700 w-full max-w-md">
                {personelAd} {personelSoyad}
              </div>
            </div>

            {/* Hak kazandığı gün */}
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

            {/* Kısa Açıklama */}
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

        {/* Bottom Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span>💾</span>
            <span>Kaydet</span>
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
