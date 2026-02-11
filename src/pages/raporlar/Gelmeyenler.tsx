import { useState, useEffect } from "react";
import { auth, db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, where, Timestamp, getDocs } from "firebase/firestore";
import { resmiTatiller } from "../../lib/data";
import { izinMapOlustur } from "../../lib/izinHelper";
import * as Sentry from '@sentry/react';

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  calismaSaati?: string;
  aktif: boolean;
}

interface GelmeyenKayit {
  personelId: string;
  personelAd: string;
  sicilNo: string;
  calismaSaati: string;
  planSaati: string;
  planKaynak: "vardiya" | "sabit" | "";
  tarih: string;
  tatilVeyaIzin: string;
}

interface VardiyaPlanKayit {
  personelId: string;
  tarih: string;
  giris: string | null;
  cikis: string | null;
  haftaTatili: boolean;
}

export default function GelmeyenlerPage() {
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [gelmeyenler, setGelmeyenler] = useState<GelmeyenKayit[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Filtreler
  const [baslangicTarih, setBaslangicTarih] = useState((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());
  const [bitisTarih, setBitisTarih] = useState((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());
  const [tatilGoster, setTatilGoster] = useState("Göster");

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
        aktif: doc.data().aktif !== false
      }));
      setPersoneller(data.filter(p => p.aktif));
    });
    return () => unsubscribe();
  }, []);

  // Resmi tatil kontrolü
  const isResmiTatil = (tarih: string): string | null => {
    for (const tatil of resmiTatiller) {
      const tatilTarih = new Date(tatil.tarih);
      for (let i = 0; i < tatil.sure; i++) {
        const gun = new Date(tatilTarih);
        gun.setDate(tatilTarih.getDate() + i);
        if (toDateStr(gun) === tarih) {
          return tatil.isim;
        }
      }
    }
    return null;
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
        where("tip", "==", "giris")
      );

      const snapshot = await getDocs(q);
      
      // Personel-gün bazında giriş yapanları kaydet
      const girisYapanlar = new Set<string>();
      snapshot.forEach(doc => {
        const d = doc.data();
        const tarih = d.tarih?.toDate?.();
        if (tarih) {
          const gunStr = toDateStr(tarih);
          girisYapanlar.add(`${d.personelId}-${gunStr}`);
        }
      });

      // ============================
      // 3. İzinleri çek
      // ============================
      const izinMap = new Map<string, string>();
      try {
        const baslangicDate = new Date(baslangic);
        const bitisDate = new Date(bitis);
        const tempMap = await izinMapOlustur(baslangicDate, bitisDate, "full");
        tempMap.forEach((value, key) => {
          izinMap.set(key, value);
        });
      } catch (e) {
        // izinHelper hatası
      }

      // ============================
      // 4. Gelmeyen personelleri bul
      // ============================
      const results: GelmeyenKayit[] = [];
      
      const currentDate = new Date(baslangic);
      while (currentDate <= bitis) {
        const dateStr = toDateStr(currentDate);
        
        for (const personel of personeller) {
          const key = `${personel.id}-${dateStr}`;
          const vardiyaKey = `${personel.id}_${dateStr}`;
          const vardiya = vardiyaMap.get(vardiyaKey);
          
          // Giriş yapmadıysa
          if (!girisYapanlar.has(key)) {
            let tatilVeyaIzin = "";
            
            // VardiyaPlan'da hafta tatili mi?
            if (vardiya?.haftaTatili) {
              tatilVeyaIzin = "Hafta Tatili (VP)";
            }
            // Resmi tatil mi?
            const resmiTatil = isResmiTatil(dateStr);
            if (resmiTatil) {
              tatilVeyaIzin = resmiTatil;
            }
            // İzinli mi?
            if (izinMap.has(key)) {
              tatilVeyaIzin = izinMap.get(key)!;
            }

            // Tatil/izin filtreleme
            if (tatilGoster === "Gizle" && tatilVeyaIzin) {
              continue;
            }

            // Plan saatini belirle: Önce vardiyaPlan, yoksa calismaSaati
            let planSaati = "";
            let planKaynak: "vardiya" | "sabit" | "" = "";

            if (vardiya?.giris && vardiya?.cikis && !vardiya.haftaTatili) {
              planSaati = `${vardiya.giris} - ${vardiya.cikis}`;
              planKaynak = "vardiya";
            }

            if (!planSaati) {
              const match = personel.calismaSaati?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
              if (match) {
                planSaati = `${match[1]} - ${match[2]}`;
                planKaynak = "sabit";
              }
            }

            // calismaSaati "serbest" ve vardiyaPlan'da kaydı yoksa → gelmesi beklenmiyor, atla
            const csSerbest = (personel.calismaSaati || "").toLowerCase() === "serbest";
            if (csSerbest && !vardiya) {
              continue;
            }

            results.push({
              personelId: personel.id,
              personelAd: `${personel.ad} ${personel.soyad}`.trim(),
              sicilNo: personel.sicilNo || "",
              calismaSaati: personel.calismaSaati || "serbest",
              planSaati,
              planKaynak,
              tarih: dateStr,
              tatilVeyaIzin
            });
          }
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Tarihe göre sırala (en yeni üstte)
      results.sort((a, b) => b.tarih.localeCompare(a.tarih));

      setGelmeyenler(results);
    } catch (error) {
      Sentry.captureException(error);
      alert("Veri çekilirken hata oluştu. Konsolu kontrol edin.");
    } finally {
      setDataLoading(false);
    }
  };

  // Excel'e kopyala
  const copyToClipboard = async () => {
    let text = "Sıra\tSicil No\tKullanıcı\tÇalışma Saati\tPlan Saati\tKaynak\tTarih\tTatil/İzin\n";
    
    gelmeyenler.forEach((g, index) => {
      const tarihFormatted = new Date(g.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
      const kaynak = g.planKaynak === "vardiya" ? "Vardiya Planı" : g.planKaynak === "sabit" ? "Sabit Saat" : "-";
      text += `${index + 1}\t${g.sicilNo || "-"}\t${g.personelAd}\t${g.calismaSaati}\t${g.planSaati || "-"}\t${kaynak}\t${tarihFormatted}\t${g.tatilVeyaIzin || "-"}\n`;
    });

    await navigator.clipboard.writeText(text);
    alert("Rapor panoya kopyalandı! Excel'de Ctrl+V ile yapıştırabilirsiniz.");
  };

  // Excel indir
  const exportToExcel = () => {
    let csv = "Sıra;Sicil No;Kullanıcı;Çalışma Saati;Plan Saati;Kaynak;Tarih;Tatil veya İzinler\n";
    
    gelmeyenler.forEach((g, index) => {
      const tarihFormatted = new Date(g.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
      const kaynak = g.planKaynak === "vardiya" ? "Vardiya Planı" : g.planKaynak === "sabit" ? "Sabit Saat" : "-";
      csv += `${index + 1};${g.sicilNo || "-"};${g.personelAd};${g.calismaSaati};${g.planSaati || "-"};${kaynak};${tarihFormatted};${g.tatilVeyaIzin || "-"}\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gelmeyenler-${baslangicTarih}-${bitisTarih}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-xl font-bold text-[#2F2F2F]">Gelmeyenler</h1>
        <p className="text-sm text-[#8A8A8A] mt-1">Bu sayfadan, belirlediğiniz parametrelere göre "Gelmeyenler" raporunu görüntüleyebilirsiniz.</p>
      </header>

      <main className="p-4 md:p-6">
        {/* Filtreler */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-[#8A8A8A] mb-1">Başlangıç tarihi</label>
              <input
                type="date" min="2020-01-01" max="2099-12-31"
                value={baslangicTarih}
                onChange={(e) => setBaslangicTarih(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8A8A8A] mb-1">Bitiş tarihi</label>
              <input
                type="date" min="2020-01-01" max="2099-12-31"
                value={bitisTarih}
                onChange={(e) => setBitisTarih(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8A8A8A] mb-1">Tatil veya İzinli günler</label>
              <select
                value={tatilGoster}
                onChange={(e) => setTatilGoster(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="Göster">Göster</option>
                <option value="Gizle">Gizle</option>
              </select>
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
        <div className="bg-[#EAF2ED] border border-[#8FAF9A]/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-[#2F2F2F]">
            <span className="font-medium">ℹ️ Bilgilendirme:</span> Seçilen tarih aralığında giriş yapmayan personeller listelenir. Plan saati öncelikle vardiya planından, yoksa sabit çalışma saatinden alınır. Serbest çalışanlar, vardiya planında kaydı yoksa listelenmez.
          </p>
        </div>

        {/* Tablo */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F7F7F7] border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Sicil No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Kullanıcı</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Plan Saati</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Tarih</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Tatil veya İzinler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {gelmeyenler.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[#8A8A8A]">
                      Sonuçları görmek için 'Sonuçları Getir' butonuna tıklayın
                    </td>
                  </tr>
                ) : (
                  gelmeyenler.map((g, index) => (
                    <tr key={`${g.personelId}-${g.tarih}`} className="hover:bg-[#F7F7F7]">
                      <td className="px-4 py-3 text-sm text-[#2F2F2F]">{index + 1}</td>
                      <td className="px-4 py-3 text-sm text-[#2F2F2F]">{g.sicilNo || "-"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-[#2F2F2F]">{g.personelAd}</td>
                      <td className="px-4 py-3 text-sm text-[#2F2F2F]">
                        {g.planSaati ? (
                          <>
                            <span>{g.planSaati}</span>
                            {g.planKaynak === "vardiya" && (
                              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">VP</span>
                            )}
                          </>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#2F2F2F]">
                        {new Date(g.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}
                      </td>
                      <td className="px-4 py-3">
                        {g.tatilVeyaIzin ? (
                          <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            g.tatilVeyaIzin.includes("Hafta Tatili") ? "bg-blue-100 text-blue-700" :
                            g.tatilVeyaIzin.includes("İzin") ? "bg-[#E6B566]/20 text-orange-700" :
                            "bg-purple-100 text-purple-700"
                          }`}>
                            {g.tatilVeyaIzin}
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-[#D96C6C]/20 text-[#D96C6C]">
                            Mazeretsiz
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alt Butonlar */}
        {gelmeyenler.length > 0 && (
          <div className="flex flex-col md:flex-row gap-3 justify-center mt-6">
            <button
              onClick={() => window.print()}
              className="bg-[#F7F7F7] hover:bg-[#E5E5E5] text-[#2F2F2F] px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
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

        {/* Notlar */}
        <div className="mt-6 text-center text-sm text-[#8A8A8A]">
          <p className="font-medium mb-2">Notlar:</p>
          <p>Seçilen günlerde hiçbir <u>Giriş İşlemi olmayanlar</u> listelenmektedir.</p>
          <p className="mt-1">Serbest çalışanlar, vardiya planında o güne kayıt yoksa listede görünmez.</p>
        </div>
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