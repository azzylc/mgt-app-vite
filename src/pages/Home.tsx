import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "../lib/firebase";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  increment,
  Timestamp,
} from "firebase/firestore";
import GelinModal from "../components/GelinModal";
import MetricCard from "../components/dashboard/MetricCard";
import GelinListPanel from "../components/dashboard/GelinListPanel";
import PersonelDurumPanel from "../components/dashboard/PersonelDurumPanel";
import DikkatPanel from "../components/dashboard/DikkatPanel";
import SakinGunlerPanel from "../components/dashboard/SakinGunlerPanel";
import GorevWidget from "../components/dashboard/GorevWidget";
import { usePersoneller } from "../hooks/usePersoneller";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";

// Interfaces
interface Gelin {
  id: string;
  isim: string;
  tarih: string;
  saat: string;
  ucret: number;
  kapora: number;
  kalan: number;
  makyaj: string;
  turban: string;
  kinaGunu?: string;
  telefon?: string;
  ucretYazildi?: boolean;
  [key: string]: any;
}

interface Duyuru {
  id: string;
  title: string;       // İngilizce field!
  content: string;     // İngilizce field!
  important: boolean;  // İngilizce field!
  group: string;
  author: string;
  createdAt: any;      // İngilizce field!
}

interface PersonelGunlukDurum {
  personelId: string;
  personelAd: string;
  girisSaati: string | null;
  cikisSaati: string | null;
  aktifMi: boolean;
}

interface EksikIzin {
  personel: { id: string; ad: string; soyad: string; aktif: boolean; };
  calismaYili: number;
  olmasiGereken: number;
  mevcut: number;
  eksik: number;
}

interface IzinKaydi {
  id: string;
  personelAd: string;
  personelSoyad: string;
  personelId: string;
  izinTuru: string;
  baslangic: string;
  bitis: string;
  durum: string;
  gunSayisi: number;
}

interface SakinGun {
  tarih: string;
  gelinSayisi: number;
}

// Cache keys
const CACHE_KEY = "gmt_gelinler_cache";
const CACHE_TIME_KEY = "gmt_gelinler_cache_time";
const CACHE_DURATION = 30 * 60 * 1000;

export default function Home() {
  const user = useAuth();
  const [gelinler, setGelinler] = useState<Gelin[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [selectedGelin, setSelectedGelin] = useState<Gelin | null>(null);
  const navigate = useNavigate();

  const { personeller, loading: personellerLoading } = usePersoneller();

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // States
  const [duyurular, setDuyurular] = useState<Duyuru[]>([]);
  const [gorevSayisi, setGorevSayisi] = useState(0);
  const [selectedDuyuru, setSelectedDuyuru] = useState<Duyuru | null>(null);
  const [gelinListeModal, setGelinListeModal] = useState<{open: boolean; title: string; gelinler: Gelin[]}>({
    open: false,
    title: "",
    gelinler: []
  });
  const [gelinGunSecim, setGelinGunSecim] = useState<'bugun' | 'yarin'>('bugun');
  const [sakinGunFiltre, setSakinGunFiltre] = useState<number>(0);
  const [aylikHedef, setAylikHedef] = useState<number>(0);
  const [eksikIzinler, setEksikIzinler] = useState<EksikIzin[]>([]);
  const [izinEkleniyor, setIzinEkleniyor] = useState<string | null>(null);
  const [bugunAttendance, setBugunAttendance] = useState<any[]>([]);
  const [personelDurumlar, setPersonelDurumlar] = useState<PersonelGunlukDurum[]>([]);
  const [bugunIzinliler, setBugunIzinliler] = useState<IzinKaydi[]>([]);
  const [haftaTatiliIzinliler, setHaftaTatiliIzinliler] = useState<IzinKaydi[]>([]);

  const bugun = new Date().toISOString().split("T")[0];
  const bugunDate = new Date();

  // Date helpers
  const formatTarih = (tarih: string) => new Date(tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const formatGun = (tarih: string) => {
    const gunler = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return gunler[new Date(tarih).getDay()];
  };
  const formatTarihUzun = (tarih: string) => new Date(tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Calculated values
  const bugunGelinler = useMemo(() => gelinler.filter(g => g.tarih === bugun), [gelinler, bugun]);
  
  const yarinGelinler = useMemo(() => {
    const yarin = new Date();
    yarin.setDate(yarin.getDate() + 1);
    return gelinler.filter(g => g.tarih === yarin.toISOString().split("T")[0]);
  }, [gelinler]);

  const buHaftaGelinler = useMemo(() => {
    const haftaBasi = new Date();
    const gun = haftaBasi.getDay(); // 0=Pazar, 1=Pazartesi, ...
    // Pazar günü (0) → 6 gün geri git, diğer günler → (gun-1) geri git
    haftaBasi.setDate(haftaBasi.getDate() - (gun === 0 ? 6 : gun - 1));
    const haftaSonu = new Date(haftaBasi);
    haftaSonu.setDate(haftaSonu.getDate() + 6);
    return gelinler.filter(g => 
      g.tarih >= haftaBasi.toISOString().split("T")[0] && 
      g.tarih <= haftaSonu.toISOString().split("T")[0]
    );
  }, [gelinler]);

  const buAyGelinler = useMemo(() => {
    const ayBasi = `${bugun.slice(0, 7)}-01`;
    const ayBiti = new Date(bugunDate.getFullYear(), bugunDate.getMonth() + 1, 0).toISOString().split("T")[0];
    return gelinler.filter(g => g.tarih >= ayBasi && g.tarih <= ayBiti);
  }, [gelinler, bugun]);

  const islenmemisUcretler = useMemo(() => 
    gelinler.filter(g => g.tarih <= bugun && g.ucretYazildi === false),
    [gelinler, bugun]
  );

  const sakinGunler = useMemo(() => {
    const gunler: SakinGun[] = [];
    const baslangic = new Date();
    for (let i = 0; i < 60; i++) {
      const tarih = new Date(baslangic);
      tarih.setDate(tarih.getDate() + i);
      const tarihStr = tarih.toISOString().split("T")[0];
      const gunGelinleri = gelinler.filter(g => g.tarih === tarihStr);
      if (gunGelinleri.length <= sakinGunFiltre) {
        gunler.push({ tarih: tarihStr, gelinSayisi: gunGelinleri.length });
      }
      // İlk 10 sakin günü bul
      if (gunler.length >= 10) break;
    }
    return gunler;
  }, [gelinler, sakinGunFiltre]);

  const suAnCalisanlar = useMemo(() => 
    personelDurumlar.filter(p => p.aktifMi),
    [personelDurumlar]
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase().trim();
    return gelinler
      .filter(g => 
        g.isim.toLowerCase().includes(q) ||
        g.telefon?.includes(q) ||
        g.makyaj?.toLowerCase().includes(q) ||
        g.turban?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [searchQuery, gelinler]);

  const toplamDikkat = islenmemisUcretler.length + eksikIzinler.length;

  // Cache functions
  const loadFromCache = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const cacheTime = localStorage.getItem(CACHE_TIME_KEY);
      if (cached && cacheTime) {
        setGelinler(JSON.parse(cached));
        setLastUpdate(new Date(parseInt(cacheTime)).toLocaleTimeString('tr-TR'));
        setDataLoading(false);
        return true;
      }
    } catch (e) {}
    return false;
  };

  const saveToCache = (data: Gelin[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      setLastUpdate(new Date().toLocaleTimeString('tr-TR'));
    } catch (e) {}
  };

  // Auth
  // Duyurular (announcements collection - İngilizce field'lar!)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "announcements"),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Duyuru[];
      setDuyurular(data);
    }, (error) => {
      console.error("[Home/duyurular] Firestore hatası:", error);
      Sentry.captureException(error, { tags: { module: "Home", collection: "announcements" } });
    });
    return () => unsubscribe();
  }, [user]);

  // Gelinler
  useEffect(() => {
    if (!user) return;

    loadFromCache();

    // 🎯 Akıllı Tarih Penceresi: Geçen hafta + Bu hafta + Önümüzdeki 1 ay
    const onDortGunOnce = new Date();
    onDortGunOnce.setDate(onDortGunOnce.getDate() - 14);
    const otuzGunSonra = new Date();
    otuzGunSonra.setDate(otuzGunSonra.getDate() + 30);

    const q = query(
      collection(db, "gelinler"),
      where("tarih", ">=", onDortGunOnce.toISOString().split("T")[0]),
      where("tarih", "<=", otuzGunSonra.toISOString().split("T")[0]),
      orderBy("tarih", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Gelin[];

      setGelinler(data);
      saveToCache(data);
      setDataLoading(false);
    }, (error) => {
      console.error("[Home/gelinler] Firestore hatası:", error);
      Sentry.captureException(error, { tags: { module: "Home", collection: "gelinler" } });
      setDataLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Attendance
  useEffect(() => {
    if (!user) return;
    const bugunBasi = new Date();
    bugunBasi.setHours(0, 0, 0, 0);
    const bugunSonu = new Date();
    bugunSonu.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, "attendance"),
      where("tarih", ">=", Timestamp.fromDate(bugunBasi)),
      where("tarih", "<=", Timestamp.fromDate(bugunSonu)),
      orderBy("tarih", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setBugunAttendance(records);

      // Tarihe göre sırala (eskiden yeniye)
      const sortedRecords = [...records].sort((a: any, b: any) => {
        const ta = a.tarih?.toDate ? a.tarih.toDate().getTime() : new Date(a.tarih).getTime();
        const tb = b.tarih?.toDate ? b.tarih.toDate().getTime() : new Date(b.tarih).getTime();
        return ta - tb;
      });

      const personelMap = new Map<string, PersonelGunlukDurum>();
      const haftaTatiliSet = new Map<string, any>(); // haftaTatili kayıtları

      sortedRecords.forEach((r: any) => {
        // Hafta tatili kayıtlarını ayrı tut — "Bugün Geldi"ye ekleme
        if (r.tip === "haftaTatili") {
          if (!haftaTatiliSet.has(r.personelId)) {
            haftaTatiliSet.set(r.personelId, {
              id: r.id,
              personelAd: r.personelAd?.split(" ")[0] || r.personelAd || "",
              personelSoyad: r.personelAd?.split(" ").slice(1).join(" ") || "",
              personelId: r.personelId,
              izinTuru: "Haftalık İzin",
              baslangic: bugun,
              bitis: bugun,
              durum: "Onaylandı",
              gunSayisi: 1,
            });
          }
          return; // personelMap'e ekleme
        }

        if (!personelMap.has(r.personelId)) {
          personelMap.set(r.personelId, {
            personelId: r.personelId,
            personelAd: r.personelAd,
            girisSaati: null,
            cikisSaati: null,
            aktifMi: false,
          });
        }

        const durum = personelMap.get(r.personelId)!;
        const tarihObj = r.tarih?.toDate ? r.tarih.toDate() : new Date(r.tarih);
        const saat = tarihObj instanceof Date && !isNaN(tarihObj.getTime()) 
          ? tarihObj.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
          : "-";
        
        if (r.tip === "giris") {
          durum.girisSaati = saat;
          durum.aktifMi = true;
        } else if (r.tip === "cikis") {
          durum.cikisSaati = saat;
          durum.aktifMi = false;
        }
      });

      setPersonelDurumlar(Array.from(personelMap.values()));
      setHaftaTatiliIzinliler(Array.from(haftaTatiliSet.values()) as IzinKaydi[]);
    }, (error) => {
      console.error("[Home/attendance] Firestore hatası:", error);
      Sentry.captureException(error, { tags: { module: "Home", collection: "attendance" } });
    });

    return () => unsubscribe();
  }, [user, bugun]);

  // İzinler - Bugün izinli olanlar
  useEffect(() => {
    if (!user) return;
    
    // Sadece bitişi bugün veya sonrası olan izinleri çek
    const q = query(
      collection(db, "izinler"),
      where("durum", "==", "Onaylandı"),
      where("bitis", ">=", bugun)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const izinler = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as IzinKaydi[];

      // Bugün izinli olanları filtrele (baslangic <= bugun kontrolü JS'te)
      const bugunIzinli = izinler.filter(izin => {
        return izin.baslangic <= bugun;
      });

      setBugunIzinliler(bugunIzinli);
    }, (error) => {
      console.error("[Home/izinler] Firestore hatası:", error);
      Sentry.captureException(error, { tags: { module: "Home", collection: "izinler" } });
    });

    return () => unsubscribe();
  }, [user, bugun]);

  // Search click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Body overflow
  useEffect(() => {
    const isAnyModalOpen = selectedGelin !== null || gelinListeModal.open || selectedDuyuru !== null || showMobileSearch;
    document.body.style.overflow = isAnyModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedGelin, gelinListeModal.open, selectedDuyuru, showMobileSearch]);

  // Handlers
  const handleIzinEkle = async (eksik: EksikIzin) => {
    setIzinEkleniyor(eksik.personel.id);
    try {
      await updateDoc(doc(db, "personnel", eksik.personel.id), {
        yillikIzinHakki: increment(eksik.eksik)
      });
      setTimeout(() => setIzinEkleniyor(null), 1000);
    } catch (error) {
      Sentry.captureException(error);
      setIzinEkleniyor(null);
    }
  };

  const handleTumIzinleriEkle = async () => {
    for (const eksik of eksikIzinler) {
      await handleIzinEkle(eksik);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  return (
    <div className="min-h-screen bg-stone-50/50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-stone-100 px-4 md:px-5 py-2.5 sticky top-0 z-40">
        <div className="flex items-center justify-between gap-3 max-w-[1400px] mx-auto">
          <div className="flex-shrink-0">
            <h1 className="text-sm md:text-base font-semibold text-stone-800">Merhaba, {personeller.find(p => p.email === user?.email)?.ad || user?.email?.split('@')[0]}!</h1>
            <p className="text-[10px] text-stone-400">{formatTarihUzun(bugun)} • {formatGun(bugun)}</p>
          </div>
          
          {/* Desktop Search */}
          <div ref={searchRef} className="hidden md:block flex-1 max-w-xs relative">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-300 text-xs">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onFocus={() => setShowSearchDropdown(true)}
                placeholder="Gelin ara..."
                className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-200 focus:bg-white transition"
              />
              {searchQuery && (
                <button 
                  onClick={() => { setSearchQuery(""); setShowSearchDropdown(false); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-300 hover:text-stone-500 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            
            {showSearchDropdown && searchQuery.length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-stone-100 overflow-hidden z-50 max-h-[350px] overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-4 text-center text-stone-400 text-xs">"{searchQuery}" bulunamadı</p>
                ) : (
                  <div>
                    <p className="px-3 py-1.5 bg-stone-50 border-b border-stone-100 text-[10px] text-stone-400">{searchResults.length} sonuç</p>
                    {searchResults.map((gelin) => (
                      <div
                        key={gelin.id}
                        onClick={() => {
                          setSelectedGelin(gelin);
                          setSearchQuery("");
                          setShowSearchDropdown(false);
                        }}
                        className="px-3 py-2 hover:bg-stone-50 cursor-pointer border-b border-stone-50 last:border-0 transition"
                      >
                        <p className="text-xs font-medium text-stone-700">{gelin.isim}</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">{new Date(gelin.tarih).toLocaleDateString('tr-TR')} • {gelin.saat}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowMobileSearch(true)}
              className="md:hidden w-7 h-7 bg-stone-100 rounded-lg flex items-center justify-center text-stone-400 text-xs"
            >
              🔍
            </button>
            {lastUpdate && (
              <span className="hidden md:inline text-[10px] text-stone-400">✓ {lastUpdate}</span>
            )}
            {dataLoading && (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-400"></div>
            )}
          </div>
        </div>
      </header>

      <main className="p-3 md:p-4">
        <div className="max-w-[1400px] mx-auto space-y-3">
          
          {/* Row 1: Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <MetricCard
              title={gelinGunSecim === 'bugun' ? "Bugün" : "Yarın"}
              value={gelinGunSecim === 'bugun' ? bugunGelinler.length : yarinGelinler.length}
              icon="💄"
              color="pink"
              onClick={() => setGelinListeModal({ 
                open: true, 
                title: gelinGunSecim === 'bugun' ? "Bugünkü Gelinler" : "Yarının Gelinler", 
                gelinler: gelinGunSecim === 'bugun' ? bugunGelinler : yarinGelinler 
              })}
            />
            <MetricCard
              title="Bu Hafta"
              value={buHaftaGelinler.length}
              icon="📅"
              color="purple"
              onClick={() => setGelinListeModal({ open: true, title: "Bu Haftaki Gelinler", gelinler: buHaftaGelinler })}
            />
            <MetricCard
              title={["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][bugunDate.getMonth()]}
              value={buAyGelinler.length}
              icon="👰"
              color="blue"
              progress={aylikHedef > 0 ? { current: buAyGelinler.length, target: aylikHedef } : undefined}
              onClick={() => setGelinListeModal({ open: true, title: `${["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][bugunDate.getMonth()]} Gelinleri`, gelinler: buAyGelinler })}
            />
            <MetricCard
              title="Aktif"
              value={suAnCalisanlar.length}
              icon="🟢"
              color="green"
            />
          </div>

          {/* Row 2: Duyurular + Görevler (50/50) */}
          {(duyurular.length > 0 || gorevSayisi > 0) && (
            <div className={`grid grid-cols-1 ${duyurular.length > 0 && gorevSayisi > 0 ? 'md:grid-cols-2' : ''} gap-2.5`}>
              {/* Duyurular */}
              {duyurular.length > 0 && (
                <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
                  <div className="px-3 py-2 border-b border-stone-100 flex items-center justify-between bg-gradient-to-r from-amber-50/50 to-transparent">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📢</span>
                      <span className="text-xs font-semibold text-stone-700">Duyurular</span>
                      <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">{duyurular.length}</span>
                    </div>
                    <button
                      onClick={() => navigate("/duyurular")}
                      className="text-[10px] text-stone-400 hover:text-amber-500 font-medium transition"
                    >
                      Tümü →
                    </button>
                  </div>
                  <div className="p-2.5 space-y-1 max-h-[160px] overflow-y-auto">
                    {duyurular.map((d) => (
                      <div 
                        key={d.id} 
                        onClick={() => setSelectedDuyuru(d)}
                        className="py-1.5 px-2.5 rounded-lg cursor-pointer hover:bg-amber-50/40 transition"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-stone-700 font-medium truncate">{d.title}</p>
                            <p className="text-[10px] text-stone-400 mt-0.5 line-clamp-1">{d.content}</p>
                          </div>
                          {d.important && <span className="text-[10px] text-amber-400">🔥</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Görev Widget */}
              <GorevWidget onCount={setGorevSayisi} />
            </div>
          )}

          {/* Row 2b: Dikkat Paneli */}
          <DikkatPanel
            islenmemisUcretler={islenmemisUcretler}
            eksikIzinler={eksikIzinler}
            onGelinClick={(g) => setSelectedGelin(g)}
            onIzinEkle={handleIzinEkle}
            onTumIzinleriEkle={handleTumIzinleriEkle}
            izinEkleniyor={izinEkleniyor}
            onIslenmemisUcretlerClick={() => navigate("/takvim")}
          />

          {/* Row 3: Operasyonel Paneller */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
            <PersonelDurumPanel
              aktifPersoneller={suAnCalisanlar}
              bugunGelenler={personelDurumlar}
              izinliler={[...bugunIzinliler, ...haftaTatiliIzinliler]}
              tumPersoneller={personeller}
            />
            <GelinListPanel
              title={gelinGunSecim === 'bugun' ? "Bugün" : "Yarın"}
              gelinler={gelinGunSecim === 'bugun' ? bugunGelinler : yarinGelinler}
              onGelinClick={(g) => setSelectedGelin(g)}
              showToggle
              toggleValue={gelinGunSecim}
              onToggleChange={(v) => setGelinGunSecim(v)}
            />
            <SakinGunlerPanel
              sakinGunler={sakinGunler}
              filtre={sakinGunFiltre}
              onFiltreChange={(f) => setSakinGunFiltre(f)}
            />
          </div>

        </div>
      </main>

      {/* Modals */}
      {selectedGelin && (
        <GelinModal gelin={selectedGelin} onClose={() => setSelectedGelin(null)} />
      )}

      {gelinListeModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setGelinListeModal({ open: false, title: "", gelinler: [] })}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-stone-800">{gelinListeModal.title}</h3>
                <button onClick={() => setGelinListeModal({ open: false, title: "", gelinler: [] })} className="text-stone-300 hover:text-stone-500 text-xl">×</button>
              </div>
              <div className="space-y-1.5">
                {gelinListeModal.gelinler.map((g) => (
                  <div
                    key={g.id}
                    onClick={() => {
                      setSelectedGelin(g);
                      setGelinListeModal({ open: false, title: "", gelinler: [] });
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-50 transition cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-medium text-stone-700">{g.isim}</p>
                      <p className="text-[10px] text-stone-400">{g.saat} • {formatTarih(g.tarih)}</p>
                    </div>
                    {g.kalan > 0 && (
                      <span className="text-xs text-red-400 font-medium">{g.kalan.toLocaleString('tr-TR')} ₺</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDuyuru && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDuyuru(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-stone-800">{selectedDuyuru.title}</h3>
                <button onClick={() => setSelectedDuyuru(null)} className="text-stone-300 hover:text-stone-500 text-xl">×</button>
              </div>
              <p className="text-sm text-stone-600 whitespace-pre-wrap">{selectedDuyuru.content}</p>
              <p className="mt-3 text-[10px] text-stone-400">{selectedDuyuru.author}</p>
            </div>
          </div>
        </div>
      )}

      {showMobileSearch && (
        <div className="fixed inset-0 bg-white z-50 md:hidden">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Gelin ara..."
                autoFocus
                className="flex-1 px-3 py-2 bg-stone-50 border border-stone-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
              <button
                onClick={() => { setShowMobileSearch(false); setSearchQuery(""); }}
                className="px-3 py-2 text-stone-500 text-sm"
              >
                İptal
              </button>
            </div>
            <div className="space-y-1.5">
              {searchResults.map((gelin) => (
                <div
                  key={gelin.id}
                  onClick={() => {
                    setSelectedGelin(gelin);
                    setShowMobileSearch(false);
                    setSearchQuery("");
                  }}
                  className="p-3 rounded-lg hover:bg-stone-50"
                >
                  <p className="text-sm font-medium text-stone-700">{gelin.isim}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{formatTarih(gelin.tarih)} • {gelin.saat}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}