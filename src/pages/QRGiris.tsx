import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../lib/firebase";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { 
  collection, 
  query, 
  where, 
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy,
  limit,
  Timestamp
} from "firebase/firestore";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useAuth } from "../context/RoleProvider";

// ============================================
// INTERFACES
// ============================================
interface Personel {
  id: string;
  ad: string;
  soyad: string;
  email: string;
  foto: string;
}

interface SonIslem {
  tip: "giris" | "cikis";
  tarih: any;
  konumAdi: string;
}

interface Konum {
  id: string;
  karekod: string;
  konumAdi: string;
  lat: number;
  lng: number;
  maksimumOkutmaUzakligi: number;
  aktif: boolean;
}

interface AttendanceRecord {
  id: string;
  tip: "giris" | "cikis";
  tarih: any;
  konumAdi: string;
  mesafe?: number;
}

interface BugunOzet {
  girisVar: boolean;
  cikisVar: boolean;
  ilkGirisSaat: string;
  sonCikisSaat: string;
  kayitSayisi: number;
}

type Tab = "qr" | "kayitlarim";
type IslemSecimi = "giris" | "cikis" | null;

// ============================================
// CONSTANTS
// ============================================
const COOLDOWN_SURE_MS = 3 * 60 * 1000; // 3 dakika cooldown

export default function QRGirisPage() {
  const user = useAuth();
  const [personel, setPersonel] = useState<Personel | null>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [durum, setDurum] = useState<"bekleniyor" | "basarili" | "hata">("bekleniyor");
  const [mesaj, setMesaj] = useState("");
  const [sonIslem, setSonIslem] = useState<SonIslem | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationError, setLocationError] = useState("");
  
  // Yeni: İşlem seçimi & akıllı kontroller
  const [islemSecimi, setIslemSecimi] = useState<IslemSecimi>(null);
  const [bugunOzet, setBugunOzet] = useState<BugunOzet | null>(null);
  const [uyariMesaj, setUyariMesaj] = useState("");
  const [uyariOnay, setUyariOnay] = useState(false); // Kullanıcı uyarıyı onayladı mı
  
  // Self-servis (Kayıtlarım) state
  const [activeTab, setActiveTab] = useState<Tab>("qr");
  const [kayitlar, setKayitlar] = useState<AttendanceRecord[]>([]);
  const [kayitLoading, setKayitLoading] = useState(false);
  const [seciliHafta, setSeciliHafta] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return toDateStr(monday);
  });

  // ============================================
  // 🔧 Personel bilgisini çek (BUG FIX)
  // ============================================
  useEffect(() => {
    if (!user?.email) return;
    
    (async () => {
      try {
        const q = query(collection(db, "personnel"), where("email", "==", user.email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const data = snapshot.docs[0];
          const p = { id: data.id, ...data.data() } as Personel;
          setPersonel(p);
          fetchSonIslem(p.id);
          fetchBugunOzet(p.id);
        }
      } catch (error) {
        console.error("[QRGiris] Personel bilgisi alınamadı:", error);
      }
    })();
  }, [user?.email]);

  // Native platformda konum iznini sayfa açılınca al
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      Geolocation.requestPermissions().catch(() => {});
    }
  }, []);

  // ============================================
  // 📊 Son işlem & bugünkü özet çek
  // ============================================
  const fetchSonIslem = async (personelId: string) => {
    try {
      const q = query(
        collection(db, "attendance"),
        where("personelId", "==", personelId),
        where("tip", "in", ["giris", "cikis"]),
        orderBy("tarih", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setSonIslem({ tip: data.tip, tarih: data.tarih, konumAdi: data.konumAdi });
      }
    } catch (error) {
      console.error("[QRGiris] Son işlem alınamadı:", error);
    }
  };

  const fetchBugunOzet = async (personelId: string) => {
    try {
      const bugunBaslangic = new Date();
      bugunBaslangic.setHours(0, 0, 0, 0);
      const bugunBitis = new Date();
      bugunBitis.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, "attendance"),
        where("personelId", "==", personelId),
        where("tarih", ">=", Timestamp.fromDate(bugunBaslangic)),
        where("tarih", "<=", Timestamp.fromDate(bugunBitis)),
        orderBy("tarih", "asc")
      );
      const snapshot = await getDocs(q);
      
      let girisVar = false;
      let cikisVar = false;
      let ilkGirisSaat = "";
      let sonCikisSaat = "";

      snapshot.docs.forEach(d => {
        const data = d.data();
        const tarih = data.tarih?.toDate ? data.tarih.toDate() : new Date(data.tarih);
        const saat = tarih.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
        
        if (data.tip === "giris") {
          if (!girisVar) ilkGirisSaat = saat; // İlk giriş
          girisVar = true;
        }
        if (data.tip === "cikis") {
          sonCikisSaat = saat; // Son çıkış (üzerine yaz)
          cikisVar = true;
        }
      });

      setBugunOzet({
        girisVar,
        cikisVar,
        ilkGirisSaat,
        sonCikisSaat,
        kayitSayisi: snapshot.docs.length,
      });
    } catch (error) {
      console.error("[QRGiris] Bugün özet alınamadı:", error);
    }
  };

  // ============================================
  // 🛡️ Akıllı kontrol & uyarı sistemi
  // ============================================
  const kontrolEtVeBasla = useCallback(async (tip: IslemSecimi) => {
    if (!tip || !personel?.id) return;
    
    setIslemSecimi(tip);
    setUyariMesaj("");
    setUyariOnay(false);
    setLocationError("");
    setMesaj("");
    setDurum("bekleniyor");

    // 1. Cooldown kontrolü
    if (sonIslem?.tarih) {
      const sonTarih = sonIslem.tarih?.toDate ? sonIslem.tarih.toDate() : new Date(sonIslem.tarih);
      const fark = Date.now() - sonTarih.getTime();
      
      if (fark >= 0 && fark < COOLDOWN_SURE_MS) {
        const kalanSn = Math.ceil((COOLDOWN_SURE_MS - fark) / 1000);
        const kalanDk = Math.floor(kalanSn / 60);
        const kalanSnKalan = kalanSn % 60;
        setUyariMesaj(
          `⏱️ Son işleminizden henüz ${kalanDk > 0 ? kalanDk + " dk " : ""}${kalanSnKalan} sn geçti.\n\nYanlışlıkla mı okuttunuz? ${kalanDk > 0 ? kalanDk + " dk " : ""}${kalanSnKalan} sn sonra tekrar deneyebilirsiniz.`
        );
        return;
      }
    }

    // 2. Akıllı uyarılar
    if (tip === "giris" && bugunOzet?.girisVar) {
      setUyariMesaj(`Bugün zaten ${bugunOzet.ilkGirisSaat}'da giriş yaptınız.\n\nTekrar giriş kaydetmek istiyor musunuz?`);
      return;
    }

    if (tip === "cikis" && !bugunOzet?.girisVar) {
      setUyariMesaj(`Bugün giriş kaydınız yok.\n\nYine de çıkış kaydetmek istiyor musunuz?`);
      return;
    }

    if (tip === "cikis" && bugunOzet?.cikisVar) {
      setUyariMesaj(`Bugün zaten ${bugunOzet.sonCikisSaat}'da çıkış yaptınız.\n\nTekrar çıkış kaydetmek istiyor musunuz?`);
      return;
    }

    // 3. Dünkü eksik çıkış uyarısı
    if (tip === "giris" && sonIslem?.tip === "giris") {
      const sonTarih = sonIslem.tarih?.toDate ? sonIslem.tarih.toDate() : new Date(sonIslem.tarih);
      const bugun = new Date();
      if (toDateStr(sonTarih) !== toDateStr(bugun)) {
        // Farklı gün + son işlem giriş = dünkü çıkış eksik
        const gunStr = sonTarih.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
        setUyariMesaj(`⚠️ ${gunStr} tarihli çıkış kaydınız eksik.\n\nBugünkü giriş kaydınız oluşturulacak.`);
        // Bu uyarı bilgilendirme amaçlı, direkt devam edebilir
        startScanning();
        return;
      }
    }

    // Sorun yok → direkt taramaya başla
    startScanning();
  }, [personel?.id, sonIslem, bugunOzet]);

  const uyariOnayla = () => {
    setUyariOnay(true);
    setUyariMesaj("");
    startScanning();
  };

  // ============================================
  // 📷 QR Tarama
  // ============================================
  const getLocation = (): Promise<{lat: number, lng: number}> => {
    if (Capacitor.isNativePlatform()) {
      return Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      }).then((position) => ({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }));
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Tarayıcınız konum özelliğini desteklemiyor"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => {
          const messages: Record<number, string> = {
            1: "Konum izni reddedildi",
            2: "Konum bilgisi alınamadı",
            3: "Konum alma zaman aşımı"
          };
          reject(new Error(messages[error.code] || "Konum hatası"));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3;
    const f1 = lat1 * Math.PI / 180;
    const f2 = lat2 * Math.PI / 180;
    const df = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const startScanning = async () => {
    setLocationError("");
    // Kamerayı hemen aç, konumu arka planda al
    setScanning(true);
    try {
      const location = await getLocation();
      setUserLocation(location);
    } catch (error: any) {
      // Konum alınamazsa kamerayı kapat
      setScanning(false);
      setLocationError(error.message);
      setIslemSecimi(null);
    }
  };

  const handleScan = async (result: any) => {
    if (!result || !result[0]?.rawValue || processing || !islemSecimi) return;
    
    const decodedText = result[0].rawValue;
    setProcessing(true);
    setScanning(false);

    try {
      if (!personel?.id) {
        setDurum("hata");
        setMesaj("Personel bilgisi bulunamadı. Lütfen uygulamayı yeniden açın.");
        setProcessing(false);
        return;
      }

      const q = query(collection(db, "locations"), where("karekod", "==", decodedText), where("aktif", "==", true));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setDurum("hata");
        setMesaj("QR kod tanınmadı!");
        setProcessing(false);
        return;
      }

      const konum = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Konum;

      // Konum henüz gelmediyse tekrar dene
      let finalLocation = userLocation;
      if (!finalLocation) {
        try {
          finalLocation = await getLocation();
          setUserLocation(finalLocation);
        } catch {
          setDurum("hata");
          setMesaj("Konum alınamadı. Lütfen konum iznini kontrol edin.");
          setProcessing(false);
          return;
        }
      }

      const mesafe = calculateDistance(finalLocation.lat, finalLocation.lng, konum.lat, konum.lng);

      if (mesafe > konum.maksimumOkutmaUzakligi) {
        setDurum("hata");
        setMesaj(`Çok uzaktasınız! (${Math.round(mesafe)}m)`);
        setProcessing(false);
        return;
      }

      // ✅ Artık islemSecimi'nden geliyor, toggle yok
      const eksikVeri = (islemSecimi === "cikis" && !bugunOzet?.girisVar) || 
                        (islemSecimi === "giris" && bugunOzet?.girisVar);

      await addDoc(collection(db, "attendance"), {
        personelId: personel.id,
        personelAd: `${personel.ad} ${personel.soyad}`,
        personelEmail: personel.email,
        konumId: konum.id,
        konumAdi: konum.konumAdi,
        karekod: decodedText,
        tip: islemSecimi,
        tarih: serverTimestamp(),
        lat: finalLocation.lat,
        lng: finalLocation.lng,
        mesafe: Math.round(mesafe),
        ...(eksikVeri ? { eksikVeri: true } : {}),
      });

      setDurum("basarili");
      setMesaj(`${islemSecimi === "giris" ? "Giriş" : "Çıkış"} kaydedildi!`);
      setSonIslem({ tip: islemSecimi, tarih: new Date(), konumAdi: konum.konumAdi });
      
      // Bugün özetini güncelle
      fetchBugunOzet(personel.id);

    } catch (error: any) {
      setDurum("hata");
      setMesaj("Bir hata oluştu");
    } finally {
      setProcessing(false);
    }
  };

  // ============================================
  // 📋 Kayıtlarım - Haftalık veri çek
  // ============================================
  useEffect(() => {
    if (!personel?.id || activeTab !== "kayitlarim") return;
    
    (async () => {
      setKayitLoading(true);
      try {
        const haftaBaslangic = new Date(seciliHafta);
        haftaBaslangic.setHours(0, 0, 0, 0);
        const haftaBitis = new Date(haftaBaslangic);
        haftaBitis.setDate(haftaBitis.getDate() + 6);
        haftaBitis.setHours(23, 59, 59, 999);

        const q = query(
          collection(db, "attendance"),
          where("personelId", "==", personel.id),
          where("tarih", ">=", Timestamp.fromDate(haftaBaslangic)),
          where("tarih", "<=", Timestamp.fromDate(haftaBitis)),
          orderBy("tarih", "desc")
        );
        const snapshot = await getDocs(q);
        const records = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as AttendanceRecord[];
        setKayitlar(records);
      } catch (error) {
        console.error("[QRGiris] Kayıtlar alınamadı:", error);
      } finally {
        setKayitLoading(false);
      }
    })();
  }, [personel?.id, activeTab, seciliHafta]);

  // ============================================
  // 📊 Haftalık özet hesapla
  // ============================================
  const haftalikOzet = useMemo(() => {
    if (kayitlar.length === 0) return null;

    const gunler: Record<string, { giris?: Date; cikis?: Date; kayitSayisi: number }> = {};
    let toplamDakika = 0;
    let calisilanGun = 0;
    const eksikCikislar: string[] = [];

    kayitlar.forEach(r => {
      const tarih = r.tarih?.toDate ? r.tarih.toDate() : new Date(r.tarih);
      const gunKey = toDateStr(tarih);
      
      if (!gunler[gunKey]) {
        gunler[gunKey] = { kayitSayisi: 0 };
      }
      gunler[gunKey].kayitSayisi++;

      if (r.tip === "giris") {
        if (!gunler[gunKey].giris || tarih < gunler[gunKey].giris!) {
          gunler[gunKey].giris = tarih;
        }
      }
      if (r.tip === "cikis") {
        if (!gunler[gunKey].cikis || tarih > gunler[gunKey].cikis!) {
          gunler[gunKey].cikis = tarih;
        }
      }
    });

    Object.entries(gunler).forEach(([gun, data]) => {
      if (data.giris) {
        calisilanGun++;
        if (data.cikis) {
          const diff = (data.cikis.getTime() - data.giris.getTime()) / (1000 * 60);
          toplamDakika += Math.max(0, diff);
        } else {
          eksikCikislar.push(gun);
        }
      }
    });

    const saat = Math.floor(toplamDakika / 60);
    const dakika = Math.round(toplamDakika % 60);

    return {
      toplamSaat: `${saat} sa ${dakika} dk`,
      toplamDakika,
      calisilanGun,
      gunler,
      eksikCikislar,
    };
  }, [kayitlar]);

  // ============================================
  // 🛠️ Yardımcı fonksiyonlar
  // ============================================
  const formatSaat = (tarih: any) => {
    if (!tarih) return "";
    const date = tarih.toDate ? tarih.toDate() : new Date(tarih);
    return date.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatGun = (tarih: any) => {
    if (!tarih) return "";
    const date = tarih.toDate ? tarih.toDate() : new Date(tarih);
    return date.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short" });
  };

  const haftaDegistir = (yön: number) => {
    const current = new Date(seciliHafta);
    current.setDate(current.getDate() + (yön * 7));
    setSeciliHafta(toDateStr(current));
  };

  const haftaLabel = useMemo(() => {
    const start = new Date(seciliHafta);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${start.toLocaleDateString("tr-TR", opts)} - ${end.toLocaleDateString("tr-TR", opts)}`;
  }, [seciliHafta]);

  // Durum metni: ÇALIŞIYOR / ÇIKTI
  const durumBilgisi = useMemo(() => {
    if (!bugunOzet) return null;
    
    if (bugunOzet.girisVar && !bugunOzet.cikisVar) {
      return { 
        durum: "ÇALIŞIYOR", 
        renk: "bg-[#8FAF9A]", 
        detay: `Giriş: ${bugunOzet.ilkGirisSaat}`,
        emoji: "🟢"
      };
    }
    if (bugunOzet.girisVar && bugunOzet.cikisVar) {
      return { 
        durum: "ÇIKTI", 
        renk: "bg-[#E6B566]", 
        detay: `Giriş: ${bugunOzet.ilkGirisSaat} → Çıkış: ${bugunOzet.sonCikisSaat}`,
        emoji: "🔴"
      };
    }
    return { 
      durum: "ÇIKTI", 
      renk: "bg-[#8A8A8A]", 
      detay: "Bugün giriş yapılmadı",
      emoji: "⚪"
    };
  }, [bugunOzet]);

  // ============================================
  // 📷 Tam ekran kamera modu
  // ============================================
  if (scanning) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        <Scanner
          onScan={handleScan}
          constraints={{ facingMode: "environment" }}
          styles={{ container: { width: "100%", height: "100%" }, video: { width: "100%", height: "100%", objectFit: "cover" } }}
        />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/70 to-transparent"></div>
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/70 to-transparent"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-white rounded-3xl">
            <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-rose-500 rounded-tl-2xl"></div>
            <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-rose-500 rounded-tr-2xl"></div>
            <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-rose-500 rounded-bl-2xl"></div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-rose-500 rounded-br-2xl"></div>
          </div>
        </div>
        <div className="absolute top-0 left-0 right-0 p-6 text-center">
          <div className={`inline-block px-4 py-2 rounded-full text-white font-medium ${
            islemSecimi === "giris" ? "bg-[#8FAF9A]" : "bg-[#E6B566]"
          }`}>
            {islemSecimi === "giris" ? "✅ Giriş Kaydı" : "🚪 Çıkış Kaydı"}
          </div>
          <p className="text-white/80 text-sm mt-2">QR kodu çerçeveleyin</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <button onClick={() => { setScanning(false); setIslemSecimi(null); }} className="w-full py-4 bg-white/20 backdrop-blur text-white rounded-lg font-medium text-lg">
            ✕ İptal
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // 🖥️ Ana sayfa render
  // ============================================
  return (
    <div className="min-h-screen bg-white">
      <div>
        <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
          <h1 className="text-lg md:text-xl font-bold text-[#2F2F2F]">📱 Giriş-Çıkış</h1>
          <p className="text-sm text-[#8A8A8A]">QR kod okutarak giriş veya çıkış yapın</p>
        </header>

        {/* Tab Navigation */}
        <div className="bg-white border-b px-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab("qr")}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === "qr" ? "border-rose-500 text-rose-600" : "border-transparent text-[#8A8A8A]"
              }`}
            >
              📷 QR Okut
            </button>
            <button
              onClick={() => setActiveTab("kayitlarim")}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === "kayitlarim" ? "border-rose-500 text-rose-600" : "border-transparent text-[#8A8A8A]"
              }`}
            >
              📋 Kayıtlarım
            </button>
          </div>
        </div>

        <main className="p-4 md:p-6">
          <div className="max-w-lg mx-auto">

            {/* ===== TAB: QR OKUT ===== */}
            {activeTab === "qr" && (
              <>
                {/* Personel Bilgisi + Durum */}
                <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-[#E5E5E5] mb-4">
                  <div className="flex items-center gap-4">
                    {personel?.foto ? (
                      <img src={personel.foto} alt="" className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover" />
                    ) : (
                      <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-rose-100 flex items-center justify-center text-xl md:text-2xl">
                        {personel?.ad?.charAt(0) || "?"}
                      </div>
                    )}
                    <div className="flex-1">
                      <h2 className="text-base md:text-lg font-bold text-[#2F2F2F]">
                        {personel ? `${personel.ad} ${personel.soyad}` : "Yükleniyor..."}
                      </h2>
                      <p className="text-sm text-[#8A8A8A]">{personel?.email}</p>
                    </div>
                  </div>

                  {/* Durum Bandı: ÇALIŞIYOR / ÇIKTI */}
                  {durumBilgisi && (
                    <div className={`mt-4 p-3 rounded-lg ${
                      durumBilgisi.durum === "ÇALIŞIYOR" ? "bg-[#EAF2ED] border border-green-200" : 
                      bugunOzet?.girisVar ? "bg-[#E6B566]/10 border border-orange-200" : 
                      "bg-[#F7F7F7] border border-[#E5E5E5]"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">
                            {durumBilgisi.emoji} Şu an: <span className={
                              durumBilgisi.durum === "ÇALIŞIYOR" ? "text-[#8FAF9A]" : 
                              bugunOzet?.girisVar ? "text-orange-700" : "text-[#2F2F2F]"
                            }>{durumBilgisi.durum}</span>
                          </p>
                          <p className="text-xs text-[#8A8A8A] mt-0.5">{durumBilgisi.detay}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Uyarı Mesajı (onay gerektiren) */}
                {uyariMesaj && !uyariOnay && (
                  <div className="bg-[#EAF2ED] border border-[#8FAF9A] rounded-lg p-4 mb-4">
                    <p className="text-sm text-[#2F2F2F] whitespace-pre-line mb-3">{uyariMesaj}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setUyariMesaj(""); setIslemSecimi(null); }}
                        className="flex-1 py-2 px-3 bg-white border border-[#E5E5E5] rounded-lg text-sm font-medium text-[#2F2F2F]"
                      >
                        İptal
                      </button>
                      {/* Cooldown uyarısıysa onay butonu gösterme */}
                      {!uyariMesaj.includes("⏱️") && (
                        <button
                          onClick={uyariOnayla}
                          className="flex-1 py-2 px-3 bg-[#8FAF9A] rounded-lg text-sm font-medium text-white"
                        >
                          Evet, Devam Et
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Konum Hatası */}
                {locationError && (
                  <div className="mb-4 p-4 bg-[#D96C6C]/10 rounded-lg text-[#D96C6C] text-sm border border-[#D96C6C]/30">{locationError}</div>
                )}

                {/* Başarı / Hata Mesajı + Geri Al */}
                {durum !== "bekleniyor" && (
                  <div className={`mb-4 p-4 rounded-lg text-center ${durum === "basarili" ? "bg-[#EAF2ED] border border-green-200" : "bg-[#D96C6C]/10 border border-[#D96C6C]/30"}`}>
                    <span className="text-3xl mb-2 block">{durum === "basarili" ? "✅" : "❌"}</span>
                    <p className={`font-semibold ${durum === "basarili" ? "text-[#8FAF9A]" : "text-[#D96C6C]"}`}>{mesaj}</p>
                  </div>
                )}

                {/* İşleniyor */}
                {processing ? (
                  <div className="bg-white rounded-lg p-8 shadow-sm border border-[#E5E5E5] text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-rose-500 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-[#2F2F2F]">İşleniyor...</p>
                  </div>
                ) : (
                  /* ===== GİRİŞ / ÇIKIŞ BUTONLARI ===== */
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => kontrolEtVeBasla("giris")}
                      disabled={!personel || scanning}
                      className="bg-white border-2 border-green-200 rounded-xl p-6 text-center shadow-sm hover:border-[#8FAF9A] hover:shadow-md transition active:scale-95 disabled:opacity-50 group"
                    >
                      <div className="w-16 h-16 mx-auto mb-3 bg-[#EAF2ED] rounded-2xl flex items-center justify-center group-hover:bg-[#EAF2ED] transition">
                        <span className="text-3xl">✅</span>
                      </div>
                      <p className="font-bold text-[#2F2F2F] text-lg">Giriş</p>
                      <p className="text-xs text-[#8A8A8A] mt-1">QR okutarak giriş yapın</p>
                    </button>

                    <button
                      onClick={() => kontrolEtVeBasla("cikis")}
                      disabled={!personel || scanning}
                      className="bg-white border-2 border-orange-200 rounded-xl p-6 text-center shadow-sm hover:border-orange-400 hover:shadow-md transition active:scale-95 disabled:opacity-50 group"
                    >
                      <div className="w-16 h-16 mx-auto mb-3 bg-[#E6B566]/10 rounded-2xl flex items-center justify-center group-hover:bg-[#E6B566]/20 transition">
                        <span className="text-3xl">🚪</span>
                      </div>
                      <p className="font-bold text-[#2F2F2F] text-lg">Çıkış</p>
                      <p className="text-xs text-[#8A8A8A] mt-1">QR okutarak çıkış yapın</p>
                    </button>
                  </div>
                )}

                {/* Bilgi Notu */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs text-blue-700">
                    💡 Giriş veya çıkış butonuna bastıktan sonra kamera açılacak. QR kodu okutun.
                  </p>
                </div>
              </>
            )}

            {/* ===== TAB: KAYITLARIM ===== */}
            {activeTab === "kayitlarim" && (
              <div className="space-y-4">
                {/* Hafta Seçici */}
                <div className="bg-white rounded-lg p-4 shadow-sm border border-[#E5E5E5]">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => haftaDegistir(-1)}
                      className="w-10 h-10 rounded-lg bg-[#F7F7F7] flex items-center justify-center text-[#2F2F2F] hover:bg-[#E5E5E5] transition"
                    >
                      ←
                    </button>
                    <div className="text-center">
                      <p className="text-xs text-[#8A8A8A]">Hafta</p>
                      <p className="font-semibold text-[#2F2F2F]">{haftaLabel}</p>
                    </div>
                    <button
                      onClick={() => haftaDegistir(1)}
                      className="w-10 h-10 rounded-lg bg-[#F7F7F7] flex items-center justify-center text-[#2F2F2F] hover:bg-[#E5E5E5] transition"
                    >
                      →
                    </button>
                  </div>
                </div>

                {/* Haftalık Özet */}
                {kayitLoading ? (
                  <div className="bg-white rounded-lg p-8 shadow-sm border border-[#E5E5E5] text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-rose-500 border-t-transparent mx-auto mb-3"></div>
                    <p className="text-[#8A8A8A] text-sm">Yükleniyor...</p>
                  </div>
                ) : haftalikOzet ? (
                  <>
                    {/* İstatistik Kartları */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-lg text-white">
                        <p className="text-blue-100 text-xs mb-1">Toplam Süre</p>
                        <p className="text-xl font-bold">{haftalikOzet.toplamSaat}</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-500 to-green-600 p-4 rounded-lg text-white">
                        <p className="text-green-100 text-xs mb-1">Çalışılan Gün</p>
                        <p className="text-xl font-bold">{haftalikOzet.calisilanGun} gün</p>
                      </div>
                    </div>

                    {/* Eksik Çıkış Uyarısı */}
                    {haftalikOzet.eksikCikislar.length > 0 && (
                      <div className="bg-[#D96C6C]/10 border border-[#D96C6C]/30 rounded-lg p-4">
                        <p className="text-sm font-medium text-red-800 mb-2">⚠️ Eksik Çıkış Kaydı</p>
                        <div className="space-y-1">
                          {haftalikOzet.eksikCikislar.map((gun) => {
                            const tarih = new Date(gun);
                            const girisData = haftalikOzet.gunler[gun];
                            return (
                              <div key={gun} className="flex items-center gap-2 text-xs text-[#D96C6C] bg-[#D96C6C]/20/50 rounded px-3 py-1.5">
                                <span>{tarih.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short" })}</span>
                                <span>→ Giriş: {girisData?.giris ? girisData.giris.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                                <span className="text-[#D96C6C]">| Çıkış yok</span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-xs text-[#D96C6C] mt-2">Bu günlerin çalışma süresi hesaba katılamadı.</p>
                      </div>
                    )}

                    {/* Günlük Detay */}
                    <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] overflow-hidden">
                      <div className="px-4 py-3 bg-[#F7F7F7] border-b border-[#E5E5E5]">
                        <h3 className="text-sm font-semibold text-[#2F2F2F]">Günlük Detay</h3>
                      </div>
                      <div className="divide-y divide-[#E5E5E5]">
                        {Array.from({ length: 7 }).map((_, i) => {
                          const gun = new Date(seciliHafta);
                          gun.setDate(gun.getDate() + i);
                          const gunKey = toDateStr(gun);
                          const gunData = haftalikOzet.gunler[gunKey];
                          const bugun = toDateStr(new Date()) === gunKey;

                          return (
                            <div key={i} className={`px-4 py-3 flex items-center justify-between ${bugun ? "bg-[#EAF2ED]" : ""}`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                  bugun ? "bg-[#8FAF9A] text-white" :
                                  gunData?.giris ? "bg-[#EAF2ED] text-[#8FAF9A]" : "bg-[#F7F7F7] text-[#8A8A8A]"
                                }`}>
                                  {gun.toLocaleDateString("tr-TR", { weekday: "short" }).slice(0, 2)}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-[#2F2F2F]">
                                    {gun.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                                    {bugun && <span className="text-[#8FAF9A] text-xs ml-1">(Bugün)</span>}
                                  </p>
                                  {gunData?.giris && (
                                    <p className="text-xs text-[#8A8A8A]">{gunData.kayitSayisi} kayıt</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-sm">
                                {gunData?.giris ? (
                                  <>
                                    <span className="text-[#8FAF9A] font-medium">
                                      {gunData.giris.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                    <span className="text-[#8A8A8A]">→</span>
                                    {gunData.cikis ? (
                                      <span className="text-[#E6B566] font-medium">
                                        {gunData.cikis.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    ) : (
                                      <span className="text-[#D96C6C] text-xs">Çıkış yok</span>
                                    )}
                                    {gunData.giris && gunData.cikis && (
                                      <span className="text-purple-600 font-medium text-xs bg-purple-50 px-2 py-0.5 rounded">
                                        {(() => {
                                          const diff = (gunData.cikis.getTime() - gunData.giris.getTime()) / (1000 * 60);
                                          const h = Math.floor(diff / 60);
                                          const m = Math.round(diff % 60);
                                          return `${h}sa ${m}dk`;
                                        })()}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[#8A8A8A] text-xs">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tüm Kayıtlar Listesi */}
                    {kayitlar.length > 0 && (
                      <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] overflow-hidden">
                        <div className="px-4 py-3 bg-[#F7F7F7] border-b border-[#E5E5E5]">
                          <h3 className="text-sm font-semibold text-[#2F2F2F]">Tüm Kayıtlar ({kayitlar.length})</h3>
                        </div>
                        <div className="divide-y divide-[#E5E5E5] max-h-64 overflow-y-auto">
                          {kayitlar.map(r => (
                            <div key={r.id} className="px-4 py-2.5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${r.tip === "giris" ? "bg-[#8FAF9A]" : "bg-[#E6B566]"}`}></span>
                                <span className={`text-xs font-medium ${r.tip === "giris" ? "text-[#8FAF9A]" : "text-orange-700"}`}>
                                  {r.tip === "giris" ? "Giriş" : "Çıkış"}
                                </span>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium text-[#2F2F2F]">{formatSaat(r.tarih)}</p>
                                <p className="text-xs text-[#8A8A8A]">{formatGun(r.tarih)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-white rounded-lg p-12 text-center shadow-sm border border-[#E5E5E5]">
                    <span className="text-4xl mb-3 block">📋</span>
                    <p className="text-[#8A8A8A]">Bu haftada kayıt bulunamadı</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// Yardımcı: YYYY-MM-DD
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}