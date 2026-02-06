import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, addDoc, Timestamp } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../../context/RoleProvider";

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  telefon?: string;
  email?: string;
  kullaniciTuru?: string;
  grupEtiketleri?: string[];
  calismaSaati?: string;
}

interface Konum {
  id: string;
  ad: string;
  karekod: string;
}

export default function TopluIslemEklePage() {
  const user = useAuth();
  const [saving, setSaving] = useState(false);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [konumlar, setKonumlar] = useState<Konum[]>([]);
  // Seçilenler
  const [seciliPersoneller, setSeciliPersoneller] = useState<Set<string>>(new Set());
  
  // Form
  const [tarih, setTarih] = useState("");
  const [seciliKonum, setSeciliKonum] = useState("");
  const [islemTipi, setIslemTipi] = useState("");
  
  // Filtre
  const [grupFiltre, setGrupFiltre] = useState("");
  const [gruplar, setGruplar] = useState<string[]>([]);

  // Varsayılan tarih
  useEffect(() => {
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    const formatted = now.toISOString().slice(0, 16);
    setTarih(formatted);
  }, []);

  // Personelleri çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .filter(doc => doc.data().aktif !== false)
        .map(doc => ({
          id: doc.id,
          ad: doc.data().ad || "",
          soyad: doc.data().soyad || "",
          sicilNo: doc.data().sicilNo || "",
          telefon: doc.data().telefon || "",
          email: doc.data().email || "",
          kullaniciTuru: doc.data().kullaniciTuru || "Personel",
          grupEtiketleri: doc.data().grupEtiketleri || [],
          calismaSaati: doc.data().calismaSaati || "her gün 9:00-18:00"
        }));
      setPersoneller(data);
      
      // Grupları çıkar
      const allGruplar = new Set<string>();
      data.forEach(p => {
        (p.grupEtiketleri || []).forEach((g: string) => allGruplar.add(g));
      });
      setGruplar(Array.from(allGruplar));
    });
    return () => unsubscribe();
  }, [user]);

  // Konumları çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "locations"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || doc.data().name || "",
        karekod: doc.data().karekod || doc.data().code || ""
      }));
      setKonumlar(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Filtrelenmiş personeller - ÖNCE grup etiketine göre filtrele
  const filtrelenmisPersoneller = grupFiltre 
    ? personeller.filter(p => (p.grupEtiketleri || []).includes(grupFiltre))
    : personeller;

  // Çalışma saatine göre grupla - FİLTRELENMİŞ personelleri grupla
  const grupluPersoneller = filtrelenmisPersoneller.reduce((acc, p) => {
    const key = p.calismaSaati || "serbest";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {} as Record<string, Personel[]>);

  // Personeli seç/bırak
  const togglePersonel = (id: string) => {
    const newSet = new Set(seciliPersoneller);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSeciliPersoneller(newSet);
  };

  // Tümünü seç (kategoriye göre) - FİLTRELENMİŞ personeller içinden
  const toggleAllInCategory = (calismaSaati: string) => {
    const categoryPersoneller = filtrelenmisPersoneller.filter(p => p.calismaSaati === calismaSaati);
    const allSelected = categoryPersoneller.every(p => seciliPersoneller.has(p.id));
    
    const newSet = new Set(seciliPersoneller);
    if (allSelected) {
      categoryPersoneller.forEach(p => newSet.delete(p.id));
    } else {
      categoryPersoneller.forEach(p => newSet.add(p.id));
    }
    setSeciliPersoneller(newSet);
  };

  // Tüm filtrelenmiş personelleri seç/bırak
  const toggleAll = () => {
    const allSelected = filtrelenmisPersoneller.every(p => seciliPersoneller.has(p.id));
    const newSet = new Set(seciliPersoneller);
    if (allSelected) {
      filtrelenmisPersoneller.forEach(p => newSet.delete(p.id));
    } else {
      filtrelenmisPersoneller.forEach(p => newSet.add(p.id));
    }
    setSeciliPersoneller(newSet);
  };

  // Kaydet
  const handleSave = async () => {
    if (seciliPersoneller.size === 0) {
      alert("Lütfen en az bir kullanıcı seçin!");
      return;
    }
    if (!seciliKonum) {
      alert("Lütfen konum seçin!");
      return;
    }
    if (!islemTipi) {
      alert("Lütfen işlem tipi seçin!");
      return;
    }
    if (!tarih) {
      alert("Lütfen tarih/saat seçin!");
      return;
    }

    setSaving(true);

    try {
      const konum = konumlar.find(k => k.id === seciliKonum);
      const tarihDate = new Date(tarih);

      for (const personelId of seciliPersoneller) {
        const personel = personeller.find(p => p.id === personelId);
        if (!personel) continue;

        // Attendance kaydı
        await addDoc(collection(db, "attendance"), {
          personelId,
          personelAd: `${personel.ad} ${personel.soyad}`.trim(),
          personelEmail: personel.email || "",
          sicilNo: personel.sicilNo || "",
          tip: islemTipi,
          tarih: Timestamp.fromDate(tarihDate),
          konumId: seciliKonum,
          konumAdi: konum?.karekod || konum?.ad,
          kayitOrtami: "Toplu Manuel",
          manuelKayit: true,
          mazeretNotu: "",
          ekleyenEmail: user.email,
          olusturmaTarihi: Timestamp.now()
        });

        // Değişiklik kaydı
        await addDoc(collection(db, "attendanceChanges"), {
          degisiklikYapan: user.email,
          degisiklikTarihi: Timestamp.now(),
          degisiklikTuru: "Kayıt Eklendi",
          oncekiDeger: "",
          sonrakiDeger: islemTipi === "giris" ? "Giriş" : "Çıkış",
          kullaniciAdi: `${personel.ad} ${personel.soyad}`.trim(),
          konum: konum?.karekod || konum?.ad,
          girisCikisTarih: Timestamp.fromDate(tarihDate)
        });
      }

      alert(`${seciliPersoneller.size} kişi için kayıt başarıyla eklendi!`);
      setSeciliPersoneller(new Set());
    } catch (error) {
      Sentry.captureException(error);
      alert("Kayıt eklenirken hata oluştu!");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <div>
        <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
          <h1 className="text-xl font-bold text-stone-800">Toplu İşlem Ekle</h1>
          <p className="text-sm text-stone-500 mt-1">Bu sayfada, seçtiğiniz kullanıcılar için topluca Giriş veya Çıkış kaydı ekleyebilirsiniz.</p>
        </header>

        <main className="p-4 md:p-6">
          {/* Grup Filtre */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Grup Etiketi</label>
                <select
                  value={grupFiltre}
                  onChange={(e) => setGrupFiltre(e.target.value)}
                  className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="">Tüm Gruplar</option>
                  {gruplar.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              
              {grupFiltre && (
                <button
                  onClick={() => setGrupFiltre("")}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-medium transition"
                >
                  Filtreyi Temizle
                </button>
              )}

              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-stone-500">
                  {filtrelenmisPersoneller.length} kişi gösteriliyor
                </span>
                <button
                  onClick={toggleAll}
                  className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-medium transition"
                >
                  {filtrelenmisPersoneller.every(p => seciliPersoneller.has(p.id)) 
                    ? "Tümünü Kaldır" 
                    : "Tümünü Seç"}
                </button>
              </div>
            </div>
          </div>

          {/* Personel Listesi */}
          {Object.entries(grupluPersoneller).map(([calismaSaati, personelList]) => (
            <div key={calismaSaati} className="mb-6">
              <h3 className="text-lg font-semibold text-stone-700 mb-3">
                {calismaSaati} 
                <span className="text-sm font-normal text-stone-500 ml-2">({personelList.length} kişi)</span>
              </h3>
              <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-stone-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={personelList.every(p => seciliPersoneller.has(p.id))}
                          onChange={() => toggleAllInCategory(calismaSaati)}
                          className="w-4 h-4 text-rose-500 rounded focus:ring-rose-500"
                        />
                        <span className="ml-2 text-xs font-medium text-stone-500">Tümü</span>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Kullanıcı Türü</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Ad Soyad</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Grup Etiketleri</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Sicil No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Telefon</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Eposta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {personelList.map(p => (
                      <tr 
                        key={p.id} 
                        className={`hover:bg-stone-50 cursor-pointer ${seciliPersoneller.has(p.id) ? 'bg-rose-50' : ''}`}
                        onClick={() => togglePersonel(p.id)}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={seciliPersoneller.has(p.id)}
                            onChange={() => {}}
                            className="w-4 h-4 text-rose-500 rounded focus:ring-rose-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-600">{p.kullaniciTuru}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center text-rose-600 font-medium text-sm">
                              {p.ad.charAt(0)}{p.soyad.charAt(0)}
                            </div>
                            <span className="font-medium text-stone-800">{p.ad} {p.soyad}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(p.grupEtiketleri || []).map(g => (
                              <span 
                                key={g} 
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  g === grupFiltre 
                                    ? 'bg-rose-100 text-rose-700' 
                                    : 'bg-green-100 text-green-700'
                                }`}
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-600">{p.sicilNo}</td>
                        <td className="px-4 py-3 text-sm text-stone-600">{p.telefon}</td>
                        <td className="px-4 py-3 text-sm text-stone-600">{p.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {filtrelenmisPersoneller.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
              <p className="text-stone-500">Bu filtreye uygun personel bulunamadı.</p>
            </div>
          )}

          {/* Alt Form */}
          <div className="bg-white rounded-lg shadow-sm border p-4 sticky bottom-0 mt-6">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs text-stone-500 mb-1">Tarih / Saat:</label>
                <input
                  type="datetime-local" min="2020-01-01T00:00" max="2099-12-31T23:59"
                  value={tarih}
                  onChange={(e) => setTarih(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-stone-500 mb-1">Konum seçiniz:</label>
                <select
                  value={seciliKonum}
                  onChange={(e) => setSeciliKonum(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="">Seçiniz</option>
                  {konumlar.map(k => (
                    <option key={k.id} value={k.id}>{k.karekod || k.ad}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-stone-500 mb-1">İşlem tipi:</label>
                <select
                  value={islemTipi}
                  onChange={(e) => setIslemTipi(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="">Seçiniz</option>
                  <option value="giris">Giriş</option>
                  <option value="cikis">Çıkış</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-stone-500 mb-1">&nbsp;</label>
                <button
                  onClick={handleSave}
                  disabled={saving || seciliPersoneller.size === 0}
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white px-6 py-2 rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>📋 Toplu Kayıt Ekle ({seciliPersoneller.size})</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}