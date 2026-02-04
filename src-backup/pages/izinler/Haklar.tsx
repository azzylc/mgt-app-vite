import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc, increment } from "firebase/firestore";
import Sidebar from "../../components/Sidebar";

interface IzinHakKaydi {
  id: string;
  personelId: string;
  personelAd: string;
  personelSoyad: string;
  iseBaslama?: string;
  eklenenGun: number;
  aciklama: string;
  islemTarihi: string;
  islemYapan: string;
}

export default function IzinHaklariListele() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [kayitlar, setKayitlar] = useState<IzinHakKaydi[]>([]);
  const [filteredKayitlar, setFilteredKayitlar] = useState<IzinHakKaydi[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [personelMap, setPersonelMap] = useState<Record<string, string>>({});

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
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const personelQuery = query(collection(db, "personnel"));
    const unsubscribePersonel = onSnapshot(personelQuery, (snapshot) => {
      const pMap: Record<string, string> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        pMap[doc.id] = data.iseBaslama || "";
      });
      setPersonelMap(pMap);
    });

    const q = query(
      collection(db, "izinHakDegisiklikleri"),
      orderBy("islemTarihi", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const kayitData: IzinHakKaydi[] = [];
      snapshot.forEach((doc) => {
        kayitData.push({ id: doc.id, ...doc.data() } as IzinHakKaydi);
      });
      setKayitlar(kayitData);
      setFilteredKayitlar(kayitData);
    });

    return () => {
      unsubscribePersonel();
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!searchTerm) {
      setFilteredKayitlar(kayitlar);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredKayitlar(
        kayitlar.filter(
          (kayit) =>
            kayit.personelAd?.toLowerCase().includes(term) ||
            kayit.personelSoyad?.toLowerCase().includes(term) ||
            kayit.aciklama?.toLowerCase().includes(term) ||
            kayit.islemYapan?.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, kayitlar]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("tr-TR");
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("tr-TR") + " " + date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  const handleDelete = async (kayit: IzinHakKaydi) => {
    if (!window.confirm(kayit.personelAd + " " + kayit.personelSoyad + " için eklenen " + kayit.eklenenGun + " günlük izin hakkı kaydını silmek istiyor musunuz?\n\nBu işlem personelin toplam izin hakkından " + kayit.eklenenGun + " gün düşecektir.")) {
      return;
    }

    try {
      if (kayit.personelId) {
        const personelRef = doc(db, "personnel", kayit.personelId);
        await updateDoc(personelRef, {
          yillikIzinHakki: increment(-kayit.eklenenGun)
        });
      }
      
      await deleteDoc(doc(db, "izinHakDegisiklikleri", kayit.id));
      alert("Kayıt silindi ve personelin izin hakkından düşüldü.");
    } catch (error) {
      console.error("Silme hatası:", error);
      alert("Silme işlemi başarısız oldu.");
    }
  };

  const toplamEklenenGun = filteredKayitlar.reduce((sum, k) => sum + k.eklenenGun, 0);

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
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-800">İzin Haklarını Listele</h1>
            <p className="text-sm text-stone-500">
              Personellere tanımlanan izin hakkı kayıtlarını görüntüleyebilirsiniz.
            </p>
          </div>

          <button
            onClick={() => navigate("/izinler/hakki-ekle")}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2"
          >
            <span>+</span>
            <span>Yeni İzin Hakkı Ekle</span>
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-stone-100 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Ara... (İsim, Açıklama, İşlem Yapan)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
              Ara
            </button>

            <div className="ml-auto">
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

        <div className="bg-white rounded-lg shadow-sm border border-stone-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Personel</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">İşe Giriş Tarihi</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">Eklenen Gün</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Açıklama</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">İşlem Tarihi</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">İşlem Yapan</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredKayitlar.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-stone-500">
                      {kayitlar.length === 0
                        ? "Henüz izin hakkı kaydı bulunmuyor."
                        : "Aramanızla eşleşen kayıt bulunamadı."}
                    </td>
                  </tr>
                ) : (
                  filteredKayitlar.map((kayit, index) => (
                    <tr
                      key={kayit.id}
                      className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors"
                    >
                      <td className="px-3 py-3 text-sm text-stone-500">
                        {index + 1}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium text-stone-800">
                        {kayit.personelAd} {kayit.personelSoyad}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">
                        {formatDate(personelMap[kayit.personelId] || "")}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded">
                          +{kayit.eklenenGun} gün
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">
                        {kayit.aciklama}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-500">
                        {formatDateTime(kayit.islemTarihi)}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">
                        {kayit.islemYapan}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => navigate("/izinler/hakki-duzenle/" + kayit.id)}
                            className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                            title="Düzenle"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(kayit)}
                            className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Sil"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredKayitlar.length > 0 && (
            <div className="px-4 py-3 border-t border-stone-100 bg-stone-50">
              <div className="flex items-center justify-between text-sm text-stone-600">
                <span>Toplam <span className="font-semibold">{filteredKayitlar.length}</span> kayıt</span>
                <span>
                  Toplam Eklenen: <span className="font-semibold text-green-600">+{toplamEklenenGun} gün</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}