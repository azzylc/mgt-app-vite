import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import Sidebar from "../../components/Sidebar";

interface PersonelIzin {
  id: string;
  ad: string;
  soyad: string;
  foto?: string;
  iseBaslama: string;
  yillikIzinHakki: number;
  kullanilanYillik: number;
  kalanYillik: number;
  ucretsizIzin: number;
  raporlu: number;
  digerIzinler: number;
  aktif: boolean;
}

export default function IzinToplamlari() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [personeller, setPersoneller] = useState<PersonelIzin[]>([]);
  const [showInactive, setShowInactive] = useState(true);

  // localStorage'dan tercihi oku
  useEffect(() => {
    const saved = localStorage.getItem("izinToplamları_showInactive");
    if (saved !== null) {
      setShowInactive(saved === "true");
    }
  }, []);

  // Tercih değişince kaydet
  const handleShowInactiveChange = (value: boolean) => {
    setShowInactive(value);
    localStorage.setItem("izinToplamları_showInactive", value.toString());
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

  // Personel ve izin verilerini çek
  useEffect(() => {
    if (!user) return;

    // Personelleri çek
    const personelQuery = query(collection(db, "personnel"));
    
    const unsubscribePersonel = onSnapshot(personelQuery, async (personelSnapshot) => {
      const personelList: PersonelIzin[] = [];

      for (const doc of personelSnapshot.docs) {
        const data = doc.data();
        
        // Her personel için izin toplamlarını hesapla
        personelList.push({
          id: doc.id,
          ad: data.ad || "",
          soyad: data.soyad || "",
          foto: data.foto || "",
          iseBaslama: data.iseBaslama || "",
          yillikIzinHakki: data.yillikIzinHakki || 0,
          kullanilanYillik: data.kullanilanYillik || 0,
          kalanYillik: (data.yillikIzinHakki || 0) - (data.kullanilanYillik || 0),
          ucretsizIzin: data.ucretsizIzin || 0,
          raporlu: data.raporlu || 0,
          digerIzinler: data.digerIzinler || 0,
          aktif: data.aktif !== false,
        });
      }

      // Önce aktifler, sonra ayrılanlar - kendi içlerinde isme göre sırala
      personelList.sort((a, b) => {
        // Aktiflik durumuna göre öncelik
        if (a.aktif && !b.aktif) return -1;
        if (!a.aktif && b.aktif) return 1;
        // Aynı durumdaysa isme göre sırala
        return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`);
      });
      
      setPersoneller(personelList);
    });

    return () => unsubscribePersonel();
  }, [user]);

  // Tarih formatla
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("tr-TR");
  };

  // Filtrele
  const filteredPersoneller = showInactive 
    ? personeller 
    : personeller.filter(p => p.aktif);

  // Aktif ve pasif sayıları
  const aktifSayisi = personeller.filter(p => p.aktif).length;
  const pasifSayisi = personeller.filter(p => !p.aktif).length;

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
        <div className="mb-6">
          <h1 className="text-xl font-bold text-stone-800">İzin Toplamları</h1>
          <p className="text-sm text-stone-500">
            Personellerin yıllık izin hakları ve kullanım durumları
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-stone-100 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => handleShowInactiveChange(e.target.checked)}
                  className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-stone-600">Ayrılanları da göster</span>
              </label>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-stone-600">
                Aktif: <span className="font-semibold text-green-600">{aktifSayisi}</span>
              </span>
              <span className="text-stone-600">
                Ayrılan: <span className="font-semibold text-red-600">{pasifSayisi}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-stone-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Görsel</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Adı</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">İşe Başl. Tarihi</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">Yıllık İzin Hakkı</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">Kullanılan Yıllık İzin</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">Kalan Yıllık İzin</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">Ücretsiz İzin</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">Raporlu</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">Diğer İzinler</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersoneller.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-stone-500">
                      Henüz personel kaydı bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  filteredPersoneller.map((personel, index) => (
                    <tr
                      key={personel.id}
                      className={`border-b border-stone-50 transition-colors ${
                        !personel.aktif 
                          ? "bg-red-50/50 text-red-400" 
                          : "hover:bg-stone-50/50"
                      }`}
                    >
                      <td className={`px-3 py-3 text-sm ${!personel.aktif ? "text-red-400" : "text-stone-500"}`}>
                        {index + 1}
                      </td>
                      <td className="px-3 py-3">
                        {personel.foto ? (
                          <img
                            src={personel.foto}
                            alt={`${personel.ad} ${personel.soyad}`}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                            !personel.aktif ? "bg-red-300" : "bg-primary-400"
                          }`}>
                            {personel.ad?.[0]}{personel.soyad?.[0]}
                          </div>
                        )}
                      </td>
                      <td className={`px-3 py-3 text-sm font-medium ${!personel.aktif ? "text-red-400 italic" : "text-stone-800"}`}>
                        {personel.ad} {personel.soyad}
                      </td>
                      <td className={`px-3 py-3 text-sm ${!personel.aktif ? "text-red-400 italic" : "text-stone-600"}`}>
                        {personel.iseBaslama ? (
                          formatDate(personel.iseBaslama)
                        ) : (
                          <button 
                            onClick={() => navigate(`/izinler/hakki-ekle?personel=${personel.id}`)}
                            className="text-primary-500 hover:text-primary-600 hover:underline"
                          >
                            Ekle ↗
                          </button>
                        )}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-red-400" : "text-stone-800"}`}>
                        {personel.yillikIzinHakki}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-red-400" : "text-stone-800"}`}>
                        {personel.kullanilanYillik}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center font-semibold ${
                        !personel.aktif 
                          ? "text-red-400" 
                          : personel.kalanYillik < 0 
                            ? "text-red-600" 
                            : personel.kalanYillik > 0 
                              ? "text-green-600" 
                              : "text-stone-800"
                      }`}>
                        {personel.kalanYillik}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-red-400" : "text-stone-800"}`}>
                        {personel.ucretsizIzin}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-red-400" : "text-stone-800"}`}>
                        {personel.raporlu}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-red-400" : "text-stone-800"}`}>
                        {personel.digerIzinler}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Summary */}
          {filteredPersoneller.length > 0 && (
            <div className="px-4 py-3 border-t border-stone-100 bg-stone-50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-600">
                  Toplam <span className="font-semibold">{filteredPersoneller.length}</span> personel
                </span>
                <div className="flex items-center gap-6">
                  <span className="text-stone-600">
                    Toplam Hak: <span className="font-semibold">{filteredPersoneller.reduce((sum, p) => sum + p.yillikIzinHakki, 0)}</span> gün
                  </span>
                  <span className="text-stone-600">
                    Kullanılan: <span className="font-semibold">{filteredPersoneller.reduce((sum, p) => sum + p.kullanilanYillik, 0)}</span> gün
                  </span>
                  <span className="text-stone-600">
                    Kalan: <span className="font-semibold text-green-600">{filteredPersoneller.reduce((sum, p) => sum + p.kalanYillik, 0)}</span> gün
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-6 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
            <span>Ayrılan personeller</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-600 font-semibold">-3</span>
            <span>Eksiye düşen izin hakkı</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-semibold">19</span>
            <span>Kalan izin hakkı</span>
          </div>
        </div>
      </main>
    </div>
  );
}