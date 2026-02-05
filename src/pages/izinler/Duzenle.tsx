import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, onSnapshot, doc, getDoc, updateDoc } from "firebase/firestore";
import Sidebar from "../../components/Sidebar";

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  aktif: boolean;
}

export default function IzinDuzenle() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [personeller, setPersoneller] = useState<Personel[]>([]);

  // Form state
  const [selectedPersonel, setSelectedPersonel] = useState("");
  const [izinTuru, setIzinTuru] = useState("Yıllık İzin");
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [aciklama, setAciklama] = useState("");

  // Enter ile kaydet (textarea hariç)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      handleSave("back");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        setLoading(false);
      } else {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, []);

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

  // İzin verisini çek (düzenleme modu)
  useEffect(() => {
    if (!user || !id) return;

    const fetchIzin = async () => {
      try {
        const izinDoc = await getDoc(doc(db, "izinler", id));
        if (izinDoc.exists()) {
          const data = izinDoc.data();
          setSelectedPersonel(data.personelId || "");
          setIzinTuru(data.izinTuru || "Yıllık İzin");
          setBaslangic(data.baslangic || "");
          setBitis(data.bitis || "");
          setAciklama(data.aciklama || "");
        } else {
          alert("İzin kaydı bulunamadı!");
          navigate("/izinler");
        }
      } catch (error) {
        console.error("İzin verisi çekilirken hata:", error);
        alert("İzin verisi yüklenemedi!");
        navigate("/izinler");
      }
    };

    fetchIzin();
  }, [user, id]);

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

    setSaving(true);

    try {
      const personel = personeller.find(p => p.id === selectedPersonel);
      const gunSayisi = hesaplaGunSayisi();

      // İzin kaydını güncelle
      await updateDoc(doc(db, "izinler", id!), {
        personelId: selectedPersonel,
        personelAd: personel?.ad || "",
        personelSoyad: personel?.soyad || "",
        sicilNo: personel?.sicilNo || "",
        izinTuru: izinTuru,
        baslangic: baslangic,
        bitis: bitis,
        gunSayisi: gunSayisi,
        aciklama: aciklama.trim(),
        duzenleyenYonetici: user?.email?.split("@")[0] || "",
        duzenlenmeTarihi: new Date().toISOString(),
      });

      alert("İzin kaydı güncellendi!");
      navigate("/izinler");
    } catch (error) {
      console.error("İzin güncellenirken hata:", error);
      alert("İzin güncellenemedi!");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-warm">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-neutral-warm">
      <Sidebar user={user} />

      <main className="flex-1 p-4 lg:p-6 md:ml-56 pb-20 md:pb-0">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-800">İzin Düzenle</h1>
            <p className="text-sm text-stone-500">
              Bu sayfada kullanıcılarınıza izin tanımlayabilir / ekleyebilirsiniz.
            </p>
          </div>

          {/* Top Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave("back")}
              disabled={saving}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span>💾</span>
              <span>Güncelle</span>
            </button>
            <button
              onClick={() => navigate("/izinler")}
              className="px-4 py-2 bg-stone-200 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-300 transition-colors flex items-center gap-2"
            >
              <span>↩</span>
              <span>İptal</span>
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
            {/* Kullanıcı */}
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
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
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                İzin Türü <span className="text-red-500">(*)</span>
              </label>
              <select
                value={izinTuru}
                onChange={(e) => setIzinTuru(e.target.value)}
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
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
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
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
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
              <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <label className="text-sm font-medium text-stone-700">Toplam Gün</label>
                <div className="px-3 py-2 bg-stone-50 rounded-lg text-sm font-semibold text-primary-600 w-fit">
                  {hesaplaGunSayisi()} gün
                </div>
              </div>
            )}

            {/* Kısa Açıklama */}
            <div className="grid grid-cols-[200px_1fr] items-start gap-4">
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
            disabled={saving}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span>💾</span>
            <span>Güncelle</span>
          </button>
          <button
            onClick={() => navigate("/izinler")}
            className="px-4 py-2 bg-stone-200 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-300 transition-colors flex items-center gap-2"
          >
            <span>↩</span>
            <span>İptal</span>
          </button>
        </div>
      </main>
    </div>
  );
}