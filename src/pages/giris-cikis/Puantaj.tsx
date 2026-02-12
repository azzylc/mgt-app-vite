import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, where, Timestamp, getDocs, addDoc, deleteDoc, updateDoc, doc } from "firebase/firestore";
import { resmiTatiller } from "../../lib/data";
import { izinMapOlustur } from "../../lib/izinHelper";
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
}

interface GunKayit {
  giris?: { id: string; saat: string };
  cikis?: { id: string; saat: string };
  haftaTatili?: { id: string; kaynak: "attendance" | "vardiyaPlan" };
  resmiTatilIptal?: { id: string };
  durum: "normal" | "haftaTatili" | "resmiTatil" | "izin" | "mazeret";
  izinTuru?: string;
  resmiTatilAdi?: string;
}

interface PersonelPuantaj {
  personelId: string;
  personelAd: string;
  sicilNo: string;
  gunler: { [key: number]: GunKayit };
}

interface PuantajDevamKayit {
  id: string;
  tip: string;
  tarihDate: Date;
  personelId?: string;
  mazeretNotu?: string;
  [key: string]: unknown;
}

export default function PuantajPage() {
  const user = useAuth();
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [puantajData, setPuantajData] = useState<PersonelPuantaj[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  // Ay seçimi
  const [seciliAy, setSeciliAy] = useState(new Date().getMonth());
  const [seciliYil, setSeciliYil] = useState(new Date().getFullYear());

  // İşlem modal
  const [islemModal, setIslemModal] = useState<{ 
    personelId: string; 
    personelAd: string; 
    gun: number;
    resmiTatilIptalId?: string;
    resmiTatilAdi?: string;
  } | null>(null);
  const [girisSaati, setGirisSaati] = useState("09:00");
  const [cikisSaati, setCikisSaati] = useState("18:00");
  const [islemTipi, setIslemTipi] = useState<"giris" | "cikis" | "giriscikis" | "haftaTatili">("giriscikis");
  const [saving, setSaving] = useState(false);
  const [girisOnerisi, setGirisOnerisi] = useState<string | null>(null);
  const [cikisOnerisi, setCikisOnerisi] = useState<string | null>(null);
  const [eksikCikisSaatleri, setEksikCikisSaatleri] = useState<{[key: string]: string}>({});

  // Hover state for delete
  const [hoverCell, setHoverCell] = useState<string | null>(null);

  // Konum
  const [konumlar, setKonumlar] = useState<{id: string; ad: string; karekod: string}[]>([]);
  const [seciliKonum, setSeciliKonum] = useState<string>("");

  // Filtreler
  const [seciliGrup, setSeciliGrup] = useState<string>("tumu");
  const [yoneticileriGoster, setYoneticileriGoster] = useState(false);

  const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const gunIsimleri = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

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
          yonetici: doc.data().yonetici === true
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
      // Varsayılan konum seç (ilk konum)
      if (data.length > 0 && !seciliKonum) {
        setSeciliKonum(data[0].id);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Grup etiketleri listesi (tüm personellerden unique grupları topla)
  const grupEtiketleri = [...new Set(personeller.flatMap(p => p.grupEtiketleri || []))];

  // Filtrelenmiş personeller
  const filtrelenmisPersoneller = personeller.filter(p => {
    // Kurucu filtresi
    if (!yoneticileriGoster && (p.grupEtiketleri || []).some(g => g.toLowerCase() === "kurucu")) return false;
    // Grup filtresi (array içinde ara)
    if (seciliGrup !== "tumu" && !(p.grupEtiketleri || []).includes(seciliGrup)) return false;
    return true;
  });

  // Aydaki gün sayısı
  const gunSayisi = new Date(seciliYil, seciliAy + 1, 0).getDate();

  // Resmi tatil kontrolü
  const getResmiTatil = (gun: number): string | null => {
    const tarih = new Date(seciliYil, seciliAy, gun);
    const tarihGun = tarih.getDate();
    const tarihAy = tarih.getMonth();
    const tarihYil = tarih.getFullYear();
    
    for (const tatil of resmiTatiller) {
      // Tarihi parçala (timezone sorununu önle)
      const [yil, ay, g] = tatil.tarih.split('-').map(Number);
      
      for (let i = 0; i < tatil.sure; i++) {
        const tatilTarih = new Date(yil, ay - 1, g + i);
        if (tatilTarih.getDate() === tarihGun && 
            tatilTarih.getMonth() === tarihAy && 
            tatilTarih.getFullYear() === tarihYil) {
          return tatil.isim;
        }
      }
    }
    return null;
  };

  // Verileri yükle
  const fetchData = async () => {
    if (!user || personeller.length === 0) return;
    setDataLoading(true);

    try {
      const ayBaslangic = new Date(seciliYil, seciliAy, 1, 0, 0, 0, 0);
      const ayBitis = new Date(seciliYil, seciliAy + 1, 0, 23, 59, 59, 999);

      const attendanceQuery = query(
        collection(db, "attendance"),
        where("tarih", ">=", Timestamp.fromDate(ayBaslangic)),
        where("tarih", "<=", Timestamp.fromDate(ayBitis)),
        orderBy("tarih", "asc")
      );

      const attendanceSnap = await getDocs(attendanceQuery);
      
      const kayitlar = new Map<string, PuantajDevamKayit[]>();
      attendanceSnap.forEach(docSnap => {
        const d = docSnap.data();
        const tarih = d.tarih?.toDate?.();
        if (!tarih) return;
        
        const gun = tarih.getDate();
        const key = `${d.personelId}-${gun}`;
        
        if (!kayitlar.has(key)) kayitlar.set(key, []);
        kayitlar.get(key)!.push({ id: docSnap.id, ...d, tarihDate: tarih } as PuantajDevamKayit);
      });

      // İzinleri çek (hem izinler hem vardiyaPlan'daki hafta tatilleri)
      const izinMap = new Map<string, string>();
      try {
        // Ayın başı ve sonu
        const ayBaslangic = new Date(seciliYil, seciliAy, 1);
        const aySonu = new Date(seciliYil, seciliAy + 1, 0);
        
        const tempMap = await izinMapOlustur(ayBaslangic, aySonu, "gun");
        // Map'i kopyala
        tempMap.forEach((value, key) => {
          izinMap.set(key, value);
        });
        
      } catch (e) {
        Sentry.captureException(e);
      }

      // VardiyaPlan'dan hafta tatillerini çek
      const vardiyaHaftaTatilMap = new Map<string, string>(); // key: personelId-gun, value: docId
      try {
        const ayBasStr = `${seciliYil}-${String(seciliAy + 1).padStart(2, '0')}-01`;
        const aySonGun = new Date(seciliYil, seciliAy + 1, 0).getDate();
        const ayBitStr = `${seciliYil}-${String(seciliAy + 1).padStart(2, '0')}-${String(aySonGun).padStart(2, '0')}`;
        
        const vpQuery = query(
          collection(db, "vardiyaPlan"),
          where("haftaTatili", "==", true),
          where("tarih", ">=", ayBasStr),
          where("tarih", "<=", ayBitStr)
        );
        const vpSnap = await getDocs(vpQuery);
        vpSnap.forEach(docSnap => {
          const d = docSnap.data();
          const gun = parseInt(d.tarih.split('-')[2]);
          const key = `${d.personelId}-${gun}`;
          vardiyaHaftaTatilMap.set(key, docSnap.id);
        });
      } catch (e) {
        Sentry.captureException(e);
      }

      // Her personel için puantaj oluştur
      const results: PersonelPuantaj[] = [];

      for (const personel of personeller) {
        const gunler: { [key: number]: GunKayit } = {};

        for (let gun = 1; gun <= gunSayisi; gun++) {
          const key = `${personel.id}-${gun}`;
          const gunKayitlari = kayitlar.get(key) || [];
          const izin = izinMap.get(key);

          let kayit: GunKayit = { durum: "normal" };

          // Resmi tatil iptal kaydı var mı?
          const resmiTatilIptalKayit = gunKayitlari.find((k) => k.tip === "resmiTatilIptal");
          
          // Resmi tatil mi?
          const resmiTatil = getResmiTatil(gun);
          if (resmiTatil && !resmiTatilIptalKayit) {
            kayit.durum = "resmiTatil";
            kayit.resmiTatilAdi = resmiTatil;
          }
          // Resmi tatil iptal edilmişse, iptal kaydını tut (geri almak için)
          if (resmiTatilIptalKayit) {
            kayit.resmiTatilIptal = { id: resmiTatilIptalKayit.id };
            if (resmiTatil) {
              kayit.resmiTatilAdi = resmiTatil; // İptal edilmiş olsa bile adını tut
            }
          }
          // İzinli mi? (Haftalık İzin ise haftaTatili olarak göster)
          else if (izin) {
            if (izin === "Haftalık İzin") {
              // izinHelper'dan gelen hafta tatili — vardiyaPlan kaynaklı olabilir
              const vpDocId = vardiyaHaftaTatilMap.get(key);
              kayit.durum = "haftaTatili";
              kayit.haftaTatili = { id: vpDocId || "", kaynak: "vardiyaPlan" };
            } else {
              kayit.durum = "izin";
              kayit.izinTuru = izin;
            }
          }
          // Mazeretli mi?
          else if (gunKayitlari.some((k) => k.mazeretNotu)) {
            kayit.durum = "mazeret";
          }

          // Hafta tatili kaydı var mı? (attendance'dan — Puantaj'dan eklenen)
          const haftaTatiliKayit = gunKayitlari.find((k) => k.tip === "haftaTatili");
          if (haftaTatiliKayit) {
            kayit.durum = "haftaTatili";
            kayit.haftaTatili = { id: haftaTatiliKayit.id, kaynak: "attendance" };
          }
          // VardiyaPlan'dan hafta tatili var mı? (attendance'da yoksa)
          else if (!kayit.haftaTatili && vardiyaHaftaTatilMap.has(key)) {
            kayit.durum = "haftaTatili";
            kayit.haftaTatili = { id: vardiyaHaftaTatilMap.get(key)!, kaynak: "vardiyaPlan" };
          }

          // Giriş kaydı
          const girisler = gunKayitlari.filter((k) => k.tip === "giris").sort((a, b) => a.tarihDate.getTime() - b.tarihDate.getTime());
          if (girisler.length > 0) {
            const ilkGiris = girisler[0];
            kayit.giris = {
              id: ilkGiris.id,
              saat: ilkGiris.tarihDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            };
          }

          // Çıkış kaydı
          const cikislar = gunKayitlari.filter((k) => k.tip === "cikis").sort((a, b) => b.tarihDate.getTime() - a.tarihDate.getTime());
          if (cikislar.length > 0) {
            const sonCikis = cikislar[0];
            kayit.cikis = {
              id: sonCikis.id,
              saat: sonCikis.tarihDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            };
          }

          gunler[gun] = kayit;
        }

        results.push({
          personelId: personel.id,
          personelAd: `${personel.ad} ${personel.soyad}`.trim(),
          sicilNo: personel.sicilNo || "",
          gunler
        });
      }

      results.sort((a, b) => a.personelAd.localeCompare(b.personelAd, 'tr'));
      setPuantajData(results);
    } catch (error) {
      Sentry.captureException(error);
      alert("Veri çekilirken hata oluştu!");
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (personeller.length > 0) {
      fetchData();
    }
  }, [seciliAy, seciliYil, personeller]);

  // Hücreye tıklayınca modal aç
  const handleHucreClick = (personelId: string, personelAd: string, gun: number, tip: "giris" | "cikis") => {
    // İzinli günlere ekleme yapılmasın (ama resmi tatile eklenebilsin)
    const kayit = puantajData.find(p => p.personelId === personelId)?.gunler[gun];
    if (kayit && kayit.durum === "izin") return;
    
    // Mevcut kayıtları kontrol et
    const mevcutGiris = kayit?.giris?.saat || "";
    const mevcutCikis = kayit?.cikis?.saat || "";
    
    // Tıklanan hücreye göre tip belirle
    if (tip === "giris") {
      setIslemTipi("giris");
      setGirisSaati(mevcutGiris || "09:00");
      setCikisSaati(mevcutCikis || "18:00");
    } else {
      setIslemTipi("cikis");
      setCikisSaati(mevcutCikis || "18:00");
      setGirisSaati(mevcutGiris || "09:00");
    }
    
    setGirisOnerisi(null);
    setCikisOnerisi(null);
    
    setIslemModal({ 
      personelId, 
      personelAd, 
      gun,
      resmiTatilIptalId: kayit?.resmiTatilIptal?.id,
      resmiTatilAdi: kayit?.resmiTatilAdi
    });
  };

  // Giriş saati değişince çıkış için öneri göster
  const handleGirisSaatiChange = (value: string) => {
    setGirisSaati(value);
    setGirisOnerisi(null);
    if (!value || !value.includes(':')) return;
    const [saat, dakika] = value.split(':').map(Number);
    if (isNaN(saat) || isNaN(dakika)) return;
    let cikisSaat = saat + 9;
    if (cikisSaat >= 24) cikisSaat -= 24;
    const oneriSaat = `${cikisSaat.toString().padStart(2, '0')}:${dakika.toString().padStart(2, '0')}`;
    setCikisOnerisi(oneriSaat);
  };

  const handleCikisSaatiChange = (value: string) => {
    setCikisSaati(value);
    setCikisOnerisi(null);
    if (!value || !value.includes(':')) return;
    const [saat, dakika] = value.split(':').map(Number);
    if (isNaN(saat) || isNaN(dakika)) return;
    let girisSaat = saat - 9;
    if (girisSaat < 0) girisSaat += 24;
    const oneriSaat = `${girisSaat.toString().padStart(2, '0')}:${dakika.toString().padStart(2, '0')}`;
    setGirisOnerisi(oneriSaat);
  };

  // Kayıt sil
  const handleDelete = async (kayitId: string, personelAd: string, tip: string, kaynak: "attendance" | "vardiyaPlan" = "attendance") => {
    if (!confirm(`${tip} kaydını silmek istediğinize emin misiniz?`)) return;
    
    try {
      const collectionName = kaynak === "vardiyaPlan" ? "vardiyaPlan" : "attendance";
      await deleteDoc(doc(db, collectionName, kayitId));
      
      await addDoc(collection(db, "attendanceChanges"), {
        degisiklikYapan: user.email,
        degisiklikTarihi: Timestamp.now(),
        degisiklikTuru: "Kayıt Silindi",
        oncekiDeger: tip,
        sonrakiDeger: "",
        kullaniciAdi: personelAd,
        konum: "",
        girisCikisTarih: Timestamp.now()
      });

      fetchData();
    } catch (error) {
      Sentry.captureException(error);
      alert("Silme işlemi başarısız!");
    }
  };

  // Resmi tatili kaldır/geri al
  const handleResmiTatilToggle = async (personelId: string, personelAd: string, gun: number, iptalKayitId?: string) => {
    try {
      const tarih = new Date(seciliYil, seciliAy, gun);
      tarih.setHours(0, 0, 0, 0);
      
      if (iptalKayitId) {
        // İptal kaydı var, sil (resmi tatil geri gelsin)
        await deleteDoc(doc(db, "attendance", iptalKayitId));
        
        await addDoc(collection(db, "attendanceChanges"), {
          degisiklikYapan: user.email,
          degisiklikTarihi: Timestamp.now(),
          degisiklikTuru: "Kayıt Eklendi",
          oncekiDeger: "",
          sonrakiDeger: "Resmi Tatil Geri Alındı",
          kullaniciAdi: personelAd,
          konum: "",
          girisCikisTarih: Timestamp.fromDate(tarih)
        });
      } else {
        // İptal kaydı yok, ekle (resmi tatil kaldırılsın)
        await addDoc(collection(db, "attendance"), {
          personelId: personelId,
          personelAd: personelAd,
          personelEmail: "",
          sicilNo: "",
          tip: "resmiTatilIptal",
          tarih: Timestamp.fromDate(tarih),
          konumId: "",
          konumAdi: "",
          kayitOrtami: "Puantaj",
          manuelKayit: true,
          mazeretNotu: "",
          ekleyenEmail: user.email,
          olusturmaTarihi: Timestamp.now()
        });

        await addDoc(collection(db, "attendanceChanges"), {
          degisiklikYapan: user.email,
          degisiklikTarihi: Timestamp.now(),
          degisiklikTuru: "Kayıt Silindi",
          oncekiDeger: "Resmi Tatil",
          sonrakiDeger: "",
          kullaniciAdi: personelAd,
          konum: "",
          girisCikisTarih: Timestamp.fromDate(tarih)
        });
      }
      
      fetchData();
    } catch (error) {
      Sentry.captureException(error);
      alert("İşlem başarısız!");
    }
  };

  // Kaydet
  const handleKaydet = async () => {
    if (!islemModal) return;
    
    // Giriş-çıkış için validasyonlar
    if (islemTipi === "giris" || islemTipi === "cikis" || islemTipi === "giriscikis") {
      // Konum zorunlu
      if (!seciliKonum) {
        alert("Lütfen konum seçiniz!");
        return;
      }
      
      // Saat formatı kontrolü (HH:MM)
      const saatRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if ((islemTipi === "giris" || islemTipi === "giriscikis") && !saatRegex.test(girisSaati)) {
        alert("Giriş saati geçersiz! Lütfen saat ve dakikayı tam giriniz. (Örn: 09:00)");
        return;
      }
      if ((islemTipi === "cikis" || islemTipi === "giriscikis") && !saatRegex.test(cikisSaati)) {
        alert("Çıkış saati geçersiz! Lütfen saat ve dakikayı tam giriniz. (Örn: 18:00)");
        return;
      }
    }
    
    setSaving(true);
    
    try {
      const personelKayit = puantajData.find(p => p.personelId === islemModal.personelId)?.gunler[islemModal.gun];
      
      if (islemTipi === "haftaTatili") {
        const tarih = new Date(seciliYil, seciliAy, islemModal.gun);
        // Önce o günün mevcut giriş/çıkış kayıtlarını sil ve logla
        if (personelKayit?.giris?.id) {
          await deleteDoc(doc(db, "attendance", personelKayit.giris.id));
          await addDoc(collection(db, "attendanceChanges"), {
            degisiklikYapan: user.email,
            degisiklikTarihi: Timestamp.now(),
            degisiklikTuru: "Kayıt Silindi",
            oncekiDeger: `Giriş - ${personelKayit.giris.saat}`,
            sonrakiDeger: "",
            kullaniciAdi: islemModal.personelAd,
            konum: "",
            girisCikisTarih: Timestamp.fromDate(tarih)
          });
        }
        if (personelKayit?.cikis?.id) {
          await deleteDoc(doc(db, "attendance", personelKayit.cikis.id));
          await addDoc(collection(db, "attendanceChanges"), {
            degisiklikYapan: user.email,
            degisiklikTarihi: Timestamp.now(),
            degisiklikTuru: "Kayıt Silindi",
            oncekiDeger: `Çıkış - ${personelKayit.cikis.saat}`,
            sonrakiDeger: "",
            kullaniciAdi: islemModal.personelAd,
            konum: "",
            girisCikisTarih: Timestamp.fromDate(tarih)
          });
        }
        
        // Hafta tatili kaydı
        tarih.setHours(0, 0, 0, 0);
        const tarihStr = `${seciliYil}-${String(seciliAy + 1).padStart(2, "0")}-${String(islemModal.gun).padStart(2, "0")}`;
        
        // Personel detaylarını bul
        const htPersonel = personeller.find(p => p.id === islemModal.personelId);
        const htPersonelAd = htPersonel?.ad || islemModal.personelAd.split(" ")[0] || "";
        const htPersonelSoyad = htPersonel?.soyad || islemModal.personelAd.split(" ").slice(1).join(" ") || "";
        const htSicilNo = htPersonel?.sicilNo || "";

        // 1) attendance kaydı
        const attendanceRef = await addDoc(collection(db, "attendance"), {
          personelId: islemModal.personelId,
          personelAd: islemModal.personelAd,
          personelEmail: "",
          sicilNo: htSicilNo,
          tip: "haftaTatili",
          tarih: Timestamp.fromDate(tarih),
          konumId: "",
          konumAdi: "Hafta Tatili",
          kayitOrtami: "Puantaj",
          manuelKayit: true,
          mazeretNotu: "",
          ekleyenEmail: user.email,
          olusturmaTarihi: Timestamp.now()
        });

        // 2) attendanceChanges log
        await addDoc(collection(db, "attendanceChanges"), {
          degisiklikYapan: user.email,
          degisiklikTarihi: Timestamp.now(),
          degisiklikTuru: "Kayıt Eklendi",
          oncekiDeger: "",
          sonrakiDeger: "Hafta Tatili",
          kullaniciAdi: islemModal.personelAd,
          konum: "",
          girisCikisTarih: Timestamp.fromDate(tarih)
        });

        // 3) izinDegisiklikKayitlari log
        await addDoc(collection(db, "izinDegisiklikKayitlari"), {
          degisikligiYapan: islemModal.personelAd,
          degisiklikTarihi: new Date().toISOString(),
          degisiklikTuru: "İzin Eklendi",
          degisiklikOncesi: "",
          degisiklikSonrasi: `Haftalık İzin | ${tarihStr} - ${tarihStr} | 1 gün | Puantajdan eklenen hafta tatili`,
          kullaniciAdi: user?.email?.split("@")[0] || "",
        });
      } else {
        // Giriş ve/veya Çıkış kaydı
        const konum = konumlar.find(k => k.id === seciliKonum);
        const kaydedilecekGiris = islemTipi === "giris" || islemTipi === "giriscikis";
        const kaydedilecekCikis = islemTipi === "cikis" || islemTipi === "giriscikis";
        
        // Giriş kaydı
        if (kaydedilecekGiris && girisSaati) {
          const girisTarih = new Date(seciliYil, seciliAy, islemModal.gun);
          const [gSaat, gDakika] = girisSaati.split(':').map(Number);
          girisTarih.setHours(gSaat, gDakika, 0, 0);

          const mevcutGirisId = personelKayit?.giris?.id;
          const oncekiSaat = personelKayit?.giris?.saat || "";

          if (mevcutGirisId) {
            // Mevcut kaydı güncelle
            await updateDoc(doc(db, "attendance", mevcutGirisId), {
              tarih: Timestamp.fromDate(girisTarih),
              konumId: seciliKonum,
              konumAdi: konum?.karekod || konum?.ad || "Puantaj",
              ekleyenEmail: user.email,
              olusturmaTarihi: Timestamp.now()
            });

            await addDoc(collection(db, "attendanceChanges"), {
              degisiklikYapan: user.email,
              degisiklikTarihi: Timestamp.now(),
              degisiklikTuru: "Kayıt Güncellendi",
              oncekiDeger: `Giriş - ${oncekiSaat}`,
              sonrakiDeger: `Giriş - ${girisSaati}`,
              kullaniciAdi: islemModal.personelAd,
              konum: konum?.karekod || konum?.ad || "Puantaj",
              girisCikisTarih: Timestamp.fromDate(girisTarih)
            });
          } else {
            // Yeni kayıt ekle
            await addDoc(collection(db, "attendance"), {
              personelId: islemModal.personelId,
              personelAd: islemModal.personelAd,
              personelEmail: "",
              sicilNo: "",
              tip: "giris",
              tarih: Timestamp.fromDate(girisTarih),
              konumId: seciliKonum,
              konumAdi: konum?.karekod || konum?.ad || "Puantaj",
              kayitOrtami: "Puantaj",
              manuelKayit: true,
              mazeretNotu: "",
              ekleyenEmail: user.email,
              olusturmaTarihi: Timestamp.now()
            });

            await addDoc(collection(db, "attendanceChanges"), {
              degisiklikYapan: user.email,
              degisiklikTarihi: Timestamp.now(),
              degisiklikTuru: "Kayıt Eklendi",
              oncekiDeger: "",
              sonrakiDeger: "Giriş",
              kullaniciAdi: islemModal.personelAd,
              konum: konum?.karekod || konum?.ad || "Puantaj",
              girisCikisTarih: Timestamp.fromDate(girisTarih)
            });
          }
        }
        
        // Çıkış kaydı
        if (kaydedilecekCikis && cikisSaati) {
          const cikisTarih = new Date(seciliYil, seciliAy, islemModal.gun);
          const [cSaat, cDakika] = cikisSaati.split(':').map(Number);
          cikisTarih.setHours(cSaat, cDakika, 0, 0);

          const mevcutCikisId = personelKayit?.cikis?.id;
          const oncekiSaat = personelKayit?.cikis?.saat || "";

          if (mevcutCikisId) {
            // Mevcut kaydı güncelle
            await updateDoc(doc(db, "attendance", mevcutCikisId), {
              tarih: Timestamp.fromDate(cikisTarih),
              konumId: seciliKonum,
              konumAdi: konum?.karekod || konum?.ad || "Puantaj",
              ekleyenEmail: user.email,
              olusturmaTarihi: Timestamp.now()
            });

            await addDoc(collection(db, "attendanceChanges"), {
              degisiklikYapan: user.email,
              degisiklikTarihi: Timestamp.now(),
              degisiklikTuru: "Kayıt Güncellendi",
              oncekiDeger: `Çıkış - ${oncekiSaat}`,
              sonrakiDeger: `Çıkış - ${cikisSaati}`,
              kullaniciAdi: islemModal.personelAd,
              konum: konum?.karekod || konum?.ad || "Puantaj",
              girisCikisTarih: Timestamp.fromDate(cikisTarih)
            });
          } else {
            // Yeni kayıt ekle
            await addDoc(collection(db, "attendance"), {
              personelId: islemModal.personelId,
              personelAd: islemModal.personelAd,
              personelEmail: "",
              sicilNo: "",
              tip: "cikis",
              tarih: Timestamp.fromDate(cikisTarih),
              konumId: seciliKonum,
              konumAdi: konum?.karekod || konum?.ad || "Puantaj",
              kayitOrtami: "Puantaj",
              manuelKayit: true,
              mazeretNotu: "",
              ekleyenEmail: user.email,
              olusturmaTarihi: Timestamp.now()
            });

            await addDoc(collection(db, "attendanceChanges"), {
              degisiklikYapan: user.email,
              degisiklikTarihi: Timestamp.now(),
              degisiklikTuru: "Kayıt Eklendi",
              oncekiDeger: "",
              sonrakiDeger: "Çıkış",
              kullaniciAdi: islemModal.personelAd,
              konum: konum?.karekod || konum?.ad || "Puantaj",
              girisCikisTarih: Timestamp.fromDate(cikisTarih)
            });
          }
        }
      }

      setIslemModal(null);
      fetchData();
    } catch (error) {
      Sentry.captureException(error);
      alert("Kayıt eklenirken hata oluştu!");
    } finally {
      setSaving(false);
    }
  };

  // Hücre rengi
  const getHucreClass = (kayit: GunKayit, tip: "giris" | "cikis"): string => {
    const base = "px-2 py-3 text-xs text-center border-r border-[#E5E5E5] transition cursor-pointer hover:bg-rose-50 relative group min-w-[50px]";
    
    if (kayit.durum === "haftaTatili") return base + " bg-orange-300 text-orange-900 font-medium";
    if (kayit.durum === "izin" && kayit.izinTuru === "Haftalık İzin") return base + " bg-orange-300 text-orange-900 font-medium cursor-not-allowed";
    if (kayit.durum === "izin") return base + " bg-yellow-300 text-yellow-900 font-medium cursor-not-allowed";
    if (kayit.durum === "mazeret") return base + " bg-yellow-200 text-[#E6B566]";
    
    // Resmi tatil - ama giriş/çıkış kaydı varsa farklı renk
    if (kayit.durum === "resmiTatil") {
      if (tip === "giris" && kayit.giris) return base + " bg-green-200 text-green-800 font-medium";
      if (tip === "cikis" && kayit.cikis) return base + " bg-green-200 text-[#D96C6C] font-medium";
      return base + " bg-green-300 text-green-900 font-medium";
    }
    
    if (tip === "giris" && kayit.giris) return base + " bg-[#EAF2ED] text-green-800 font-medium";
    if (tip === "cikis" && kayit.cikis) return base + " bg-[#D96C6C]/10 text-red-800 font-medium";
    
    return base + " bg-white text-[#8A8A8A] hover:text-rose-500";
  };

  // Hücre içeriği
  const getHucreIcerik = (kayit: GunKayit, tip: "giris" | "cikis"): string => {
    if (kayit.durum === "haftaTatili") return "Hafta T.";
    if (kayit.durum === "izin" && kayit.izinTuru === "Haftalık İzin") return "Hafta T.";
    if (kayit.durum === "izin") return kayit.izinTuru?.substring(0, 6) || "İzin";
    if (kayit.durum === "mazeret") return "Mazeret";
    
    // Resmi tatil - giriş/çıkış kaydı varsa saati göster, yoksa tire
    if (kayit.durum === "resmiTatil") {
      if (tip === "giris") return kayit.giris?.saat || "Resmi T.";
      if (tip === "cikis") return kayit.cikis?.saat || (kayit.giris ? "-" : "Resmi T.");
    }
    
    if (tip === "giris") return kayit.giris?.saat || "-";
    if (tip === "cikis") return kayit.cikis?.saat || "-";
    
    return "-";
  };

  // Eksik çıkış kayıtlarını bul (filtrelenmiş)
  const eksikCikislar = puantajData
    .filter(personel => {
      const p = personeller.find(per => per.id === personel.personelId);
      if (!p) return true;
      if (!yoneticileriGoster && (p.grupEtiketleri || []).some(g => g.toLowerCase() === "kurucu")) return false;
      if (seciliGrup !== "tumu" && !(p.grupEtiketleri || []).includes(seciliGrup)) return false;
      return true;
    })
    .flatMap(personel => {
      const eksikler: { personelAd: string; personelId: string; gun: number; girisSaat: string }[] = [];
      
      Object.entries(personel.gunler).forEach(([gunStr, kayit]) => {
        const gun = parseInt(gunStr);
        // Giriş var ama çıkış yok (ve hafta tatili veya izin değilse)
        // Bugünü hariç tut — henüz mesai bitmemiş olabilir
        const bugun = new Date();
        const bugunGun = bugun.getDate();
        const bugunAy = bugun.getMonth();
        const bugunYil = bugun.getFullYear();
        const isBugun = gun === bugunGun && seciliAy === bugunAy && seciliYil === bugunYil;
        
        if (kayit.giris && !kayit.cikis && !isBugun && kayit.durum !== "haftaTatili" && kayit.durum !== "izin") {
          eksikler.push({
            personelAd: personel.personelAd,
            personelId: personel.personelId,
            gun,
            girisSaat: kayit.giris.saat
          });
        }
      });
      
      return eksikler;
    }).sort((a, b) => a.gun - b.gun);

  // Excel export (filtrelenmiş)
  const exportToExcel = () => {
    const filtrelenmis = puantajData.filter(personel => {
      const p = personeller.find(per => per.id === personel.personelId);
      if (!p) return true;
      if (!yoneticileriGoster && (p.grupEtiketleri || []).some(g => g.toLowerCase() === "kurucu")) return false;
      if (seciliGrup !== "tumu" && !(p.grupEtiketleri || []).includes(seciliGrup)) return false;
      return true;
    });
    
    let csv = "Sicil No;Ad Soyad;";
    for (let gun = 1; gun <= gunSayisi; gun++) {
      csv += `${gun} Giriş;${gun} Çıkış;`;
    }
    csv += "\n";
    
    filtrelenmis.forEach(p => {
      csv += `${p.sicilNo};${p.personelAd};`;
      for (let gun = 1; gun <= gunSayisi; gun++) {
        const kayit = p.gunler[gun] || { durum: "normal" };
        csv += `${getHucreIcerik(kayit, "giris")};${getHucreIcerik(kayit, "cikis")};`;
      }
      csv += "\n";
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `puantaj-${aylar[seciliAy]}-${seciliYil}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-white">
      <div>
        <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#2F2F2F]">{aylar[seciliAy]} {seciliYil} - İşlem Ekle (Puantaj)</h1>
              <p className="text-sm text-[#8A8A8A] mt-1">Hücrelere tıklayarak giriş/çıkış saati veya hafta tatili ekleyebilirsiniz.</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-300 rounded"></span> Hafta Tatili</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-300 rounded"></span> İzin/Rapor</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-300 rounded"></span> Resmi Tatil</div>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">
          {/* Ay Seçimi ve Filtreler */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-xs text-[#8A8A8A] mb-1">Ay</label>
                <select
                  value={seciliAy}
                  onChange={(e) => setSeciliAy(Number(e.target.value))}
                  className="px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {aylar.map((ay, i) => (
                    <option key={i} value={i}>{ay}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#8A8A8A] mb-1">Yıl</label>
                <select
                  value={seciliYil}
                  onChange={(e) => setSeciliYil(Number(e.target.value))}
                  className="px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {[2024, 2025, 2026, 2027].map(yil => (
                    <option key={yil} value={yil}>{yil}</option>
                  ))}
                </select>
              </div>
              
              <div className="h-8 w-px bg-[#E5E5E5] hidden sm:block"></div>
              
              {/* Grup Filtresi */}
              <div>
                <label className="block text-xs text-[#8A8A8A] mb-1">Grup</label>
                <select
                  value={seciliGrup}
                  onChange={(e) => setSeciliGrup(e.target.value)}
                  className="px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="tumu">Tüm Gruplar</option>
                  {grupEtiketleri.map(grup => (
                    <option key={grup} value={grup}>{grup}</option>
                  ))}
                </select>
              </div>
              
              {/* Kurucu Filtresi */}
              <div>
                <label className="block text-xs text-[#8A8A8A] mb-1">Kurucular</label>
                <button
                  onClick={() => setYoneticileriGoster(!yoneticileriGoster)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    yoneticileriGoster 
                      ? "bg-rose-500 text-white" 
                      : "bg-[#F7F7F7] text-[#2F2F2F] hover:bg-[#E5E5E5]"
                  }`}
                >
                  {yoneticileriGoster ? "Göster ✓" : "Gizli"}
                </button>
              </div>
            </div>
          </div>

          {/* Puantaj Tablosu */}
          {dataLoading ? (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500 mx-auto"></div>
              <p className="text-[#8A8A8A] mt-4">Veriler yükleniyor...</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#F7F7F7]">
                    <tr>
                      <th rowSpan={2} className="px-3 py-3 text-left font-medium text-[#2F2F2F] border-b border-r sticky left-0 bg-[#F7F7F7] z-10 min-w-[100px]">Sicil No</th>
                      <th rowSpan={2} className="px-3 py-3 text-left font-medium text-[#2F2F2F] border-b border-r sticky left-[100px] bg-[#F7F7F7] z-10 min-w-[140px]">Ad Soyad</th>
                      {Array.from({ length: gunSayisi }, (_, i) => i + 1).map(gun => {
                        const tarih = new Date(seciliYil, seciliAy, gun);
                        const gunIsmi = gunIsimleri[tarih.getDay()];
                        return (
                          <th key={gun} colSpan={2} className="px-2 py-2 text-center font-medium border-b border-r min-w-[100px]">
                            <div className="text-xs text-[#2F2F2F]">{gun} {aylar[seciliAy].substring(0, 3)}</div>
                            <div className="text-xs text-[#8A8A8A]">{gunIsmi}</div>
                          </th>
                        );
                      })}
                    </tr>
                    <tr className="bg-[#F7F7F7]">
                      {Array.from({ length: gunSayisi }, (_, i) => i + 1).map(gun => (
                        <React.Fragment key={gun}>
                          <th className="px-2 py-2 text-center text-xs text-[#8FAF9A] border-b border-r font-medium">Giriş</th>
                          <th className="px-2 py-2 text-center text-xs text-[#D96C6C] border-b border-r font-medium">Çıkış</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5]">
                    {puantajData
                      .filter(personel => {
                        const p = personeller.find(per => per.id === personel.personelId);
                        if (!p) return true;
                        // Kurucu filtresi
                        if (!yoneticileriGoster && (p.grupEtiketleri || []).some(g => g.toLowerCase() === "kurucu")) return false;
                        // Grup filtresi (array içinde ara)
                        if (seciliGrup !== "tumu" && !(p.grupEtiketleri || []).includes(seciliGrup)) return false;
                        return true;
                      })
                      .map(personel => (
                      <tr key={personel.personelId} className="hover:bg-[#F7F7F7]">
                        <td className="px-3 py-3 text-[#2F2F2F] sticky left-0 bg-white z-10 border-r text-sm">{personel.sicilNo}</td>
                        <td className="px-3 py-3 font-medium text-[#2F2F2F] sticky left-[100px] bg-white z-10 border-r whitespace-nowrap">{personel.personelAd}</td>
                        {Array.from({ length: gunSayisi }, (_, i) => i + 1).map(gun => {
                          const kayit = personel.gunler[gun] || { durum: "normal" };
                          const girisIcerik = getHucreIcerik(kayit, "giris");
                          const cikisIcerik = getHucreIcerik(kayit, "cikis");
                          const cellKeyGiris = `${personel.personelId}-${gun}-giris`;
                          const cellKeyCikis = `${personel.personelId}-${gun}-cikis`;
                          
                          return (
                            <React.Fragment key={gun}>
                              {/* Giriş Hücresi */}
                              <td
                                className={getHucreClass(kayit, "giris")}
                                onClick={() => handleHucreClick(personel.personelId, personel.personelAd, gun, "giris")}
                                onMouseEnter={() => setHoverCell(cellKeyGiris)}
                                onMouseLeave={() => setHoverCell(null)}
                              >
                                <span>{girisIcerik}</span>
                                {/* Silme butonu - giriş kaydı varsa */}
                                {kayit.giris && hoverCell === cellKeyGiris && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(kayit.giris!.id, personel.personelAd, "Giriş");
                                    }}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-[#D96C6C] text-white rounded-full text-xs flex items-center justify-center hover:bg-[#C25A5A] shadow"
                                  >
                                    ×
                                  </button>
                                )}
                                {/* Silme butonu - hafta tatili varsa (sadece giriş hücresinde göster) */}
                                {kayit.haftaTatili && kayit.haftaTatili.id && hoverCell === cellKeyGiris && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(kayit.haftaTatili!.id, personel.personelAd, "Hafta Tatili", kayit.haftaTatili!.kaynak);
                                    }}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-[#D96C6C] text-white rounded-full text-xs flex items-center justify-center hover:bg-[#C25A5A] shadow"
                                  >
                                    ×
                                  </button>
                                )}
                                {/* Silme butonu - resmi tatil (kaldır) */}
                                {kayit.durum === "resmiTatil" && !kayit.giris && hoverCell === cellKeyGiris && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResmiTatilToggle(personel.personelId, personel.personelAd, gun);
                                    }}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-[#D96C6C] text-white rounded-full text-xs flex items-center justify-center hover:bg-[#C25A5A] shadow"
                                    title="Resmi tatili kaldır"
                                  >
                                    ×
                                  </button>
                                )}
                              </td>
                              
                              {/* Çıkış Hücresi */}
                              <td
                                className={getHucreClass(kayit, "cikis")}
                                onClick={() => handleHucreClick(personel.personelId, personel.personelAd, gun, "cikis")}
                                onMouseEnter={() => setHoverCell(cellKeyCikis)}
                                onMouseLeave={() => setHoverCell(null)}
                              >
                                <span>{cikisIcerik}</span>
                                {/* Silme butonu - çıkış kaydı varsa */}
                                {kayit.cikis && hoverCell === cellKeyCikis && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(kayit.cikis!.id, personel.personelAd, "Çıkış");
                                    }}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-[#D96C6C] text-white rounded-full text-xs flex items-center justify-center hover:bg-[#C25A5A] shadow"
                                  >
                                    ×
                                  </button>
                                )}
                                {/* Silme butonu - hafta tatili varsa (çıkış hücresinden de silinebilir) */}
                                {kayit.haftaTatili && kayit.haftaTatili.id && hoverCell === cellKeyCikis && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(kayit.haftaTatili!.id, personel.personelAd, "Hafta Tatili", kayit.haftaTatili!.kaynak);
                                    }}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-[#D96C6C] text-white rounded-full text-xs flex items-center justify-center hover:bg-[#C25A5A] shadow"
                                  >
                                    ×
                                  </button>
                                )}
                                {/* Silme butonu - resmi tatil (kaldır) - çıkış hücresinden de */}
                                {kayit.durum === "resmiTatil" && !kayit.cikis && hoverCell === cellKeyCikis && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResmiTatilToggle(personel.personelId, personel.personelAd, gun);
                                    }}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-[#D96C6C] text-white rounded-full text-xs flex items-center justify-center hover:bg-[#C25A5A] shadow"
                                    title="Resmi tatili kaldır"
                                  >
                                    ×
                                  </button>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Eksik Çıkış Uyarısı */}
          {eksikCikislar.length > 0 ? (
            <div className="mt-6 bg-[#D96C6C]/10 border border-[#D96C6C]/30 rounded-lg p-4">
              <h3 className="text-red-800 font-semibold mb-3 flex items-center gap-2">
                ⚠️ Çıkış Kaydı Eksik ({eksikCikislar.length} kayıt)
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {eksikCikislar.map((eksik, i) => {
                  // +9 saat hesapla, max 18:00
                  const parts = (eksik.girisSaat || "09:00").split(':').map(Number);
                  const saat = isNaN(parts[0]) ? 9 : parts[0];
                  const dakika = isNaN(parts[1]) ? 0 : parts[1];
                  let varsayilanCikisSaat = saat + 9;
                  if (varsayilanCikisSaat > 18) varsayilanCikisSaat = 18;
                  const varsayilanCikisDakika = varsayilanCikisSaat === 18 ? 0 : dakika;
                  const varsayilanCikisSaatStr = `${varsayilanCikisSaat.toString().padStart(2, '0')}:${varsayilanCikisDakika.toString().padStart(2, '0')}`;
                  
                  const key = `${eksik.personelId}-${eksik.gun}`;
                  const secilenSaat = eksikCikisSaatleri[key] || varsayilanCikisSaatStr;
                  
                  return (
                    <div key={i} className="flex items-center justify-between bg-white p-2 rounded-lg border border-[#D96C6C]/20 gap-2">
                      <div className="text-sm flex-1">
                        <span className="font-medium text-[#2F2F2F]">{eksik.personelAd}</span>
                        <span className="text-[#8A8A8A] ml-2">
                          {eksik.gun} {aylar[seciliAy]} - Giriş: {eksik.girisSaat}
                        </span>
                      </div>
                      <input
                        type="time"
                        value={secilenSaat}
                        onChange={(e) => setEksikCikisSaatleri(prev => ({ ...prev, [key]: e.target.value }))}
                        className="px-2 py-1 border border-[#E5E5E5] rounded text-sm w-24"
                      />
                      <button
                        onClick={async () => {
                          try {
                            const [cSaat, cDakika] = secilenSaat.split(':').map(Number);
                            const tarih = new Date(seciliYil, seciliAy, eksik.gun);
                            tarih.setHours(cSaat, cDakika, 0, 0);
                            
                            await addDoc(collection(db, "attendance"), {
                              personelId: eksik.personelId,
                              personelAd: eksik.personelAd,
                              personelEmail: "",
                              sicilNo: "",
                              tip: "cikis",
                              tarih: Timestamp.fromDate(tarih),
                              konumId: "",
                              konumAdi: "Puantaj",
                              kayitOrtami: "Puantaj",
                              manuelKayit: true,
                              mazeretNotu: "",
                              ekleyenEmail: user.email,
                              olusturmaTarihi: Timestamp.now()
                            });

                            await addDoc(collection(db, "attendanceChanges"), {
                              degisiklikYapan: user.email,
                              degisiklikTarihi: Timestamp.now(),
                              degisiklikTuru: "Kayıt Eklendi",
                              oncekiDeger: "",
                              sonrakiDeger: "Çıkış",
                              kullaniciAdi: eksik.personelAd,
                              konum: "Puantaj",
                              girisCikisTarih: Timestamp.fromDate(tarih)
                            });
                            
                            fetchData();
                          } catch (error) {
                            Sentry.captureException(error);
                            alert("Çıkış eklenirken hata oluştu!");
                          }
                        }}
                        className="text-xs bg-rose-500 hover:bg-rose-600 text-white px-3 py-1 rounded-lg transition whitespace-nowrap"
                      >
                        Ekle
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-6 bg-[#EAF2ED] border border-green-200 rounded-lg p-4">
              <h3 className="text-green-800 font-semibold flex items-center gap-2">
                ✅ Tüm çıkış kayıtları tamam
              </h3>
            </div>
          )}

          {/* Notlar */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            <p><strong>💡 İpucu:</strong> Hücrelere tıklayarak giriş/çıkış saati veya hafta tatili ekleyebilirsiniz. Kayıtların üzerine gelince silme butonu çıkar.</p>
          </div>

          {/* Alt Butonlar */}
          <div className="flex flex-col md:flex-row gap-3 justify-center mt-6">
            <button
              onClick={() => window.print()}
              className="bg-[#F7F7F7] hover:bg-[#E5E5E5] text-[#2F2F2F] px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
            >
              🖨️ Yazdır / PDF
            </button>
            <button
              onClick={exportToExcel}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
            >
              📥 Excel İndir
            </button>
          </div>
        </main>
      </div>

      {/* İşlem Modal */}
      {islemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-[#2F2F2F] mb-4">
              {(() => {
                const mk = puantajData.find(p => p.personelId === islemModal.personelId)?.gunler[islemModal.gun];
                const mevcutVar = (islemTipi === "giris" && mk?.giris) || (islemTipi === "cikis" && mk?.cikis) || (islemTipi === "giriscikis" && (mk?.giris || mk?.cikis));
                return mevcutVar ? "İşlem Düzenle" : "İşlem Ekle";
              })()}
            </h3>
            
            <div className="mb-4 p-3 bg-[#F7F7F7] rounded-lg">
              <p className="text-sm text-[#2F2F2F]"><strong>Personel:</strong> {islemModal.personelAd}</p>
              <p className="text-sm text-[#2F2F2F]"><strong>Tarih:</strong> {islemModal.gun} {aylar[seciliAy]} {seciliYil}</p>
            </div>

            {/* İşlem Tipi Seçimi */}
            <div className="mb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => setIslemTipi("giris")}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    islemTipi === "giris" 
                      ? "bg-[#8FAF9A] text-white" 
                      : "bg-[#F7F7F7] text-[#2F2F2F] hover:bg-[#E5E5E5]"
                  }`}
                >
                  🟢 Giriş
                </button>
                <button
                  onClick={() => setIslemTipi("cikis")}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    islemTipi === "cikis" 
                      ? "bg-[#D96C6C] text-white" 
                      : "bg-[#F7F7F7] text-[#2F2F2F] hover:bg-[#E5E5E5]"
                  }`}
                >
                  🔴 Çıkış
                </button>
                <button
                  onClick={() => setIslemTipi("giriscikis")}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    islemTipi === "giriscikis" 
                      ? "bg-rose-500 text-white" 
                      : "bg-[#F7F7F7] text-[#2F2F2F] hover:bg-[#E5E5E5]"
                  }`}
                >
                  🟢🔴 İkisi
                </button>
                <button
                  onClick={() => setIslemTipi("haftaTatili")}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    islemTipi === "haftaTatili" 
                      ? "bg-[#E6B566] text-white" 
                      : "bg-[#F7F7F7] text-[#2F2F2F] hover:bg-[#E5E5E5]"
                  }`}
                >
                  🟠 H.Tatil
                </button>
              </div>
              
              {/* Resmi Tatil Geri Al - sadece iptal edilmişse göster */}
              {islemModal?.resmiTatilIptalId && islemModal?.resmiTatilAdi && (
                <button
                  onClick={async () => {
                    await handleResmiTatilToggle(
                      islemModal.personelId, 
                      islemModal.personelAd, 
                      islemModal.gun, 
                      islemModal.resmiTatilIptalId
                    );
                    setIslemModal(null);
                  }}
                  className="w-full mt-3 px-3 py-2 rounded-lg text-sm font-medium transition bg-[#EAF2ED] text-[#8FAF9A] hover:bg-green-200 border border-green-300"
                >
                  🟢 Resmi Tatil Ekle ({islemModal.resmiTatilAdi})
                </button>
              )}
            </div>

            {/* Giriş & Çıkış Saatleri */}
            {(islemTipi === "giris" || islemTipi === "cikis" || islemTipi === "giriscikis") && (
              <div className="mb-6 space-y-4">
                {/* Konum Seçimi */}
                <div>
                  <label className="block text-sm font-medium text-[#2F2F2F] mb-2">📍 Konum</label>
                  <select
                    value={seciliKonum}
                    onChange={(e) => setSeciliKonum(e.target.value)}
                    className="w-full px-4 py-3 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                  >
                    <option value="">Konum Seçiniz</option>
                    {konumlar.map(k => (
                      <option key={k.id} value={k.id}>{k.karekod || k.ad}</option>
                    ))}
                  </select>
                </div>
                {(islemTipi === "giris" || islemTipi === "giriscikis") && (
                <div>
                  <label className="block text-sm font-medium text-[#8FAF9A] mb-2">🟢 Giriş Saati</label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={girisSaati}
                      onChange={(e) => handleGirisSaatiChange(e.target.value)}
                      className="flex-1 px-4 py-3 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-lg bg-[#EAF2ED]"
                    />
                    {girisOnerisi && (
                      <button
                        onClick={() => {
                          setGirisSaati(girisOnerisi);
                          setGirisOnerisi(null);
                          setCikisOnerisi(null);
                        }}
                        className="px-3 py-2 bg-[#EAF2ED] hover:bg-green-200 text-[#8FAF9A] rounded-lg text-sm font-medium border border-green-300 transition whitespace-nowrap"
                      >
                        {girisOnerisi} ?
                      </button>
                    )}
                  </div>
                </div>
                )}
                {(islemTipi === "cikis" || islemTipi === "giriscikis") && (
                <div>
                  <label className="block text-sm font-medium text-[#D96C6C] mb-2">🔴 Çıkış Saati</label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={cikisSaati}
                      onChange={(e) => handleCikisSaatiChange(e.target.value)}
                      className="flex-1 px-4 py-3 border border-[#D96C6C]/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-lg bg-[#D96C6C]/10"
                    />
                    {cikisOnerisi && (
                      <button
                        onClick={() => {
                          setCikisSaati(cikisOnerisi);
                          setCikisOnerisi(null);
                          setGirisOnerisi(null);
                        }}
                        className="px-3 py-2 bg-[#D96C6C]/20 hover:bg-red-200 text-[#D96C6C] rounded-lg text-sm font-medium border border-[#D96C6C] transition whitespace-nowrap"
                      >
                        {cikisOnerisi} ?
                      </button>
                    )}
                  </div>
                </div>
                )}
                <p className="text-xs text-[#8A8A8A] text-center">💡 Mevcut kayıt varsa üstüne yazar, yoksa yeni ekler</p>
              </div>
            )}

            {islemTipi === "haftaTatili" && (
              <div className="mb-6 p-3 bg-[#E6B566]/10 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-700">Bu gün <strong>Hafta Tatili</strong> olarak işaretlenecek.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setIslemModal(null)}
                className="flex-1 px-4 py-2 border border-[#E5E5E5] rounded-lg text-[#2F2F2F] hover:bg-[#F7F7F7] transition"
              >
                İptal
              </button>
              <button
                onClick={handleKaydet}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition disabled:opacity-50"
              >
                {saving ? "Kaydediliyor..." : (() => {
                  const mk = puantajData.find(p => p.personelId === islemModal.personelId)?.gunler[islemModal.gun];
                  const mevcutVar = (islemTipi === "giris" && mk?.giris) || (islemTipi === "cikis" && mk?.cikis) || (islemTipi === "giriscikis" && (mk?.giris || mk?.cikis));
                  return mevcutVar ? "Güncelle" : "Kaydet";
                })()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}