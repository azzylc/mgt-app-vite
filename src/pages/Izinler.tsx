import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../lib/firebase";
import { collection, query, orderBy, limit, onSnapshot, deleteDoc, doc, updateDoc, increment, addDoc } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";

interface Izin {
  id: string;
  personelId: string;
  sicilNo: string;
  personelAd: string;
  personelSoyad: string;
  izinTuru: string;
  baslangic: string;
  bitis: string;
  gunSayisi?: number;
  aciklama?: string;
  olusturanYonetici?: string;
  olusturulmaTarihi: string;
  durum?: string;
  kaynak?: string;
}

export default function IzinListesi() {
  const navigate = useNavigate();
  const user = useAuth();
  const [izinler, setIzinler] = useState<Izin[]>([]);
  const [filteredIzinler, setFilteredIzinler] = useState<Izin[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTur, setFilterTur] = useState("Tümü");
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIzin, setSelectedIzin] = useState<Izin | null>(null);

  // Firebase'den izinleri çek
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "izinler"),
      orderBy("olusturulmaTarihi", "desc"),
      limit(500)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const izinData: Izin[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Haftalık izinler puantajdan yönetilir, burada gösterme
        if (data.izinTuru === "Haftalık İzin") return;
        izinData.push({ id: doc.id, ...data } as Izin);
      });
      setIzinler(izinData);
      setFilteredIzinler(izinData);
    });

    return () => unsubscribe();
  }, [user]);

  // Arama ve filtreleme
  useEffect(() => {
    let result = izinler;

    // İzin türü filtresi
    if (filterTur !== "Tümü") {
      result = result.filter((izin) => izin.izinTuru === filterTur);
    }

    // Arama filtresi
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (izin) =>
          izin.personelAd?.toLowerCase().includes(term) ||
          izin.personelSoyad?.toLowerCase().includes(term) ||
          izin.sicilNo?.toLowerCase().includes(term) ||
          izin.aciklama?.toLowerCase().includes(term)
      );
    }

    setFilteredIzinler(result);
    setCurrentPage(1);
  }, [searchTerm, filterTur, izinler]);

  // Sayfalama
  const totalPages = Math.ceil(filteredIzinler.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedIzinler = filteredIzinler.slice(startIndex, startIndex + itemsPerPage);

  // Silme işlemi
  const handleDelete = async (id: string) => {
    if (window.confirm("Bu izin kaydını silmek istediğinize emin misiniz?")) {
      try {
        // Silinecek izin verisini bul
        const silinecekIzin = izinler.find(i => i.id === id);

        // Personnel sayacını geri al
        if (silinecekIzin?.personelId && silinecekIzin?.gunSayisi && silinecekIzin.gunSayisi > 0) {
          const izinTuruField = (tur: string) => {
            if (tur === "Yıllık İzin") return "kullanilanYillik";
            if (tur === "Raporlu") return "raporlu";
            if (tur === "Mazeret ve Diğer Ücretli İzinler") return "digerIzinler";
            if (tur === "Ücretsiz İzin") return "ucretsizIzin";
            return null;
          };
          const field = izinTuruField(silinecekIzin.izinTuru);
          if (field) {
            await updateDoc(doc(db, "personnel", silinecekIzin.personelId), {
              [field]: increment(-silinecekIzin.gunSayisi),
            });
          }
        }

        // Değişiklik kaydı oluştur
        if (silinecekIzin) {
          await addDoc(collection(db, "izinDegisiklikKayitlari"), {
            degisikligiYapan: `${silinecekIzin.personelAd} ${silinecekIzin.personelSoyad}`,
            degisiklikTarihi: new Date().toISOString(),
            degisiklikTuru: "İzin Silindi",
            degisiklikOncesi: `${silinecekIzin.izinTuru} | ${silinecekIzin.baslangic} - ${silinecekIzin.bitis} | ${silinecekIzin.gunSayisi || 0} gün`,
            degisiklikSonrasi: "",
            kullaniciAdi: user?.email?.split("@")[0] || "",
          });
        }

        await deleteDoc(doc(db, "izinler", id));
      } catch (error) {
        Sentry.captureException(error);
        alert("Silme işlemi başarısız oldu.");
      }
    }
  };

  // Tarih formatla
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("tr-TR");
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return `${date.toLocaleDateString("tr-TR")} ${date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  };

  // İzin türü badge rengi
  const getIzinTuruClass = (tur: string) => {
    switch (tur) {
      case "Yıllık İzin":
        return "bg-blue-100 text-blue-800";
      case "Mazeret ve Diğer Ücretli İzinler":
        return "bg-[#EAF2ED] text-[#2F2F2F]";
      case "Raporlu":
        return "bg-[#D96C6C]/20 text-red-800";
      case "Ücretsiz İzin":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-[#F7F7F7] text-[#2F2F2F]";
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <main className="flex-1 p-4 lg:p-6 ">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#2F2F2F]">İzin Listesi</h1>
          <p className="text-sm text-[#8A8A8A]">
            Bu sayfada kullanıcılarınıza izin tanımlayabilir / ekleyebilirsiniz.
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Arama */}
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Ara... (İsim, Sicil No, Açıklama)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* İzin Türü Filtresi */}
            <select
              value={filterTur}
              onChange={(e) => setFilterTur(e.target.value)}
              className="px-3 py-2 border border-[#E5E5E5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="Tümü">Tümünde</option>
              <option value="Yıllık İzin">Yıllık İzin</option>
              <option value="Mazeret ve Diğer Ücretli İzinler">Mazeret İzni</option>
              <option value="Raporlu">Raporlu</option>
              <option value="Ücretsiz İzin">Ücretsiz İzin</option>
            </select>

            {/* Ara Butonu */}
            <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
              Ara
            </button>

            {/* Sağ Taraf Butonlar */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => navigate("/izinler/ekle")}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2"
              >
                <span>+</span>
                <span>Yeni Ekle</span>
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-[#F7F7F7] text-[#2F2F2F] rounded-lg text-sm font-medium hover:bg-[#E5E5E5] transition-colors flex items-center gap-2"
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
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Sicil No</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Kullanıcı</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">İzin Türü</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Başlangıç (Dahil)</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Bitiş (Dahil)</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Kısa Açıklama</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Oluşturan Yönetici</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[#2F2F2F]">Oluşturuldu</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[#2F2F2F]">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {paginatedIzinler.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-[#8A8A8A]">
                      {izinler.length === 0
                        ? "Henüz izin kaydı bulunmuyor."
                        : "Aramanızla eşleşen izin kaydı bulunamadı."}
                    </td>
                  </tr>
                ) : (
                  paginatedIzinler.map((izin, index) => (
                    <tr
                      key={izin.id}
                      className="border-b border-[#E5E5E5]/50 hover:bg-[#F7F7F7] transition-colors"
                    >
                      <td className="px-3 py-3 text-sm text-[#8A8A8A]">
                        {startIndex + index + 1}
                      </td>
                      <td className="px-3 py-3 text-sm text-[#2F2F2F] font-medium">
                        {izin.sicilNo || "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-[#2F2F2F]">
                        {izin.personelAd} {izin.personelSoyad}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getIzinTuruClass(izin.izinTuru)}`}>
                          {izin.izinTuru}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-[#2F2F2F]">
                        {formatDate(izin.baslangic)}
                      </td>
                      <td className="px-3 py-3 text-sm text-[#2F2F2F]">
                        {formatDate(izin.bitis)}
                      </td>
                      <td className="px-3 py-3 text-sm text-[#2F2F2F] max-w-[150px] truncate">
                        {izin.aciklama || "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-[#2F2F2F]">
                        {izin.olusturanYonetici || "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-[#8A8A8A]">
                        {formatDateTime(izin.olusturulmaTarihi)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => window.print()}
                            className="p-1.5 text-[#8A8A8A] hover:text-[#2F2F2F] hover:bg-[#F7F7F7] rounded transition-colors"
                            title="Yazdır"
                          >
                            🖨️
                          </button>
                          <button
                            onClick={() => handleDelete(izin.id)}
                            className="p-1.5 text-[#8A8A8A] hover:text-[#D96C6C] hover:bg-[#D96C6C]/10 rounded transition-colors"
                            title="Sil"
                          >
                            🗑️
                          </button>
                          <button
                            onClick={() => setSelectedIzin(izin)}
                            className="p-1.5 text-[#8A8A8A] hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Görüntüle"
                          >
                            🔍
                          </button>
                          <button
                            onClick={() => {
                              navigate(`/izinler/${izin.id}/duzenle`);
                            }}
                            className="p-1.5 text-[#8A8A8A] hover:text-[#8FAF9A] hover:bg-[#EAF2ED] rounded transition-colors"
                            title="Düzenle"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredIzinler.length > 0 && (
            <div className="px-4 py-3 border-t border-[#E5E5E5] flex items-center justify-between">
              {/* Items per page */}
              <div className="flex items-center gap-2">
                {[25, 50, 75, 100].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      setItemsPerPage(num);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 text-sm rounded ${
                      itemsPerPage === num
                        ? "bg-primary-500 text-white"
                        : "bg-[#F7F7F7] text-[#2F2F2F] hover:bg-[#E5E5E5]"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 text-sm rounded ${
                      currentPage === page
                        ? "bg-primary-500 text-white"
                        : "bg-[#F7F7F7] text-[#2F2F2F] hover:bg-[#E5E5E5]"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                {totalPages > 5 && (
                  <>
                    <span className="px-2 text-[#8A8A8A]">...</span>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      className={`px-3 py-1 text-sm rounded ${
                        currentPage === totalPages
                          ? "bg-primary-500 text-white"
                          : "bg-[#F7F7F7] text-[#2F2F2F] hover:bg-[#E5E5E5]"
                      }`}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>

              {/* Info */}
              <div className="text-sm text-[#8A8A8A]">
                Toplam {filteredIzinler.length} kayıt
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ========== DETAY MODAL ========== */}
      {selectedIzin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setSelectedIzin(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E5]">
              <h2 className="text-lg font-bold text-[#2F2F2F]">İzin Detayı</h2>
              <button
                onClick={() => setSelectedIzin(null)}
                className="p-1.5 text-[#8A8A8A] hover:text-[#2F2F2F] hover:bg-[#F7F7F7] rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4 space-y-4">
              {/* İzin Türü Badge */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#8A8A8A]">İzin Türü:</span>
                <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${getIzinTuruClass(selectedIzin.izinTuru)}`}>
                  {selectedIzin.izinTuru}
                </span>
                {selectedIzin.kaynak === "puantaj" && (
                  <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-[#F7F7F7] text-[#8A8A8A]">
                    Puantajdan
                  </span>
                )}
              </div>

              {/* Bilgi Satırları */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Personel</span>
                  <span className="text-sm font-medium text-[#2F2F2F]">{selectedIzin.personelAd} {selectedIzin.personelSoyad}</span>
                </div>
                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Sicil No</span>
                  <span className="text-sm font-medium text-[#2F2F2F]">{selectedIzin.sicilNo || "-"}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Başlangıç</span>
                  <span className="text-sm font-medium text-[#2F2F2F]">{formatDate(selectedIzin.baslangic)}</span>
                </div>
                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Bitiş</span>
                  <span className="text-sm font-medium text-[#2F2F2F]">{formatDate(selectedIzin.bitis)}</span>
                </div>
              </div>

              {selectedIzin.gunSayisi && (
                <div className="bg-blue-50 rounded-lg px-4 py-3">
                  <span className="text-xs text-blue-400 block mb-1">Toplam Gün</span>
                  <span className="text-sm font-semibold text-blue-700">{selectedIzin.gunSayisi} gün</span>
                </div>
              )}

              {selectedIzin.aciklama && (
                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Açıklama</span>
                  <span className="text-sm text-[#2F2F2F]">{selectedIzin.aciklama}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Oluşturan Yönetici</span>
                  <span className="text-sm font-medium text-[#2F2F2F]">{selectedIzin.olusturanYonetici || "-"}</span>
                </div>
                <div className="bg-[#F7F7F7] rounded-lg px-4 py-3">
                  <span className="text-xs text-[#8A8A8A] block mb-1">Oluşturulma Tarihi</span>
                  <span className="text-sm font-medium text-[#2F2F2F]">{formatDateTime(selectedIzin.olusturulmaTarihi)}</span>
                </div>
              </div>

              <div className="text-xs text-[#8A8A8A] text-right">
                Kayıt ID: {selectedIzin.id}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-[#E5E5E5] flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedIzin(null);
                  navigate(`/izinler/${selectedIzin.id}/duzenle`);
                }}
                className="px-4 py-2 bg-[#EAF2ED] text-[#2F2F2F] rounded-lg text-sm font-medium hover:bg-[#EAF2ED] transition-colors flex items-center gap-2"
              >
                <span>✏️</span>
                <span>Düzenle</span>
              </button>
              <button
                onClick={() => setSelectedIzin(null)}
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