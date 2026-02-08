import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, where, Timestamp } from "firebase/firestore";
import { useAuth } from "../../context/RoleProvider";

interface DegisiklikKaydi {
  id: string;
  degisiklikYapan: string;
  degisiklikTarihi: any;
  degisiklikTuru: string;
  oncekiDeger: string;
  sonrakiDeger: string;
  kullaniciAdi: string;
  konum: string;
  girisCikisTarih: any;
}

export default function DegisiklikKayitlariPage() {
  const user = useAuth();
  const [kayitlar, setKayitlar] = useState<DegisiklikKaydi[]>([]);
  const [filteredKayitlar, setFilteredKayitlar] = useState<DegisiklikKaydi[]>([]);
  // Filtreler
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("Tümünde");

  // Değişiklik kayıtlarını çek
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "attendanceChanges"),
      orderBy("degisiklikTarihi", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: DegisiklikKaydi[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        data.push({
          id: doc.id,
          degisiklikYapan: d.degisiklikYapan || "",
          degisiklikTarihi: d.degisiklikTarihi,
          degisiklikTuru: d.degisiklikTuru || "",
          oncekiDeger: d.oncekiDeger || "",
          sonrakiDeger: d.sonrakiDeger || "",
          kullaniciAdi: d.kullaniciAdi || "",
          konum: d.konum || "",
          girisCikisTarih: d.girisCikisTarih
        });
      });
      setKayitlar(data);
    });

    return () => unsubscribe();
  }, [user]);

  // Filtreleme
  useEffect(() => {
    let filtered = [...kayitlar];

    if (searchTerm) {
      filtered = filtered.filter(k => 
        k.degisiklikYapan.toLowerCase().includes(searchTerm.toLowerCase()) ||
        k.kullaniciAdi.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterType !== "Tümünde") {
      filtered = filtered.filter(k => k.degisiklikTuru === filterType);
    }

    setFilteredKayitlar(filtered);
  }, [kayitlar, searchTerm, filterType]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div>
        <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-stone-800">Değişiklik Kayıtları</h1>
              <p className="text-sm text-stone-500 mt-1">Bu sayfada, giriş - çıkış işlemleri üzerinde yapılan işlemlerin kayıtlarını görüntüleyebilirsiniz.</p>
            </div>
            <button
              onClick={() => window.print()}
              className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              🖨️ Yazdır
            </button>
          </div>
        </header>

        <main className="p-4 md:p-6">
          {/* Filtreler */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <input
                type="text"
                placeholder="Kullanıcı ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="Tümünde">Tümünde</option>
                <option value="Kayıt Eklendi">Kayıt Eklendi</option>
                <option value="Kayıt Silindi">Kayıt Silindi</option>
              </select>
              <button className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-medium transition">
                Ara
              </button>
            </div>
          </div>

          {/* Tablo */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Değişikliği Yapan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">↓ Değişiklik Tarihi</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Değişiklik Türü</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Değişiklik Öncesi</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Değişiklik Sonrası</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Kullanıcı Adı</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Konum</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Giriş / Çıkış Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredKayitlar.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-stone-500">
                        Değişiklik kaydı bulunamadı
                      </td>
                    </tr>
                  ) : (
                    filteredKayitlar.map((kayit, index) => {
                      const degisiklikTarihi = kayit.degisiklikTarihi?.toDate?.() ? kayit.degisiklikTarihi.toDate() : new Date();
                      const girisCikisTarihi = kayit.girisCikisTarih?.toDate?.() ? kayit.girisCikisTarih.toDate() : null;
                      
                      return (
                        <tr key={kayit.id} className="hover:bg-stone-50">
                          <td className="px-4 py-3 text-sm text-stone-600">{index + 1}</td>
                          <td className="px-4 py-3 text-sm text-stone-600">{kayit.degisiklikYapan}</td>
                          <td className="px-4 py-3 text-sm text-stone-600">
                            {degisiklikTarihi.toLocaleDateString('tr-TR')} {degisiklikTarihi.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                              kayit.degisiklikTuru === "Kayıt Eklendi" 
                                ? "bg-green-100 text-green-700" 
                                : kayit.degisiklikTuru === "Kayıt Silindi"
                                ? "bg-red-100 text-red-700"
                                : "bg-stone-100 text-stone-700"
                            }`}>
                              {kayit.degisiklikTuru}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-stone-600">{kayit.oncekiDeger || "-"}</td>
                          <td className="px-4 py-3">
                            {kayit.sonrakiDeger ? (
                              <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                                kayit.sonrakiDeger === "Giriş" 
                                  ? "bg-green-100 text-green-700" 
                                  : kayit.sonrakiDeger === "Çıkış"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-stone-100 text-stone-700"
                              }`}>
                                {kayit.sonrakiDeger}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-stone-800">{kayit.kullaniciAdi}</td>
                          <td className="px-4 py-3 text-sm text-stone-600">{kayit.konum || "-"}</td>
                          <td className="px-4 py-3 text-sm text-stone-600">
                            {girisCikisTarihi 
                              ? `${girisCikisTarihi.toLocaleDateString('tr-TR')} ${girisCikisTarihi.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                              : "-"
                            }
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}