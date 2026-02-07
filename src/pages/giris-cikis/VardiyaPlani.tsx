import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, Timestamp, getDocs, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { resmiTatiller } from "../../lib/data";
import { tarihAraligiIzinleriGetir } from "../../lib/izinHelper";
import * as Sentry from '@sentry/react';
import { useAuth } from "../../context/RoleProvider";

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  aktif: boolean;
  grupEtiketleri?: string[];
  yonetici?: boolean;
  calismaSaati?: string;
}

interface VardiyaKayit {
  giris?: string;
  cikis?: string;
  haftaTatili?: boolean;
  izin?: string;
}

interface PersonelVardiya {
  personelId: string;
  personelAd: string;
  sicilNo: string;
  calismaSaati: string;
  gunler: { [key: string]: VardiyaKayit };
}

export default function VardiyaPlaniPage() {
  const user = useAuth();
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [vardiyaData, setVardiyaData] = useState<PersonelVardiya[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hafta seçimi
  const [seciliHafta, setSeciliHafta] = useState(getHaftaNumarasi(new Date()));
  const [seciliYil, setSeciliYil] = useState(new Date().getFullYear());

  // Filtreler
  const [seciliGrup, setSeciliGrup] = useState<string>("tumu");
  const [yoneticileriGoster, setYoneticileriGoster] = useState(false);

  // Düzenleme modal
  const [editModal, setEditModal] = useState<{
    personelId: string;
    personelAd: string;
    tarih: string;
    gunAdi: string;
  } | null>(null);
  const [girisSaati, setGirisSaati] = useState("09:00");
  const [cikisSaati, setCikisSaati] = useState("18:00");
  const [islemTipi, setIslemTipi] = useState<"giriscikis" | "haftaTatili">("giriscikis");
  const [girisOnerisi, setGirisOnerisi] = useState<string | null>(null);
  const [cikisOnerisi, setCikisOnerisi] = useState<string | null>(null);

  // Konum
  const [konumlar, setKonumlar] = useState<{id: string; ad: string; karekod: string}[]>([]);
  const [seciliKonum, setSeciliKonum] = useState<string>("");

  // Hafta numarası hesapla
  function getHaftaNumarasi(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  // Hafta başlangıç tarihi (Pazartesi)
  function getHaftaBaslangic(hafta: number, yil: number): Date {
    const simple = new Date(yil, 0, 1 + (hafta - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    return ISOweekStart;
  }

  // Haftanın günlerini al
  function getHaftaGunleri(hafta: number, yil: number): Date[] {
    const baslangic = getHaftaBaslangic(hafta, yil);
    const gunler: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const gun = new Date(baslangic);
      gun.setDate(baslangic.getDate() + i);
      gunler.push(gun);
    }
    return gunler;
  }

  const haftaGunleri = getHaftaGunleri(seciliHafta, seciliYil);
  const gunIsimleri = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

  // Tarih formatlama
  const formatTarih = (date: Date) => {
    return `${date.getDate()} ${["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][date.getMonth()]} ${date.getFullYear()}`;
  };

  const formatTarihKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Personelleri çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const grupEtiketleri = doc.data().grupEtiketleri;
        return {
          id: doc.id,
          ad: doc.data().ad || "",
          soyad: doc.data().soyad || "",
          sicilNo: doc.data().sicilNo || "",
          aktif: doc.data().aktif !== false,
          grupEtiketleri: Array.isArray(grupEtiketleri) ? grupEtiketleri : (grupEtiketleri ? [grupEtiketleri] : []),
          yonetici: doc.data().yonetici === true,
          calismaSaati: doc.data().calismaSaati || "her gün 9:00-18:00"
        };
      });
      setPersoneller(data.filter(p => p.aktif));
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
      // Varsayılan konum seç
      if (data.length > 0 && !seciliKonum) {
        setSeciliKonum(data[0].id);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Grup etiketleri
  const grupEtiketleri = [...new Set(personeller.flatMap(p => p.grupEtiketleri || []))];

  // Resmi tatil kontrolü
  const isResmiTatil = (date: Date): string | null => {
    const tarihStr = formatTarihKey(date);
    for (const tatil of resmiTatiller) {
      const [yil, ay, gun] = tatil.tarih.split('-').map(Number);
      for (let i = 0; i < tatil.sure; i++) {
        const tatilTarih = new Date(yil, ay - 1, gun + i);
        if (formatTarihKey(tatilTarih) === tarihStr) {
          return tatil.isim;
        }
      }
    }
    return null;
  };

  // Vardiya verilerini çek
  const fetchVardiyaData = async () => {
    if (personeller.length === 0) return;
    setDataLoading(true);

    try {
      // Filtrelenmiş personeller
      const filtrelenmis = personeller.filter(p => {
        // Kurucu filtresi (küçük/büyük harf fark etmez)
        const isKurucu = (p.grupEtiketleri || []).some(g => g.toLowerCase() === "kurucu");
        if (!yoneticileriGoster && isKurucu) return false;
        if (seciliGrup !== "tumu" && !(p.grupEtiketleri || []).includes(seciliGrup)) return false;
        return true;
      });

      // İzinleri çek (hem izinler hem vardiyaPlan'daki hafta tatilleri)
      const izinMap = new Map<string, string>();
      try {
        // Haftanın ilk ve son günü
        const haftaBaslangic = haftaGunleri[0];
        const haftaSonu = haftaGunleri[haftaGunleri.length - 1];
        
        // Tüm izinleri getir
        const haftaBasStr = formatTarihKey(haftaBaslangic);
        const haftaSonStr = formatTarihKey(haftaSonu);
        const izinler = await tarihAraligiIzinleriGetir(haftaBasStr, haftaSonStr);
        
        // Her izin için map'e ekle
        izinler.forEach(izin => {
          const start = new Date(izin.baslangicTarihi);
          const end = new Date(izin.bitisTarihi);
          
          if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
              const tarihKey = formatTarihKey(date);
              // Haftanın günleri içinde mi kontrol et
              if (haftaGunleri.some(g => formatTarihKey(g) === tarihKey)) {
                const key = `${izin.personelId}-${tarihKey}`;
                izinMap.set(key, izin.izinTuru);
              }
            }
          }
        });
        
      } catch (e) {
        Sentry.captureException(e);
      }

      const results: PersonelVardiya[] = [];

      for (const personel of filtrelenmis) {
        const gunler: { [key: string]: VardiyaKayit } = {};

        // Her gün için varsayılan değer ve izin kontrolü
        for (const gun of haftaGunleri) {
          const tarihKey = formatTarihKey(gun);
          const izin = izinMap.get(`${personel.id}-${tarihKey}`);
          
          gunler[tarihKey] = izin ? { izin } : {};
        }

        results.push({
          personelId: personel.id,
          personelAd: `${personel.ad} ${personel.soyad}`.trim(),
          sicilNo: personel.sicilNo || "",
          calismaSaati: personel.calismaSaati || "her gün 9:00-18:00",
          gunler
        });
      }

      // Tüm vardiya kayıtlarını çek (sadece bu hafta)
      const haftaBaslangicStr = formatTarihKey(haftaGunleri[0]);
      const haftaBitisStr = formatTarihKey(haftaGunleri[6]);
      
      const vardiyaQuery = query(
        collection(db, "vardiyaPlan"),
        where("tarih", ">=", haftaBaslangicStr),
        where("tarih", "<=", haftaBitisStr)
      );
      const vardiyaSnapshot = await getDocs(vardiyaQuery);
      
      vardiyaSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const personelResult = results.find(r => r.personelId === data.personelId);
        if (personelResult) {
          // İzin varsa üzerine yazma, yoksa vardiya kaydını kullan
          const mevcutIzin = personelResult.gunler[data.tarih]?.izin;
          personelResult.gunler[data.tarih] = {
            giris: data.giris,
            cikis: data.cikis,
            haftaTatili: data.haftaTatili,
            izin: mevcutIzin || data.izin
          };
        }
      });

      // Attendance'dan da hafta tatillerini çek (Puantaj'dan eklenmiş olanlar)
      try {
        const haftaBasDate = new Date(haftaBaslangicStr + "T00:00:00");
        const haftaBitDate = new Date(haftaBitisStr + "T23:59:59");
        const attHaftaQuery = query(
          collection(db, "attendance"),
          where("tip", "==", "haftaTatili"),
          where("tarih", ">=", Timestamp.fromDate(haftaBasDate)),
          where("tarih", "<=", Timestamp.fromDate(haftaBitDate))
        );
        const attHaftaSnap = await getDocs(attHaftaQuery);
        
        attHaftaSnap.forEach(docSnap => {
          const d = docSnap.data();
          const tarih = d.tarih?.toDate?.();
          if (!tarih) return;
          const tarihKey = formatTarihKey(tarih);
          
          const personelResult = results.find(r => r.personelId === d.personelId);
          if (personelResult) {
            // VardiyaPlan'da bu gün için zaten haftaTatili varsa dokunma
            if (!personelResult.gunler[tarihKey]?.haftaTatili) {
              personelResult.gunler[tarihKey] = {
                ...personelResult.gunler[tarihKey],
                haftaTatili: true,
              };
            }
          }
        });
      } catch (e) {
        // attendance haftaTatili çekilemezse sessizce devam et
      }

      setVardiyaData(results);
    } catch (error) {
      Sentry.captureException(error);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    fetchVardiyaData();
  }, [seciliHafta, seciliYil, personeller, seciliGrup, yoneticileriGoster]);

  // Vardiya kaydet
  const handleKaydet = async () => {
    if (!editModal) return;
    
    // Giriş-çıkış için validasyonlar
    if (islemTipi === "giriscikis") {
      // Konum zorunlu
      if (!seciliKonum) {
        alert("Lütfen konum seçiniz!");
        return;
      }
      
      // Saat formatı kontrolü (HH:MM)
      const saatRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!saatRegex.test(girisSaati)) {
        alert("Giriş saati geçersiz! Lütfen saat ve dakikayı tam giriniz. (Örn: 09:00)");
        return;
      }
      if (!saatRegex.test(cikisSaati)) {
        alert("Çıkış saati geçersiz! Lütfen saat ve dakikayı tam giriniz. (Örn: 18:00)");
        return;
      }
    }
    
    setSaving(true);

    try {
      const docId = `${editModal.personelId}_${editModal.tarih}`;
      const docRef = doc(db, "vardiyaPlan", docId);
      const konum = konumlar.find(k => k.id === seciliKonum);

      if (islemTipi === "haftaTatili") {
        await setDoc(docRef, {
          personelId: editModal.personelId,
          personelAd: editModal.personelAd,
          tarih: editModal.tarih,
          haftaTatili: true,
          giris: null,
          cikis: null,
          konumId: null,
          konumAdi: null,
          guncellemeZamani: Timestamp.now(),
          guncelleyenEmail: user.email
        });
      } else {
        await setDoc(docRef, {
          personelId: editModal.personelId,
          personelAd: editModal.personelAd,
          tarih: editModal.tarih,
          giris: girisSaati,
          cikis: cikisSaati,
          haftaTatili: false,
          konumId: seciliKonum,
          konumAdi: konum?.karekod || konum?.ad || "",
          guncellemeZamani: Timestamp.now(),
          guncelleyenEmail: user.email
        });
      }

      setEditModal(null);
      fetchVardiyaData();
    } catch (error) {
      Sentry.captureException(error);
      alert("Kaydetme başarısız!");
    } finally {
      setSaving(false);
    }
  };

  // Kayıt sil
  const handleSil = async () => {
    if (!editModal) return;
    if (!confirm("Bu vardiya kaydını silmek istediğinize emin misiniz?")) return;

    try {
      const docId = `${editModal.personelId}_${editModal.tarih}`;
      await deleteDoc(doc(db, "vardiyaPlan", docId));
      setEditModal(null);
      fetchVardiyaData();
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  // Toplam saat hesapla
  const hesaplaToplam = (gunler: { [key: string]: VardiyaKayit }): string => {
    let toplamDakika = 0;
    
    Object.entries(gunler).forEach(([tarih, kayit]) => {
      if (kayit.giris && kayit.cikis && !kayit.haftaTatili && !kayit.izin) {
        const [girisS, girisD] = kayit.giris.split(':').map(Number);
        const [cikisS, cikisD] = kayit.cikis.split(':').map(Number);
        const dakika = (cikisS * 60 + cikisD) - (girisS * 60 + girisD);
        if (dakika > 0) toplamDakika += dakika;
      }
    });

    const saat = Math.floor(toplamDakika / 60);
    const dakika = toplamDakika % 60;
    return `${saat.toString().padStart(2, '0')}:${dakika.toString().padStart(2, '0')}`;
  };

  // Hücre rengi
  const getHucreClass = (kayit: VardiyaKayit, tarih: Date): string => {
    const base = "px-2 py-3 text-xs text-center border-r border-stone-100 transition";
    const clickable = " cursor-pointer hover:bg-rose-50";
    const notClickable = " cursor-not-allowed";
    
    const resmiTatil = isResmiTatil(tarih);
    if (resmiTatil) return base + notClickable + " bg-green-200 text-green-800";
    if (kayit.izin) return base + notClickable + " bg-yellow-200 text-yellow-800";
    if (kayit.haftaTatili) return base + clickable + " bg-orange-300 text-orange-900";
    if (kayit.giris && kayit.cikis) return base + clickable + " bg-green-50 text-stone-800";
    
    return base + clickable + " bg-white text-stone-400";
  };

  // Hücre içeriği
  const getHucreIcerik = (kayit: VardiyaKayit, tarih: Date): string => {
    const resmiTatil = isResmiTatil(tarih);
    if (resmiTatil) return "Resmi Tatil";
    if (kayit.haftaTatili) return "Hafta Tatili";
    if (kayit.izin) return kayit.izin;
    if (kayit.giris && kayit.cikis) return `${kayit.giris} - ${kayit.cikis}`;
    return "-";
  };

  // Giriş saati değişince çıkış için öneri göster
  const handleGirisSaatiChange = (value: string) => {
    setGirisSaati(value);
    setGirisOnerisi(null);
    const [saat, dakika] = value.split(':').map(Number);
    let cikisSaat = saat + 9;
    // 24 saat üzeriyse düzelt
    if (cikisSaat >= 24) cikisSaat -= 24;
    const oneriSaat = `${cikisSaat.toString().padStart(2, '0')}:${dakika.toString().padStart(2, '0')}`;
    // Her zaman öneri göster
    setCikisOnerisi(oneriSaat);
  };

  // Çıkış saati değişince giriş için öneri göster
  const handleCikisSaatiChange = (value: string) => {
    setCikisSaati(value);
    setCikisOnerisi(null);
    const [saat, dakika] = value.split(':').map(Number);
    let girisSaat = saat - 9;
    if (girisSaat < 0) girisSaat += 24;
    const oneriSaat = `${girisSaat.toString().padStart(2, '0')}:${dakika.toString().padStart(2, '0')}`;
    // Her zaman öneri göster
    setGirisOnerisi(oneriSaat);
  };

  // Hücreye tıkla
  const handleHucreClick = (personelId: string, personelAd: string, tarih: Date, kayit: VardiyaKayit) => {
    const resmiTatil = isResmiTatil(tarih);
    if (resmiTatil) return; // Resmi tatillere tıklanamaz
    if (kayit.izin) return; // İzinli günlere tıklanamaz

    const tarihKey = formatTarihKey(tarih);
    const gunIndex = tarih.getDay() === 0 ? 6 : tarih.getDay() - 1;
    
    // Önerileri temizle
    setGirisOnerisi(null);
    setCikisOnerisi(null);

    if (kayit.haftaTatili) {
      setIslemTipi("haftaTatili");
      setGirisSaati("09:00");
      setCikisSaati("18:00");
    } else {
      setIslemTipi("giriscikis");
      setGirisSaati(kayit.giris || "09:00");
      setCikisSaati(kayit.cikis || "18:00");
    }
    
    setEditModal({
      personelId,
      personelAd,
      tarih: tarihKey,
      gunAdi: gunIsimleri[gunIndex]
    });
  };

  // Haftaları listele
  const haftalar = Array.from({ length: 53 }, (_, i) => i + 1);

  if (!user) return null;

  const haftaBaslangic = formatTarih(haftaGunleri[0]);
  const haftaBitis = formatTarih(haftaGunleri[6]);

  return (
    <div className="min-h-screen bg-stone-50">
      <div>
        <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-stone-800">{seciliHafta}. Hafta - Vardiya Planı</h1>
              <p className="text-sm text-stone-500 mt-1">Haftalık vardiya planı oluşturun ve yönetin. ({haftaBaslangic} - {haftaBitis})</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-300 rounded"></span> Hafta Tatili</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-200 rounded"></span> İzin</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-200 rounded"></span> Resmi Tatil</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-50 border rounded"></span> Çalışma</div>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-stone-500 mb-1">Hafta</label>
              <select
                value={seciliHafta}
                onChange={(e) => setSeciliHafta(Number(e.target.value))}
                className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {haftalar.map(h => {
                  const gunler = getHaftaGunleri(h, seciliYil);
                  const baslangic = `${gunler[0].getDate()}/${gunler[0].getMonth() + 1}`;
                  const bitis = `${gunler[6].getDate()}/${gunler[6].getMonth() + 1}`;
                  return (
                    <option key={h} value={h}>
                      {h}. Hafta ({baslangic} - {bitis})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs text-stone-500 mb-1">Yıl</label>
              <select
                value={seciliYil}
                onChange={(e) => setSeciliYil(Number(e.target.value))}
                className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {[2024, 2025, 2026, 2027].map(yil => (
                  <option key={yil} value={yil}>{yil}</option>
                ))}
              </select>
            </div>

            <div className="h-8 w-px bg-stone-200 hidden sm:block"></div>

            <div>
              <label className="block text-xs text-stone-500 mb-1">Grup</label>
              <select
                value={seciliGrup}
                onChange={(e) => setSeciliGrup(e.target.value)}
                className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="tumu">Tüm Gruplar</option>
                {grupEtiketleri.map(grup => (
                  <option key={grup} value={grup}>{grup}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-stone-500 mb-1">Kurucular</label>
              <button
                onClick={() => setYoneticileriGoster(!yoneticileriGoster)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  yoneticileriGoster 
                    ? "bg-rose-500 text-white" 
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {yoneticileriGoster ? "Göster ✓" : "Gizli"}
              </button>
            </div>
          </div>
        </div>

        {/* Hafta Başlığı */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-stone-800">
            {seciliHafta}. Hafta ({haftaBaslangic} - {haftaBitis})
          </h2>
        </div>

        {/* Tablo */}
        {dataLoading ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500 mx-auto"></div>
            <p className="text-stone-500 mt-4">Veriler yükleniyor...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium text-stone-600 border-b border-r sticky left-0 bg-stone-50 z-10 min-w-[100px]">Sicil No</th>
                    <th className="px-3 py-3 text-left font-medium text-stone-600 border-b border-r sticky left-[100px] bg-stone-50 z-10 min-w-[140px]">Ad Soyad</th>
                    <th className="px-3 py-3 text-left font-medium text-stone-600 border-b border-r min-w-[120px]">Çalışma Saati</th>
                    {haftaGunleri.map((gun, i) => (
                      <th key={i} className="px-2 py-2 text-center font-medium border-b border-r min-w-[110px]">
                        <div className="text-xs text-stone-600">{gunIsimleri[i]}</div>
                        <div className="text-xs text-stone-400">{formatTarih(gun).split(' ').slice(0, 2).join(' ')}</div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-medium text-stone-600 border-b min-w-[80px]">Toplam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {vardiyaData.map(personel => (
                    <tr key={personel.personelId} className="hover:bg-stone-50">
                      <td className="px-3 py-3 text-stone-600 sticky left-0 bg-white z-10 border-r">{personel.sicilNo}</td>
                      <td className="px-3 py-3 font-medium text-stone-800 sticky left-[100px] bg-white z-10 border-r whitespace-nowrap">{personel.personelAd}</td>
                      <td className="px-3 py-3 text-xs text-stone-500 border-r">{personel.calismaSaati}</td>
                      {haftaGunleri.map((gun, i) => {
                        const tarihKey = formatTarihKey(gun);
                        const kayit = personel.gunler[tarihKey] || {};
                        return (
                          <td
                            key={i}
                            className={getHucreClass(kayit, gun)}
                            onClick={() => handleHucreClick(personel.personelId, personel.personelAd, gun, kayit)}
                          >
                            {getHucreIcerik(kayit, gun)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center font-semibold text-stone-800">{hesaplaToplam(personel.gunler)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Alt Butonlar */}
        <div className="flex flex-col md:flex-row gap-3 justify-center mt-6">
          <button
            onClick={() => window.print()}
            className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
          >
            🖨️ Yazdır / PDF
          </button>
          <button
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
          >
            📥 Excel İndir
          </button>
        </div>
        </main>
      </div>

      {/* Düzenleme Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-stone-800 mb-4">Vardiya Düzenle</h3>
            
            <div className="mb-4 p-3 bg-stone-50 rounded-lg">
              <p className="text-sm text-stone-600"><strong>Personel:</strong> {editModal.personelAd}</p>
              <p className="text-sm text-stone-600"><strong>Gün:</strong> {editModal.gunAdi} - {editModal.tarih}</p>
            </div>

            {/* Tip Seçimi */}
            <div className="mb-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setIslemTipi("giriscikis")}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    islemTipi === "giriscikis" 
                      ? "bg-rose-500 text-white" 
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  🟢🔴 Giriş & Çıkış
                </button>
                <button
                  onClick={() => setIslemTipi("haftaTatili")}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    islemTipi === "haftaTatili" 
                      ? "bg-orange-500 text-white" 
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  🟠 Hafta Tatili
                </button>
              </div>
            </div>

            {/* Giriş & Çıkış Saatleri */}
            {islemTipi === "giriscikis" && (
              <div className="mb-6 space-y-4">
                {/* Konum Seçimi */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">📍 Konum</label>
                  <select
                    value={seciliKonum}
                    onChange={(e) => setSeciliKonum(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                  >
                    <option value="">Konum Seçiniz</option>
                    {konumlar.map(k => (
                      <option key={k.id} value={k.id}>{k.karekod || k.ad}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-green-700 mb-2">🟢 Giriş Saati</label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={girisSaati}
                      onChange={(e) => handleGirisSaatiChange(e.target.value)}
                      className="flex-1 px-4 py-3 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-lg bg-green-50"
                    />
                    {girisOnerisi && (
                      <button
                        onClick={() => {
                          setGirisSaati(girisOnerisi);
                          setGirisOnerisi(null);
                          setCikisOnerisi(null);
                        }}
                        className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm font-medium border border-green-300 transition whitespace-nowrap"
                      >
                        {girisOnerisi} ?
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-red-700 mb-2">🔴 Çıkış Saati</label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={cikisSaati}
                      onChange={(e) => handleCikisSaatiChange(e.target.value)}
                      className="flex-1 px-4 py-3 border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-lg bg-red-50"
                    />
                    {cikisOnerisi && (
                      <button
                        onClick={() => {
                          setCikisSaati(cikisOnerisi);
                          setCikisOnerisi(null);
                          setGirisOnerisi(null);
                        }}
                        className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium border border-red-300 transition whitespace-nowrap"
                      >
                        {cikisOnerisi} ?
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-stone-500 text-center">💡 Saatleri değiştirince yanda öneri çıkar, basarsan uygular</p>
              </div>
            )}

            {islemTipi === "haftaTatili" && (
              <div className="mb-6 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-700">Bu gün <strong>Hafta Tatili</strong> olarak işaretlenecek.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSil}
                className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition"
              >
                Sil
              </button>
              <button
                onClick={() => setEditModal(null)}
                className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50 transition"
              >
                İptal
              </button>
              <button
                onClick={handleKaydet}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition disabled:opacity-50"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}