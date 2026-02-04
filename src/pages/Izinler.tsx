import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, limit, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import Sidebar from "../components/Sidebar";

interface Izin {
  id: string;
  sicilNo: string;
  personelAd: string;
  personelSoyad: string;
  izinTuru: string;
  baslangic: string;
  bitis: string;
  aciklama?: string;
  olusturanYonetici?: string;
  olusturulmaTarihi: string;
}

export default function IzinListesi() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [izinler, setIzinler] = useState<Izin[]>([]);
  const [filteredIzinler, setFilteredIzinler] = useState<Izin[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTur, setFilterTur] = useState("Tümü");
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

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

  // Firebase'den izinleri çek
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "izinler"),
      orderBy("olusturulmaTarihi", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const izinData: Izin[] = [];
      snapshot.forEach((doc) => {
        izinData.push({ id: doc.id, ...doc.data() } as Izin);
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
        await deleteDoc(doc(db, "izinler", id));
      } catch (error) {
        console.error("Silme hatası:", error);
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
        return "bg-amber-100 text-amber-800";
      case "Raporlu":
        return "bg-red-100 text-red-800";
      default:
        return "bg-stone-100 text-stone-800";
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

      <main className="flex-1 p-4 lg:p-6 pb-20 md:pb-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-stone-800">İzin Listesi</h1>
          <p className="text-sm text-stone-500">
            Bu sayfada kullanıcılarınıza izin tanımlayabilir / ekleyebilirsiniz.
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-stone-100 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Arama */}
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Ara... (İsim, Sicil No, Açıklama)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* İzin Türü Filtresi */}
            <select
              value={filterTur}
              onChange={(e) => setFilterTur(e.target.value)}
              className="px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="Tümü">Tümünde</option>
              <option value="Yıllık İzin">Yıllık İzin</option>
              <option value="Mazeret ve Diğer Ücretli İzinler">Mazeret İzni</option>
              <option value="Raporlu">Raporlu</option>
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
                className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-200 transition-colors flex items-center gap-2"
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
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Sicil No</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Kullanıcı</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">İzin Türü</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Başlangıç (Dahil)</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Bitiş (Dahil)</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Kısa Açıklama</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Oluşturan Yönetici</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Oluşturuldu</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {paginatedIzinler.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-stone-500">
                      {izinler.length === 0
                        ? "Henüz izin kaydı bulunmuyor."
                        : "Aramanızla eşleşen izin kaydı bulunamadı."}
                    </td>
                  </tr>
                ) : (
                  paginatedIzinler.map((izin, index) => (
                    <tr
                      key={izin.id}
                      className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors"
                    >
                      <td className="px-3 py-3 text-sm text-stone-500">
                        {startIndex + index + 1}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-800 font-medium">
                        {izin.sicilNo || "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-800">
                        {izin.personelAd} {izin.personelSoyad}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getIzinTuruClass(izin.izinTuru)}`}>
                          {izin.izinTuru}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">
                        {formatDate(izin.baslangic)}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">
                        {formatDate(izin.bitis)}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600 max-w-[150px] truncate">
                        {izin.aciklama || "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">
                        {izin.olusturanYonetici || "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-500">
                        {formatDateTime(izin.olusturulmaTarihi)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => window.print()}
                            className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded transition-colors"
                            title="Yazdır"
                          >
                            🖨️
                          </button>
                          <button
                            onClick={() => handleDelete(izin.id)}
                            className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Sil"
                          >
                            🗑️
                          </button>
                          <button
                            onClick={() => navigate(`/izinler/${izin.id}`)}
                            className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Görüntüle"
                          >
                            🔍
                          </button>
                          <button
                            onClick={() => navigate(`/izinler/${izin.id}/duzenle`)}
                            className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
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
            <div className="px-4 py-3 border-t border-stone-100 flex items-center justify-between">
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
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
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
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                {totalPages > 5 && (
                  <>
                    <span className="px-2 text-stone-400">...</span>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      className={`px-3 py-1 text-sm rounded ${
                        currentPage === totalPages
                          ? "bg-primary-500 text-white"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>

              {/* Info */}
              <div className="text-sm text-stone-500">
                Toplam {filteredIzinler.length} kayıt
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}