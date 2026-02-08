import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import GelinModal from "../components/GelinModal";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  orderBy,
  getDocs,
  setDoc,
  getDoc
} from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";

// Composite key helper: görev ID = gelinId_gorevTuru_email
function sanitizeEmail(email: string): string {
  return email.replace(/[^a-zA-Z0-9]/g, '_');
}
function compositeGorevId(gelinId: string, gorevTuru: string, atananEmail: string): string {
  return `${gelinId}_${gorevTuru}_${sanitizeEmail(atananEmail)}`;
}

interface Gorev {
  id: string;
  baslik: string;
  aciklama: string;
  atayan: string; // "Sistem" veya user.uid
  atayanAd: string;
  atanan: string; // Personel ID
  atananAd: string;
  durum: "bekliyor" | "devam-ediyor" | "tamamlandi" | "iptal";
  oncelik: "dusuk" | "normal" | "yuksek" | "acil";
  olusturulmaTarihi: any;
  tamamlanmaTarihi?: any;
  gelinId?: string; // İlgili gelin
  otomatikMi?: boolean; // Sistem tarafından oluşturuldu mu?
  gorevTuru?: "yorumIstesinMi" | "paylasimIzni" | "yorumIstendiMi" | "odemeTakip"; // Görev türü
  // Embedded gelin bilgisi - ekstra okuma yapmamak için
  gelinBilgi?: {
    isim: string;
    tarih: string;
    saat: string;
  };
}

interface Gelin {
  id: string;
  isim: string;
  tarih: string;
  saat: string;
  makyaj: string;
  turban: string;
  odemeTamamlandi?: boolean;
  yorumIstesinMi?: string;
  paylasimIzni?: boolean;
  yorumIstendiMi?: boolean;
  // GelinModal için ek alanlar (zorunlu)
  ucret: number;
  kapora: number;
  kalan: number;
  telefon?: string;
  esiTelefon?: string;
  instagram?: string;
  fotografci?: string;
  modaevi?: string;
  kinaGunu?: string;
  not?: string;
  bilgilendirmeGonderildiMi?: boolean;
  anlasmaYazildiMi?: boolean;
  malzemeGonderildiMi?: boolean;
  yorumIstendiMi2?: boolean;
  anlastigiTarih?: string;
}

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  email: string;
  kullaniciTuru?: string;
  firmalar?: string[]; // Personelin çalıştığı firmalar
  yonettigiFirmalar?: string[]; // Yöneticinin yönettiği firmalar
}

interface GorevAyari {
  aktif: boolean;
  baslangicTarihi: string;
}

interface GorevAyarlari {
  yorumIstesinMi: GorevAyari;
  paylasimIzni: GorevAyari;
  yorumIstendiMi: GorevAyari;
  odemeTakip: GorevAyari;
}

export default function GorevlerPage() {
  const user = useAuth();
  const [userRole, setUserRole] = useState<string>("");
  const [userFirmalar, setUserFirmalar] = useState<string[]>([]); // Yöneticinin firmaları
  const [gorevler, setGorevler] = useState<Gorev[]>([]);
  const [tumGorevler, setTumGorevler] = useState<Gorev[]>([]); // Kurucu/Yönetici için
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [filtreliGorevler, setFiltreliGorevler] = useState<Gorev[]>([]);
  const [filtre, setFiltre] = useState<"hepsi" | "bekliyor" | "devam-ediyor" | "tamamlandi">("hepsi");
  const [siralama, setSiralama] = useState<"yenidenEskiye" | "eskidenYeniye">("yenidenEskiye");
  const [aktifSekme, setAktifSekme] = useState<"gorevlerim" | "otomatik" | "tumgorevler">("gorevlerim");
  const [otomatikAltSekme, setOtomatikAltSekme] = useState<"yorumIstesinMi" | "paylasimIzni" | "yorumIstendiMi" | "odemeTakip">("yorumIstesinMi");
  const [seciliPersoneller, setSeciliPersoneller] = useState<string[]>([]); // Seçili personel email'leri
  const [selectedGorev, setSelectedGorev] = useState<Gorev | null>(null);
  const [selectedGelinId, setSelectedGelinId] = useState<string | null>(null);
  const [showAyarlar, setShowAyarlar] = useState(false);
  const [senkronizeLoading, setSenkronizeLoading] = useState<string | null>(null);
  const [gorevAyarlari, setGorevAyarlari] = useState<GorevAyarlari>({
    yorumIstesinMi: { aktif: false, baslangicTarihi: "" },
    paylasimIzni: { aktif: false, baslangicTarihi: "" },
    yorumIstendiMi: { aktif: false, baslangicTarihi: "" },
    odemeTakip: { aktif: false, baslangicTarihi: "" }
  });
  // Auth kontrolü
  // Görev ayarlarını Firestore'dan çek
  useEffect(() => {
    if (!user) return;

    const fetchAyarlar = async () => {
      try {
        const ayarDoc = await getDoc(doc(db, "settings", "gorevAyarlari"));
        if (ayarDoc.exists()) {
          const data = ayarDoc.data();
          // Firestore'daki eski/eksik format için güvenli okuma
          const guvenliAyar = (key: string) => ({
            aktif: data[key]?.aktif ?? false,
            baslangicTarihi: data[key]?.baslangicTarihi ?? ""
          });
          setGorevAyarlari({
            yorumIstesinMi: guvenliAyar("yorumIstesinMi"),
            paylasimIzni: guvenliAyar("paylasimIzni"),
            yorumIstendiMi: guvenliAyar("yorumIstendiMi"),
            odemeTakip: guvenliAyar("odemeTakip")
          });
        }
      } catch (error) {
        Sentry.captureException(error);
      }
    };
    fetchAyarlar();
  }, [user]);

  // ⚡ Gelinler artık toplu çekilmiyor - Firebase okuma tasarrufu!
  // GelinModal açılınca sadece o tek gelin çekilecek
  const [selectedGelin, setSelectedGelin] = useState<Gelin | null>(null);
  const [gelinLoading, setGelinLoading] = useState(false);

  // Tek gelin çek (GelinModal için)
  const fetchSingleGelin = async (gelinId: string) => {
    setGelinLoading(true);
    try {
      const gelinDoc = await getDoc(doc(db, "gelinler", gelinId));
      if (gelinDoc.exists()) {
        const data = gelinDoc.data();
        setSelectedGelin({
          id: gelinDoc.id,
          isim: data.isim || "",
          tarih: data.tarih || "",
          saat: data.saat || "",
          makyaj: data.makyaj || "",
          turban: data.turban || "",
          yorumIstesinMi: data.yorumIstesinMi || "",
          paylasimIzni: data.paylasimIzni || false,
          yorumIstendiMi: data.yorumIstendiMi || false,
          ucret: data.ucret || 0,
          kapora: data.kapora || 0,
          kalan: data.kalan || 0,
          telefon: data.telefon || "",
          esiTelefon: data.esiTelefon || "",
          instagram: data.instagram || "",
          fotografci: data.fotografci || "",
          modaevi: data.modaevi || "",
          kinaGunu: data.kinaGunu || "",
          not: data.not || "",
          bilgilendirmeGonderildiMi: data.bilgilendirmeGonderildiMi || false,
          anlasmaYazildiMi: data.anlasmaYazildiMi || false,
          malzemeGonderildiMi: data.malzemeGonderildiMi || false,
          yorumIstendiMi2: data.yorumIstendiMi2 || false,
          anlastigiTarih: data.anlastigiTarih || "",
        });
      }
    } catch (error) {
      Sentry.captureException(error);
    } finally {
      setGelinLoading(false);
    }
  };

  // Personelleri dinle (SADECE AKTİF)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "personnel"), 
      where("aktif", "==", true),
      orderBy("ad", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || "",
        soyad: doc.data().soyad || "",
        email: doc.data().email || "",
        kullaniciTuru: doc.data().kullaniciTuru || "",
        firmalar: doc.data().firmalar || [],
        yonettigiFirmalar: doc.data().yonettigiFirmalar || []
      } as Personel));
      setPersoneller(data);
      
      // Kullanıcının rolünü ve firmalarını bul
      const currentUser = data.find(p => p.email === user.email);
      if (currentUser?.kullaniciTuru) {
        setUserRole(currentUser.kullaniciTuru);
      }
      if (currentUser?.yonettigiFirmalar) {
        setUserFirmalar(currentUser.yonettigiFirmalar);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Görevleri dinle
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "gorevler"),
      where("atanan", "==", user.email),
      orderBy("olusturulmaTarihi", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Gorev));
      setGorevler(data);
    });

    return () => unsubscribe();
  }, [user]);

  // Kurucu ve Yönetici için TÜM görevleri dinle
  useEffect(() => {
    if (!user || (userRole !== "Kurucu" && userRole !== "Yönetici")) return;

    const q = query(
      collection(db, "gorevler"),
      orderBy("olusturulmaTarihi", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Gorev));
      setTumGorevler(data);
    });

    return () => unsubscribe();
  }, [user, userRole]);

  // ⚡ Otomatik görev sistemi:
  // - Oluşturma: hourlyGorevReconcile Cloud Function saatte bir kontrol eder
  // - Silme: onGelinUpdated Firestore trigger → alan doldurulunca anında siler
  // - "Senkronize Et" butonu: ilk kurulum ve acil durum için

  // Ekip personellerini hesapla (Yönetici için kendi ekibi, Kurucu için herkes)
  const ekipPersonelleri = personeller.filter(p => {
    if (userRole === "Kurucu") return true; // Kurucu herkesi görür
    if ((userRole === "Yönetici") && userFirmalar.length > 0) {
      // Yönetici sadece kendi firmalarındaki personeli görür
      return p.firmalar?.some(f => userFirmalar.includes(f));
    }
    return false;
  });

  // Her personelin görev sayısını hesapla
  const personelGorevSayilari = ekipPersonelleri.map(p => ({
    ...p,
    gorevSayisi: tumGorevler.filter(g => g.atanan === p.email).length
  }));

  // Filtre uygula (sekme + durum filtresi + seçili personeller + alt sekme + sıralama)
  useEffect(() => {
    let sonuc: Gorev[] = [];
    
    // Önce sekmeye göre filtrele
    if (aktifSekme === "tumgorevler") {
      sonuc = [...tumGorevler];
      
      // Seçili personellere göre filtrele
      if (seciliPersoneller.length > 0) {
        sonuc = sonuc.filter(g => seciliPersoneller.includes(g.atanan));
      }
    } else if (aktifSekme === "otomatik") {
      // Otomatik sekmede alt sekmeye göre filtrele
      sonuc = gorevler.filter(g => g.otomatikMi === true && g.gorevTuru === otomatikAltSekme);
    } else {
      sonuc = gorevler.filter(g => !g.otomatikMi);
    }
    
    // Sonra durum filtresini uygula
    if (filtre !== "hepsi") {
      sonuc = sonuc.filter(g => g.durum === filtre);
    }

    // Sıralama uygula (embedded gelin tarihine göre)
    sonuc.sort((a, b) => {
      // gelinBilgi varsa onu kullan, yoksa oluşturulma tarihine göre sırala
      const tarihA = a.gelinBilgi?.tarih ? new Date(a.gelinBilgi.tarih).getTime() : 
                     (a.olusturulmaTarihi?.toDate?.()?.getTime() || 0);
      const tarihB = b.gelinBilgi?.tarih ? new Date(b.gelinBilgi.tarih).getTime() : 
                     (b.olusturulmaTarihi?.toDate?.()?.getTime() || 0);
      
      if (siralama === "yenidenEskiye") {
        return tarihB - tarihA; // Yeniden eskiye
      } else {
        return tarihA - tarihB; // Eskiden yeniye
      }
    });
    
    setFiltreliGorevler(sonuc);
  }, [gorevler, tumGorevler, filtre, aktifSekme, seciliPersoneller, otomatikAltSekme, siralama]);

  // Görev durumu değiştir
  const handleDurumDegistir = async (gorevId: string, yeniDurum: Gorev["durum"]) => {
    try {
      const updateData: any = { durum: yeniDurum };
      if (yeniDurum === "tamamlandi") {
        updateData.tamamlanmaTarihi = serverTimestamp();
      }
      await updateDoc(doc(db, "gorevler", gorevId), updateData);
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  // Tüm Görev Ayarlarını Tek Seferde Senkronize Et
  const handleTumunuSenkronizeEt = async () => {
    // En az bir tarih girilmiş mi kontrol et
    const tarihliler = [];
    if (gorevAyarlari?.yorumIstesinMi?.baslangicTarihi) tarihliler.push("Yorum İstensin Mi");
    if (gorevAyarlari?.paylasimIzni?.baslangicTarihi) tarihliler.push("Paylaşım İzni");
    if (gorevAyarlari?.yorumIstendiMi?.baslangicTarihi) tarihliler.push("Yorum İstendi Mi");
    if (gorevAyarlari?.odemeTakip?.baslangicTarihi) tarihliler.push("Ödeme Takip");

    if (tarihliler.length === 0) {
      alert("Lütfen en az bir görev türü için başlangıç tarihi girin!");
      return;
    }

    if (!confirm(`⚠️ DİKKAT!\n\nTüm otomatik görevler silinecek ve seçilen tarihlerden bugüne kadarki gelinler için yeniden oluşturulacak.\n\nSenkronize edilecek türler:\n${tarihliler.map(t => "• " + t).join("\n")}\n\nDevam etmek istiyor musunuz?`)) {
      return;
    }

    setSenkronizeLoading("tumu");

    try {
      const bugun = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const gorevlerRef = collection(db, "gorevler");
      let toplamSilinen = 0;
      let toplamOlusturulan = 0;

      // ÖNCELİKLE: Tüm otomatik görevleri sil
      const tumOtomatikQuery = query(gorevlerRef, where("otomatikMi", "==", true));
      const tumOtomatikSnapshot = await getDocs(tumOtomatikQuery);
      
      for (const gorevDoc of tumOtomatikSnapshot.docs) {
        await deleteDoc(doc(db, "gorevler", gorevDoc.id));
        toplamSilinen++;
      }

      // Her görev türü için yeni görevler oluştur
      const gorevTurleri: ("yorumIstesinMi" | "paylasimIzni" | "yorumIstendiMi" | "odemeTakip")[] = ["yorumIstesinMi", "paylasimIzni", "yorumIstendiMi", "odemeTakip"];
      const yeniAyarlar = { ...gorevAyarlari };

      for (const gorevTuru of gorevTurleri) {
        const ayar = gorevAyarlari?.[gorevTuru];
        if (!ayar?.baslangicTarihi) continue;

        // Başlangıç tarihi → bugüne kadar olan gelinleri çek (gelecek gelinler hariç)
        const gelinlerQuery = query(
          collection(db, "gelinler"),
          where("tarih", ">=", ayar.baslangicTarihi),
          where("tarih", "<=", bugun),
          orderBy("tarih", "asc")
        );
        const gelinlerSnapshot = await getDocs(gelinlerQuery);
        const gelinlerData = gelinlerSnapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as Gelin[];

        for (const gelin of gelinlerData) {
          // Alan boş mu kontrol et
          let alanBos = false;
          if (gorevTuru === "yorumIstesinMi") {
            alanBos = !gelin.yorumIstesinMi || gelin.yorumIstesinMi.trim() === "";
          } else if (gorevTuru === "paylasimIzni") {
            alanBos = !gelin.paylasimIzni;
          } else if (gorevTuru === "yorumIstendiMi") {
            alanBos = !gelin.yorumIstendiMi;
          } else if (gorevTuru === "odemeTakip") {
            alanBos = gelin.odemeTamamlandi !== true;
          }

          if (!alanBos) continue;

          const gorevBasliklar: Record<string, string> = {
            yorumIstesinMi: "Yorum istensin mi alanını doldur",
            paylasimIzni: "Paylaşım izni alanını doldur",
            yorumIstendiMi: "Yorum istendi mi alanını doldur",
            odemeTakip: "Ödeme alınmadı!"
          };

          if (gorevTuru === "odemeTakip") {
            // Yöneticilere ata
            const yoneticiler = personeller.filter(p => 
              p.kullaniciTuru === "Kurucu" || p.kullaniciTuru === "Yönetici"
            );
            for (const yonetici of yoneticiler) {
              const cId = compositeGorevId(gelin.id, gorevTuru, yonetici.email);
              await setDoc(doc(db, "gorevler", cId), {
                baslik: `${gelin.isim} - ${gorevBasliklar[gorevTuru]}`,
                aciklama: `${gelin.isim} gelinin düğünü ${gelin.tarih} tarihinde gerçekleşti. Takvime "--" eklenmesi gerekiyor.`,
                atayan: "Aziz",
                atayanAd: "Aziz (Otomatik)",
                atanan: yonetici.email,
                atananAd: `${yonetici.ad} ${yonetici.soyad}`,
                durum: "bekliyor",
                oncelik: "acil",
                olusturulmaTarihi: serverTimestamp(),
                gelinId: gelin.id,
                otomatikMi: true,
                gorevTuru: "odemeTakip",
                gelinBilgi: { isim: gelin.isim, tarih: gelin.tarih, saat: gelin.saat }
              });
              toplamOlusturulan++;
            }
          } else {
            // Makyajcı/türbancıya ata
            const makyajci = personeller.find(p => 
              p.ad.toLocaleLowerCase('tr-TR') === gelin.makyaj?.toLocaleLowerCase('tr-TR') ||
              `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR') === gelin.makyaj?.toLocaleLowerCase('tr-TR')
            );
            const turbanci = personeller.find(p => 
              p.ad.toLocaleLowerCase('tr-TR') === gelin.turban?.toLocaleLowerCase('tr-TR') ||
              `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR') === gelin.turban?.toLocaleLowerCase('tr-TR')
            );

            const ayniKisi = makyajci?.email === turbanci?.email;
            const kisiler: { email: string; ad: string; rol: string }[] = [];
            if (makyajci?.email) kisiler.push({ email: makyajci.email, ad: `${makyajci.ad} ${makyajci.soyad}`, rol: "Makyaj" });
            if (turbanci?.email && !ayniKisi) kisiler.push({ email: turbanci.email, ad: `${turbanci.ad} ${turbanci.soyad}`, rol: "Türban" });

            for (const kisi of kisiler) {
              const cId = compositeGorevId(gelin.id, gorevTuru, kisi.email);
              await setDoc(doc(db, "gorevler", cId), {
                baslik: `${gelin.isim} - ${gorevBasliklar[gorevTuru]}`,
                aciklama: `${gelin.isim} için "${gorevBasliklar[gorevTuru]}" alanı boş. Takvimden doldurun. (${kisi.rol})`,
                atayan: "Sistem",
                atayanAd: "Sistem (Otomatik)",
                atanan: kisi.email,
                atananAd: kisi.ad,
                durum: "bekliyor",
                oncelik: "yuksek",
                olusturulmaTarihi: serverTimestamp(),
                gelinId: gelin.id,
                otomatikMi: true,
                gorevTuru: gorevTuru,
                gelinBilgi: { isim: gelin.isim, tarih: gelin.tarih, saat: gelin.saat }
              });
              toplamOlusturulan++;
            }
          }
        }

        // Bu türü aktif yap
        yeniAyarlar[gorevTuru] = { ...ayar, aktif: true };
      }

      // Ayarları kaydet
      await setDoc(doc(db, "settings", "gorevAyarlari"), yeniAyarlar);
      setGorevAyarlari(yeniAyarlar);

      alert(`✅ Senkronizasyon tamamlandı!\n\n• ${toplamSilinen} görev silindi\n• ${toplamOlusturulan} yeni görev oluşturuldu`);
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Senkronizasyon sırasında hata oluştu!");
    } finally {
      setSenkronizeLoading(null);
    }
  };

  // Görev sil
  const handleGorevSil = async (gorevId: string) => {
    if (!confirm("Bu görevi silmek istediğinize emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, "gorevler", gorevId));
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  // Otomatik görev: "Yaptım" butonu - gelini kontrol et, alan doluysa sil
  const [yaptimLoading, setYaptimLoading] = useState<string | null>(null);
  const handleYaptim = async (gorev: Gorev) => {
    if (!gorev.gelinId || !gorev.gorevTuru) return;
    setYaptimLoading(gorev.id);
    try {
      const gelinDoc = await getDoc(doc(db, "gelinler", gorev.gelinId));
      if (!gelinDoc.exists()) {
        alert("❌ Gelin kaydı bulunamadı!");
        return;
      }
      const gelin = gelinDoc.data();

      // Görev türüne göre alan kontrolü
      let alanDolu = false;
      let alanAdi = "";
      if (gorev.gorevTuru === "yorumIstesinMi") {
        alanDolu = !!gelin.yorumIstesinMi && gelin.yorumIstesinMi.trim() !== "";
        alanAdi = "Yorum istensin mi";
      } else if (gorev.gorevTuru === "paylasimIzni") {
        alanDolu = !!gelin.paylasimIzni;
        alanAdi = "Paylaşım izni";
      } else if (gorev.gorevTuru === "yorumIstendiMi") {
        alanDolu = !!gelin.yorumIstendiMi;
        alanAdi = "Yorum istendi mi";
      } else if (gorev.gorevTuru === "odemeTakip") {
        alanDolu = gelin.odemeTamamlandi === true;
        alanAdi = "Ödeme";
      }

      if (alanDolu) {
        await deleteDoc(doc(db, "gorevler", gorev.id));
        alert(`✅ "${alanAdi}" alanı dolu, görev silindi!`);
      } else {
        if (gorev.gorevTuru === "odemeTakip") {
          alert(`⚠️ Takvime henüz "--" eklenmemiş! Önce takvimde ödeme işaretini ekleyin.`);
        } else {
          alert(`⚠️ "${alanAdi}" alanı henüz doldurulmamış! Önce takvimden doldurun.`);
        }
      }
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Kontrol sırasında hata oluştu!");
    } finally {
      setYaptimLoading(null);
    }
  };

  const oncelikRenk = (oncelik: string) => {
    switch (oncelik) {
      case "acil": return "border-red-500 bg-red-50";
      case "yuksek": return "border-orange-500 bg-orange-50";
      case "normal": return "border-blue-500 bg-blue-50";
      case "dusuk": return "border-stone-500 bg-stone-50";
      default: return "border-stone-300 bg-white";
    }
  };

  const durumBadge = (durum: string) => {
    switch (durum) {
      case "bekliyor": return "bg-yellow-100 text-yellow-800";
      case "devam-ediyor": return "bg-blue-100 text-blue-800";
      case "tamamlandi": return "bg-green-100 text-green-800";
      case "iptal": return "bg-stone-100 text-stone-800";
      default: return "bg-stone-100 text-stone-800";
    }
  };

  const durumEmojiyon = (durum: string) => {
    switch (durum) {
      case "bekliyor": return "⏳";
      case "devam-ediyor": return "🔄";
      case "tamamlandi": return "✅";
      case "iptal": return "❌";
      default: return "📋";
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex">
      <div className="flex-1">
        <header className="bg-white shadow-sm sticky top-0 z-10 border-b border-stone-200">
          <div className="px-3 md:px-6 py-2 md:py-3 flex items-center justify-between">
            <h1 className="text-base md:text-xl font-bold text-stone-800">✅ Görevler</h1>
            
            {/* Kurucu için Ayarlar Butonu */}
            {userRole === "Kurucu" && (
              <button
                onClick={() => setShowAyarlar(!showAyarlar)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  showAyarlar 
                    ? "bg-stone-800 text-white" 
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                ⚙️ Görev Ayarları
              </button>
            )}
          </div>
          
          {/* Ana Sekmeler */}
          <div className="px-2 md:px-6 flex gap-0.5 md:gap-1 border-t border-stone-100 overflow-x-auto">
            <button
              onClick={() => { setAktifSekme("gorevlerim"); setFiltre("hepsi"); }}
              className={`px-2.5 md:px-4 py-2 md:py-2.5 font-medium text-xs md:text-sm transition border-b-2 whitespace-nowrap ${
                aktifSekme === "gorevlerim"
                  ? "border-amber-500 text-amber-600 bg-amber-50/50"
                  : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              📋 Görevlerim
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                aktifSekme === "gorevlerim" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"
              }`}>
                {gorevler.filter(g => !g.otomatikMi).length}
              </span>
            </button>
            <button
              onClick={() => { setAktifSekme("otomatik"); setFiltre("hepsi"); }}
              className={`px-2.5 md:px-4 py-2 md:py-2.5 font-medium text-xs md:text-sm transition border-b-2 whitespace-nowrap ${
                aktifSekme === "otomatik"
                  ? "border-purple-500 text-purple-600 bg-purple-50/50"
                  : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              <span className="hidden md:inline">🤖 </span>Otomatik
              <span className="hidden md:inline"> Görevler</span>
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                aktifSekme === "otomatik" ? "bg-purple-100 text-purple-700" : "bg-stone-100 text-stone-500"
              }`}>
                {gorevler.filter(g => g.otomatikMi === true).length}
              </span>
            </button>
            
            {/* Kurucu ve Yönetici için Ekip Görevleri sekmesi */}
            {(userRole === "Kurucu" || userRole === "Yönetici") && (
              <button
                onClick={() => { setAktifSekme("tumgorevler"); setFiltre("hepsi"); setSeciliPersoneller([]); }}
                className={`px-2.5 md:px-4 py-2 md:py-2.5 font-medium text-xs md:text-sm transition border-b-2 whitespace-nowrap ${
                  aktifSekme === "tumgorevler"
                    ? "border-emerald-500 text-emerald-600 bg-emerald-50/50"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                }`}
              >
                {userRole === "Kurucu" ? "👑" : "👥"} <span className="hidden md:inline">Ekip </span>Görevleri
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  aktifSekme === "tumgorevler" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"
                }`}>
                  {tumGorevler.length}
                </span>
              </button>
            )}
          </div>
        </header>

        <main className="p-3 md:p-6">
          {/* Görev Ayarları Paneli - Sadece Kurucu */}
          {showAyarlar && userRole === "Kurucu" && (
            <div className="mb-6 bg-white rounded-lg border-2 border-stone-300 shadow-lg overflow-hidden">
              <div className="bg-stone-800 text-white px-4 py-3 flex items-center justify-between">
                <h2 className="font-bold">⚙️ Otomatik Görev Ayarları</h2>
                <button onClick={() => setShowAyarlar(false)} className="text-stone-300 hover:text-white">✕</button>
              </div>
              
              <div className="p-4 space-y-4">
                {/* Yorum İstensin Mi */}
                <div className={`p-3 rounded-lg border ${gorevAyarlari?.yorumIstesinMi?.aktif ? "border-green-400 bg-green-50" : "border-stone-200 bg-stone-50"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📝</span>
                      <div>
                        <h3 className="font-semibold text-stone-800 text-sm">Yorum İstensin Mi</h3>
                        <p className="text-xs text-stone-500">Düğünü geçmiş + alan boş → Makyajcı/Türbancıya görev</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date" min="2020-01-01" max="2099-12-31"
                        value={gorevAyarlari?.yorumIstesinMi?.baslangicTarihi}
                        onChange={(e) => setGorevAyarlari({
                          ...gorevAyarlari,
                          yorumIstesinMi: { ...gorevAyarlari.yorumIstesinMi, baslangicTarihi: e.target.value }
                        })}
                        className="px-2 py-1 border border-stone-300 rounded text-sm w-36"
                      />
                      {gorevAyarlari?.yorumIstesinMi?.aktif && (
                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">✓</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Paylaşım İzni */}
                <div className={`p-3 rounded-lg border ${gorevAyarlari?.paylasimIzni?.aktif ? "border-green-400 bg-green-50" : "border-stone-200 bg-stone-50"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📸</span>
                      <div>
                        <h3 className="font-semibold text-stone-800 text-sm">Paylaşım İzni Var Mı</h3>
                        <p className="text-xs text-stone-500">Düğünü geçmiş + alan boş → Makyajcı/Türbancıya görev</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date" min="2020-01-01" max="2099-12-31"
                        value={gorevAyarlari?.paylasimIzni?.baslangicTarihi}
                        onChange={(e) => setGorevAyarlari({
                          ...gorevAyarlari,
                          paylasimIzni: { ...gorevAyarlari.paylasimIzni, baslangicTarihi: e.target.value }
                        })}
                        className="px-2 py-1 border border-stone-300 rounded text-sm w-36"
                      />
                      {gorevAyarlari?.paylasimIzni?.aktif && (
                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">✓</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Yorum İstendi Mi */}
                <div className={`p-3 rounded-lg border ${gorevAyarlari?.yorumIstendiMi?.aktif ? "border-green-400 bg-green-50" : "border-stone-200 bg-stone-50"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">💬</span>
                      <div>
                        <h3 className="font-semibold text-stone-800 text-sm">Yorum İstendi Mi</h3>
                        <p className="text-xs text-stone-500">Düğünü geçmiş + alan boş → Makyajcı/Türbancıya görev</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date" min="2020-01-01" max="2099-12-31"
                        value={gorevAyarlari?.yorumIstendiMi?.baslangicTarihi}
                        onChange={(e) => setGorevAyarlari({
                          ...gorevAyarlari,
                          yorumIstendiMi: { ...gorevAyarlari.yorumIstendiMi, baslangicTarihi: e.target.value }
                        })}
                        className="px-2 py-1 border border-stone-300 rounded text-sm w-36"
                      />
                      {gorevAyarlari?.yorumIstendiMi?.aktif && (
                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">✓</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ödeme Takip */}
                <div className={`p-3 rounded-lg border ${gorevAyarlari?.odemeTakip?.aktif ? "border-green-400 bg-green-50" : "border-stone-200 bg-stone-50"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">💰</span>
                      <div>
                        <h3 className="font-semibold text-stone-800 text-sm">Ödeme Takip</h3>
                        <p className="text-xs text-stone-500">Düğünü geçmiş + ödeme alınmamış → Yöneticilere acil görev</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date" min="2020-01-01" max="2099-12-31"
                        value={gorevAyarlari?.odemeTakip?.baslangicTarihi}
                        onChange={(e) => setGorevAyarlari({
                          ...gorevAyarlari,
                          odemeTakip: { ...gorevAyarlari.odemeTakip, baslangicTarihi: e.target.value }
                        })}
                        className="px-2 py-1 border border-stone-300 rounded text-sm w-36"
                      />
                      {gorevAyarlari?.odemeTakip?.aktif && (
                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">✓</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tek Senkronize Butonu */}
                <div className="pt-3 border-t border-stone-200">
                  <button
                    onClick={handleTumunuSenkronizeEt}
                    disabled={senkronizeLoading !== null}
                    className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition"
                  >
                    {senkronizeLoading ? "⏳ İşleniyor..." : "🔄 Tümünü Kaydet & Senkronize Et"}
                  </button>
                  <p className="text-xs text-stone-500 mt-2 text-center">
                    Belirlediğiniz tarihten bugüne kadarki gelinler kontrol edilir. Gelecek gelinler hesaba katılmaz.
                  </p>
                  <p className="text-xs text-purple-600 mt-1 text-center font-medium">
                    🔄 Senkronize ettikten sonra sistem saatte bir otomatik kontrol yapacaktır. Alan doldurulunca görevler anında silinir.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Otomatik sekmede alt sekmeler */}
          {aktifSekme === "otomatik" && (
            <div className="mb-4">
              <div className="flex flex-wrap gap-1.5 md:gap-2 mb-3">
                <button
                  onClick={() => setOtomatikAltSekme("yorumIstesinMi")}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                    otomatikAltSekme === "yorumIstesinMi"
                      ? "bg-purple-500 text-white"
                      : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  📝 <span className="hidden md:inline">Yorum </span>İstensin Mi
                  <span className="ml-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] md:text-xs">
                    {gorevler.filter(g => g.otomatikMi && g.gorevTuru === "yorumIstesinMi").length}
                  </span>
                </button>
                <button
                  onClick={() => setOtomatikAltSekme("paylasimIzni")}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                    otomatikAltSekme === "paylasimIzni"
                      ? "bg-blue-500 text-white"
                      : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  📸 Paylaşım İzni
                  <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] md:text-xs">
                    {gorevler.filter(g => g.otomatikMi && g.gorevTuru === "paylasimIzni").length}
                  </span>
                </button>
                <button
                  onClick={() => setOtomatikAltSekme("yorumIstendiMi")}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                    otomatikAltSekme === "yorumIstendiMi"
                      ? "bg-amber-500 text-white"
                      : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  💬 <span className="hidden md:inline">Yorum </span>İstenecekler
                  <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] md:text-xs">
                    {gorevler.filter(g => g.otomatikMi && g.gorevTuru === "yorumIstendiMi").length}
                  </span>
                </button>
                <button
                  onClick={() => setOtomatikAltSekme("odemeTakip")}
                  className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                    otomatikAltSekme === "odemeTakip"
                      ? "bg-red-500 text-white"
                      : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  💰 Ödeme Takip
                  <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] md:text-xs">
                    {gorevler.filter(g => g.otomatikMi && g.gorevTuru === "odemeTakip").length}
                  </span>
                </button>
              </div>
              
              <div className={`p-3 rounded-lg border ${
                otomatikAltSekme === "yorumIstesinMi" ? "bg-purple-50 border-purple-200" :
                otomatikAltSekme === "paylasimIzni" ? "bg-blue-50 border-blue-200" :
                otomatikAltSekme === "odemeTakip" ? "bg-red-50 border-red-200" :
                "bg-amber-50 border-amber-200"
              }`}>
                <p className={`text-sm ${
                  otomatikAltSekme === "yorumIstesinMi" ? "text-purple-800" :
                  otomatikAltSekme === "paylasimIzni" ? "text-blue-800" :
                  otomatikAltSekme === "odemeTakip" ? "text-red-800" :
                  "text-amber-800"
                }`}>
                  {otomatikAltSekme === "yorumIstesinMi" && (
                    <>
                      <span className="font-medium">📝 Yorum İstensin Mi görevleri</span>
                      <br />
                      <span className="text-xs opacity-75">Düğünü geçmiş + alan boş → Makyajcı/Türbancıya atanır. "Yaptım"a basarak kontrol edebilirsiniz.</span>
                    </>
                  )}
                  {otomatikAltSekme === "paylasimIzni" && (
                    <>
                      <span className="font-medium">📸 Paylaşım İzni görevleri</span>
                      <br />
                      <span className="text-xs opacity-75">Düğünü geçmiş + alan boş → Makyajcı/Türbancıya atanır. "Yaptım"a basarak kontrol edebilirsiniz.</span>
                    </>
                  )}
                  {otomatikAltSekme === "yorumIstendiMi" && (
                    <>
                      <span className="font-medium">💬 Yorum İstendi Mi görevleri</span>
                      <br />
                      <span className="text-xs opacity-75">Düğünü geçmiş + alan boş → Makyajcı/Türbancıya atanır. "Yaptım"a basarak kontrol edebilirsiniz.</span>
                    </>
                  )}
                  {otomatikAltSekme === "odemeTakip" && (
                    <>
                      <span className="font-medium">💰 Ödeme Takip görevleri</span>
                      <br />
                      <span className="text-xs opacity-75">Düğünü geçmiş + ödeme alınmamış → Yöneticilere acil görev atanır. "Yaptım"a basarak kontrol edebilirsiniz.</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
          
          {/* Tüm Görevler sekmesinde açıklama ve personel seçimi */}
          {aktifSekme === "tumgorevler" && (
            <div className="mb-4 space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-sm text-emerald-800">
                  <span className="font-medium">{userRole === "Kurucu" ? "👑" : "👥"} {userRole === "Kurucu" ? "Tüm personelin" : "Ekibinizin"} görevlerini görüntülüyorsunuz.</span>
                  <br />
                  <span className="text-xs text-emerald-600">Personel seçerek filtreleyebilirsiniz.</span>
                </p>
              </div>
              
              {/* Personel Checkbox'ları */}
              <div className="bg-white rounded-lg border border-stone-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-stone-600">👤 Personel Filtresi</p>
                  {seciliPersoneller.length > 0 && (
                    <button 
                      onClick={() => setSeciliPersoneller([])}
                      className="text-xs text-emerald-600 hover:text-emerald-800"
                    >
                      Temizle
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {personelGorevSayilari.map(p => (
                    <label
                      key={p.id}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition text-sm ${
                        seciliPersoneller.includes(p.email)
                          ? "bg-emerald-100 border-2 border-emerald-400 text-emerald-800"
                          : "bg-stone-50 border border-stone-200 text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={seciliPersoneller.includes(p.email)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSeciliPersoneller([...seciliPersoneller, p.email]);
                          } else {
                            setSeciliPersoneller(seciliPersoneller.filter(email => email !== p.email));
                          }
                        }}
                        className="sr-only"
                      />
                      <span className="font-medium">{p.ad} {p.soyad}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        seciliPersoneller.includes(p.email)
                          ? "bg-emerald-200 text-emerald-800"
                          : "bg-stone-200 text-stone-600"
                      }`}>
                        {p.gorevSayisi}
                      </span>
                    </label>
                  ))}
                </div>
                {seciliPersoneller.length > 0 && (
                  <p className="text-xs text-stone-500 mt-2">
                    {seciliPersoneller.length} personel seçili • {filtreliGorevler.length} görev gösteriliyor
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Filtre Butonları */}
          <div className="mb-3 md:mb-4 flex flex-wrap gap-1.5 md:gap-2">
            <button
              onClick={() => setFiltre("hepsi")}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                filtre === "hepsi"
                  ? aktifSekme === "otomatik" ? "bg-purple-500 text-white" 
                    : aktifSekme === "tumgorevler" ? "bg-emerald-500 text-white"
                    : "bg-amber-500 text-white"
                  : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
              }`}
            >
              Hepsi ({
                aktifSekme === "tumgorevler" ? tumGorevler.length 
                : aktifSekme === "otomatik" ? gorevler.filter(g => g.otomatikMi).length 
                : gorevler.filter(g => !g.otomatikMi).length
              })
            </button>
            <button
              onClick={() => setFiltre("bekliyor")}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                filtre === "bekliyor"
                  ? aktifSekme === "otomatik" ? "bg-purple-500 text-white" 
                    : aktifSekme === "tumgorevler" ? "bg-emerald-500 text-white"
                    : "bg-amber-500 text-white"
                  : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
              }`}
            >
              ⏳ Bekliyor
            </button>
            <button
              onClick={() => setFiltre("devam-ediyor")}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                filtre === "devam-ediyor"
                  ? aktifSekme === "otomatik" ? "bg-purple-500 text-white" 
                    : aktifSekme === "tumgorevler" ? "bg-emerald-500 text-white"
                    : "bg-amber-500 text-white"
                  : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
              }`}
            >
              🔄 <span className="hidden md:inline">Devam </span>Ediyor
            </button>
            <button
              onClick={() => setFiltre("tamamlandi")}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                filtre === "tamamlandi"
                  ? aktifSekme === "otomatik" ? "bg-purple-500 text-white" 
                    : aktifSekme === "tumgorevler" ? "bg-emerald-500 text-white"
                    : "bg-amber-500 text-white"
                  : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
              }`}
            >
              ✅ Tamamlandı
            </button>
            
            {/* Sıralama */}
            <button
              onClick={() => setSiralama(siralama === "yenidenEskiye" ? "eskidenYeniye" : "yenidenEskiye")}
              className="ml-auto px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 transition flex items-center gap-1"
            >
              {siralama === "yenidenEskiye" ? "📅 Yeni → Eski" : "📅 Eski → Yeni"}
            </button>
          </div>

          {/* Görev Listesi */}
          <div className="space-y-4">
            {filtreliGorevler.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-stone-100">
                <span className="text-6xl">📋</span>
                <p className="text-stone-500 mt-4">Henüz görev yok</p>
              </div>
            ) : (
              filtreliGorevler.map((gorev) => (
                <div
                  key={gorev.id}
                  className={`bg-white rounded-lg shadow-sm border-2 p-3 md:p-5 transition hover:shadow-md ${oncelikRenk(gorev.oncelik)}`}
                >
                  <div className="flex items-start justify-between gap-2 md:gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Başlık + Otomatik Badge */}
                      <div className="flex items-start gap-2 mb-1 md:mb-2">
                        <h3 className="text-sm md:text-lg font-semibold text-stone-800 flex-1">{gorev.baslik}</h3>
                        {gorev.otomatikMi && (
                          <span className="bg-purple-100 text-purple-700 text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full font-medium shrink-0">
                            🤖 Otomatik
                          </span>
                        )}
                      </div>

                      {/* Açıklama */}
                      <p className="text-xs md:text-sm text-stone-600 mb-2 md:mb-3">{gorev.aciklama}</p>

                      {/* Meta Bilgiler */}
                      <div className="flex flex-wrap items-center gap-2 md:gap-3 text-[10px] md:text-xs text-stone-500">
                        {/* Tüm Görevler sekmesinde atanan kişiyi göster */}
                        {aktifSekme === "tumgorevler" && (
                          <div className="flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <span>🎯</span>
                            <span className="font-medium text-emerald-700">Atanan: {gorev.atananAd}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <span>👤</span>
                          <span>
                            {gorev.atayan === "Sistem" ? (
                              <span className="font-medium text-purple-600">Sistem (Otomatik)</span>
                            ) : (
                              <span>Atayan: {gorev.atayanAd}</span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span>📅</span>
                          <span>{gorev.olusturulmaTarihi?.toDate?.().toLocaleDateString('tr-TR')}</span>
                        </div>
                        {gorev.gelinId && (
                          <div className="flex items-center gap-1">
                            <span>💄</span>
                            <span className="text-rose-600">Gelin görevi</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Durum Badge */}
                    <div className="shrink-0">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${durumBadge(gorev.durum)}`}>
                        {durumEmojiyon(gorev.durum)} {gorev.durum.charAt(0).toUpperCase() + gorev.durum.slice(1).replace("-", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Otomatik görevlerde gelin bilgisi - tıklanabilir */}
                  {gorev.otomatikMi && gorev.gelinId && (
                    <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
                      <p className="text-xs text-purple-600 mb-1">📅 Gelin Bilgisi:</p>
                      {gorev.gelinBilgi ? (
                        <button 
                          onClick={() => {
                            fetchSingleGelin(gorev.gelinId!);
                            setSelectedGelinId(gorev.gelinId!);
                          }}
                          className="w-full flex items-center gap-3 hover:bg-purple-100 p-2 rounded-lg transition cursor-pointer text-left"
                        >
                          <div className="w-10 h-10 bg-purple-200 rounded-lg flex items-center justify-center text-lg">
                            💍
                          </div>
                          <div>
                            <p className="font-medium text-purple-800">{gorev.gelinBilgi.isim}</p>
                            <p className="text-xs text-purple-600">
                              📆 {new Date(gorev.gelinBilgi.tarih).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} • 🕐 {gorev.gelinBilgi.saat}
                            </p>
                          </div>
                          <span className="ml-auto text-purple-400">→</span>
                        </button>
                      ) : (
                        <p className="text-xs text-stone-500">Gelin bilgisi yükleniyor...</p>
                      )}
                    </div>
                  )}

                  {/* Aksiyon Butonları - SADECE OTOMATİK OLMAYAN GÖREVLER İÇİN */}
                  {!gorev.otomatikMi && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {gorev.durum === "bekliyor" && (
                        <button
                          onClick={() => handleDurumDegistir(gorev.id, "devam-ediyor")}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition"
                        >
                          🔄 Başla
                        </button>
                      )}
                      {gorev.durum === "devam-ediyor" && (
                        <button
                          onClick={() => handleDurumDegistir(gorev.id, "tamamlandi")}
                          className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition"
                        >
                          ✅ Tamamla
                        </button>
                      )}
                      {gorev.durum !== "tamamlandi" && (
                        <button
                          onClick={() => handleDurumDegistir(gorev.id, "iptal")}
                          className="px-4 py-2 bg-stone-400 text-white rounded-lg text-sm font-medium hover:bg-stone-500 transition"
                        >
                          ❌ İptal Et
                        </button>
                      )}
                      <button
                        onClick={() => handleGorevSil(gorev.id)}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition"
                      >
                        🗑️ Sil
                      </button>
                    </div>
                  )}
                  
                  {/* Otomatik görevlerde Yaptım butonu */}
                  {gorev.otomatikMi && (
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`text-xs italic ${gorev.gorevTuru === "odemeTakip" ? "text-red-500" : "text-purple-500"}`}>
                        {gorev.gorevTuru === "odemeTakip" 
                          ? '💰 Takvime "--" eklenince otomatik silinir.'
                          : "ℹ️ Takvimde alan doldurulunca otomatik silinir."}
                      </span>
                      <button
                        onClick={() => handleYaptim(gorev)}
                        disabled={yaptimLoading === gorev.id}
                        className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition"
                      >
                        {yaptimLoading === gorev.id ? "⏳ Kontrol..." : "✅ Yaptım"}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </main>
      </div>

      {/* Gelin Modal */}
      {selectedGelinId && selectedGelin && (
        <GelinModal
          gelin={selectedGelin}
          onClose={() => {
            setSelectedGelinId(null);
            setSelectedGelin(null);
          }}
        />
      )}

      {/* Gelin yüklenirken */}
      {selectedGelinId && gelinLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg">
            <p className="text-stone-600">⏳ Gelin bilgisi yükleniyor...</p>
          </div>
        </div>
      )}
    </div>
  );
}