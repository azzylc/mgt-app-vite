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
  getDoc,
  addDoc,
  arrayUnion
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

interface GorevYorum {
  id: string;
  yazan: string;
  yazanAd: string;
  yorum: string;
  tarih: any;
}

interface Gorev {
  id: string;
  baslik: string;
  aciklama: string;
  atayan: string;
  atayanAd: string;
  atanan: string;
  atananAd: string;
  durum: "bekliyor" | "devam-ediyor" | "tamamlandi" | "iptal";
  oncelik: "dusuk" | "normal" | "yuksek" | "acil";
  olusturulmaTarihi: any;
  tamamlanmaTarihi?: any;
  sonTarih?: string;
  gelinId?: string;
  otomatikMi?: boolean;
  gorevTuru?: "yorumIstesinMi" | "paylasimIzni" | "yorumIstendiMi" | "odemeTakip";
  yorumlar?: GorevYorum[];
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
  const [aktifSekme, setAktifSekme] = useState<"gorevlerim" | "verdigim" | "otomatik" | "tumgorevler">("gorevlerim");
  const [otomatikAltSekme, setOtomatikAltSekme] = useState<"yorumIstesinMi" | "paylasimIzni" | "yorumIstendiMi" | "odemeTakip">("yorumIstesinMi");
  const [seciliPersoneller, setSeciliPersoneller] = useState<string[]>([]); // Seçili personel email'leri
  const [selectedGorev, setSelectedGorev] = useState<Gorev | null>(null);
  const [selectedGelinId, setSelectedGelinId] = useState<string | null>(null);
  const [showAyarlar, setShowAyarlar] = useState(false);
  const [senkronizeLoading, setSenkronizeLoading] = useState<string | null>(null);
  
  // Manuel görev ekleme
  const [showGorevEkle, setShowGorevEkle] = useState(false);
  const [yeniGorev, setYeniGorev] = useState({
    baslik: "",
    aciklama: "",
    atananlar: [] as string[],
    oncelik: "normal" as Gorev["oncelik"],
    sonTarih: ""
  });
  const [gorevEkleLoading, setGorevEkleLoading] = useState(false);
  
  // Görev düzenleme
  const [duzenleMode, setDuzenleMode] = useState(false);
  const [duzenleData, setDuzenleData] = useState({ baslik: "", aciklama: "", oncelik: "normal" as Gorev["oncelik"], sonTarih: "" });
  
  // Görev detay & yorum
  const [detayGorev, setDetayGorev] = useState<Gorev | null>(null);
  const [yeniYorum, setYeniYorum] = useState("");
  const [yorumLoading, setYorumLoading] = useState(false);
  const [tamamlaGorevId, setTamamlaGorevId] = useState<string | null>(null);
  const [tamamlaYorum, setTamamlaYorum] = useState("");
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
    } else if (aktifSekme === "verdigim") {
      // Kullanıcının atadığı manuel görevler
      sonuc = tumGorevler.filter(g => g.atayan === user?.email && !g.otomatikMi);
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
  }, [gorevler, tumGorevler, filtre, aktifSekme, seciliPersoneller, otomatikAltSekme, siralama, user?.email]);

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

  // Görevi yorumla tamamla
  const handleTamamla = async (gorevId: string) => {
    if (!tamamlaYorum.trim()) {
      alert("Lütfen ne yaptığınızı yazın!");
      return;
    }
    try {
      const kpiPersonel = personeller.find(p => p.email === user?.email);
      const yorumEkleyen = kpiPersonel ? `${kpiPersonel.ad} ${kpiPersonel.soyad}` : user?.email || "";
      const tamamlananGorev = [...gorevler, ...tumGorevler].find(g => g.id === gorevId);
      
      await updateDoc(doc(db, "gorevler", gorevId), {
        durum: "tamamlandi",
        tamamlanmaTarihi: serverTimestamp(),
        yorumlar: arrayUnion({
          yazan: user?.email || "",
          yazanAd: yorumEkleyen,
          yorum: `✅ Tamamlandı: ${tamamlaYorum.trim()}`,
          tarih: new Date().toISOString()
        })
      });

      // Push bildirim: atayan kişiye
      if (tamamlananGorev && tamamlananGorev.atayan !== user?.email && tamamlananGorev.atayan !== "Sistem") {
        try {
          await fetch('https://europe-west1-gmt-test-99b30.cloudfunctions.net/sendGorevTamamBildirim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              atayan: tamamlananGorev.atayan,
              tamamlayanAd: yorumEkleyen,
              baslik: tamamlananGorev.baslik
            })
          });
        } catch (pushErr) {
          console.warn('[PUSH] Tamamlama bildirimi gönderilemedi:', pushErr);
        }
      }
      
      setTamamlaGorevId(null);
      setTamamlaYorum("");
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Görev tamamlanamadı!");
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

  // Manuel görev oluştur (çoklu atama - her kişi için ayrı doküman)
  const handleGorevOlustur = async () => {
    if (!yeniGorev.baslik.trim()) {
      alert("Lütfen görev başlığı girin!");
      return;
    }
    if (yeniGorev.atananlar.length === 0) {
      alert("Lütfen en az bir kişi seçin!");
      return;
    }

    setGorevEkleLoading(true);
    try {
      const atayanPersonel = personeller.find(p => p.email === user?.email);
      const atayanAd = atayanPersonel ? `${atayanPersonel.ad} ${atayanPersonel.soyad}` : user?.email || "";
      const grupId = Date.now().toString();
      
      for (const atananEmail of yeniGorev.atananlar) {
        const atananPersonel = personeller.find(p => p.email === atananEmail);
        
        await addDoc(collection(db, "gorevler"), {
          baslik: yeniGorev.baslik.trim(),
          aciklama: yeniGorev.aciklama.trim(),
          atayan: user?.email || "",
          atayanAd,
          atanan: atananEmail,
          atananAd: atananPersonel ? `${atananPersonel.ad} ${atananPersonel.soyad}` : atananEmail,
          durum: "bekliyor",
          oncelik: yeniGorev.oncelik,
          sonTarih: yeniGorev.sonTarih || "",
          otomatikMi: false,
          yorumlar: [],
          grupId: yeniGorev.atananlar.length > 1 ? grupId : "",
          olusturulmaTarihi: serverTimestamp()
        });

        // Push bildirim gönder (kendine atamadıysa)
        if (atananEmail !== user?.email) {
          try {
            await fetch('https://europe-west1-gmt-test-99b30.cloudfunctions.net/sendGorevBildirim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                atanan: atananEmail,
                atayanAd,
                baslik: yeniGorev.baslik.trim(),
                oncelik: yeniGorev.oncelik
              })
            });
          } catch (pushErr) {
            console.warn('[PUSH] Bildirim gönderilemedi:', pushErr);
          }
        }
      }

      setYeniGorev({ baslik: "", aciklama: "", atananlar: [], oncelik: "normal", sonTarih: "" });
      setShowGorevEkle(false);
      alert(`✅ ${yeniGorev.atananlar.length} kişiye görev atandı!`);
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Görev oluşturulamadı!");
    } finally {
      setGorevEkleLoading(false);
    }
  };

  // Göreve yorum ekle
  const handleYorumEkle = async () => {
    if (!detayGorev || !yeniYorum.trim()) return;
    
    setYorumLoading(true);
    try {
      const yazanPersonel = personeller.find(p => p.email === user?.email);
      const yorumData = {
        id: Date.now().toString(),
        yazan: user?.email || "",
        yazanAd: yazanPersonel ? `${yazanPersonel.ad} ${yazanPersonel.soyad}` : user?.email || "",
        yorum: yeniYorum.trim(),
        tarih: new Date().toISOString()
      };

      await updateDoc(doc(db, "gorevler", detayGorev.id), {
        yorumlar: arrayUnion(yorumData)
      });

      // Push bildirim: görevdeki herkese (yorum yapan hariç)
      try {
        await fetch('https://europe-west1-gmt-test-99b30.cloudfunctions.net/sendGorevYorumBildirim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            yorumYapan: user?.email || "",
            yorumYapanAd: yorumData.yazanAd,
            atayan: detayGorev.atayan,
            atanan: detayGorev.atanan,
            baslik: detayGorev.baslik
          })
        });
      } catch (pushErr) {
        console.warn('[PUSH] Yorum bildirimi gönderilemedi:', pushErr);
      }

      setDetayGorev({
        ...detayGorev,
        yorumlar: [...(detayGorev.yorumlar || []), yorumData]
      });
      setYeniYorum("");
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Yorum eklenemedi!");
    } finally {
      setYorumLoading(false);
    }
  };

  // Görev düzenle (sadece atayan kişi)
  const handleGorevDuzenle = async () => {
    if (!detayGorev) return;
    try {
      await updateDoc(doc(db, "gorevler", detayGorev.id), {
        baslik: duzenleData.baslik.trim(),
        aciklama: duzenleData.aciklama.trim(),
        oncelik: duzenleData.oncelik,
        sonTarih: duzenleData.sonTarih || ""
      });
      setDetayGorev({
        ...detayGorev,
        baslik: duzenleData.baslik.trim(),
        aciklama: duzenleData.aciklama.trim(),
        oncelik: duzenleData.oncelik,
        sonTarih: duzenleData.sonTarih
      });
      setDuzenleMode(false);
      alert("✅ Görev güncellendi!");
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Güncelleme başarısız!");
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

  // Silme yetkisi: Kurucu hep, Yönetici ekibini, atayan kendi görevini silebilir
  const canDeleteGorev = (gorev: Gorev) => {
    if (userRole === "Kurucu") return true;
    if (userRole === "Yönetici") return true;
    if (gorev.atayan === user?.email) return true;
    return false;
  };

  const oncelikRenk = (oncelik: string) => {
    switch (oncelik) {
      case "acil": return "border-l-red-400";
      case "yuksek": return "border-l-amber-400";
      case "normal": return "border-l-sky-300";
      case "dusuk": return "border-l-stone-300";
      default: return "border-l-stone-200";
    }
  };

  const durumBadge = (durum: string) => {
    switch (durum) {
      case "bekliyor": return "bg-yellow-50 text-yellow-700";
      case "devam-ediyor": return "bg-blue-50 text-blue-700";
      case "tamamlandi": return "bg-emerald-50 text-emerald-700";
      case "iptal": return "bg-stone-100 text-stone-600";
      default: return "bg-stone-100 text-stone-600";
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
    <div className="min-h-screen bg-stone-50/50">
      <div className="flex-1">
        <header className="bg-white/80 backdrop-blur-sm sticky top-0 z-10 border-b border-stone-100">
          <div className="px-3 md:px-5 py-2 flex items-center justify-between">
            <h1 className="text-sm md:text-base font-bold text-stone-800">✅ Görevler</h1>
            
            {/* Kurucu için Ayarlar Butonu */}
            <div className="flex items-center gap-2">
              {(userRole === "Kurucu" || userRole === "Yönetici") && (
                <button
                  onClick={() => setShowGorevEkle(true)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition"
                >
                  ➕ Görev Ata
                </button>
              )}
              {userRole === "Kurucu" && (
                <button
                  onClick={() => setShowAyarlar(!showAyarlar)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    showAyarlar 
                      ? "bg-stone-800 text-white" 
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  ⚙️ <span className="hidden md:inline">Görev </span>Ayarları
                </button>
              )}
            </div>
          </div>
          
          {/* Ana Sekmeler */}
          <div className="px-2 md:px-5 flex gap-0 border-t border-stone-100 overflow-x-auto">
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
            
            {/* Kurucu ve Yönetici için Verdiğim Görevler sekmesi */}
            {(userRole === "Kurucu" || userRole === "Yönetici") && (
              <button
                onClick={() => { setAktifSekme("verdigim"); setFiltre("hepsi"); }}
                className={`px-2.5 md:px-4 py-2 md:py-2.5 font-medium text-xs md:text-sm transition border-b-2 whitespace-nowrap ${
                  aktifSekme === "verdigim"
                    ? "border-sky-500 text-sky-600 bg-sky-50/50"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                }`}
              >
                📤 <span className="hidden md:inline">Verdiğim </span>Görevler
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  aktifSekme === "verdigim" ? "bg-sky-100 text-sky-700" : "bg-stone-100 text-stone-500"
                }`}>
                  {tumGorevler.filter(g => g.atayan === user?.email && !g.otomatikMi).length}
                </span>
              </button>
            )}

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

        <main className="p-3 md:p-4 max-w-5xl mx-auto">
          {/* Görev Ayarları Paneli - Sadece Kurucu */}
          {showAyarlar && userRole === "Kurucu" && (
            <div className="mb-4 bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="bg-stone-800 text-white px-4 py-2.5 flex items-center justify-between">
                <h2 className="font-bold text-sm">⚙️ Otomatik Görev Ayarları</h2>
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
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
            <div className="mb-3 space-y-2">
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-2.5">
                <p className="text-xs text-emerald-700">
                  <span className="font-medium">{userRole === "Kurucu" ? "👑" : "👥"} {userRole === "Kurucu" ? "Tüm personelin" : "Ekibinizin"} görevleri</span>
                  <span className="text-emerald-500 ml-1">• Personel seçerek filtreleyin</span>
                </p>
              </div>
              
              {/* Personel Checkbox'ları */}
              <div className="bg-white rounded-xl border border-stone-100 p-2.5">
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
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
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
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
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
              onClick={() => setFiltre("tamamlandi")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
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
              className="ml-auto px-2.5 py-1 rounded-lg text-xs font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 transition flex items-center gap-1"
            >
              {siralama === "yenidenEskiye" ? "📅 Yeni → Eski" : "📅 Eski → Yeni"}
            </button>
          </div>

          {/* Görev Listesi */}
          <div className="space-y-2">
            {filtreliGorevler.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-stone-100">
                <span className="text-3xl">📋</span>
                <p className="text-stone-400 mt-2 text-sm">Henüz görev yok</p>
              </div>
            ) : (
              filtreliGorevler.map((gorev) => (
                <div
                  key={gorev.id}
                  onClick={() => setDetayGorev(gorev)}
                  className={`bg-white rounded-xl border border-stone-100 border-l-[3px] ${oncelikRenk(gorev.oncelik)} p-3 transition hover:shadow-md cursor-pointer`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Başlık + Badge'ler */}
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <h3 className="text-xs md:text-sm font-semibold text-stone-800 truncate">{gorev.baslik}</h3>
                        {gorev.otomatikMi && (
                          <span className="bg-purple-50 text-purple-600 text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0">🤖 Oto</span>
                        )}
                        {!gorev.otomatikMi && gorev.oncelik && gorev.oncelik !== "normal" && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                            gorev.oncelik === "acil" ? "bg-red-50 text-red-600" :
                            gorev.oncelik === "yuksek" ? "bg-amber-50 text-amber-600" :
                            "bg-sky-50 text-sky-600"
                          }`}>
                            {gorev.oncelik === "acil" ? "Acil" : gorev.oncelik === "yuksek" ? "Yüksek" : "Düşük"}
                          </span>
                        )}
                      </div>

                      {/* Açıklama */}
                      {gorev.aciklama && (
                        <p className="text-[10px] md:text-xs text-stone-500 mb-1.5 line-clamp-1 break-all">{gorev.aciklama}</p>
                      )}

                      {/* Meta Bilgiler */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-stone-400">
                        {/* Tüm Görevler veya Verdiğim sekmesinde atanan kişiyi göster */}
                        {(aktifSekme === "tumgorevler" || aktifSekme === "verdigim") && (
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
                        {gorev.sonTarih && (
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${
                            new Date(gorev.sonTarih) < new Date() && gorev.durum !== "tamamlandi" 
                              ? "bg-red-50 text-red-600 font-medium" 
                              : "bg-stone-50"
                          }`}>
                            <span>⏰</span>
                            <span>Son: {new Date(gorev.sonTarih).toLocaleDateString('tr-TR')}</span>
                          </div>
                        )}
                        {gorev.gelinId && (
                          <div className="flex items-center gap-1">
                            <span>💄</span>
                            <span className="text-rose-600">Gelin görevi</span>
                          </div>
                        )}
                        {(gorev.yorumlar?.length || 0) > 0 && (
                          <div className="flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-full">
                            <span>💬</span>
                            <span className="text-blue-600 font-medium">{gorev.yorumlar!.length} yorum</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Durum Badge */}
                    <div className="shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${durumBadge(gorev.durum)}`}>
                        {durumEmojiyon(gorev.durum)} {gorev.durum === "devam-ediyor" ? "Devam" : gorev.durum.charAt(0).toUpperCase() + gorev.durum.slice(1)}
                      </span>
                    </div>
                  </div>

                  {/* Otomatik görevlerde gelin bilgisi - tıklanabilir */}
                  {gorev.otomatikMi && gorev.gelinId && (
                    <div className="mt-2 p-2 bg-purple-50/50 rounded-lg" onClick={e => e.stopPropagation()}>
                      {gorev.gelinBilgi ? (
                        <button 
                          onClick={() => {
                            fetchSingleGelin(gorev.gelinId!);
                            setSelectedGelinId(gorev.gelinId!);
                          }}
                          className="w-full flex items-center gap-2 hover:bg-purple-100/50 p-1 rounded-lg transition cursor-pointer text-left"
                        >
                          <span className="text-sm">💍</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-purple-800 truncate">{gorev.gelinBilgi.isim}</p>
                            <p className="text-[10px] text-purple-500">
                              {new Date(gorev.gelinBilgi.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} • {gorev.gelinBilgi.saat}
                            </p>
                          </div>
                          <span className="text-purple-300 text-xs">→</span>
                        </button>
                      ) : (
                        <p className="text-[10px] text-stone-400">Yükleniyor...</p>
                      )}
                    </div>
                  )}

                  {/* Aksiyon Butonları */}
                  {!gorev.otomatikMi && gorev.durum !== "tamamlandi" && (
                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                      {tamamlaGorevId === gorev.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={tamamlaYorum}
                            onChange={e => setTamamlaYorum(e.target.value)}
                            placeholder="Ne yaptınız? Kısa bir not bırakın..."
                            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs resize-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 outline-none"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleTamamla(gorev.id)}
                              className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition"
                            >
                              ✅ Onayla
                            </button>
                            <button
                              onClick={() => { setTamamlaGorevId(null); setTamamlaYorum(""); }}
                              className="px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs hover:bg-stone-200 transition"
                            >
                              Vazgeç
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setTamamlaGorevId(gorev.id)}
                            className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition"
                          >
                            ✅ Tamamla
                          </button>
                          {canDeleteGorev(gorev) && (
                            <button
                              onClick={() => handleGorevSil(gorev.id)}
                              className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tamamlanmış görev bilgisi */}
                  {!gorev.otomatikMi && gorev.durum === "tamamlandi" && (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-600" onClick={e => e.stopPropagation()}>
                      <span>✅ Tamamlandı</span>
                      {gorev.yorumlar && gorev.yorumlar.length > 0 && (
                        <span className="text-stone-400">• {gorev.yorumlar.length} yorum</span>
                      )}
                      {canDeleteGorev(gorev) && (
                        <button
                          onClick={() => handleGorevSil(gorev.id)}
                          className="ml-auto p-1 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Otomatik görevlerde Yaptım butonu */}
                  {gorev.otomatikMi && (
                    <div className="mt-2 flex items-center justify-between" onClick={e => e.stopPropagation()}>
                      <span className={`text-[10px] italic ${gorev.gorevTuru === "odemeTakip" ? "text-red-400" : "text-purple-400"}`}>
                        {gorev.gorevTuru === "odemeTakip" 
                          ? '💰 "--" eklenince silinir'
                          : "ℹ️ Alan dolunca silinir"}
                      </span>
                      <button
                        onClick={() => handleYaptim(gorev)}
                        disabled={yaptimLoading === gorev.id}
                        className="px-2.5 py-1 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 transition"
                      >
                        {yaptimLoading === gorev.id ? "⏳..." : "✅ Yaptım"}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-xl shadow-lg">
            <p className="text-stone-500 text-sm">⏳ Gelin bilgisi yükleniyor...</p>
          </div>
        </div>
      )}

      {/* ==================== GÖREV EKLE MODAL ==================== */}
      {showGorevEkle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3" onClick={() => setShowGorevEkle(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-500 to-amber-400 text-white px-4 py-3 rounded-t-xl flex items-center justify-between">
              <h2 className="font-bold text-sm">➕ Yeni Görev Ata</h2>
              <button onClick={() => setShowGorevEkle(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>
            
            <div className="p-5 space-y-4">
              {/* Başlık */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Görev Başlığı *</label>
                <input
                  type="text"
                  value={yeniGorev.baslik}
                  onChange={e => setYeniGorev({...yeniGorev, baslik: e.target.value})}
                  placeholder="Görev başlığını yazın..."
                  className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Açıklama */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Açıklama</label>
                <textarea
                  value={yeniGorev.aciklama}
                  onChange={e => setYeniGorev({...yeniGorev, aciklama: e.target.value})}
                  placeholder="Görev detaylarını yazın..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              {/* Atanacak Kişiler */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Atanacak Kişi(ler) *</label>
                <div className="border border-stone-300 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                  {/* Tümünü Seç */}
                  <label className="flex items-center gap-2 p-1.5 rounded hover:bg-amber-50 cursor-pointer border-b border-stone-100 pb-2 mb-1">
                    <input
                      type="checkbox"
                      checked={yeniGorev.atananlar.length === ekipPersonelleri.length}
                      onChange={() => {
                        if (yeniGorev.atananlar.length === ekipPersonelleri.length) {
                          setYeniGorev({...yeniGorev, atananlar: []});
                        } else {
                          setYeniGorev({...yeniGorev, atananlar: ekipPersonelleri.map(p => p.email)});
                        }
                      }}
                      className="rounded border-stone-300 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-sm font-medium text-stone-700">Tümünü Seç ({ekipPersonelleri.length})</span>
                  </label>
                  {ekipPersonelleri.map(p => (
                    <label key={p.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-stone-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={yeniGorev.atananlar.includes(p.email)}
                        onChange={() => {
                          const yeni = yeniGorev.atananlar.includes(p.email)
                            ? yeniGorev.atananlar.filter(e => e !== p.email)
                            : [...yeniGorev.atananlar, p.email];
                          setYeniGorev({...yeniGorev, atananlar: yeni});
                        }}
                        className="rounded border-stone-300 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-stone-700">{p.ad} {p.soyad}</span>
                    </label>
                  ))}
                </div>
                {yeniGorev.atananlar.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1">{yeniGorev.atananlar.length} kişi seçildi</p>
                )}
              </div>

              {/* Aciliyet + Son Tarih */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Aciliyet</label>
                  <select
                    value={yeniGorev.oncelik}
                    onChange={e => setYeniGorev({...yeniGorev, oncelik: e.target.value as Gorev["oncelik"]})}
                    className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="dusuk">🔵 Düşük</option>
                    <option value="normal">⚪ Normal</option>
                    <option value="yuksek">🟠 Yüksek</option>
                    <option value="acil">🔴 Acil</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Son Tarih</label>
                  <input
                    type="date"
                    value={yeniGorev.sonTarih}
                    onChange={e => setYeniGorev({...yeniGorev, sonTarih: e.target.value})}
                    className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Kaydet */}
              <button
                onClick={handleGorevOlustur}
                disabled={gorevEkleLoading}
                className="w-full py-3 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 disabled:opacity-50 transition text-sm"
              >
                {gorevEkleLoading ? "⏳ Oluşturuluyor..." : `✅ Görev Oluştur${yeniGorev.atananlar.length > 1 ? ` (${yeniGorev.atananlar.length} kişi)` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== GÖREV DETAY MODAL ==================== */}
      {detayGorev && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3" onClick={() => { setDetayGorev(null); setYeniYorum(""); setDuzenleMode(false); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={`px-4 py-3 rounded-t-xl flex items-center justify-between ${
              detayGorev.oncelik === "acil" ? "bg-gradient-to-r from-red-500 to-red-400 text-white" :
              detayGorev.oncelik === "yuksek" ? "bg-gradient-to-r from-amber-500 to-amber-400 text-white" :
              detayGorev.oncelik === "dusuk" ? "bg-gradient-to-r from-sky-500 to-sky-400 text-white" :
              "bg-gradient-to-r from-stone-700 to-stone-600 text-white"
            }`}>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-sm md:text-base truncate">{detayGorev.baslik}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] opacity-80">
                    {detayGorev.oncelik === "acil" ? "Acil" : detayGorev.oncelik === "yuksek" ? "Yüksek" : detayGorev.oncelik === "dusuk" ? "Düşük" : "Normal"} 
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
                    {durumEmojiyon(detayGorev.durum)} {detayGorev.durum === "devam-ediyor" ? "Devam" : detayGorev.durum.charAt(0).toUpperCase() + detayGorev.durum.slice(1)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Düzenle butonu - sadece atayan kişi ve manuel görevler */}
                {!detayGorev.otomatikMi && detayGorev.atayan === user?.email && !duzenleMode && (
                  <button
                    onClick={() => {
                      setDuzenleMode(true);
                      setDuzenleData({
                        baslik: detayGorev.baslik,
                        aciklama: detayGorev.aciklama,
                        oncelik: detayGorev.oncelik,
                        sonTarih: detayGorev.sonTarih || ""
                      });
                    }}
                    className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition"
                  >
                    ✏️ Düzenle
                  </button>
                )}
                <button onClick={() => { setDetayGorev(null); setYeniYorum(""); setDuzenleMode(false); }} className="text-white/80 hover:text-white text-xl">✕</button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* DÜZENLEME MODU */}
              {duzenleMode ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Başlık</label>
                    <input
                      type="text"
                      value={duzenleData.baslik}
                      onChange={e => setDuzenleData({...duzenleData, baslik: e.target.value})}
                      className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Açıklama</label>
                    <textarea
                      value={duzenleData.aciklama}
                      onChange={e => setDuzenleData({...duzenleData, aciklama: e.target.value})}
                      rows={3}
                      className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Aciliyet</label>
                      <select
                        value={duzenleData.oncelik}
                        onChange={e => setDuzenleData({...duzenleData, oncelik: e.target.value as Gorev["oncelik"]})}
                        className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                      >
                        <option value="dusuk">🔵 Düşük</option>
                        <option value="normal">⚪ Normal</option>
                        <option value="yuksek">🟠 Yüksek</option>
                        <option value="acil">🔴 Acil</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Son Tarih</label>
                      <input
                        type="date"
                        value={duzenleData.sonTarih}
                        onChange={e => setDuzenleData({...duzenleData, sonTarih: e.target.value})}
                        className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleGorevDuzenle} className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 transition text-sm">
                      ✅ Kaydet
                    </button>
                    <button onClick={() => setDuzenleMode(false)} className="px-4 py-2.5 bg-stone-200 text-stone-700 rounded-lg font-medium hover:bg-stone-300 transition text-sm">
                      İptal
                    </button>
                  </div>
                </div>
              ) : (
              /* GÖRÜNTÜLEME MODU */
              <div className="space-y-3">
                {detayGorev.aciklama && (
                  <div className="p-3 bg-stone-50 rounded-lg">
                    <p className="text-xs font-medium text-stone-500 mb-1">📝 Açıklama</p>
                    <p className="text-sm text-stone-700 whitespace-pre-wrap">{detayGorev.aciklama}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-stone-50 rounded-lg">
                    <p className="text-xs font-medium text-stone-500 mb-1">🎯 Atanan</p>
                    <p className="text-stone-700 font-medium">{detayGorev.atananAd}</p>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-lg">
                    <p className="text-xs font-medium text-stone-500 mb-1">👤 Atayan</p>
                    <p className="text-stone-700 font-medium">
                      {detayGorev.atayan === "Sistem" ? "🤖 Sistem (Otomatik)" : detayGorev.atayanAd}
                    </p>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-lg">
                    <p className="text-xs font-medium text-stone-500 mb-1">📅 Oluşturulma</p>
                    <p className="text-stone-700">{detayGorev.olusturulmaTarihi?.toDate?.().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                  {detayGorev.sonTarih && (
                    <div className={`p-3 rounded-lg ${
                      new Date(detayGorev.sonTarih) < new Date() && detayGorev.durum !== "tamamlandi"
                        ? "bg-red-50 border border-red-200"
                        : "bg-stone-50"
                    }`}>
                      <p className="text-xs font-medium text-stone-500 mb-1">⏰ Son Tarih</p>
                      <p className={`font-medium ${
                        new Date(detayGorev.sonTarih) < new Date() && detayGorev.durum !== "tamamlandi"
                          ? "text-red-600" : "text-stone-700"
                      }`}>
                        {new Date(detayGorev.sonTarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {new Date(detayGorev.sonTarih) < new Date() && detayGorev.durum !== "tamamlandi" && " ⚠️ Gecikmiş!"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Durum Değiştirme */}
              {!detayGorev.otomatikMi && (
                <div className="flex flex-wrap gap-2 p-3 bg-stone-50 rounded-xl">
                  {detayGorev.durum !== "tamamlandi" && (
                    <>
                      <button 
                        onClick={() => { setTamamlaGorevId(detayGorev.id); }}
                        className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition">
                        ✅ Tamamla
                      </button>
                      {tamamlaGorevId === detayGorev.id && (
                        <div className="w-full mt-2 space-y-2">
                          <textarea
                            value={tamamlaYorum}
                            onChange={e => setTamamlaYorum(e.target.value)}
                            placeholder="Ne yaptınız? Kısa bir not bırakın..."
                            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={async () => { 
                                await handleTamamla(detayGorev.id); 
                                setDetayGorev({...detayGorev, durum: "tamamlandi"}); 
                              }}
                              className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition">
                              ✅ Onayla
                            </button>
                            <button
                              onClick={() => { setTamamlaGorevId(null); setTamamlaYorum(""); }}
                              className="px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs hover:bg-stone-200 transition">
                              Vazgeç
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {detayGorev.durum === "tamamlandi" && (
                    <span className="text-xs text-emerald-600 font-medium">✅ Bu görev tamamlandı</span>
                  )}
                  {canDeleteGorev(detayGorev) && (
                    <button 
                      onClick={() => { handleGorevSil(detayGorev.id); setDetayGorev(null); }}
                      className="ml-auto px-2.5 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-xs transition">
                      🗑️ Sil
                    </button>
                  )}
                </div>
              )}

              {/* Yorumlar */}
              <div>
                <h3 className="font-semibold text-stone-800 text-sm mb-2 flex items-center gap-2">
                  💬 Yorumlar
                  <span className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded-full text-stone-500">
                    {detayGorev.yorumlar?.length || 0}
                  </span>
                </h3>

                {/* Yorum Listesi */}
                <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                  {(!detayGorev.yorumlar || detayGorev.yorumlar.length === 0) ? (
                    <p className="text-sm text-stone-400 text-center py-4">Henüz yorum yok. İlk yorumu ekleyin!</p>
                  ) : (
                    detayGorev.yorumlar.map((yorum) => (
                      <div key={yorum.id} className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-stone-700">👤 {yorum.yazanAd}</span>
                          <span className="text-[10px] text-stone-400">
                            {new Date(yorum.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} {new Date(yorum.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-stone-600 whitespace-pre-wrap">{yorum.yorum}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Yorum Ekle */}
                <div className="flex gap-2">
                  <textarea
                    value={yeniYorum}
                    onChange={e => setYeniYorum(e.target.value)}
                    placeholder="Yorum veya not ekleyin... (ne yaptınız, nasıl yaptınız)"
                    rows={2}
                    className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm resize-none"
                  />
                  <button
                    onClick={handleYorumEkle}
                    disabled={yorumLoading || !yeniYorum.trim()}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition self-end"
                  >
                    {yorumLoading ? "⏳" : "Gönder"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}