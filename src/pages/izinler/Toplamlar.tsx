import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import { useAuth } from "../../context/RoleProvider";

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
  const user = useAuth();
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

  return (
    <div className="flex min-h-screen bg-white">
      <main className="flex-1 p-4 lg:p-6 ">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#2F2F2F]">İzin Toplamları</h1>
          <p className="text-sm text-[#8A8A8A]">
            Personellerin yıllık izin hakları ve kullanım durumları
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => handleShowInactiveChange(e.target.checked)}
                  className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-[#2F2F2F]">Ayrılanları da göster</span>
              </label>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-[#2F2F2F]">
                Aktif: <span className="font-semibold text-[#8FAF9A]">{aktifSayisi}</span>
              </span>
              <span className="text-[#2F2F2F]">
                Ayrılan: <span className="font-semibold text-[#D96C6C]">{pasifSayisi}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F7F7F7] border-b border-[#E5E5E5]">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Görsel</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Adı</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">İşe Başl. Tarihi</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[#2F2F2F]">Yıllık İzin Hakkı</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[#2F2F2F]">Kullanılan Yıllık İzin</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[#2F2F2F]">Kalan Yıllık İzin</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[#2F2F2F]">Ücretsiz İzin</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[#2F2F2F]">Raporlu</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[#2F2F2F]">Diğer İzinler</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersoneller.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-[#8A8A8A]">
                      Henüz personel kaydı bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  filteredPersoneller.map((personel, index) => (
                    <tr
                      key={personel.id}
                      className={`border-b border-[#E5E5E5]/50 transition-colors ${
                        !personel.aktif 
                          ? "bg-[#D96C6C]/10/50 text-[#D96C6C]" 
                          : "hover:bg-[#F7F7F7]"
                      }`}
                    >
                      <td className={`px-3 py-3 text-sm ${!personel.aktif ? "text-[#D96C6C]" : "text-[#8A8A8A]"}`}>
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
                      <td className={`px-3 py-3 text-sm font-medium ${!personel.aktif ? "text-[#D96C6C] italic" : "text-[#2F2F2F]"}`}>
                        {personel.ad} {personel.soyad}
                      </td>
                      <td className={`px-3 py-3 text-sm ${!personel.aktif ? "text-[#D96C6C] italic" : "text-[#2F2F2F]"}`}>
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
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-[#D96C6C]" : "text-[#2F2F2F]"}`}>
                        {personel.yillikIzinHakki}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-[#D96C6C]" : "text-[#2F2F2F]"}`}>
                        {personel.kullanilanYillik}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center font-semibold ${
                        !personel.aktif 
                          ? "text-[#D96C6C]" 
                          : personel.kalanYillik < 0 
                            ? "text-[#D96C6C]" 
                            : personel.kalanYillik > 0 
                              ? "text-[#8FAF9A]" 
                              : "text-[#2F2F2F]"
                      }`}>
                        {personel.kalanYillik}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-[#D96C6C]" : "text-[#2F2F2F]"}`}>
                        {personel.ucretsizIzin}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-[#D96C6C]" : "text-[#2F2F2F]"}`}>
                        {personel.raporlu}
                      </td>
                      <td className={`px-3 py-3 text-sm text-center ${!personel.aktif ? "text-[#D96C6C]" : "text-[#2F2F2F]"}`}>
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
            <div className="px-4 py-3 border-t border-[#E5E5E5] bg-[#F7F7F7]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#2F2F2F]">
                  Toplam <span className="font-semibold">{filteredPersoneller.length}</span> personel
                </span>
                <div className="flex items-center gap-6">
                  <span className="text-[#2F2F2F]">
                    Toplam Hak: <span className="font-semibold">{filteredPersoneller.reduce((sum, p) => sum + p.yillikIzinHakki, 0)}</span> gün
                  </span>
                  <span className="text-[#2F2F2F]">
                    Kullanılan: <span className="font-semibold">{filteredPersoneller.reduce((sum, p) => sum + p.kullanilanYillik, 0)}</span> gün
                  </span>
                  <span className="text-[#2F2F2F]">
                    Kalan: <span className="font-semibold text-[#8FAF9A]">{filteredPersoneller.reduce((sum, p) => sum + p.kalanYillik, 0)}</span> gün
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-6 text-xs text-[#8A8A8A]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#D96C6C]/10 border border-[#D96C6C]/30 rounded"></div>
            <span>Ayrılan personeller</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#D96C6C] font-semibold">-3</span>
            <span>Eksiye düşen izin hakkı</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#8FAF9A] font-semibold">19</span>
            <span>Kalan izin hakkı</span>
          </div>
        </div>
      </main>
    </div>
  );
}