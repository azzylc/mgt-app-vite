import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, addDoc, Timestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import * as Sentry from '@sentry/react';
import { useAuth } from "../../context/RoleProvider";

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
}

interface Konum {
  id: string;
  ad: string;
  karekod: string;
}

export default function ManuelIslemEklePage() {
  const user = useAuth();
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [konumlar, setKonumlar] = useState<Konum[]>([]);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // Form state
  const [seciliPersonel, setSeciliPersonel] = useState("");
  const [seciliKonum, setSeciliKonum] = useState("");
  const [tarih, setTarih] = useState("");
  const [kayitTuru, setKayitTuru] = useState("giris");
  const [mazeret, setMazeret] = useState("");

  // Şu anki tarih/saat
  useEffect(() => {
    const now = new Date();
    const formatted = now.toISOString().slice(0, 16);
    setTarih(formatted);
  }, []);

  // Personelleri çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .filter(doc => doc.data().aktif !== false)
        .map(doc => ({
          id: doc.id,
          ad: doc.data().ad || "",
          soyad: doc.data().soyad || "",
          sicilNo: doc.data().sicilNo || ""
        }));
      setPersoneller(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Konumları çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "locations"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || doc.data().name || "",
        karekod: doc.data().karekod || doc.data().code || ""
      }));
      setKonumlar(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Kaydet ve geri dön
  const handleSaveAndBack = async () => {
    const success = await saveRecord();
    if (success) navigate("/giris-cikis/islem-listesi");
  };

  // Kaydet ve yeni ekle
  const handleSaveAndNew = async () => {
    const success = await saveRecord();
    if (success) {
      setSeciliPersonel("");
      setSeciliKonum("");
      setMazeret("");
      const now = new Date();
      setTarih(now.toISOString().slice(0, 16));
    }
  };

  // Kayıt işlemi
  const saveRecord = async (): Promise<boolean> => {
    if (!seciliPersonel) {
      alert("Lütfen kullanıcı seçin!");
      return false;
    }
    if (!seciliKonum) {
      alert("Lütfen konum seçin!");
      return false;
    }
    if (!tarih) {
      alert("Lütfen tarih seçin!");
      return false;
    }

    setSaving(true);

    try {
      const personel = personeller.find(p => p.id === seciliPersonel);
      const konum = konumlar.find(k => k.id === seciliKonum);
      const tarihDate = new Date(tarih);

      await addDoc(collection(db, "attendance"), {
        personelId: seciliPersonel,
        personelAd: `${personel?.ad} ${personel?.soyad}`.trim(),
        personelEmail: "",
        sicilNo: personel?.sicilNo || "",
        tip: kayitTuru,
        tarih: Timestamp.fromDate(tarihDate),
        konumId: seciliKonum,
        konumAdi: konum?.karekod || konum?.ad,
        kayitOrtami: "Manuel",
        manuelKayit: true,
        mazeretNotu: mazeret || "",
        ekleyenEmail: user.email,
        olusturmaTarihi: Timestamp.now()
      });

      await addDoc(collection(db, "attendanceChanges"), {
        degisiklikYapan: user.email,
        degisiklikTarihi: Timestamp.now(),
        degisiklikTuru: "Kayıt Eklendi",
        oncekiDeger: "",
        sonrakiDeger: kayitTuru === "giris" ? "Giriş" : "Çıkış",
        kullaniciAdi: `${personel?.ad} ${personel?.soyad}`.trim(),
        konum: konum?.karekod || konum?.ad,
        girisCikisTarih: Timestamp.fromDate(tarihDate)
      });

      alert("Kayıt başarıyla eklendi!");
      return true;
    } catch (error) {
      Sentry.captureException(error);
      alert("Kayıt eklenirken hata oluştu!");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div>
        <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#2F2F2F]">Manuel İşlem Ekle</h1>
              <p className="text-sm text-[#8A8A8A] mt-1">Bu sayfada, manuel olarak bir giriş - çıkış kaydı ekleyebilirsiniz.</p>
            </div>
            <div className="hidden md:flex gap-2">
              <button
                onClick={handleSaveAndBack}
                disabled={saving}
                className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
              >
                💾 Kaydet & Geri dön
              </button>
              <button
                onClick={handleSaveAndNew}
                disabled={saving}
                className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
              >
                ➕ Kaydet & Yeni ekle
              </button>
              <button
                onClick={() => navigate("/giris-cikis/islem-listesi")}
                className="bg-[#F7F7F7] hover:bg-[#E5E5E5] text-[#2F2F2F] px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                ↩️ Geri dön
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="space-y-6">
                {/* Kullanıcı Adı */}
                <div>
                  <label className="block text-sm font-medium text-[#2F2F2F] mb-2">Kullanıcı Adı</label>
                  <select
                    value={seciliPersonel}
                    onChange={(e) => setSeciliPersonel(e.target.value)}
                    className="w-full px-4 py-3 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="">- Seçiniz -</option>
                    {personeller.map(p => (
                      <option key={p.id} value={p.id}>{p.ad} {p.soyad}</option>
                    ))}
                  </select>
                </div>

                {/* Konum */}
                <div>
                  <label className="block text-sm font-medium text-[#2F2F2F] mb-2">Konum</label>
                  <select
                    value={seciliKonum}
                    onChange={(e) => setSeciliKonum(e.target.value)}
                    className="w-full px-4 py-3 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="">- Seçiniz -</option>
                    {konumlar.map(k => (
                      <option key={k.id} value={k.id}>{k.karekod} - {k.ad}</option>
                    ))}
                  </select>
                </div>

                {/* Tarih */}
                <div>
                  <label className="block text-sm font-medium text-[#2F2F2F] mb-2">Tarih</label>
                  <input
                    type="datetime-local" min="2020-01-01T00:00" max="2099-12-31T23:59"
                    value={tarih}
                    onChange={(e) => setTarih(e.target.value)}
                    className="w-full px-4 py-3 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {/* Kayıt Türü */}
                <div>
                  <label className="block text-sm font-medium text-[#2F2F2F] mb-2">Kayıt Türü</label>
                  <select
                    value={kayitTuru}
                    onChange={(e) => setKayitTuru(e.target.value)}
                    className="w-full px-4 py-3 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="giris">Giriş</option>
                    <option value="cikis">Çıkış</option>
                  </select>
                </div>

                {/* Mazeret */}
                <div>
                  <label className="block text-sm font-medium text-[#2F2F2F] mb-2">Mazeret</label>
                  <textarea
                    value={mazeret}
                    onChange={(e) => setMazeret(e.target.value)}
                    placeholder="Mazeret notu girin (opsiyonel)..."
                    rows={3}
                    className="w-full px-4 py-3 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                  />
                </div>

                {/* Alt Butonlar */}
                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t">
                  <button
                    onClick={handleSaveAndBack}
                    disabled={saving}
                    className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-4 py-3 rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? "Kaydediliyor..." : "💾 Kaydet & Geri dön"}
                  </button>
                  <button
                    onClick={handleSaveAndNew}
                    disabled={saving}
                    className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-4 py-3 rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? "Kaydediliyor..." : "➕ Kaydet & Yeni ekle"}
                  </button>
                  <button
                    onClick={() => navigate("/giris-cikis/islem-listesi")}
                    className="flex-1 bg-[#F7F7F7] hover:bg-[#E5E5E5] text-[#2F2F2F] px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
                  >
                    ↩️ Geri dön
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}