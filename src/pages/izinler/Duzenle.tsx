import { useState, useEffect, useRef } from "react";
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
  const [yarimGun, setYarimGun] = useState(false);
  const [yarimGunTipi, setYarimGunTipi] = useState<"baslangic" | "bitis">("baslangic");
  const [aciklama, setAciklama] = useState("");
  const [kaynak, setKaynak] = useState<"manuel" | "puantaj">("manuel");

  // Kullanıcı açıklamayı kendisi düzenledi mi?
  const isUserEditedRef = useRef(false);
  // İlk veri yüklendi mi?
  const isDataLoadedRef = useRef(false);

  // Enter ile kaydet (textarea hariç)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      handleSave();
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
          setYarimGun(data.yarimGun || false);
          setYarimGunTipi(data.yarimGunTipi || "baslangic");
          setAciklama(data.aciklama || "");
          setKaynak(data.kaynak || "manuel");
          isDataLoadedRef.current = true;
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
    let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (yarimGun) diffDays = diffDays - 0.5;
    return diffDays;
  };

  // Otomatik açıklama doldur (sadece kullanıcı kendisi düzenlemediyse)
  useEffect(() => {
    if (!isDataLoadedRef.current) return;
    if (isUserEditedRef.current) return;

    if (baslangic && bitis && izinTuru) {
      const gunSayisi = hesaplaGunSayisi();
      if (gunSayisi > 0) {
        const yarimGunText = yarimGun ? ` (${yarimGunTipi === "baslangic" ? "ilk gün" : "son gün"} yarım gün)` : "";
        const aciklamaMetni = `${gunSayisi} günlük ${izinTuru.toLowerCase()}${yarimGunText}`;
        setAciklama(aciklamaMetni);
      }
    }
  }, [baslangic, bitis, izinTuru, yarimGun, yarimGunTipi]);

  const handleSave = async () => {
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

      await updateDoc(doc(db, "izinler", id!), {
        personelId: selectedPersonel,
        personelAd: personel?.ad || "",
        personelSoyad: personel?.soyad || "",
        sicilNo: personel?.sicilNo || "",
        izinTuru,
        baslangic,
        bitis,
        yarimGun,
        yarimGunTipi: yarimGun ? yarimGunTipi : null,
        gunSayisi,
        aciklama: aciklama.trim(),
        kaynak,
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
              Mevcut izin kaydını düzenleyebilirsiniz.
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
              <span>{saving ? "Kaydediliyor..." : "Güncelle"}</span>
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
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                Başlangıç (Dahil) <span className="text-red-500">(*)</span>
                <span className="block text-xs text-stone-400 font-normal">İzin başlangıç günü dahildir</span>
              </label>
              <input
                type="date"
                min="2020-01-01"
                max="2099-12-31"
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
                type="date"
                min={baslangic || "2020-01-01"}
                max="2099-12-31"
                value={bitis}
                onChange={(e) => setBitis(e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* Yarım Gün */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                Yarım Gün
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={yarimGun}
                    onChange={(e) => setYarimGun(e.target.checked)}
                    className="w-4 h-4 rounded border-stone-300 text-primary-500 focus:ring-primary-500/20"
                  />
                  <span className="text-sm text-stone-600">Yarım gün izin</span>
                </label>
                {yarimGun && (
                  <select
                    value={yarimGunTipi}
                    onChange={(e) => setYarimGunTipi(e.target.value as "baslangic" | "bitis")}
                    className="px-3 py-1.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="baslangic">İlk gün yarım</option>
                    <option value="bitis">Son gün yarım</option>
                  </select>
                )}
              </div>
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

            {/* Kaynak */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-stone-700">
                Kaynak
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="kaynak"
                    value="manuel"
                    checked={kaynak === "manuel"}
                    onChange={() => setKaynak("manuel")}
                    className="w-4 h-4 text-primary-500 focus:ring-primary-500/20"
                  />
                  <span className="text-sm text-stone-600">Manuel</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="kaynak"
                    value="puantaj"
                    checked={kaynak === "puantaj"}
                    onChange={() => setKaynak("puantaj")}
                    className="w-4 h-4 text-primary-500 focus:ring-primary-500/20"
                  />
                  <span className="text-sm text-stone-600">Puantajdan</span>
                </label>
              </div>
            </div>

            {/* Kısa Açıklama */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-start gap-4">
              <label className="text-sm font-medium text-stone-700 pt-2">
                Kısa Açıklama
              </label>
              <textarea
                value={aciklama}
                onChange={(e) => {
                  setAciklama(e.target.value);
                  isUserEditedRef.current = true;
                }}
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
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span>💾</span>
            <span>{saving ? "Kaydediliyor..." : "Güncelle"}</span>
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