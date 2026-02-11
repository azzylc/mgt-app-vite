import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { useAuth } from "../../context/RoleProvider";

interface DegisiklikKaydi {
  id: string;
  degisikligiYapan: string;
  degisiklikTarihi: string;
  degisiklikTuru: "İzin Eklendi" | "İzin Düzenlendi" | "İzin Silindi";
  degisiklikOncesi?: string;
  degisiklikSonrasi: string;
  kullaniciAdi: string;
}

export default function IzinDegisiklikKayitlari() {
  const user = useAuth();
  const [kayitlar, setKayitlar] = useState<DegisiklikKaydi[]>([]);
  const [filteredKayitlar, setFilteredKayitlar] = useState<DegisiklikKaydi[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTur, setFilterTur] = useState("Tümü");
  const [selectedKayit, setSelectedKayit] = useState<DegisiklikKaydi | null>(null);

  // Firebase'den kayıtları çek
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "izinDegisiklikKayitlari"),
      orderBy("degisiklikTarihi", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const kayitData: DegisiklikKaydi[] = [];
      snapshot.forEach((doc) => {
        kayitData.push({ id: doc.id, ...doc.data() } as DegisiklikKaydi);
      });
      setKayitlar(kayitData);
      setFilteredKayitlar(kayitData);
    });

    return () => unsubscribe();
  }, [user]);

  // Arama ve filtreleme
  useEffect(() => {
    let result = kayitlar;

    // Değişiklik türü filtresi
    if (filterTur !== "Tümü") {
      result = result.filter((kayit) => kayit.degisiklikTuru === filterTur);
    }

    // Arama filtresi
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (kayit) =>
          kayit.degisikligiYapan?.toLowerCase().includes(term) ||
          kayit.kullaniciAdi?.toLowerCase().includes(term) ||
          kayit.degisiklikOncesi?.toLowerCase().includes(term) ||
          kayit.degisiklikSonrasi?.toLowerCase().includes(term)
      );
    }

    setFilteredKayitlar(result);
  }, [searchTerm, filterTur, kayitlar]);

  // Tarih formatla
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return `${date.toLocaleDateString("tr-TR")}\n${date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  };

  // Tarih formatla (modal için tek satır)
  const formatDateTimeSingle = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return `${date.toLocaleDateString("tr-TR")} ${date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  };

  // Satır rengi
  const getRowClass = (tur: string) => {
    switch (tur) {
      case "İzin Eklendi":
        return "bg-[#EAF2ED]/70 hover:bg-[#EAF2ED]/70";
      case "İzin Düzenlendi":
        return "bg-[#EAF2ED]/70 hover:bg-[#EAF2ED]/70";
      case "İzin Silindi":
        return "bg-[#D96C6C]/10/70 hover:bg-[#D96C6C]/20/70";
      default:
        return "hover:bg-[#F7F7F7]";
    }
  };

  // Text rengi
  const getTextClass = (tur: string) => {
    switch (tur) {
      case "İzin Eklendi":
        return "text-[#8FAF9A]";
      case "İzin Düzenlendi":
        return "text-[#2F2F2F]";
      case "İzin Silindi":
        return "text-[#D96C6C]";
      default:
        return "text-[#2F2F2F]";
    }
  };

  // Badge rengi (modal için)
  const getBadgeClass = (tur: string) => {
    switch (tur) {
      case "İzin Eklendi":
        return "bg-[#EAF2ED] text-green-800 border-green-200";
      case "İzin Düzenlendi":
        return "bg-[#EAF2ED] text-[#2F2F2F] border-[#8FAF9A]/30";
      case "İzin Silindi":
        return "bg-[#D96C6C]/20 text-red-800 border-[#D96C6C]/30";
      default:
        return "bg-[#F7F7F7] text-[#2F2F2F] border-[#E5E5E5]";
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <main className="flex-1 p-4 lg:p-6 ">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#2F2F2F]">İzin Değişiklik Kayıtları</h1>
          <p className="text-sm text-[#8A8A8A]">
            Bu sayfada, izin işlemleri üzerinde yapılan işlemlerin kayıtlarını görüntüleyebilirsiniz.
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Arama */}
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* Değişiklik Türü Filtresi */}
            <select
              value={filterTur}
              onChange={(e) => setFilterTur(e.target.value)}
              className="px-3 py-2 border border-[#E5E5E5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="Tümü">Tümünde</option>
              <option value="İzin Eklendi">İzin Eklendi</option>
              <option value="İzin Düzenlendi">İzin Düzenlendi</option>
              <option value="İzin Silindi">İzin Silindi</option>
            </select>

            {/* Ara Butonu */}
            <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
              Ara
            </button>

            {/* Yazdır Butonu */}
            <div className="ml-auto">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2"
              >
                <span>🖨️</span>
                <span>Yazdır</span>
              </button>
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
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Değişikliği Yapan</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">↓ Değişiklik Tarihi</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Değişiklik Türü</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Değişiklik Öncesi</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Değişiklik Sonrası</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Kullanıcı Adı</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[#2F2F2F]"></th>
                </tr>
              </thead>
              <tbody>
                {filteredKayitlar.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-[#8A8A8A]">
                      {kayitlar.length === 0
                        ? "Henüz değişiklik kaydı bulunmuyor."
                        : "Aramanızla eşleşen kayıt bulunamadı."}
                    </td>
                  </tr>
                ) : (
                  filteredKayitlar.map((kayit, index) => (
                    <tr
                      key={kayit.id}
                      className={`border-b border-[#E5E5E5]/50 transition-colors ${getRowClass(kayit.degisiklikTuru)}`}
                    >
                      <td className="px-3 py-3 text-sm text-[#8A8A8A]">
                        {index + 1}
                      </td>
                      <td className={`px-3 py-3 text-sm font-medium ${getTextClass(kayit.degisiklikTuru)}`}>
                        {kayit.degisikligiYapan}
                      </td>
                      <td className={`px-3 py-3 text-sm whitespace-pre-line ${getTextClass(kayit.degisiklikTuru)}`}>
                        {formatDateTime(kayit.degisiklikTarihi)}
                      </td>
                      <td className={`px-3 py-3 text-sm ${getTextClass(kayit.degisiklikTuru)}`}>
                        {kayit.degisiklikTuru}
                      </td>
                      <td className={`px-3 py-3 text-sm max-w-[200px] ${getTextClass(kayit.degisiklikTuru)}`}>
                        {kayit.degisiklikOncesi || "-"}
                      </td>
                      <td className={`px-3 py-3 text-sm max-w-[250px] ${getTextClass(kayit.degisiklikTuru)}`}>
                        {kayit.degisiklikSonrasi}
                      </td>
                      <td className={`px-3 py-3 text-sm ${getTextClass(kayit.degisiklikTuru)}`}>
                        {kayit.kullaniciAdi}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setSelectedKayit(kayit)}
                          className="p-1.5 text-[#8A8A8A] hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Görüntüle"
                        >
                          🔍
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {filteredKayitlar.length > 0 && (
            <div className="px-4 py-3 border-t border-[#E5E5E5] bg-[#F7F7F7]">
              <div className="flex items-center justify-between text-sm text-[#2F2F2F]">
                <span>Toplam <span className="font-semibold">{filteredKayitlar.length}</span> kayıt</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-200 rounded"></span>
                    Eklenen: {filteredKayitlar.filter(k => k.degisiklikTuru === "İzin Eklendi").length}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-[#EAF2ED] rounded"></span>
                    Düzenlenen: {filteredKayitlar.filter(k => k.degisiklikTuru === "İzin Düzenlendi").length}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-200 rounded"></span>
                    Silinen: {filteredKayitlar.filter(k => k.degisiklikTuru === "İzin Silindi").length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-6 text-xs text-[#8A8A8A]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#EAF2ED] border border-green-300 rounded"></div>
            <span>İzin Eklendi</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#EAF2ED] border border-[#8FAF9A] rounded"></div>
            <span>İzin Düzenlendi</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#D96C6C]/20 border border-[#D96C6C] rounded"></div>
            <span>İzin Silindi</span>
          </div>
        </div>
      </main>

      {/* ========== DETAY MODAL ========== */}
      {selectedKayit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setSelectedKayit(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E5]">
              <h2 className="text-lg font-bold text-[#2F2F2F]">Değişiklik Detayı</h2>
              <button
                onClick={() => setSelectedKayit(null)}
                className="p-1.5 text-[#8A8A8A] hover:text-[#2F2F2F] hover:bg-[#F7F7F7] rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Değişiklik Türü Badge */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#8A8A8A]">Değişiklik Türü:</span>
                <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full border ${getBadgeClass(selectedKayit.degisiklikTuru)}`}>
                  {selectedKayit.degisiklikTuru}
                </span>
              </div>

              {/* Bilgi Satırları */}
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Kullanıcı Adı</span>
                  <span className="text-sm font-medium text-[#2F2F2F]">{selectedKayit.kullaniciAdi || "-"}</span>
                </div>

                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Değişikliği Yapan</span>
                  <span className="text-sm font-medium text-[#2F2F2F]">{selectedKayit.degisikligiYapan || "-"}</span>
                </div>

                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Değişiklik Tarihi</span>
                  <span className="text-sm font-medium text-[#2F2F2F]">{formatDateTimeSingle(selectedKayit.degisiklikTarihi)}</span>
                </div>
              </div>

              {/* Öncesi / Sonrası Karşılaştırma */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#D96C6C]/10 border border-[#D96C6C]/20 rounded-lg px-4 py-3">
                  <span className="text-xs text-[#D96C6C] block mb-1">Değişiklik Öncesi</span>
                  <span className="text-sm text-[#D96C6C] whitespace-pre-wrap">
                    {selectedKayit.degisiklikOncesi || "-"}
                  </span>
                </div>
                <div className="bg-[#EAF2ED] border border-green-100 rounded-lg px-4 py-3">
                  <span className="text-xs text-green-400 block mb-1">Değişiklik Sonrası</span>
                  <span className="text-sm text-[#8FAF9A] whitespace-pre-wrap">
                    {selectedKayit.degisiklikSonrasi || "-"}
                  </span>
                </div>
              </div>

              {/* Kayıt ID */}
              <div className="text-xs text-[#8A8A8A] text-right">
                Kayıt ID: {selectedKayit.id}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-[#E5E5E5] flex justify-end">
              <button
                onClick={() => setSelectedKayit(null)}
                className="px-4 py-2 bg-[#F7F7F7] text-[#2F2F2F] rounded-lg text-sm font-medium hover:bg-[#E5E5E5] transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
