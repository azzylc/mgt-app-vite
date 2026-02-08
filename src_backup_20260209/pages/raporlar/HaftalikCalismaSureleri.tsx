import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, where, Timestamp, getDocs } from "firebase/firestore";
import { resmiTatiller } from "../../lib/data";
import { izinMapOlustur } from "../../lib/izinHelper";
import { useAuth } from "../../context/RoleProvider";
import * as Sentry from "@sentry/react";

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  calismaSaati?: string;
  aktif: boolean;
  kullaniciTuru?: string;
  firmalar?: string[];
  grupEtiketleri?: string[];
}

interface Firma {
  id: string;
  firmaAdi: string;
  kisaltma?: string;
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
  beklenenSaat: string;
  geldigiGun: number;
  fazlaCalisma: string;
  eksikCalisma: string;
}

interface EksikCikisUyari {
  personelAd: string;
  tarih: string;
  girisSaati: string;
}

interface GelmeyenUyari {
  personelAd: string;
  tarih: string;
  mesaj: string;
}

/** Local timezone'da YYYY-MM-DD */
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "HH:MM" formatından dakika hesapla */
function saatToDakika(saat: string): number | null {
  const match = saat.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/** İki saat arasındaki farkı dakika olarak hesapla (giriş-çıkış) */
function saatFarkiDakika(giris: string, cikis: string): number | null {
  const girisDk = saatToDakika(giris);
  const cikisDk = saatToDakika(cikis);
  if (girisDk === null || cikisDk === null) return null;
  return cikisDk - girisDk;
}

export default function HaftalikCalismaSureleriPage() {
  const user = useAuth();
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [firmalar, setFirmalar] = useState<Firma[]>([]);
  const [grupEtiketleri, setGrupEtiketleri] = useState<string[]>([]);
  const [haftalikData, setHaftalikData] = useState<PersonelHaftalik[]>([]);
  const [eksikCikislar, setEksikCikislar] = useState<EksikCikisUyari[]>([]);
  const [gelmeyenUyarilar, setGelmeyenUyarilar] = useState<GelmeyenUyari[]>([]);
  const [haftalar, setHaftalar] = useState<{ value: string; label: string; year?: number; isYearHeader?: boolean }[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Filtreler
  const [seciliHafta, setSeciliHafta] = useState("");
  const [molaSuresi, setMolaSuresi] = useState(90);
  const [showYoneticiler, setShowYoneticiler] = useState(false);
  const [seciliFirmalar, setSeciliFirmalar] = useState<string[]>([]);
  const [seciliGrup, setSeciliGrup] = useState("tumu");

  // Hafta numarası hesapla
  const getWeekNumber = (date: Date): number => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };

  // Haftaları oluştur
  useEffect(() => {
    const weeks: { value: string; label: string; year?: number; isYearHeader?: boolean }[] = [];
    const today = new Date();
    
    for (let i = 51; i >= 0; i--) {
      const weekStart = new Date(today);
      const dayOfWeek = today.getDay();
      weekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const weekNum = getWeekNumber(weekStart);
      const year = weekStart.getFullYear();
      const startStr = weekStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      const endStr = weekEnd.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      
      if (weeks.length === 0 || weeks[weeks.length - 1].year !== year) {
        weeks.push({ value: `year-${year}`, label: `${year} yılı`, year, isYearHeader: true });
      }
      
      weeks.push({
        value: toLocalDateStr(weekStart),
        label: `${String(weekNum).padStart(2, '0')}. Hafta (${startStr} - ${endStr})`,
        year
      });
    }
    
    setHaftalar(weeks);
    const thisWeek = weeks.filter(w => !w.isYearHeader).pop();
    if (thisWeek) setSeciliHafta(thisWeek.value);
  }, []);

  // Personelleri çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        const ge = d.grupEtiketleri;
        return {
          id: doc.id,
          ad: d.ad || "",
          soyad: d.soyad || "",
          sicilNo: d.sicilNo || "",
          calismaSaati: d.calismaSaati || "",
          aktif: d.aktif !== false,
          kullaniciTuru: d.kullaniciTuru || "",
          firmalar: Array.isArray(d.firmalar) ? d.firmalar : (d.firma ? [d.firma] : []),
          grupEtiketleri: Array.isArray(ge) ? ge : (ge ? [ge] : []),
        };
      });
      setPersoneller(data.filter(p => p.aktif));
      const gruplar = [...new Set(data.flatMap(p => p.grupEtiketleri || []))].sort((a, b) => a.localeCompare(b, 'tr'));
      setGrupEtiketleri(gruplar);
    });
    return () => unsubscribe();
  }, [user]);

  // Firmaları çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "companies"), orderBy("firmaAdi", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFirmalar(snapshot.docs.map(doc => ({
        id: doc.id,
        firmaAdi: doc.data().firmaAdi || "",
        kisaltma: doc.data().kisaltma || "",
      })));
    });
    return () => unsubscribe();
  }, [user]);

  // Resmi tatil kontrolü
  const isResmiTatil = (tarih: string): boolean => {
    for (const tatil of resmiTatiller) {
      const tatilTarih = new Date(tatil.tarih);
      for (let i = 0; i < tatil.sure; i++) {
        const gun = new Date(tatilTarih);
        gun.setDate(tatilTarih.getDate() + i);
        if (toLocalDateStr(gun) === tarih) return true;
      }
    }
    return false;
  };

  // Firma toggle
  const toggleFirma = (firmaId: string) => {
    setSeciliFirmalar(prev =>
      prev.includes(firmaId) ? prev.filter(f => f !== firmaId) : [...prev, firmaId]
    );
  };

  // Verileri getir
  const fetchData = async () => {
    if (!user || !seciliHafta) return;
    setDataLoading(true);

    try {
      const haftaBaslangic = new Date(seciliHafta + "T00:00:00");
      const haftaBitis = new Date(haftaBaslangic);
      haftaBitis.setDate(haftaBaslangic.getDate() + 6);
      haftaBitis.setHours(23, 59, 59, 999);

      const attendanceQuery = query(
        collection(db, "attendance"),
        where("tarih", ">=", Timestamp.fromDate(haftaBaslangic)),
        where("tarih", "<=", Timestamp.fromDate(haftaBitis)),
        orderBy("tarih", "asc")
      );

      const attendanceSnap = await getDocs(attendanceQuery);
      
      const kayitlar = new Map<string, any[]>();
      attendanceSnap.forEach(docSnap => {
        const d = docSnap.data();
        const tarih = d.tarih?.toDate?.();
        if (!tarih) return;
        
        const gunStr = toLocalDateStr(tarih);
        const key = `${d.personelId}-${gunStr}`;
        
        if (!kayitlar.has(key)) kayitlar.set(key, []);
        kayitlar.get(key)!.push({ ...d, tarihDate: tarih });
      });

      // VardiyaPlan verilerini çek
      const haftaSonu = new Date(haftaBaslangic);
      haftaSonu.setDate(haftaBaslangic.getDate() + 6);
      
      const vardiyaMap = new Map<string, { giris: string | null; cikis: string | null; haftaTatili: boolean }>();
      try {
        const haftaBasStr = toLocalDateStr(haftaBaslangic);
        const haftaBitStr = toLocalDateStr(haftaSonu);
        const vpQuery = query(
          collection(db, "vardiyaPlan"),
          where("tarih", ">=", haftaBasStr),
          where("tarih", "<=", haftaBitStr)
        );
        const vpSnap = await getDocs(vpQuery);
        vpSnap.forEach(docSnap => {
          const d = docSnap.data();
          vardiyaMap.set(`${d.personelId}_${d.tarih}`, {
            giris: d.giris || null,
            cikis: d.cikis || null,
            haftaTatili: d.haftaTatili === true,
          });
        });
      } catch (e) {
        Sentry.captureException(e);
      }

      const izinMap = await izinMapOlustur(haftaBaslangic, haftaSonu, "full");

      let filteredPersonel = showYoneticiler
        ? personeller
        : personeller.filter(p => !["Yönetici", "Kurucu"].includes(p.kullaniciTuru || ""));

      if (seciliFirmalar.length > 0) {
        filteredPersonel = filteredPersonel.filter(p =>
          (p.firmalar || []).some(f => seciliFirmalar.includes(f))
        );
      }

      if (seciliGrup !== "tumu") {
        filteredPersonel = filteredPersonel.filter(p =>
          (p.grupEtiketleri || []).includes(seciliGrup)
        );
      }

      const results: PersonelHaftalik[] = [];
      const eksikler: EksikCikisUyari[] = [];
      const gelmeyenler: GelmeyenUyari[] = [];

      for (const personel of filteredPersonel) {
        const gunler: GunData[] = [];
        let toplamDakika = 0;
        let beklenenToplamDakika = 0;
        let geldigiGun = 0;

        for (let i = 0; i < 7; i++) {
          const gun = new Date(haftaBaslangic);
          gun.setDate(haftaBaslangic.getDate() + i);
          const gunStr = toLocalDateStr(gun);
          const key = `${personel.id}-${gunStr}`;
          const vpKey = `${personel.id}_${gunStr}`;

          const gunKayitlari = kayitlar.get(key) || [];
          const izin = izinMap.get(key);
          const vardiya = vardiyaMap.get(vpKey);

          let gunData: GunData = {
            tarih: gunStr,
            girisSaati: "",
            durum: "bos",
            calismaDakika: 0
          };

          // Günlük beklenen çalışma süresini hesapla
          // HER ZAMAN personel.calismaSaati'nden (çıkış - giriş - mola)
          let gunlukBeklenenDakika = 0;
          let beklenenHesaplanabildi = false;
          
          const csMatch = (personel.calismaSaati || "").match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
          if (csMatch) {
            const fark = saatFarkiDakika(csMatch[1], csMatch[2]);
            if (fark !== null) {
              gunlukBeklenenDakika = fark - molaSuresi;
              beklenenHesaplanabildi = true;
            }
          }
          // calismaSaati parse edilemiyorsa veya "serbest" ise → beklenen 0, hesaplanamadı

          if (gunlukBeklenenDakika < 0) gunlukBeklenenDakika = 0;

          if (isResmiTatil(gunStr)) {
            gunData.durum = "resmiTatil";
            gunData.girisSaati = "Resmi Tatil";
            // Resmi tatil → beklenen 0
          }
          else if (vardiya?.haftaTatili) {
            gunData.durum = "tatil";
            gunData.girisSaati = "Hafta Tatili";
            // Hafta tatili → beklenen 0
          }
          else if (izin) {
            if (izin === "Haftalık İzin") {
              gunData.durum = "tatil";
              gunData.girisSaati = "Hafta Tatili";
            } else {
              gunData.durum = "izin";
              gunData.girisSaati = izin;
            }
            // İzin/tatil → beklenen 0
          }
          else if (gunKayitlari.length > 0) {
            // Beklenen süreyi haftalık toplama ekle
            beklenenToplamDakika += gunlukBeklenenDakika;

            const girisler = gunKayitlari.filter((k: any) => k.tip === "giris").sort((a: any, b: any) => a.tarihDate - b.tarihDate);
            const cikislar = gunKayitlari.filter((k: any) => k.tip === "cikis").sort((a: any, b: any) => a.tarihDate - b.tarihDate);

            if (girisler.length > 0) {
              const ilkGiris = girisler[0].tarihDate;
              geldigiGun++;

              if (cikislar.length > 0) {
                const sonCikis = cikislar[cikislar.length - 1].tarihDate;
                let calismaDakika = Math.floor((sonCikis - ilkGiris) / (1000 * 60)) - molaSuresi;
                if (calismaDakika < 0) calismaDakika = 0;
                
                toplamDakika += calismaDakika;
                gunData.calismaDakika = calismaDakika;

                const saatStr = Math.floor(calismaDakika / 60);
                const dakikaStr = calismaDakika % 60;
                gunData.girisSaati = `${String(saatStr).padStart(2, '0')}:${String(dakikaStr).padStart(2, '0')}`;

                if (gunlukBeklenenDakika > 0) {
                  if (calismaDakika < gunlukBeklenenDakika - 30) {
                    gunData.durum = "eksik";
                  } else if (calismaDakika > gunlukBeklenenDakika + 30) {
                    gunData.durum = "fazla";
                  } else {
                    gunData.durum = "calisma";
                  }
                } else {
                  gunData.durum = "calisma";
                }
              } else {
                gunData.girisSaati = ilkGiris.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + " ⚠️";
                gunData.durum = "eksik";
                eksikler.push({
                  personelAd: `${personel.ad} ${personel.soyad}`.trim(),
                  tarih: gun.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }),
                  girisSaati: ilkGiris.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                });
              }
            }
          } else {
            // Gelmemiş - hiç QR kaydı yok
            if (beklenenHesaplanabildi && gunlukBeklenenDakika > 0) {
              // calismaSaati tanımlı ama gelmemiş → beklenen'e ekle (eksik çıkacak) + uyarı
              beklenenToplamDakika += gunlukBeklenenDakika;
              gelmeyenler.push({
                personelAd: `${personel.ad} ${personel.soyad}`.trim(),
                tarih: gun.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }),
                mesaj: "Gelmedi — haftalık tatil de girilmemiş",
              });
            } else if (!beklenenHesaplanabildi) {
              // calismaSaati parse edilemedi → beklenen'e ekleme, sadece uyarı
              gelmeyenler.push({
                personelAd: `${personel.ad} ${personel.soyad}`.trim(),
                tarih: gun.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }),
                mesaj: "Çalışma saati tanımsız",
              });
            }
          }

          gunler.push(gunData);
        }

        const toplamSaat = Math.floor(toplamDakika / 60);
        const toplamDakikaKalan = toplamDakika % 60;
        
        const beklenenSaat = Math.floor(beklenenToplamDakika / 60);
        const beklenenDakikaKalan = beklenenToplamDakika % 60;

        const fazlaDakika = Math.max(0, toplamDakika - beklenenToplamDakika);
        const fazlaSaat = Math.floor(fazlaDakika / 60);
        const fazlaDakikaKalan = fazlaDakika % 60;

        const eksikDakika = Math.max(0, beklenenToplamDakika - toplamDakika);
        const eksikSaat = Math.floor(eksikDakika / 60);
        const eksikDakikaKalan = eksikDakika % 60;

        results.push({
          personelId: personel.id,
          personelAd: `${personel.ad} ${personel.soyad}`.trim(),
          sicilNo: personel.sicilNo || "",
          gunler,
          toplamSaat: `${String(toplamSaat).padStart(2, '0')}:${String(toplamDakikaKalan).padStart(2, '0')}`,
          beklenenSaat: `${String(beklenenSaat).padStart(2, '0')}:${String(beklenenDakikaKalan).padStart(2, '0')}`,
          geldigiGun,
          fazlaCalisma: `${String(fazlaSaat).padStart(2, '0')}:${String(fazlaDakikaKalan).padStart(2, '0')}`,
          eksikCalisma: `${String(eksikSaat).padStart(2, '0')}:${String(eksikDakikaKalan).padStart(2, '0')}`,
        });
      }

      results.sort((a, b) => a.personelAd.localeCompare(b.personelAd, 'tr'));
      setHaftalikData(results);
      setEksikCikislar(eksikler);
      setGelmeyenUyarilar(gelmeyenler);
    } catch (error) {
      Sentry.captureException(error);
    }

    setDataLoading(false);
  };

  // Gün başlıkları
  const getGunBasliklari = () => {
    if (!seciliHafta) return [];
    const gunler = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const baslangic = new Date(seciliHafta + "T12:00:00");
    
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
    const gb = getGunBasliklari();
    let text = "Sicil No\tAd Soyad\t" + gb.join("\t") + "\tToplam Saat\tBeklenen\tGeldiği Gün\tFazla Çalışma\tEksik Çalışma\n";
    
    haftalikData.forEach(h => {
      const gunVerileri = h.gunler.map(g => g.girisSaati || "-").join("\t");
      text += `${h.sicilNo || "-"}\t${h.personelAd}\t${gunVerileri}\t${h.toplamSaat}\t${h.beklenenSaat}\t${h.geldigiGun}\t${h.fazlaCalisma}\t${h.eksikCalisma}\n`;
    });

    await navigator.clipboard.writeText(text);
    alert("Rapor panoya kopyalandı! Excel'de Ctrl+V ile yapıştırabilirsiniz.");
  };

  // Excel indir
  const exportToExcel = () => {
    const gb = getGunBasliklari();
    let csv = "Sicil No;Ad Soyad;" + gb.join(";") + ";Toplam Saat;Beklenen;Geldiği Gün;Fazla Çalışma;Eksik Çalışma\n";
    
    haftalikData.forEach(h => {
      const gunVerileri = h.gunler.map(g => g.girisSaati || "-").join(";");
      csv += `${h.sicilNo || "-"};${h.personelAd};${gunVerileri};${h.toplamSaat};${h.beklenenSaat};${h.geldigiGun};${h.fazlaCalisma};${h.eksikCalisma}\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `haftalik-calisma-${seciliHafta}.csv`;
    link.click();
  };

  const gunBasliklari = getGunBasliklari();
  const weekNum = seciliHafta ? getWeekNumber(new Date(seciliHafta + "T12:00:00")) : 0;

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-xl font-bold text-stone-800">Toplam Çalışma Süreleri (Haftalık)</h1>
        <p className="text-sm text-stone-500 mt-1">Bu sayfada, belirlediğiniz parametre ve filtrelere göre &quot;Toplam Çalışma Süreleri (Haftalık)&quot; raporunu görüntüleyebilirsiniz.</p>
      </header>

      <main className="p-4 md:p-6">
        {/* Filtreler */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6 space-y-3">
          {/* Satır 1: Hafta + Parametreler + Buton */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-[2]">
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
            <div className="flex-1">
              <label className="block text-xs text-stone-500 mb-1">Mola süresi (dk)</label>
              <input
                type="number"
                value={molaSuresi}
                onChange={(e) => setMolaSuresi(Number(e.target.value))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-stone-500 mb-1">Grup Etiketi</label>
              <select
                value={seciliGrup}
                onChange={(e) => setSeciliGrup(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="tumu">Tümü</option>
                {grupEtiketleri.map(grup => (
                  <option key={grup} value={grup}>{grup}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchData}
                disabled={dataLoading}
                className="w-full bg-rose-500 hover:bg-rose-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {dataLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>🔍 Getir</>
                )}
              </button>
            </div>
          </div>

          {/* Satır 2: Firma + Yöneticiler */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-500 mr-1">Firma:</span>
            {firmalar.map(firma => {
              const selected = seciliFirmalar.includes(firma.id);
              return (
                <button
                  key={firma.id}
                  onClick={() => toggleFirma(firma.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    selected
                      ? "bg-rose-500 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {firma.kisaltma || firma.firmaAdi}
                </button>
              );
            })}
            {seciliFirmalar.length > 0 && (
              <button
                onClick={() => setSeciliFirmalar([])}
                className="px-2 py-1 rounded-full text-xs text-stone-400 hover:text-stone-600 transition"
              >
                ✕
              </button>
            )}
            {firmalar.length === 0 && (
              <span className="text-xs text-stone-400">Tanımsız</span>
            )}

            <span className="mx-2 text-stone-200">|</span>

            <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showYoneticiler}
                onChange={(e) => setShowYoneticiler(e.target.checked)}
                className="rounded border-stone-300 w-3.5 h-3.5"
              />
              Yöneticiler
            </label>
          </div>
        </div>

        {/* Renk açıklamaları */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-green-500 rounded"></span> Çalıştığı günler</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-stone-300 rounded"></span> Hafta Tatili</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-red-500 rounded"></span> Eksik çalışma</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-orange-400 rounded"></span> Fazla çalışma</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-blue-400 rounded"></span> İzin ve Raporlar</div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 bg-yellow-400 rounded"></span> Resmi Tatil</div>
        </div>

        {/* Uyarı */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            <span className="font-medium">ℹ️ Not:</span> Resmi tatil ve izin günleri toplam çalışma süresine dahil edilmez. Hücrelerdeki süreler mola düşülmüş net çalışma süresidir.
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
                      <th className="px-3 py-2 text-center text-xs font-medium text-stone-500 whitespace-nowrap">Beklenen</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-stone-500 whitespace-nowrap">Geldiği Gün</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-stone-500 whitespace-nowrap">Fazla Çalışma</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-stone-500 whitespace-nowrap">Eksik Çalışma</th>
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
                        <td className="px-3 py-2 text-center text-stone-500">{h.beklenenSaat}</td>
                        <td className="px-3 py-2 text-center text-stone-600">{h.geldigiGun}</td>
                        <td className={`px-3 py-2 text-center font-medium ${h.fazlaCalisma !== "00:00" ? "text-orange-600" : "text-stone-400"}`}>
                          {h.fazlaCalisma}
                        </td>
                        <td className={`px-3 py-2 text-center font-medium ${h.eksikCalisma !== "00:00" ? "text-red-600" : "text-stone-400"}`}>
                          {h.eksikCalisma}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Eksik Çıkış Uyarıları */}
            {eksikCikislar.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-bold text-red-800 mb-3">⚠️ Dikkat: Çıkış Kaydı Eksik ({eksikCikislar.length} kayıt)</h3>
                <p className="text-xs text-red-600 mb-3">Aşağıdaki personellerin giriş kaydı var ancak çıkış kaydı bulunamadı. Bu günlerin çalışma süresi hesaplanamadı.</p>
                <div className="space-y-1">
                  {eksikCikislar.map((uyari, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs text-red-700 bg-red-100/50 rounded px-3 py-1.5">
                      <span className="font-medium min-w-[150px]">{uyari.personelAd}</span>
                      <span className="text-red-500">{uyari.tarih}</span>
                      <span>Giriş: {uyari.girisSaati}</span>
                      <span className="text-red-400">→ Çıkış yok</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {gelmeyenUyarilar.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-bold text-orange-800 mb-3">⚠️ Notlar: Gelmeyenler ({gelmeyenUyarilar.length} kayıt)</h3>
                <p className="text-xs text-orange-600 mb-3">Aşağıdaki personeller belirtilen günlerde gelmedi ve haftalık tatil/izin kaydı da bulunamadı.</p>
                <div className="space-y-1">
                  {gelmeyenUyarilar.map((uyari, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs text-orange-700 bg-orange-100/50 rounded px-3 py-1.5">
                      <span className="font-medium min-w-[150px]">{uyari.personelAd}</span>
                      <span className="text-orange-500">{uyari.tarih}</span>
                      <span>{uyari.mesaj}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notlar */}
            <div className="bg-stone-50 border rounded-lg p-4 mb-6 text-center text-sm text-stone-600">
              <p className="font-medium mb-1">Notlar:</p>
              <p>Sadece gün içindeki <u>İlk Giriş</u> ve <u>Son Çıkış</u> işlemleri hesaba katılmaktadır.</p>
              <p>Beklenen saat, personelin çalışma saatinden hesaplanır (çıkış - giriş - mola). Tatil ve izin günleri sayılmaz.</p>
              <p>Hücrelerdeki süreler yemek + mola süresi ({molaSuresi} dk) düşülmüş <strong>net çalışma süreleridir.</strong></p>
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
                📋 Excel&apos;e Kopyala
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
            <p className="text-stone-500 mt-4">Rapor oluşturmak için hafta seçin ve &quot;Sonuçları Getir&quot; butonuna tıklayın.</p>
          </div>
        )}
      </main>
    </div>
  );
}