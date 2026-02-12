import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, where, Timestamp } from "firebase/firestore";
import { useAuth } from "../../context/RoleProvider";

interface DegisiklikKaydi {
  id: string;
  degisiklikYapan: string;
  degisiklikTarihi: Timestamp | Date;
  degisiklikTuru: string;
  oncekiDeger: string;
  sonrakiDeger: string;
  kullaniciAdi: string;
  konum: string;
  girisCikisTarih: Timestamp | Date | null;
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
    <div className="min-h-screen bg-white">
      <div>
        <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#2F2F2F]">Değişiklik Kayıtları</h1>
              <p className="text-sm text-[#8A8A8A] mt-1">Bu sayfada, giriş - çıkış işlemleri üzerinde yapılan işlemlerin kayıtlarını görüntüleyebilirsiniz.</p>
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
                className="flex-1 px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="Tümünde">Tümünde</option>
                <option value="Kayıt Eklendi">Kayıt Eklendi</option>
                <option value="Kayıt Silindi">Kayıt Silindi</option>
              </select>
              <button className="bg-[#8FAF9A] hover:bg-[#7A9E86] text-white px-6 py-2 rounded-lg font-medium transition">
                Ara
              </button>
            </div>
          </div>

          {/* Tablo */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F7F7F7] border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Değişikliği Yapan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">↓ Değişiklik Tarihi</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Değişiklik Türü</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Değişiklik Öncesi</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Değişiklik Sonrası</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Kullanıcı Adı</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Konum</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Giriş / Çıkış Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {filteredKayitlar.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-[#8A8A8A]">
                        Değişiklik kaydı bulunamadı
                      </td>
                    </tr>
                  ) : (
                    filteredKayitlar.map((kayit, index) => {
                      const degisiklikTarihi = kayit.degisiklikTarihi instanceof Timestamp ? kayit.degisiklikTarihi.toDate() : new Date(kayit.degisiklikTarihi as Date);
                      const girisCikisTarihi = kayit.girisCikisTarih instanceof Timestamp ? kayit.girisCikisTarih.toDate() : (kayit.girisCikisTarih instanceof Date ? kayit.girisCikisTarih : null);
                      
                      return (
                        <tr key={kayit.id} className="hover:bg-[#F7F7F7]">
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{index + 1}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{kayit.degisiklikYapan}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">
                            {degisiklikTarihi.toLocaleDateString('tr-TR')} {degisiklikTarihi.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                              kayit.degisiklikTuru === "Kayıt Eklendi" 
                                ? "bg-[#EAF2ED] text-[#8FAF9A]" 
                                : kayit.degisiklikTuru === "Kayıt Silindi"
                                ? "bg-[#D96C6C]/20 text-[#D96C6C]"
                                : "bg-[#F7F7F7] text-[#2F2F2F]"
                            }`}>
                              {kayit.degisiklikTuru}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{kayit.oncekiDeger || "-"}</td>
                          <td className="px-4 py-3">
                            {kayit.sonrakiDeger ? (
                              <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                                kayit.sonrakiDeger === "Giriş" 
                                  ? "bg-[#EAF2ED] text-[#8FAF9A]" 
                                  : kayit.sonrakiDeger === "Çıkış"
                                  ? "bg-[#D96C6C]/20 text-[#D96C6C]"
                                  : "bg-[#F7F7F7] text-[#2F2F2F]"
                              }`}>
                                {kayit.sonrakiDeger}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-[#2F2F2F]">{kayit.kullaniciAdi}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{kayit.konum || "-"}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">
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