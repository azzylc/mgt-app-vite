import { useState, useEffect } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from "firebase/firestore";

interface Attendance {
  id: string;
  personelId: string;
  personelAd: string;
  konumAdi: string;
  tip: "giris" | "cikis";
  tarih: any;
  lat?: number;
  lng?: number;
  mesafe?: number;
}

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  aktif: boolean;
}

export default function GirisCikisPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [filterTarih, setFilterTarih] = useState(new Date().toISOString().split('T')[0]);
  const [filterPersonel, setFilterPersonel] = useState("hepsi");
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        navigate("/login");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Personelleri Firebase'den çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Personel))
        .filter(p => p.aktif !== false);
      setPersoneller(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Giriş-çıkış kayıtlarını çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "attendance"), orderBy("tarih", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
      setRecords(data);
    });
    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (confirm("Bu kaydı silmek istediğinize emin misiniz?")) {
      try {
        await deleteDoc(doc(db, "attendance", id));
      } catch (error) {
        console.error("Hata:", error);
      }
    }
  };

  // Tarihe göre filtrele
  const filteredRecords = records.filter(r => {
    if (!r.tarih) return false;
    const recordDate = r.tarih.toDate ? r.tarih.toDate() : new Date(r.tarih);
    const recordDateStr = recordDate.toISOString().split('T')[0];
    const tarihMatch = recordDateStr === filterTarih;
    const personelMatch = filterPersonel === "hepsi" || r.personelId === filterPersonel;
    return tarihMatch && personelMatch;
  });

  // Personel bazında grupla (giriş-çıkış eşleştirme)
  const personelGunlukOzet = () => {
    const ozet: Record<string, { ad: string, giris?: any, cikis?: any, kayitlar: Attendance[] }> = {};
    
    filteredRecords.forEach(r => {
      if (!ozet[r.personelId]) {
        ozet[r.personelId] = { ad: r.personelAd, kayitlar: [] };
      }
      ozet[r.personelId].kayitlar.push(r);
      
      if (r.tip === "giris" && !ozet[r.personelId].giris) {
        ozet[r.personelId].giris = r;
      }
      if (r.tip === "cikis") {
        ozet[r.personelId].cikis = r;
      }
    });
    
    return ozet;
  };

  const formatSaat = (tarih: any) => {
    if (!tarih) return "-";
    const date = tarih.toDate ? tarih.toDate() : new Date(tarih);
    return date.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatTarihUzun = (tarih: any) => {
    if (!tarih) return "-";
    const date = tarih.toDate ? tarih.toDate() : new Date(tarih);
    return date.toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  };

  const hesaplaCalisma = (giris: any, cikis: any) => {
    if (!giris || !cikis) return "-";
    const girisDate = giris.toDate ? giris.toDate() : new Date(giris);
    const cikisDate = cikis.toDate ? cikis.toDate() : new Date(cikis);
    const diff = (cikisDate.getTime() - girisDate.getTime()) / (1000 * 60 * 60);
    return diff.toFixed(1) + " saat";
  };

  const ozet = personelGunlukOzet();
  const toplamKayit = filteredRecords.length;
  const girisYapanlar = Object.values(ozet).filter(o => o.giris).length;
  const cikisYapanlar = Object.values(ozet).filter(o => o.cikis).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Sidebar user={user} />
      
      <div className="pb-20 md:pb-0">
        <header className="bg-white border-b px-6 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-stone-800">🕐 Giriş-Çıkış Kayıtları</h1>
              <p className="text-sm text-stone-500">Personel mesai takibi</p>
            </div>
          </div>
        </header>

        <main className="p-6">
          {/* Filtreler */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-stone-100 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 block">📅 Tarih:</label>
                <input type="date" min="2020-01-01" max="2099-12-31" value={filterTarih} onChange={e => setFilterTarih(e.target.value)} className="w-full px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 block">👤 Personel:</label>
                <select value={filterPersonel} onChange={e => setFilterPersonel(e.target.value)} className="w-full px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white">
                  <option value="hepsi">Tüm Personel</option>
                  {personeller.map(p => (
                    <option key={p.id} value={p.id}>{p.ad} {p.soyad}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* İstatistikler */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-lg shadow-md text-white">
              <p className="text-blue-100 text-sm mb-1">Toplam Kayıt</p>
              <p className="text-3xl font-bold">{toplamKayit}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 p-5 rounded-lg shadow-md text-white">
              <p className="text-green-100 text-sm mb-1">Giriş Yapan</p>
              <p className="text-3xl font-bold">{girisYapanlar}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-5 rounded-lg shadow-md text-white">
              <p className="text-orange-100 text-sm mb-1">Çıkış Yapan</p>
              <p className="text-3xl font-bold">{cikisYapanlar}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-5 rounded-lg shadow-md text-white">
              <p className="text-purple-100 text-sm mb-1">Aktif Personel</p>
              <p className="text-3xl font-bold">{personeller.length}</p>
            </div>
          </div>

          {/* Personel Özet Kartları */}
          {Object.keys(ozet).length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center text-stone-500 border border-stone-100">
              <span className="text-5xl mb-4 block">🕐</span>
              <p className="text-lg font-medium">Bu tarihte kayıt bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(ozet).map(([personelId, data]) => (
                <div key={personelId} className="bg-white rounded-lg shadow-sm border border-stone-100 p-5">
                  <div className="flex items-center justify-between">
                    {/* Sol: Personel bilgisi */}
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center">
                        <span className="text-rose-600 font-bold text-lg">{data.ad?.charAt(0)}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-stone-800">{data.ad}</h3>
                        <p className="text-sm text-stone-500">{data.kayitlar.length} kayıt</p>
                      </div>
                    </div>

                    {/* Orta: Giriş-Çıkış */}
                    <div className="flex items-center gap-8">
                      <div className="text-center">
                        <p className="text-xs text-stone-500 mb-1">Giriş</p>
                        {data.giris ? (
                          <p className="text-lg font-bold text-green-600">{formatSaat(data.giris.tarih)}</p>
                        ) : (
                          <p className="text-lg text-stone-300">-</p>
                        )}
                      </div>
                      <div className="text-2xl text-stone-300">→</div>
                      <div className="text-center">
                        <p className="text-xs text-stone-500 mb-1">Çıkış</p>
                        {data.cikis ? (
                          <p className="text-lg font-bold text-orange-600">{formatSaat(data.cikis.tarih)}</p>
                        ) : (
                          <p className="text-lg text-stone-300">-</p>
                        )}
                      </div>
                    </div>

                    {/* Sağ: Toplam süre ve konum */}
                    <div className="text-right">
                      <p className="text-sm text-stone-500">Çalışma Süresi</p>
                      <p className="text-lg font-bold text-purple-600">{hesaplaCalisma(data.giris?.tarih, data.cikis?.tarih)}</p>
                      {data.giris?.konumAdi && (
                        <p className="text-xs text-stone-400 mt-1">📍 {data.giris.konumAdi}</p>
                      )}
                    </div>
                  </div>

                  {/* Detay Kayıtlar */}
                  {data.kayitlar.length > 2 && (
                    <div className="mt-4 pt-4 border-t border-stone-100">
                      <p className="text-xs text-stone-500 mb-2">Tüm Kayıtlar:</p>
                      <div className="flex flex-wrap gap-2">
                        {data.kayitlar.map((k, i) => (
                          <span key={i} className={`px-3 py-1 text-xs rounded-full ${k.tip === 'giris' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                            {k.tip === 'giris' ? '✓' : '→'} {formatSaat(k.tarih)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tüm Kayıtlar Tablosu */}
          {filteredRecords.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-bold text-stone-800 mb-4">📋 Detaylı Kayıtlar</h2>
              <div className="bg-white rounded-lg shadow-sm border border-stone-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-stone-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Personel</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">İşlem</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Saat</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Konum</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Mesafe</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {filteredRecords.map(record => (
                        <tr key={record.id} className="hover:bg-stone-50 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center">
                                <span className="text-rose-600 font-semibold text-sm">{record.personelAd?.charAt(0)}</span>
                              </div>
                              <span className="text-sm font-medium text-stone-900">{record.personelAd}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 text-xs rounded-full ${record.tip === 'giris' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                              {record.tip === 'giris' ? '✓ Giriş' : '→ Çıkış'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-stone-900">{formatSaat(record.tarih)}</td>
                          <td className="px-6 py-4 text-sm text-stone-600">{record.konumAdi || '-'}</td>
                          <td className="px-6 py-4 text-sm text-stone-600">{record.mesafe ? `${record.mesafe}m` : '-'}</td>
                          <td className="px-6 py-4">
                            <button onClick={() => handleDelete(record.id)} className="text-red-600 hover:text-red-800 text-lg">🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}