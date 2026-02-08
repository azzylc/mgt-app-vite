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
        return "bg-green-50/70 hover:bg-green-100/70";
      case "İzin Düzenlendi":
        return "bg-amber-50/70 hover:bg-amber-100/70";
      case "İzin Silindi":
        return "bg-red-50/70 hover:bg-red-100/70";
      default:
        return "hover:bg-stone-50";
    }
  };

  // Text rengi
  const getTextClass = (tur: string) => {
    switch (tur) {
      case "İzin Eklendi":
        return "text-green-700";
      case "İzin Düzenlendi":
        return "text-amber-700";
      case "İzin Silindi":
        return "text-red-700";
      default:
        return "text-stone-700";
    }
  };

  // Badge rengi (modal için)
  const getBadgeClass = (tur: string) => {
    switch (tur) {
      case "İzin Eklendi":
        return "bg-green-100 text-green-800 border-green-200";
      case "İzin Düzenlendi":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "İzin Silindi":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-stone-100 text-stone-800 border-stone-200";
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <main className="flex-1 p-4 lg:p-6 ">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-stone-800">İzin Değişiklik Kayıtları</h1>
          <p className="text-sm text-stone-500">
            Bu sayfada, izin işlemleri üzerinde yapılan işlemlerin kayıtlarını görüntüleyebilirsiniz.
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-stone-100 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Arama */}
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* Değişiklik Türü Filtresi */}
            <select
              value={filterTur}
              onChange={(e) => setFilterTur(e.target.value)}
              className="px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
        <div className="bg-white rounded-lg shadow-sm border border-stone-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Değişikliği Yapan</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">↓ Değişiklik Tarihi</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Değişiklik Türü</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Değişiklik Öncesi</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Değişiklik Sonrası</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Kullanıcı Adı</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600"></th>
                </tr>
              </thead>
              <tbody>
                {filteredKayitlar.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-stone-500">
                      {kayitlar.length === 0
                        ? "Henüz değişiklik kaydı bulunmuyor."
                        : "Aramanızla eşleşen kayıt bulunamadı."}
                    </td>
                  </tr>
                ) : (
                  filteredKayitlar.map((kayit, index) => (
                    <tr
                      key={kayit.id}
                      className={`border-b border-stone-50 transition-colors ${getRowClass(kayit.degisiklikTuru)}`}
                    >
                      <td className="px-3 py-3 text-sm text-stone-500">
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
                          className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
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
            <div className="px-4 py-3 border-t border-stone-100 bg-stone-50">
              <div className="flex items-center justify-between text-sm text-stone-600">
                <span>Toplam <span className="font-semibold">{filteredKayitlar.length}</span> kayıt</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-200 rounded"></span>
                    Eklenen: {filteredKayitlar.filter(k => k.degisiklikTuru === "İzin Eklendi").length}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-amber-200 rounded"></span>
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
        <div className="mt-4 flex items-center gap-6 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span>İzin Eklendi</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-100 border border-amber-300 rounded"></div>
            <span>İzin Düzenlendi</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h2 className="text-lg font-bold text-stone-800">Değişiklik Detayı</h2>
              <button
                onClick={() => setSelectedKayit(null)}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Değişiklik Türü Badge */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-stone-500">Değişiklik Türü:</span>
                <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full border ${getBadgeClass(selectedKayit.degisiklikTuru)}`}>
                  {selectedKayit.degisiklikTuru}
                </span>
              </div>

              {/* Bilgi Satırları */}
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-stone-50 rounded-lg px-4 py-3">
                  <span className="text-xs text-stone-400 block mb-1">Kullanıcı Adı</span>
                  <span className="text-sm font-medium text-stone-800">{selectedKayit.kullaniciAdi || "-"}</span>
                </div>

                <div className="bg-stone-50 rounded-lg px-4 py-3">
                  <span className="text-xs text-stone-400 block mb-1">Değişikliği Yapan</span>
                  <span className="text-sm font-medium text-stone-800">{selectedKayit.degisikligiYapan || "-"}</span>
                </div>

                <div className="bg-stone-50 rounded-lg px-4 py-3">
                  <span className="text-xs text-stone-400 block mb-1">Değişiklik Tarihi</span>
                  <span className="text-sm font-medium text-stone-800">{formatDateTimeSingle(selectedKayit.degisiklikTarihi)}</span>
                </div>
              </div>

              {/* Öncesi / Sonrası Karşılaştırma */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                  <span className="text-xs text-red-400 block mb-1">Değişiklik Öncesi</span>
                  <span className="text-sm text-red-700 whitespace-pre-wrap">
                    {selectedKayit.degisiklikOncesi || "-"}
                  </span>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3">
                  <span className="text-xs text-green-400 block mb-1">Değişiklik Sonrası</span>
                  <span className="text-sm text-green-700 whitespace-pre-wrap">
                    {selectedKayit.degisiklikSonrasi || "-"}
                  </span>
                </div>
              </div>

              {/* Kayıt ID */}
              <div className="text-xs text-stone-300 text-right">
                Kayıt ID: {selectedKayit.id}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-stone-100 flex justify-end">
              <button
                onClick={() => setSelectedKayit(null)}
                className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-200 transition-colors"
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
