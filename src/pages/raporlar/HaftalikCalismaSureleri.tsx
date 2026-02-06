import { useState, useEffect } from "react";
import { auth, db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, where, Timestamp, getDocs } from "firebase/firestore";
import { resmiTatiller } from "../../lib/data";
import { izinMapOlustur } from "../../lib/izinHelper";

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  aktif: boolean;
  kullaniciTuru?: string;
}

interface GunData {
  tarih: string;
  girisSaati: string;
  durum: "calisma" | "tatil" | "izin" | "eksik" | "fazla" | "bos" | "resmiTatil";
  calismaDakika: number;
}

interface PersonelHaftalik {
  personelId: string;
  personelAd: string;
  sicilNo: string;
  gunler: GunData[];
  toplamSaat: string;
  geldigiGun: number;
  fazlaCalisma: string;
}

export default function HaftalikCalismaSureleriPage() {
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [haftalikData, setHaftalikData] = useState<PersonelHaftalik[]>([]);
  const [haftalar, setHaftalar] = useState<{ value: string; label: string; year?: number; isYearHeader?: boolean }[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Filtreler
  const [seciliHafta, setSeciliHafta] = useState("");
  const [gunlukCalismaSuresi, setGunlukCalismaSuresi] = useState(9);
  const [molaSuresi, setMolaSuresi] = useState(90);
  const [gecKalmaToleransi, setGecKalmaToleransi] = useState(10);
  const [erkenCikisToleransi, setErkenCikisToleransi] = useState(5);
  const [haftalikCalismaSaati, setHaftalikCalismaSaati] = useState(45);
  const [showYoneticiler, setShowYoneticiler] = useState(false);

  // Hafta numarası hesapla
  const getWeekNumber = (date: Date): number => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };

  // Haftaları oluştur (patrondaki gibi)
  useEffect(() => {
    const weeks: { value: string; label: string; year?: number; isYearHeader?: boolean }[] = [];
    const today = new Date();
    
    // Son 52 hafta (1 yıl)
    for (let i = 51; i >= 0; i--) {  // TERS SIRALAMA: geçmişten bugüne
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1 - (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const weekNum = getWeekNumber(weekStart);
      const year = weekStart.getFullYear();
      const startStr = weekStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      const endStr = weekEnd.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      
      // Yıl değiştiyse başlık ekle
      if (weeks.length === 0 || weeks[weeks.length - 1].year !== year) {
        weeks.push({
          value: `year-${year}`,
          label: `${year} yılı`,
          year: year,
          isYearHeader: true
        });
      }
      
      weeks.push({
        value: weekStart.toISOString().split('T')[0],
        label: `${String(weekNum).padStart(2, '0')}. Hafta (${startStr} - ${endStr})`,
        year: year
      });
    }
    
    setHaftalar(weeks);
    // Bu haftayı seç (en son eklenen, yıl başlığı olmayanlar arasında)
    const thisWeek = weeks.filter(w => !w.isYearHeader).pop();
    if (thisWeek) setSeciliHafta(thisWeek.value);
  }, []);

  // Personelleri çek
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, "personnel"), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || "",
        soyad: doc.data().soyad || "",
        sicilNo: doc.data().sicilNo || "",
        aktif: doc.data().aktif !== false,
        kullaniciTuru: doc.data().kullaniciTuru || ""
      }));
      setPersoneller(data.filter(p => p.aktif));
    });
    return () => unsubscribe();
  }, []);

  // Resmi tatil kontrolü
  const isResmiTatil = (tarih: string): boolean => {
    for (const tatil of resmiTatiller) {
      const tatilTarih = new Date(tatil.tarih);
      for (let i = 0; i < tatil.sure; i++) {
        const gun = new Date(tatilTarih);
        gun.setDate(tatilTarih.getDate() + i);
        if (gun.toISOString().split('T')[0] === tarih) return true;
      }
    }
    return false;
  };

  // Hafta tatili kontrolü
  const isHaftaTatili = (tarih: string): boolean => {
    const gun = new Date(tarih).getDay();
    return gun === 0 || gun === 6;
  };

  // Verileri getir
  const fetchData = async () => {
    if (!auth.currentUser || !seciliHafta) return;
    setDataLoading(true);

    const haftaBaslangic = new Date(seciliHafta);
    haftaBaslangic.setHours(0, 0, 0, 0);
    const haftaBitis = new Date(haftaBaslangic);
    haftaBitis.setDate(haftaBaslangic.getDate() + 6);
    haftaBitis.setHours(23, 59, 59, 999);

    // Attendance kayıtlarını çek
    const attendanceQuery = query(
      collection(db, "attendance"),
      where("tarih", ">=", Timestamp.fromDate(haftaBaslangic)),
      where("tarih", "<=", Timestamp.fromDate(haftaBitis)),
      orderBy("tarih", "asc")
    );

    const attendanceSnap = await getDocs(attendanceQuery);
    
    // Kayıtları grupla
    const kayitlar = new Map<string, any[]>();
    attendanceSnap.forEach(doc => {
      const d = doc.data();
      const tarih = d.tarih?.toDate?.();
      if (!tarih) return;
      
      const gunStr = tarih.toISOString().split('T')[0];
      const key = `${d.personelId}-${gunStr}`;
      
      if (!kayitlar.has(key)) kayitlar.set(key, []);
      kayitlar.get(key)!.push({ ...d, tarihDate: tarih });
    });

    // İzinleri çek (hem izinler hem vardiyaPlan'daki hafta tatilleri)
    const haftaSonu = new Date(haftaBaslangic);
    haftaSonu.setDate(haftaBaslangic.getDate() + 6);
    const izinMap = await izinMapOlustur(haftaBaslangic, haftaSonu, "full");

    // Her personel için haftalık veri oluştur
    const results: PersonelHaftalik[] = [];
    
    const filteredPersonel = showYoneticiler 
      ? personeller 
      : personeller.filter(p => !["Yönetici", "Kurucu"].includes(p.kullaniciTuru || ""));

    for (const personel of filteredPersonel) {
      const gunler: GunData[] = [];
      let toplamDakika = 0;
      let geldigiGun = 0;

      for (let i = 0; i < 7; i++) {
        const gun = new Date(haftaBaslangic);
        gun.setDate(haftaBaslangic.getDate() + i);
        const gunStr = gun.toISOString().split('T')[0];
        const key = `${personel.id}-${gunStr}`;

        const gunKayitlari = kayitlar.get(key) || [];
        const izin = izinMap.get(key);

        let gunData: GunData = {
          tarih: gunStr,
          girisSaati: "",
          durum: "bos",
          calismaDakika: 0
        };

        // Resmi tatil
        if (isResmiTatil(gunStr)) {
          gunData.durum = "resmiTatil";
          gunData.girisSaati = "Resmi Tatili";
        }
        // Hafta tatili
        else if (isHaftaTatili(gunStr)) {
          gunData.durum = "tatil";
          gunData.girisSaati = "Hafta Tatili";
        }
        // İzinli
        else if (izin) {
          gunData.durum = "izin";
          gunData.girisSaati = izin;
        }
        // Giriş var
        else if (gunKayitlari.length > 0) {
          const girisler = gunKayitlari.filter(k => k.tip === "giris").sort((a, b) => a.tarihDate - b.tarihDate);
          const cikislar = gunKayitlari.filter(k => k.tip === "cikis").sort((a, b) => a.tarihDate - b.tarihDate);

          if (girisler.length > 0) {
            const ilkGiris = girisler[0].tarihDate;
            gunData.girisSaati = ilkGiris.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            gunData.durum = "calisma";
            geldigiGun++;

            if (cikislar.length > 0) {
              const sonCikis = cikislar[cikislar.length - 1].tarihDate;
              let calismaDakika = Math.floor((sonCikis - ilkGiris) / (1000 * 60)) - molaSuresi;
              if (calismaDakika < 0) calismaDakika = 0;
              
              toplamDakika += calismaDakika;
              gunData.calismaDakika = calismaDakika;

              // Eksik veya fazla
              const hedefDakika = gunlukCalismaSuresi * 60;
              if (calismaDakika < hedefDakika - 30) {
                gunData.durum = "eksik";
              } else if (calismaDakika > hedefDakika + 30) {
                gunData.durum = "fazla";
              }
            }
          }
        }

        gunler.push(gunData);
      }

      // Toplam hesapla
      const toplamSaat = Math.floor(toplamDakika / 60);
      const toplamDakikaKalan = toplamDakika % 60;
      
      const hedefHaftalikDakika = haftalikCalismaSaati * 60;
      const fazlaDakika = Math.max(0, toplamDakika - hedefHaftalikDakika);
      const fazlaSaat = Math.floor(fazlaDakika / 60);
      const fazlaDakikaKalan = fazlaDakika % 60;

      results.push({
        personelId: personel.id,
        personelAd: `${personel.ad} ${personel.soyad}`.trim(),
        sicilNo: personel.sicilNo || "",
        gunler,
        toplamSaat: `${String(toplamSaat).padStart(2, '0')}:${String(toplamDakikaKalan).padStart(2, '0')}`,
        geldigiGun,
        fazlaCalisma: `${String(fazlaSaat).padStart(2, '0')}:${String(fazlaDakikaKalan).padStart(2, '0')}`
      });
    }

    results.sort((a, b) => a.personelAd.localeCompare(b.personelAd, 'tr'));
    setHaftalikData(results);
    setDataLoading(false);
  };

  // Gün başlıkları
  const getGunBasliklari = () => {
    if (!seciliHafta) return [];
    const gunler = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const baslangic = new Date(seciliHafta);
    
    return gunler.map((gun, i) => {
      const tarih = new Date(baslangic);
      tarih.setDate(baslangic.getDate() + i);
      return `${tarih.getDate()} ${tarih.toLocaleDateString('tr-TR', { month: 'long' })} ${tarih.getFullYear()} ${gun}`;
    });
  };

  // Renk sınıfı
  const getDurumClass = (durum: string): string => {
    switch (durum) {
      case "calisma": return "bg-green-500 text-white";
      case "tatil": return "bg-stone-300 text-stone-700";
      case "resmiTatil": return "bg-yellow-400 text-yellow-900";
      case "izin": return "bg-blue-400 text-white";
      case "eksik": return "bg-red-500 text-white";
      case "fazla": return "bg-orange-400 text-white";
      default: return "bg-white text-stone-400";
    }
  };

  // Excel'e kopyala
  const copyToClipboard = async () => {
    const gunBasliklari = getGunBasliklari();
    let text = "Sicil No\tAd Soyad\t" + gunBasliklari.join("\t") + "\tToplam Saat\tGeldiği Gün\tFazla Çalışma\n";
    
    haftalikData.forEach(h => {
      const gunVerileri = h.gunler.map(g => g.girisSaati || "-").join("\t");
      text += `${h.sicilNo || "-"}\t${h.personelAd}\t${gunVerileri}\t${h.toplamSaat}\t${h.geldigiGun}\t${h.fazlaCalisma}\n`;
    });

    await navigator.clipboard.writeText(text);
    alert("Rapor panoya kopyalandı! Excel'de Ctrl+V ile yapıştırabilirsiniz.");
  };

  // Excel indir
  const exportToExcel = () => {
    const gunBasliklari = getGunBasliklari();
    let csv = "Sicil No;Ad Soyad;" + gunBasliklari.join(";") + ";Toplam Saat;Geldiği Gün;Fazla Çalışma\n";
    
    haftalikData.forEach(h => {
      const gunVerileri = h.gunler.map(g => g.girisSaati || "-").join(";");
      csv += `${h.sicilNo || "-"};${h.personelAd};${gunVerileri};${h.toplamSaat};${h.geldigiGun};${h.fazlaCalisma}\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `haftalik-calisma-${seciliHafta}.csv`;
    link.click();
  };

  const gunBasliklari = getGunBasliklari();
  const weekNum = seciliHafta ? getWeekNumber(new Date(seciliHafta)) : 0;

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-xl font-bold text-stone-800">Toplam Çalışma Süreleri (Haftalık)</h1>
        <p className="text-sm text-stone-500 mt-1">Bu sayfada, belirlediğiniz parametre ve filtrelere göre "Toplam Çalışma Süreleri (Haftalık)" raporunu görüntüleyebilirsiniz.</p>
      </header>

      <main className="p-4 md:p-6">
        {/* Filtreler */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-8 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-stone-500 mb-1">Hafta seçiniz</label>
              <select
                value={seciliHafta}
                onChange={(e) => setSeciliHafta(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {haftalar.map(h => 
                  h.isYearHeader ? (
                    <option key={h.value} value={h.value} disabled className="text-stone-400 font-semibold">
                      {h.label}
                    </option>
                  ) : (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Günlük çalışma süresi</label>
              <select
                value={gunlukCalismaSuresi}
                onChange={(e) => setGunlukCalismaSuresi(Number(e.target.value))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value={8}>8 saat</option>
                <option value={9}>9 saat</option>
                <option value={10}>10 saat</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Yemek + Mola süre...</label>
              <input
                type="number"
                value={molaSuresi}
                onChange={(e) => setMolaSuresi(Number(e.target.value))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Geç kal. toleransı</label>
              <input
                type="number"
                value={gecKalmaToleransi}
                onChange={(e) => setGecKalmaToleransi(Number(e.target.value))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Erken çık. toleransı</label>
              <input
                type="number"
                value={erkenCikisToleransi}
                onChange={(e) => setErkenCikisToleransi(Number(e.target.value))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Haftalık çalışma (sa)</label>
              <input
                type="number"
                value={haftalikCalismaSaati}
                onChange={(e) => setHaftalikCalismaSaati(Number(e.target.value))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchData}
                disabled={dataLoading}
                className="w-full bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                {dataLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>🔍 Sonuçları Getir</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Renk açıklamaları */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-green-500 rounded"></span> Çalıştığı günler</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-stone-300 rounded"></span> Çalışmadığı günler</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-red-500 rounded"></span> Eksik çalışma</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-orange-400 rounded"></span> Fazla çalışma</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-stone-300 rounded"></span> Hafta Tatili</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-blue-400 rounded"></span> İzin ve Raporlar</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-yellow-400 rounded"></span> Resmi Tatil</div>
        </div>

        {/* Uyarı */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            <span className="font-medium">ℹ️ Not:</span> Resmi tatil ve izin günleri toplam çalışma süresine dahil edilmez.
          </p>
        </div>

        {/* Başlık */}
        {haftalikData.length > 0 && (
          <h2 className="text-lg font-bold text-stone-800 mb-4">
            {String(weekNum).padStart(2, '0')}. Hafta - Toplam Çalışma Süreleri (Haftalık)
          </h2>
        )}

        {/* Tablo */}
        {haftalikData.length > 0 ? (
          <>
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-stone-500 whitespace-nowrap">Sicil No</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-stone-500 whitespace-nowrap">Ad Soyad</th>
                      {gunBasliklari.map((gun, i) => (
                        <th key={i} className="px-2 py-2 text-center text-xs font-medium text-stone-500 whitespace-nowrap min-w-[110px]">
                          {gun}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center text-xs font-medium text-stone-500 whitespace-nowrap">Toplam Saat</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-stone-500 whitespace-nowrap">Geldiği Gün</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-stone-500 whitespace-nowrap">Fazla Çalışma</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {haftalikData.map(h => (
                      <tr key={h.personelId} className="hover:bg-stone-50">
                        <td className="px-3 py-2 text-stone-800 whitespace-nowrap">{h.sicilNo || "-"}</td>
                        <td className="px-3 py-2 font-medium text-stone-800 whitespace-nowrap">{h.personelAd}</td>
                        {h.gunler.map((gun, i) => (
                          <td key={i} className={`px-2 py-2 text-center whitespace-nowrap text-xs font-medium ${getDurumClass(gun.durum)}`}>
                            {gun.girisSaati || "-"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center font-bold text-stone-800">{h.toplamSaat}</td>
                        <td className="px-3 py-2 text-center text-stone-600">{h.geldigiGun}</td>
                        <td className="px-3 py-2 text-center text-stone-600">{h.fazlaCalisma}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notlar */}
            <div className="bg-stone-50 border rounded-lg p-4 mb-6 text-center text-sm text-stone-600">
              <p className="font-medium mb-1">Notlar:</p>
              <p>Sadece gün içindeki <u>İlk Giriş</u> ve <u>Son Çıkış</u> işlemleri hesaba katılmaktadır.</p>
              <p>Toplam Saat ve Gün hesaplanırken Resmi Tatiller ve İzin Günleri, toplam sürelere eklenmemektedir.</p>
            </div>

            {/* Butonlar */}
            <div className="flex flex-col md:flex-row gap-3 justify-center">
              <button
                onClick={() => window.print()}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
              >
                🖨️ Yazdır / PDF
              </button>
              <button
                onClick={copyToClipboard}
                className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
              >
                📋 Excel'e Kopyala
              </button>
              <button
                onClick={exportToExcel}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
              >
                📥 Excel İndir
              </button>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <span className="text-5xl">📋</span>
            <p className="text-stone-500 mt-4">Rapor oluşturmak için hafta seçin ve "Sonuçları Getir" butonuna tıklayın.</p>
          </div>
        )}
      </main>
    </div>
  );
}
