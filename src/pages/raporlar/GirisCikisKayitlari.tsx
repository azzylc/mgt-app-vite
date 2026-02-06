import { useState, useEffect } from "react";
import { auth, db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, where, Timestamp, getDocs } from "firebase/firestore";

interface AttendanceRecord {
  id: string;
  personelId: string;
  personelAd: string;
  personelEmail: string;
  sicilNo?: string;
  tip: "giris" | "cikis";
  tarih: any;
  konumAdi: string;
  konumId: string;
  lat?: number;
  lng?: number;
  mesafe?: number;
  karekod?: string;
  mazeretNotu?: string;
  konumDisi?: boolean;
}

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  calismaSaati?: string;
  aktif: boolean;
}

interface Konum {
  id: string;
  ad: string;
  karekod: string;
}

export default function GirisCikisKayitlariPage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [konumlar, setKonumlar] = useState<Konum[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);

  // Filtreler
  const [baslangicTarih, setBaslangicTarih] = useState(new Date().toISOString().split('T')[0]);
  const [bitisTarih, setBitisTarih] = useState(new Date().toISOString().split('T')[0]);
  const [seciliKullanici, setSeciliKullanici] = useState("Tümü");
  const [seciliKonum, setSeciliKonum] = useState("Tümü");
  const [seciliIslemTuru, setSeciliIslemTuru] = useState("Tümü");
  const [dataLoading, setDataLoading] = useState(false);

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
        calismaSaati: doc.data().calismaSaati || "09:00-18:00",
        aktif: doc.data().aktif !== false
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
        ad: doc.data().ad || doc.data().name || "",
        karekod: doc.data().karekod || ""
      }));
      setKonumlar(data);
    });
    return () => unsubscribe();
  }, []);

  // Verileri getir
  const fetchRecords = async () => {
    if (!auth.currentUser) return;
    setDataLoading(true);

    const baslangic = new Date(baslangicTarih);
    baslangic.setHours(0, 0, 0, 0);
    const bitis = new Date(bitisTarih);
    bitis.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, "attendance"),
      where("tarih", ">=", Timestamp.fromDate(baslangic)),
      where("tarih", "<=", Timestamp.fromDate(bitis)),
      orderBy("tarih", "desc")
    );

    const snapshot = await getDocs(q);

    const data: AttendanceRecord[] = [];
    snapshot.forEach((doc) => {
      const d = doc.data();
      data.push({
        id: doc.id,
        personelId: d.personelId || "",
        personelAd: d.personelAd || "",
        personelEmail: d.personelEmail || "",
        sicilNo: d.sicilNo || "",
        tip: d.tip || "giris",
        tarih: d.tarih,
        konumAdi: d.konumAdi || "",
        konumId: d.konumId || "",
        lat: d.lat,
        lng: d.lng,
        mesafe: d.mesafe,
        karekod: d.karekod || "",
        mazeretNotu: d.mazeretNotu || "",
        konumDisi: d.mesafe && d.mesafe > 100
      });
    });
    setRecords(data);
    setDataLoading(false);
  };

  // Filtreleme
  useEffect(() => {
    let filtered = [...records];

    if (seciliKullanici !== "Tümü") {
      filtered = filtered.filter(r => r.personelAd === seciliKullanici);
    }

    if (seciliKonum !== "Tümü") {
      filtered = filtered.filter(r => r.konumAdi === seciliKonum);
    }

    if (seciliIslemTuru !== "Tümü") {
      filtered = filtered.filter(r => r.tip === seciliIslemTuru.toLowerCase());
    }

    setFilteredRecords(filtered);
  }, [records, seciliKullanici, seciliKonum, seciliIslemTuru]);

  // Personel bilgisi getir
  const getPersonelBilgi = (personelId: string) => {
    return personeller.find(p => p.id === personelId);
  };

  // Excel'e kopyala (clipboard)
  const copyToClipboard = async () => {
    let text = "Sıra\tSicil No\tKullanıcı\tKonum\tÇalışma Saati\tTarih\tSaat\tİşlem Türü\tKonum Dışı\tMazeret Notu\n";
    
    filteredRecords.forEach((r, index) => {
      const personel = getPersonelBilgi(r.personelId);
      const tarih = r.tarih?.toDate?.() ? r.tarih.toDate() : new Date();
      const tarihStr = tarih.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
      const saatStr = tarih.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      text += `${index + 1}\t${personel?.sicilNo || r.sicilNo || "-"}\t${r.personelAd}\t${r.konumAdi}\t${personel?.calismaSaati || "her gün 9:00-18:00"}\t${tarihStr}\t${saatStr}\t${r.tip === "giris" ? "Giriş" : "Çıkış"}\t${r.konumDisi ? "Evet" : ""}\t${r.mazeretNotu || ""}\n`;
    });

    await navigator.clipboard.writeText(text);
    alert("Rapor panoya kopyalandı! Excel'de Ctrl+V ile yapıştırabilirsiniz.");
  };

  // Excel indir
  const exportToExcel = () => {
    let csv = "Sıra;Sicil No;Kullanıcı;Konum;Çalışma Saati;Tarih;Saat;İşlem Türü;Konum Dışı;Mazeret Notu\n";
    
    filteredRecords.forEach((r, index) => {
      const personel = getPersonelBilgi(r.personelId);
      const tarih = r.tarih?.toDate?.() ? r.tarih.toDate() : new Date();
      const tarihStr = tarih.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
      const saatStr = tarih.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      csv += `${index + 1};${personel?.sicilNo || r.sicilNo || "-"};${r.personelAd};${r.konumAdi};${personel?.calismaSaati || "her gün 9:00-18:00"};${tarihStr};${saatStr};${r.tip === "giris" ? "Giriş" : "Çıkış"};${r.konumDisi ? "Evet" : ""};${r.mazeretNotu || ""}\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `giris-cikis-kayitlari-${baslangicTarih}-${bitisTarih}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-xl font-bold text-stone-800">Giriş ve Çıkış Kayıtları</h1>
        <p className="text-sm text-stone-500 mt-1">Bu sayfada, belirlediğiniz parametrelere göre "Giriş ve Çıkış Kayıtları" raporunu görüntüleyebilirsiniz.</p>
      </header>

      <main className="p-4 md:p-6">
        {/* Filtreler */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
              <label className="block text-xs text-stone-500 mb-1">Kullanıcı seçiniz</label>
              <select
                value={seciliKullanici}
                onChange={(e) => setSeciliKullanici(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="Tümü">Tümü</option>
                {personeller.map(p => (
                  <option key={p.id} value={`${p.ad} ${p.soyad}`.trim()}>{p.ad} {p.soyad}</option>
                ))}
              </select>
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
              <label className="block text-xs text-stone-500 mb-1">İşlem türü</label>
              <select
                value={seciliIslemTuru}
                onChange={(e) => setSeciliIslemTuru(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="Tümü">Tümü</option>
                <option value="Giris">Giriş</option>
                <option value="Cikis">Çıkış</option>
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
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            <span className="font-medium">ℹ️ Bilgilendirme:</span> Bu rapor otomatik olarak oluşturulmuştur. Resmi işlemlerde kullanmadan önce verileri kontrol etmenizi öneririz.
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Konum</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Çalışma Saati</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Tarih</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Saat</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">İşlem Türü</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Konum Dışı</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">Mazeret Notu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-stone-500">
                      {records.length === 0 ? "Sonuçları görmek için 'Sonuçları Getir' butonuna tıklayın" : "Filtrelere uygun kayıt bulunamadı"}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record, index) => {
                    const personel = getPersonelBilgi(record.personelId);
                    const tarih = record.tarih?.toDate?.() ? record.tarih.toDate() : new Date();
                    
                    return (
                      <tr key={record.id} className="hover:bg-stone-50">
                        <td className="px-4 py-3 text-sm text-stone-600">{index + 1}</td>
                        <td className="px-4 py-3 text-sm text-stone-600">{personel?.sicilNo || record.sicilNo || "-"}</td>
                        <td className="px-4 py-3 text-sm font-medium text-stone-800">{record.personelAd}</td>
                        <td className="px-4 py-3 text-sm text-stone-600">{record.konumAdi}</td>
                        <td className="px-4 py-3 text-sm text-stone-600">{personel?.calismaSaati || "her gün 9:00-18:00"}</td>
                        <td className="px-4 py-3 text-sm text-stone-600">
                          {tarih.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-600">
                          {tarih.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            record.tip === "giris" 
                              ? "bg-green-100 text-green-700" 
                              : "bg-red-100 text-red-700"
                          }`}>
                            {record.tip === "giris" ? "Giriş" : "Çıkış"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-600">
                          {record.konumDisi && <span className="text-orange-500">⚠️</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-600">{record.mazeretNotu || "-"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alt Butonlar */}
        {filteredRecords.length > 0 && (
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

        {/* Notlar */}
        <div className="mt-6 text-center text-sm text-stone-500">
          <p className="font-medium mb-2">Notlar:</p>
          <p>Tüm raporlar, sistemimizi kullanan firmaların tamamının ortak ve genel ihtiyaçlarına yönelik hazırlanmakta ve sonuç vermektedir.</p>
        </div>
      </main>
    </div>
  );
}
