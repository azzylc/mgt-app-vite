import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, addDoc, increment } from "firebase/firestore";
import Sidebar from "../../components/Sidebar";

interface IzinTalebi {
  id: string;
  personelId: string;
  personelAd: string;
  personelSoyad: string;
  izinTuru: string;
  baslangic: string;
  bitis: string;
  gunSayisi: number;
  aciklama?: string;
  talepTarihi: string;
  durum: "Beklemede" | "Onaylandı" | "Reddedildi";
}

export default function IzinTalepleri() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [talepler, setTalepler] = useState<IzinTalebi[]>([]);
  const [filteredTalepler, setFilteredTalepler] = useState<IzinTalebi[]>([]);
  const [filterDurum, setFilterDurum] = useState("Tümü");

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

  // Firebase'den talepleri çek
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "izinTalepleri"),
      orderBy("talepTarihi", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const talepData: IzinTalebi[] = [];
      snapshot.forEach((doc) => {
        talepData.push({ id: doc.id, ...doc.data() } as IzinTalebi);
      });
      setTalepler(talepData);
      setFilteredTalepler(talepData);
    });

    return () => unsubscribe();
  }, [user]);

  // Filtreleme
  useEffect(() => {
    if (filterDurum === "Tümü") {
      setFilteredTalepler(talepler);
    } else {
      setFilteredTalepler(talepler.filter(t => t.durum === filterDurum));
    }
  }, [filterDurum, talepler]);

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

  // Durum badge
  const getDurumClass = (durum: string) => {
    switch (durum) {
      case "Beklemede":
        return "bg-amber-100 text-amber-800";
      case "Onaylandı":
        return "bg-green-100 text-green-800";
      case "Reddedildi":
        return "bg-red-100 text-red-800";
      default:
        return "bg-stone-100 text-stone-800";
    }
  };

  // Talebi onayla
  const handleOnayla = async (talep: IzinTalebi) => {
    if (!window.confirm(`${talep.personelAd} ${talep.personelSoyad} için ${talep.gunSayisi} günlük izin talebini onaylamak istiyor musunuz?`)) {
      return;
    }

    try {
      // Talebi güncelle
      await updateDoc(doc(db, "izinTalepleri", talep.id), {
        durum: "Onaylandı",
        onaylayanYonetici: user?.email?.split("@")[0] || "",
        onayTarihi: new Date().toISOString(),
      });

      // İzin kaydı oluştur
      await addDoc(collection(db, "izinler"), {
        personelId: talep.personelId,
        personelAd: talep.personelAd,
        personelSoyad: talep.personelSoyad,
        izinTuru: talep.izinTuru,
        baslangic: talep.baslangic,
        bitis: talep.bitis,
        gunSayisi: talep.gunSayisi,
        aciklama: talep.aciklama || "",
        olusturanYonetici: user?.email?.split("@")[0] || "",
        olusturulmaTarihi: new Date().toISOString(),
        durum: "Onaylandı",
        talepId: talep.id,
      });

      // Personelin izin kullanımını güncelle
      const personelRef = doc(db, "personnel", talep.personelId);
      if (talep.izinTuru === "Yıllık İzin") {
        await updateDoc(personelRef, {
          kullanilanYillik: increment(talep.gunSayisi),
        });
      } else if (talep.izinTuru === "Raporlu") {
        await updateDoc(personelRef, {
          raporlu: increment(talep.gunSayisi),
        });
      } else if (talep.izinTuru === "Mazeret ve Diğer Ücretli İzinler") {
        await updateDoc(personelRef, {
          digerIzinler: increment(talep.gunSayisi),
        });
      }

      alert("İzin talebi onaylandı.");
    } catch (error) {
      console.error("Onaylama hatası:", error);
      alert("İşlem başarısız oldu.");
    }
  };

  // Talebi reddet
  const handleReddet = async (talep: IzinTalebi) => {
    const sebep = window.prompt("Reddetme sebebini yazın (opsiyonel):");
    
    if (sebep === null) return; // İptal

    try {
      await updateDoc(doc(db, "izinTalepleri", talep.id), {
        durum: "Reddedildi",
        reddedenYonetici: user?.email?.split("@")[0] || "",
        redTarihi: new Date().toISOString(),
        redSebebi: sebep || "",
      });

      alert("İzin talebi reddedildi.");
    } catch (error) {
      console.error("Reddetme hatası:", error);
      alert("İşlem başarısız oldu.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-warm">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // Bekleyen talep sayısı
  const bekleyenSayisi = talepler.filter(t => t.durum === "Beklemede").length;

  return (
    <div className="flex min-h-screen bg-neutral-warm">
      <Sidebar user={user} />

      <main className="flex-1 p-4 lg:p-6 md:ml-56 pb-20 md:pb-0">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-stone-800">İzin Talepleri</h1>
            {bekleyenSayisi > 0 && (
              <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
                {bekleyenSayisi} Bekleyen
              </span>
            )}
          </div>
          <p className="text-sm text-stone-500">
            Personellerin izin taleplerini görüntüleyebilir, onaylayabilir veya reddedebilirsiniz.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-stone-100 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Durum Filtresi */}
            <select
              value={filterDurum}
              onChange={(e) => setFilterDurum(e.target.value)}
              className="px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="Tümü">Tüm Talepler</option>
              <option value="Beklemede">Beklemede</option>
              <option value="Onaylandı">Onaylananlar</option>
              <option value="Reddedildi">Reddedilenler</option>
            </select>

            {/* Özet Bilgiler */}
            <div className="ml-auto flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                Beklemede: {talepler.filter(t => t.durum === "Beklemede").length}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                Onaylanan: {talepler.filter(t => t.durum === "Onaylandı").length}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                Reddedilen: {talepler.filter(t => t.durum === "Reddedildi").length}
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
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Personel</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">İzin Türü</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Başlangıç</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Bitiş</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">Gün</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Açıklama</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-stone-600">Talep Tarihi</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">Durum</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredTalepler.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-stone-500">
                      {talepler.length === 0
                        ? "Henüz izin talebi bulunmuyor."
                        : "Filtreyle eşleşen talep bulunamadı."}
                    </td>
                  </tr>
                ) : (
                  filteredTalepler.map((talep, index) => (
                    <tr
                      key={talep.id}
                      className={`border-b border-stone-50 transition-colors ${
                        talep.durum === "Beklemede" ? "bg-amber-50/30" : ""
                      } hover:bg-stone-50/50`}
                    >
                      <td className="px-3 py-3 text-sm text-stone-500">
                        {index + 1}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium text-stone-800">
                        {talep.personelAd} {talep.personelSoyad}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">
                        {talep.izinTuru}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">
                        {formatDate(talep.baslangic)}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">
                        {formatDate(talep.bitis)}
                      </td>
                      <td className="px-3 py-3 text-sm text-center font-semibold text-stone-800">
                        {talep.gunSayisi}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600 max-w-[150px] truncate">
                        {talep.aciklama || "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-500">
                        {formatDateTime(talep.talepTarihi)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getDurumClass(talep.durum)}`}>
                          {talep.durum}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {talep.durum === "Beklemede" ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOnayla(talep)}
                              className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
                              title="Onayla"
                            >
                              ✓ Onayla
                            </button>
                            <button
                              onClick={() => handleReddet(talep)}
                              className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                              title="Reddet"
                            >
                              ✗ Reddet
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <button
                              onClick={() => {/* Detay göster */}}
                              className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Detay"
                            >
                              🔍
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}