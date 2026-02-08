import { useState, useEffect } from "react";
import { auth, db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, where, Timestamp, getDocs } from "firebase/firestore";
import * as Sentry from '@sentry/react';

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  calismaSaati?: string;
  aktif: boolean;
  yonetici?: boolean;
}

interface Konum {
  id: string;
  ad: string;
}

interface GecKalanKayit {
  personelId: string;
  personelAd: string;
  sicilNo: string;
  tarih: string;
  konum: string;
  planSaati: string;
  planKaynak: "vardiya" | "sabit"; // vardiyaPlan'dan mı, calismaSaati'nden mi
  ilkGiris: string;
  gecKalmaSuresi: string;
  mazeretNotu: string;
}

interface VardiyaPlanKayit {
  personelId: string;
  tarih: string;
  giris: string | null;
  cikis: string | null;
  haftaTatili: boolean;
}

interface EksikTatilUyari {
  personelId: string;
  personelAd: string;
  haftaLabel: string;
}

export default function GecKalanlarPage() {
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [konumlar, setKonumlar] = useState<Konum[]>([]);
  const [gecKalanlar, setGecKalanlar] = useState<GecKalanKayit[]>([]);
  const [eksikTatiller, setEksikTatiller] = useState<EksikTatilUyari[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Filtreler - 2 ay geriye
  const ikiAyOnce = new Date();
  ikiAyOnce.setMonth(ikiAyOnce.getMonth() - 2);
  
  const [baslangicTarih, setBaslangicTarih] = useState(ikiAyOnce.toISOString().split('T')[0]);
  const [bitisTarih, setBitisTarih] = useState(new Date().toISOString().split('T')[0]);
  const [seciliKonum, setSeciliKonum] = useState("Tümü");
  const [gecKalmaToleransi, setGecKalmaToleransi] = useState(10); // dakika

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
        calismaSaati: doc.data().calismaSaati || "",
        aktif: doc.data().aktif !== false,
        yonetici: doc.data().yonetici || false
      }));
      setPersoneller(data.filter(p => p.aktif));
    });
    return () => unsubscribe();
  }, []);

  // Konumları çek
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, "locations"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || doc.data().name || ""
      }));
      setKonumlar(data);
    });
    return () => unsubscribe();
  }, []);

  // Plan saatini parse et (HH:MM formatından)
  const parsePlanSaati = (calismaSaati: string): { saat: number; dakika: number } | null => {
    if (!calismaSaati) return null;
    const match = calismaSaati.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return { saat: parseInt(match[1]), dakika: parseInt(match[2]) };
    }
    return null;
  };

  // Tarih aralığındaki haftaları bul
  const getHaftalar = (baslangic: string, bitis: string): { baslangic: string; bitis: string; label: string }[] => {
    const haftalar: { baslangic: string; bitis: string; label: string }[] = [];
    const current = new Date(baslangic);
    
    // İlk pazartesiyi bul
    const day = current.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    current.setDate(current.getDate() + diff);

    const bitisDate = new Date(bitis);

    while (current <= bitisDate) {
      const haftaBas = toDateStr(current);
      const haftaSon = new Date(current);
      haftaSon.setDate(haftaSon.getDate() + 6);
      const haftaBit = toDateStr(haftaSon);

      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      const label = `${current.toLocaleDateString("tr-TR", opts)} - ${haftaSon.toLocaleDateString("tr-TR", opts)}`;

      haftalar.push({ baslangic: haftaBas, bitis: haftaBit, label });
      current.setDate(current.getDate() + 7);
    }

    return haftalar;
  };

  // Verileri getir
  const fetchRecords = async () => {
    if (!auth.currentUser) return;
    
    if (personeller.length === 0) {
      alert("Personel listesi henüz yüklenmedi, lütfen bekleyin.");
      return;
    }
    
    setDataLoading(true);

    try {
      const baslangic = new Date(baslangicTarih);
      baslangic.setHours(0, 0, 0, 0);
      const bitis = new Date(bitisTarih);
      bitis.setHours(23, 59, 59, 999);

      // ============================
      // 1. VardiyaPlan verilerini çek
      // ============================
      const vardiyaMap = new Map<string, VardiyaPlanKayit>();
      
      const vardiyaQuery = query(
        collection(db, "vardiyaPlan"),
        where("tarih", ">=", baslangicTarih),
        where("tarih", "<=", bitisTarih)
      );
      const vardiyaSnapshot = await getDocs(vardiyaQuery);
      
      vardiyaSnapshot.forEach(docSnap => {
        const d = docSnap.data();
        const key = `${d.personelId}_${d.tarih}`;
        vardiyaMap.set(key, {
          personelId: d.personelId,
          tarih: d.tarih,
          giris: d.giris || null,
          cikis: d.cikis || null,
          haftaTatili: d.haftaTatili === true,
        });
      });

      // ============================
      // 2. Attendance giriş kayıtlarını çek
      // ============================
      const q = query(
        collection(db, "attendance"),
        where("tarih", ">=", Timestamp.fromDate(baslangic)),
        where("tarih", "<=", Timestamp.fromDate(bitis)),
        where("tip", "==", "giris"),
        orderBy("tarih", "asc")
      );

      const snapshot = await getDocs(q);
      
      // Her personelin her günkü ilk girişini bul
      const ilkGirisler = new Map<string, any>();
      
      snapshot.forEach(doc => {
        const d = doc.data();
        const tarih = d.tarih?.toDate?.();
        if (!tarih) return;
        
        const gunStr = toDateStr(tarih);
        const key = `${d.personelId}-${gunStr}`;
        
        if (!ilkGirisler.has(key) || tarih < ilkGirisler.get(key).tarihDate) {
          ilkGirisler.set(key, { ...d, tarihDate: tarih, gunStr });
        }
      });

      // ============================
      // 3. Geç kalanları hesapla
      // ============================
      const results: GecKalanKayit[] = [];

      ilkGirisler.forEach((kayit) => {
        const personel = personeller.find(p => p.id === kayit.personelId);
        if (!personel) return;

        // Konum filtresi
        if (seciliKonum !== "Tümü" && kayit.konumAdi !== seciliKonum) return;

        // VardiyaPlan'da hafta tatili mi?
        const vardiyaKey = `${kayit.personelId}_${kayit.gunStr}`;
        const vardiya = vardiyaMap.get(vardiyaKey);
        
        if (vardiya?.haftaTatili) return; // Hafta tatili günü → atla

        // Plan saatini belirle: Önce vardiyaPlan, yoksa calismaSaati
        let planSaati: { saat: number; dakika: number } | null = null;
        let planKaynak: "vardiya" | "sabit" = "sabit";

        if (vardiya?.giris) {
          planSaati = parsePlanSaati(vardiya.giris);
          planKaynak = "vardiya";
        }

        if (!planSaati) {
          planSaati = parsePlanSaati(personel.calismaSaati || "");
          planKaynak = "sabit";
        }

        if (!planSaati) return; // Hiç plan yoksa atla

        // Giriş saatini al
        const girisSaat = kayit.tarihDate.getHours();
        const girisDakika = kayit.tarihDate.getMinutes();
        const girisSaniye = kayit.tarihDate.getSeconds();

        // Geç kalma süresini hesapla
        const planDakikaTotal = planSaati.saat * 60 + planSaati.dakika;
        const girisDakikaTotal = girisSaat * 60 + girisDakika;
        const gecKalmaDakika = girisDakikaTotal - planDakikaTotal;

        // Tolerans kontrolü
        if (gecKalmaDakika > gecKalmaToleransi) {
          const saat = Math.floor(gecKalmaDakika / 60);
          const dakika = gecKalmaDakika % 60;

          results.push({
            personelId: kayit.personelId,
            personelAd: kayit.personelAd || `${personel.ad} ${personel.soyad}`.trim(),
            sicilNo: personel.sicilNo || "",
            tarih: kayit.gunStr,
            konum: kayit.konumAdi || "-",
            planSaati: `${String(planSaati.saat).padStart(2, '0')}:${String(planSaati.dakika).padStart(2, '0')}`,
            planKaynak,
            ilkGiris: `${String(girisSaat).padStart(2, '0')}:${String(girisDakika).padStart(2, '0')}:${String(girisSaniye).padStart(2, '0')}`,
            gecKalmaSuresi: saat > 0 
              ? `${saat} sa ${dakika} dk`
              : `${dakika} dk`,
            mazeretNotu: kayit.mazeretNotu || ""
          });
        }
      });

      // Tarihe göre sırala
      results.sort((a, b) => a.tarih.localeCompare(b.tarih));
      setGecKalanlar(results);

      // ============================
      // 4. Eksik hafta tatili kontrolü
      // ============================
      const haftalar = getHaftalar(baslangicTarih, bitisTarih);
      const eksikler: EksikTatilUyari[] = [];
      
      // calismaSaati "serbest" olanlar tatil takibine girmez
      const takipEdilecekPersonel = personeller.filter(p => {
        const cs = (p.calismaSaati || "").toLowerCase();
        return cs !== "serbest" && cs !== "";
      });

      for (const hafta of haftalar) {
        // Bugünden sonraki haftaları kontrol etme
        if (hafta.baslangic > toDateStr(new Date())) continue;

        for (const personel of takipEdilecekPersonel) {
          let tatilVar = false;

          // Haftanın 7 günü boyunca vardiyaPlan'da hafta tatili var mı?
          const haftaBas = new Date(hafta.baslangic);
          for (let i = 0; i < 7; i++) {
            const gun = new Date(haftaBas);
            gun.setDate(haftaBas.getDate() + i);
            const gunStr = toDateStr(gun);
            const key = `${personel.id}_${gunStr}`;
            
            if (vardiyaMap.get(key)?.haftaTatili) {
              tatilVar = true;
              break;
            }
          }

          if (!tatilVar) {
            eksikler.push({
              personelId: personel.id,
              personelAd: `${personel.ad} ${personel.soyad}`.trim(),
              haftaLabel: hafta.label,
            });
          }
        }
      }

      setEksikTatiller(eksikler);

    } catch (error) {
      Sentry.captureException(error);
      alert("Veri çekilirken hata oluştu. Konsolu kontrol edin.");
    } finally {
      setDataLoading(false);
    }
  };

  // Excel'e kopyala
  const copyToClipboard = async () => {
    let text = "Sıra\tSicil No\tKullanıcı\tTarih\tKonum\tPlan Saati\tKaynak\tİlk Giriş\tGeç Kalma\tMazeret\n";
    
    gecKalanlar.forEach((g, index) => {
      const tarihFormatted = new Date(g.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
      text += `${index + 1}\t${g.sicilNo || "-"}\t${g.personelAd}\t${tarihFormatted}\t${g.konum}\t${g.planSaati}\t${g.planKaynak === "vardiya" ? "Vardiya Planı" : "Sabit Saat"}\t${g.ilkGiris}\t${g.gecKalmaSuresi}\t${g.mazeretNotu || "-"}\n`;
    });

    await navigator.clipboard.writeText(text);
    alert("Rapor panoya kopyalandı! Excel'de Ctrl+V ile yapıştırabilirsiniz.");
  };

  // Excel indir
  const exportToExcel = () => {
    let csv = "Sıra;Sicil No;Kullanıcı;Tarih;Konum;Plan Saati;Kaynak;İlk Giriş İşlemi;Geç Kalma Süresi;Mazeret Notu\n";
    
    gecKalanlar.forEach((g, index) => {
      const tarihFormatted = new Date(g.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
      csv += `${index + 1};${g.sicilNo || "-"};${g.personelAd};${tarihFormatted};${g.konum};${g.planSaati};${g.planKaynak === "vardiya" ? "Vardiya Planı" : "Sabit Saat"};${g.ilkGiris};${g.gecKalmaSuresi};${g.mazeretNotu || "-"}\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gec-kalanlar-${baslangicTarih}-${bitisTarih}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-xl font-bold text-stone-800">Geç Kalanlar</h1>
        <p className="text-sm text-stone-500 mt-1">Bu sayfadan, belirlediğiniz parametrelere göre "Geç Kalanlar" raporunu görüntüleyebilirsiniz.</p>
      </header>

      <main className="p-4 md:p-6">
        {/* Filtreler */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs text-stone-500 mb-1">Başlangıç tarihi</label>
              <input
                type="date" min="2020-01-01" max="2099-12-31"
                value={baslangicTarih}
                onChange={(e) => setBaslangicTarih(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Bitiş tarihi</label>
              <input
                type="date" min="2020-01-01" max="2099-12-31"
                value={bitisTarih}
                onChange={(e) => setBitisTarih(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Konum seçiniz</label>
              <select
                value={seciliKonum}
                onChange={(e) => setSeciliKonum(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="Tümü">Tümü</option>
                {konumlar.map(k => (
                  <option key={k.id} value={k.ad}>{k.ad}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Geç kalma toleransı (dk)</label>
              <input
                type="number"
                value={gecKalmaToleransi}
                onChange={(e) => setGecKalmaToleransi(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                min={0}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchRecords}
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

        {/* Uyarı Mesajı */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            <span className="font-medium">ℹ️ Bilgilendirme:</span> Plan saati öncelikle vardiya planından alınır. Vardiya planı yoksa personelin sabit çalışma saati kullanılır. Tolerans süresi ayarlanabilir.
          </p>
        </div>

        {/* Tablo */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Sicil No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Kullanıcı</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Tarih</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Konum</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Plan Saati</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">İlk Giriş</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Geç Kalma</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Mazeret</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {gecKalanlar.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-stone-500">
                      Sonuçları görmek için 'Sonuçları Getir' butonuna tıklayın
                    </td>
                  </tr>
                ) : (
                  gecKalanlar.map((g, index) => (
                    <tr key={`${g.personelId}-${g.tarih}`} className="hover:bg-stone-50">
                      <td className="px-4 py-3 text-sm text-stone-600">{index + 1}</td>
                      <td className="px-4 py-3 text-sm text-stone-600">{g.sicilNo || "-"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-stone-800">{g.personelAd}</td>
                      <td className="px-4 py-3 text-sm text-stone-600">
                        {new Date(g.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-600">{g.konum}</td>
                      <td className="px-4 py-3 text-sm text-stone-600">
                        <span>{g.planSaati}</span>
                        {g.planKaynak === "vardiya" && (
                          <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">VP</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600 font-medium">{g.ilkGiris}</td>
                      <td className="px-4 py-3 text-sm text-red-600 font-bold">{g.gecKalmaSuresi}</td>
                      <td className="px-4 py-3 text-sm text-stone-600">{g.mazeretNotu || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alt Butonlar */}
        {gecKalanlar.length > 0 && (
          <div className="flex flex-col md:flex-row gap-3 justify-center mt-6">
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
        )}

        {/* ============================
            📋 NOTLAR: Eksik Hafta Tatili
            ============================ */}
        {eksikTatiller.length > 0 && (
          <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-orange-100 border-b border-orange-200">
              <h3 className="text-sm font-semibold text-orange-800">
                ⚠️ Notlar — Haftalık Tatil Ayarlanmamış ({eksikTatiller.length} kayıt)
              </h3>
              <p className="text-xs text-orange-600 mt-0.5">
                Aşağıdaki personellerin belirtilen haftalarda haftalık tatili vardiya planında tanımlanmamış.
              </p>
            </div>
            <div className="p-4">
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {/* Haftaya göre grupla */}
                {(() => {
                  const grouped = new Map<string, string[]>();
                  eksikTatiller.forEach(e => {
                    if (!grouped.has(e.haftaLabel)) grouped.set(e.haftaLabel, []);
                    grouped.get(e.haftaLabel)!.push(e.personelAd);
                  });

                  return Array.from(grouped.entries()).map(([hafta, kisiler]) => (
                    <div key={hafta} className="bg-white rounded-lg border border-orange-100 p-3">
                      <p className="text-xs font-semibold text-orange-700 mb-1.5">📅 {hafta}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {kisiler.map((kisi, i) => (
                          <span key={i} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                            {kisi}
                          </span>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// YYYY-MM-DD (local timezone)
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}