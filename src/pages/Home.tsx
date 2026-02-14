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
import OtomatikGorevWidget from "../components/dashboard/OtomatikGorevWidget";
import GorevWidget from "../components/dashboard/GorevWidget";
import TakvimEtkinlikWidget from "../components/dashboard/TakvimEtkinlikWidget";
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
  odemeTamamlandi?: boolean;
  iptal?: boolean;
  firma?: string;
  bitisSaati?: string;
  ref?: boolean;
  prova?: boolean;
  etkinlikTuru?: string;
  gidecegiYer?: string;
  gidecegiYerSaat?: string;
  hizmetTuru?: string;
}

interface FirmaInfo {
  id: string;
  firmaAdi: string;
  kisaltma: string;
  renk: string;
  aktif: boolean;
}

interface Duyuru {
  id: string;
  title: string;       // İngilizce field!
  content: string;     // İngilizce field!
  important: boolean;  // İngilizce field!
  group: string;
  author: string;
  createdAt: Timestamp | Date;      // İngilizce field!
}

interface PersonelGunlukDurum {
  personelId: string;
  personelAd: string;
  girisSaati: string | null;
  cikisSaati: string | null;
  aktifMi: boolean;
}

interface HomeAttendanceRecord {
  id: string;
  tip?: string;
  tarih?: Timestamp | Date;
  personelId?: string;
  personelAd?: string;
  konumAdi?: string;
  [key: string]: unknown;
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
  const [aktifCalisanModal, setAktifCalisanModal] = useState(false);
  const [bilgiModal, setBilgiModal] = useState<{open: boolean; title: string; mesaj: string}>({open: false, title: '', mesaj: ''});

  // Firma filtreleme
  const [tumFirmalar, setTumFirmalar] = useState<FirmaInfo[]>([]);
  const [aktifFirmaKodlari, setAktifFirmaKodlari] = useState<Set<string>>(new Set());
  const [aylikHedef, setAylikHedef] = useState<number>(0);
  const [eksikIzinler, setEksikIzinler] = useState<EksikIzin[]>([]);
  const [izinEkleniyor, setIzinEkleniyor] = useState<string | null>(null);
  const [bugunAttendance, setBugunAttendance] = useState<HomeAttendanceRecord[]>([]);
  const [personelDurumlar, setPersonelDurumlar] = useState<PersonelGunlukDurum[]>([]);
  const [bugunIzinliler, setBugunIzinliler] = useState<IzinKaydi[]>([]);
  const [haftaTatiliIzinliler, setHaftaTatiliIzinliler] = useState<IzinKaydi[]>([]);
  const [refGelinler, setRefGelinler] = useState<Gelin[]>([]);
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
  // Firma bazlı filtrelenmiş gelinler (diğer useMemo'lardan ÖNCE olmalı)
  const filteredGelinler = useMemo(() => {
    if (aktifFirmaKodlari.size === 0) return gelinler;
    return gelinler.filter(g => !g.firma || aktifFirmaKodlari.has(g.firma));
  }, [gelinler, aktifFirmaKodlari]);

  const bugunGelinler = useMemo(() => filteredGelinler.filter(g => g.tarih === bugun).sort((a, b) => (a.saat || '').localeCompare(b.saat || '')), [filteredGelinler, bugun]);
  
  const filteredRefGelinler = useMemo(() => {
    const filtered = aktifFirmaKodlari.size === 0 ? refGelinler : refGelinler.filter(g => !g.firma || aktifFirmaKodlari.has(g.firma));
    return filtered.slice(0, 10);
  }, [refGelinler, aktifFirmaKodlari]);
  
  const yarinGelinler = useMemo(() => {
    const yarin = new Date();
    yarin.setDate(yarin.getDate() + 1);
    return filteredGelinler.filter(g => g.tarih === yarin.toISOString().split("T")[0]).sort((a, b) => (a.saat || '').localeCompare(b.saat || ''));
  }, [filteredGelinler]);

  const buHaftaGelinler = useMemo(() => {
    const haftaBasi = new Date();
    const gun = haftaBasi.getDay(); // 0=Pazar, 1=Pazartesi, ...
    // Pazar günü (0) → 6 gün geri git, diğer günler → (gun-1) geri git
    haftaBasi.setDate(haftaBasi.getDate() - (gun === 0 ? 6 : gun - 1));
    const haftaSonu = new Date(haftaBasi);
    haftaSonu.setDate(haftaSonu.getDate() + 6);
    return filteredGelinler.filter(g => 
      g.tarih >= haftaBasi.toISOString().split("T")[0] && 
      g.tarih <= haftaSonu.toISOString().split("T")[0]
    ).sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.saat || '').localeCompare(b.saat || ''));
  }, [filteredGelinler]);

  const buAyGelinler = useMemo(() => {
    const ayBasi = `${bugun.slice(0, 7)}-01`;
    const ayBiti = new Date(bugunDate.getFullYear(), bugunDate.getMonth() + 1, 0).toISOString().split("T")[0];
    return filteredGelinler.filter(g => g.tarih >= ayBasi && g.tarih <= ayBiti).sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.saat || '').localeCompare(b.saat || ''));
  }, [filteredGelinler, bugun]);

  const islenmemisUcretler = useMemo(() => 
    filteredGelinler.filter(g => {
      if (g.tarih > bugun || g.ucretYazildi !== false) return false;
      if (g.iptal || g.odemeTamamlandi) return false;
      if (g.ref) return false;
      return true;
    }).sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.saat || '').localeCompare(b.saat || '')),
    [filteredGelinler, bugun]
  );

  const suAnCalisanlar = useMemo(() => 
    personelDurumlar.filter(p => p.aktifMi),
    [personelDurumlar]
  );

  const aktifGelinler = useMemo(() => {
    const simdi = new Date();
    const simdikiDakika = simdi.getHours() * 60 + simdi.getMinutes();
    return bugunGelinler.filter(g => {
      if (!g.saat) return false;
      const [s, d] = g.saat.split(':').map(Number);
      const baslangic = s * 60 + (d || 0);
      let bitis: number;
      if (g.bitisSaati) {
        const [bs, bd] = g.bitisSaati.split(':').map(Number);
        bitis = bs * 60 + (bd || 0);
      } else {
        bitis = baslangic + 120; // +2 saat varsayılan
      }
      return simdikiDakika >= baslangic && simdikiDakika <= bitis;
    });
  }, [bugunGelinler]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase().trim();
    return filteredGelinler
      .filter(g => 
        g.isim.toLowerCase().includes(q) ||
        g.telefon?.includes(q) ||
        g.makyaj?.toLowerCase().includes(q) ||
        g.turban?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [searchQuery, filteredGelinler]);

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

  // Önümüzdeki Referanslar (REF gelinler - bugün dahil 90 gün)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "gelinler"),
      where("ref", "==", true),
      where("tarih", ">=", new Date().toISOString().split("T")[0]),
      orderBy("tarih", "asc"),
      limit(30)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Gelin[];
      setRefGelinler(data.filter(g => !g.iptal));
    }, (error) => {
      console.error("[Home/refGelinler] Firestore hatası:", error);
      Sentry.captureException(error, { tags: { module: "Home", collection: "gelinler", query: "ref" } });
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
      const records: HomeAttendanceRecord[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setBugunAttendance(records);

      // Tarihe göre sırala (eskiden yeniye)
      const sortedRecords = [...records].sort((a, b) => {
        const ta = a.tarih instanceof Timestamp ? a.tarih.toDate().getTime() : new Date(a.tarih as Date).getTime();
        const tb = b.tarih instanceof Timestamp ? b.tarih.toDate().getTime() : new Date(b.tarih as Date).getTime();
        return ta - tb;
      });

      const personelMap = new Map<string, PersonelGunlukDurum>();
      const haftaTatiliSet = new Map<string, Record<string, unknown>>();

      sortedRecords.forEach((r) => {
        // Hafta tatili kayıtlarını ayrı tut — "Bugün Geldi"ye ekleme
        if (r.tip === "haftaTatili") {
          if (r.personelId && !haftaTatiliSet.has(r.personelId)) {
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

        if (!r.personelId) return;
        if (!personelMap.has(r.personelId)) {
          personelMap.set(r.personelId, {
            personelId: r.personelId,
            personelAd: r.personelAd || "",
            girisSaati: null,
            cikisSaati: null,
            aktifMi: false,
          });
        }

        const durum = personelMap.get(r.personelId)!;
        const tarihObj = r.tarih instanceof Timestamp ? r.tarih.toDate() : new Date(r.tarih as Date);
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
      setHaftaTatiliIzinliler(Array.from(haftaTatiliSet.values()) as unknown as IzinKaydi[]);
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

  // ✅ Firmaları çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "companies"), where("aktif", "==", true), orderBy("firmaAdi", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FirmaInfo));
      setTumFirmalar(data);
    });
    return () => unsubscribe();
  }, [user]);

  // ✅ Kullanıcının firmalarını bul ve aktif firma kodlarını set et
  useEffect(() => {
    if (!user?.email || !personeller.length || !tumFirmalar.length) return;
    const currentPersonel = personeller.find(p => p.email === user.email);
    if (!currentPersonel) return;
    const isKurucu = currentPersonel.kullaniciTuru === 'Kurucu';
    const kullaniciFirmalariIds = currentPersonel.firmalar || [];
    const firmaKodlari = isKurucu
      ? tumFirmalar.map(f => f.kisaltma)
      : tumFirmalar.filter(f => kullaniciFirmalariIds.includes(f.id)).map(f => f.kisaltma);
    setAktifFirmaKodlari(prev => prev.size === 0 ? new Set(firmaKodlari) : prev);
  }, [user, personeller, tumFirmalar]);

  // ✅ Firma toggle
  const toggleFirma = (kisaltma: string) => {
    setAktifFirmaKodlari(prev => {
      const next = new Set(prev);
      if (next.has(kisaltma)) {
        if (next.size > 1) next.delete(kisaltma);
      } else {
        next.add(kisaltma);
      }
      return next;
    });
  };

  // ✅ Kullanıcının erişebildiği firmalar
  const kullaniciFirmalari = useMemo(() => {
    if (!user?.email || !personeller.length) return tumFirmalar;
    const currentPersonel = personeller.find(p => p.email === user.email);
    if (!currentPersonel) return [];
    const isKurucu = currentPersonel.kullaniciTuru === 'Kurucu';
    if (isKurucu) return tumFirmalar;
    const firmaIds = currentPersonel.firmalar || [];
    return tumFirmalar.filter(f => firmaIds.includes(f.id));
  }, [user, personeller, tumFirmalar]);

  // Body overflow
  useEffect(() => {
    const isAnyModalOpen = selectedGelin !== null || gelinListeModal.open || selectedDuyuru !== null || showMobileSearch || aktifCalisanModal || bilgiModal.open;
    document.body.style.overflow = isAnyModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedGelin, gelinListeModal.open, selectedDuyuru, showMobileSearch, aktifCalisanModal, bilgiModal.open]);

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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-[#E5E5E5] px-4 md:px-5 py-2.5 sticky top-0 z-40">
        <div className="flex items-center justify-between gap-3 max-w-[1400px] mx-auto">
          <div className="flex-shrink-0">
            <h1 className="text-sm md:text-base font-semibold text-[#2F2F2F]">Merhaba, {personeller.find(p => p.email === user?.email)?.ad || user?.email?.split('@')[0]}!</h1>
            <p className="text-[10px] text-[#8A8A8A]">{formatTarihUzun(bugun)} • {formatGun(bugun)}</p>
          </div>
          
          {/* Desktop Search */}
          <div ref={searchRef} className="hidden md:block flex-1 max-w-xs relative">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A8A8A] text-xs">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onFocus={() => setShowSearchDropdown(true)}
                placeholder="Gelin ara..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]/30 focus:border-[#8FAF9A] focus:bg-white transition"
              />
              {searchQuery && (
                <button 
                  onClick={() => { setSearchQuery(""); setShowSearchDropdown(false); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#8A8A8A] text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            
            {showSearchDropdown && searchQuery.length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-[#E5E5E5] overflow-hidden z-50 max-h-[350px] overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[#8A8A8A] text-xs">"{searchQuery}" bulunamadı</p>
                ) : (
                  <div>
                    <p className="px-3 py-1.5 bg-[#F7F7F7] border-b border-[#E5E5E5] text-[10px] text-[#8A8A8A]">{searchResults.length} sonuç</p>
                    {searchResults.map((gelin) => (
                      <div
                        key={gelin.id}
                        onClick={() => {
                          setSelectedGelin(gelin);
                          setSearchQuery("");
                          setShowSearchDropdown(false);
                        }}
                        className="px-3 py-2 hover:bg-[#F7F7F7] cursor-pointer border-b border-[#E5E5E5]/50 last:border-0 transition"
                      >
                        <p className="text-xs font-medium text-[#2F2F2F]">{gelin.isim}</p>
                        <p className="text-[10px] text-[#8A8A8A] mt-0.5">{new Date(gelin.tarih).toLocaleDateString('tr-TR')} • {gelin.saat}</p>
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
              className="md:hidden w-7 h-7 bg-[#F7F7F7] rounded-lg flex items-center justify-center text-[#8A8A8A] text-xs"
            >
              🔍
            </button>
            {lastUpdate && (
              <span className="hidden md:inline text-[10px] text-[#8A8A8A]">✓ {lastUpdate}</span>
            )}
            {dataLoading && (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#8FAF9A]"></div>
            )}
          </div>
        </div>
      </header>

      {/* Firma Filtre Logoları */}
      {kullaniciFirmalari.length > 1 && (
        <div className="bg-white/60 backdrop-blur-sm border-b border-[#E5E5E5] px-4 md:px-5 py-1.5">
          <div className="flex items-center gap-2 max-w-[1400px] mx-auto">
            {kullaniciFirmalari.map(firma => {
              const aktif = aktifFirmaKodlari.has(firma.kisaltma);
              const logoSrc = `/logos/${firma.kisaltma.toLowerCase()}.png`;
              return (
                <button
                  key={firma.id}
                  onClick={() => toggleFirma(firma.kisaltma)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    aktif
                      ? 'bg-[#EAF2ED] ring-1 ring-[#8FAF9A]/40'
                      : 'opacity-30 grayscale hover:opacity-50'
                  }`}
                >
                  <img
                    src={logoSrc}
                    alt={firma.firmaAdi}
                    className="h-5 md:h-6 w-auto object-contain"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <main className="p-3 md:p-4">
        <div className="max-w-[1400px] mx-auto space-y-3">
          
          {/* Row 1: Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            <MetricCard
              title="Aktif Çalışan"
              value={suAnCalisanlar.length}
              icon="🟢"
              color="green"
              subtitle="çalışan"
              onClick={() => {
                if (suAnCalisanlar.length > 0) setAktifCalisanModal(true);
                else setBilgiModal({ open: true, title: 'Aktif Çalışan', mesaj: 'Aktif çalışan bulunmuyor.' });
              }}
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
              title="Bu Hafta"
              value={buHaftaGelinler.length}
              icon="📅"
              color="purple"
              onClick={() => setGelinListeModal({ open: true, title: "Bu Haftaki Gelinler", gelinler: buHaftaGelinler })}
            />
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
              title="Aktif Gelin"
              value={aktifGelinler.length}
              icon="💍"
              color="amber"
              onClick={() => {
                if (aktifGelinler.length > 0) setGelinListeModal({ open: true, title: "Şu An Aktif Gelinler", gelinler: aktifGelinler });
                else setBilgiModal({ open: true, title: 'Aktif Gelin', mesaj: 'Aktif gelin bulunmuyor.' });
              }}
            />
          </div>

          {/* Row 2: Duyurular + Görevler + Yaklaşan Etkinlikler */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 lg:h-[340px]">
              {/* Duyurular */}
              {duyurular.length > 0 && (
                <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden flex flex-col h-full">
                  <div className="px-3 py-2 border-b border-[#E5E5E5] flex items-center justify-between bg-gradient-to-r from-[#EAF2ED] to-transparent flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📢</span>
                      <span className="text-xs font-semibold text-[#2F2F2F]">Duyurular</span>
                      <span className="text-[10px] text-[#8FAF9A] bg-[#EAF2ED] px-1.5 py-0.5 rounded-full font-medium">{duyurular.length}</span>
                    </div>
                    <button
                      onClick={() => navigate("/duyurular")}
                      className="text-[10px] text-[#8A8A8A] hover:text-[#8FAF9A] font-medium transition"
                    >
                      Tümü →
                    </button>
                  </div>
                  <div className="p-2.5 space-y-1 flex-1 overflow-y-auto min-h-0">
                    {duyurular.map((d) => (
                      <div 
                        key={d.id} 
                        onClick={() => setSelectedDuyuru(d)}
                        className="py-1.5 px-2.5 rounded-lg cursor-pointer hover:bg-[#EAF2ED]/50 transition"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[#2F2F2F] font-medium truncate">{d.title}</p>
                            <p className="text-[10px] text-[#8A8A8A] mt-0.5 line-clamp-1">{d.content}</p>
                          </div>
                          {d.important && <span className="text-[10px] text-[#8FAF9A]">🔥</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Görev Widget */}
              <GorevWidget onCount={setGorevSayisi} />

              {/* Otomatik Görevler */}
              <OtomatikGorevWidget />
          </div>

          {/* Row 2.5: Önümüzdeki Referanslar */}
          {filteredRefGelinler.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
              <div className="px-3 py-2 border-b border-[#E5E5E5] flex items-center justify-between bg-gradient-to-r from-[#FFF3E0] to-transparent">
                <div className="flex items-center gap-2">
                  <span className="text-sm">⭐</span>
                  <span className="text-xs font-semibold text-[#2F2F2F]">Önümüzdeki Referanslar</span>
                  <span className="text-[10px] text-[#E67E22] bg-[#FFF3E0] px-1.5 py-0.5 rounded-full font-medium">{filteredRefGelinler.length}</span>
                </div>
              </div>
              <div className="divide-y divide-[#E5E5E5]/60 max-h-[275px] overflow-y-auto">
                {filteredRefGelinler.slice(0, 10).map((g) => {
                  const d = new Date(g.tarih);
                  const gunAdi = d.toLocaleDateString('tr-TR', { weekday: 'short' });
                  const tarihStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
                  const gunFarki = Math.ceil((d.getTime() - new Date(bugun).getTime()) / (1000 * 60 * 60 * 24));
                  const hizmet = g.hizmetTuru === 'makyaj' ? 'Makyaj' 
                    : g.hizmetTuru === 'sac' ? 'Saç' 
                    : g.hizmetTuru === 'turban' ? 'Türban'
                    : g.hizmetTuru === 'makyaj+sac' ? 'Makyaj + Saç'
                    : 'Makyaj + Türban';
                  return (
                    <div 
                      key={g.id} 
                      onClick={() => setSelectedGelin(g)}
                      className="px-3 py-2.5 hover:bg-[#FFF8F0] cursor-pointer transition flex items-center gap-3"
                    >
                      {/* Tarih */}
                      <div className="flex-shrink-0 w-14 text-center">
                        <p className="text-xs font-bold text-[#E67E22]">{tarihStr}</p>
                        <p className="text-[10px] text-[#8A8A8A]">{gunAdi}</p>
                      </div>
                      {/* Detay */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {g.firma && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[#F0F0F0] text-[#8A8A8A]">{g.firma}</span>
                          )}
                          <p className="text-xs font-medium text-[#2F2F2F] truncate">{g.isim}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#8A8A8A]">{g.saat}{g.bitisSaati ? `–${g.bitisSaati}` : ''}</span>
                          <span className="text-[10px] text-[#8A8A8A]">•</span>
                          <span className="text-[10px] text-[#8A8A8A]">{hizmet}{g.prova ? ' PRV' : ''}</span>
                          {g.etkinlikTuru && (
                            <>
                              <span className="text-[10px] text-[#8A8A8A]">•</span>
                              <span className="text-[10px] text-[#8A8A8A]">{g.etkinlikTuru}</span>
                            </>
                          )}
                        </div>
                        {g.gidecegiYer && (
                          <p className="text-[10px] text-[#E67E22] mt-0.5">📍 {g.gidecegiYer}{g.gidecegiYerSaat ? ` • ${g.gidecegiYerSaat}'da orada ol` : ''}</p>
                        )}
                      </div>
                      {/* Gün sayacı */}
                      <div className="flex-shrink-0">
                        <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${
                          gunFarki === 0 ? 'bg-red-100 text-red-600' 
                          : gunFarki <= 3 ? 'bg-orange-100 text-orange-600' 
                          : gunFarki <= 7 ? 'bg-yellow-100 text-yellow-700' 
                          : 'bg-gray-100 text-gray-500'
                        }`}>
                          {gunFarki === 0 ? 'Bugün' : gunFarki === 1 ? 'Yarın' : `${gunFarki} gün`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Row 3: Yaklaşan Etkinlikler + Bugün + Bugün Geldi */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 lg:h-[340px]">
            <TakvimEtkinlikWidget personeller={personeller} />
            <GelinListPanel
              title={gelinGunSecim === 'bugun' ? "Bugün" : "Yarın"}
              gelinler={gelinGunSecim === 'bugun' ? bugunGelinler : yarinGelinler}
              onGelinClick={(g) => setSelectedGelin(g)}
              showToggle
              toggleValue={gelinGunSecim}
              onToggleChange={(v) => setGelinGunSecim(v)}
            />
            <PersonelDurumPanel
              aktifPersoneller={suAnCalisanlar}
              bugunGelenler={personelDurumlar}
              izinliler={[...bugunIzinliler, ...haftaTatiliIzinliler]}
              tumPersoneller={personeller}
            />
          </div>

        </div>
      </main>

      {/* Modals */}
      {selectedGelin && (
        <GelinModal gelin={selectedGelin} onClose={() => setSelectedGelin(null)} />
      )}

      {gelinListeModal.open && (() => {
        const dayColors = ['bg-[#F7F7F7]', 'bg-white', 'bg-[#EAF2ED]', 'bg-[#F7F7F7]', 'bg-white', 'bg-[#EAF2ED]/50', 'bg-[#F7F7F7]'];
        const grouped = gelinListeModal.gelinler.reduce<Record<string, Gelin[]>>((acc, g) => {
          (acc[g.tarih] = acc[g.tarih] || []).push(g);
          return acc;
        }, {});
        const sortedDays = Object.keys(grouped).sort();
        return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setGelinListeModal({ open: false, title: "", gelinler: [] })}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-[#2F2F2F]">{gelinListeModal.title}</h3>
                <button onClick={() => setGelinListeModal({ open: false, title: "", gelinler: [] })} className="text-[#8A8A8A] hover:text-[#8A8A8A] text-xl">×</button>
              </div>
              <div className="space-y-3">
                {sortedDays.map((tarih, dayIdx) => {
                  const d = new Date(tarih);
                  const gunAdi = d.toLocaleDateString('tr-TR', { weekday: 'long' });
                  const tarihStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
                  const bgColor = dayColors[dayIdx % dayColors.length];
                  return (
                    <div key={tarih} className={`${bgColor} rounded-xl p-3`}>
                      <p className="text-xs font-semibold text-[#8A8A8A] mb-2 uppercase tracking-wide">{tarihStr} {gunAdi}</p>
                      <div className="space-y-1.5 divide-y divide-[#E5E5E5]/60">
                        {grouped[tarih].sort((a, b) => (a.saat || '').localeCompare(b.saat || '')).map((g) => (
                          <div
                            key={g.id}
                            onClick={() => {
                              setSelectedGelin(g);
                              setGelinListeModal({ open: false, title: "", gelinler: [] });
                            }}
                            className="flex items-center justify-between p-2.5 pt-3 rounded-lg hover:bg-white/70 transition cursor-pointer"
                          >
                            <div>
                              <p className="text-sm font-medium text-[#2F2F2F]">{g.isim}</p>
                              <p className="text-[10px] text-[#8A8A8A]">{g.saat}{g.bitisSaati ? ` - ${g.bitisSaati}` : ''}</p>
                            </div>
                            {g.kalan > 0 && (
                              <span className="text-xs text-[#D96C6C] font-medium">{g.kalan.toLocaleString('tr-TR')} ₺</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {selectedDuyuru && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDuyuru(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-[#2F2F2F]">{selectedDuyuru.title}</h3>
                <button onClick={() => setSelectedDuyuru(null)} className="text-[#8A8A8A] hover:text-[#8A8A8A] text-xl">×</button>
              </div>
              <p className="text-sm text-[#2F2F2F] whitespace-pre-wrap">{selectedDuyuru.content}</p>
              <p className="mt-3 text-[10px] text-[#8A8A8A]">{selectedDuyuru.author}</p>
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
                className="flex-1 px-3 py-2 bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]/30"
              />
              <button
                onClick={() => { setShowMobileSearch(false); setSearchQuery(""); }}
                className="px-3 py-2 text-[#8A8A8A] text-sm"
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
                  className="p-3 rounded-lg hover:bg-[#F7F7F7]"
                >
                  <p className="text-sm font-medium text-[#2F2F2F]">{gelin.isim}</p>
                  <p className="text-xs text-[#8A8A8A] mt-0.5">{formatTarih(gelin.tarih)} • {gelin.saat}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Aktif Çalışan Modal */}
      {aktifCalisanModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setAktifCalisanModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-[#2F2F2F]">Şu An Çalışanlar</h3>
                <button onClick={() => setAktifCalisanModal(false)} className="text-[#8A8A8A] hover:text-[#8A8A8A] text-xl">×</button>
              </div>
              <div className="space-y-2">
                {suAnCalisanlar.map((p) => (
                  <div key={p.personelId} className="flex items-center justify-between p-2.5 bg-[#EAF2ED] rounded-lg">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 bg-[#8FAF9A] rounded-full"></div>
                      <span className="text-sm font-medium text-[#2F2F2F]">{p.personelAd}</span>
                    </div>
                    <span className="text-xs text-[#8FAF9A] font-medium">{p.girisSaati || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bilgi Modal (bulunmuyor mesajları) */}
      {bilgiModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setBilgiModal({open: false, title: '', mesaj: ''})}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5 text-center">
              <p className="text-3xl mb-3">🤷</p>
              <h3 className="text-base font-bold text-[#2F2F2F] mb-1">{bilgiModal.title}</h3>
              <p className="text-sm text-[#8A8A8A]">{bilgiModal.mesaj}</p>
              <button 
                onClick={() => setBilgiModal({open: false, title: '', mesaj: ''})}
                className="mt-4 px-4 py-1.5 bg-[#F7F7F7] text-[#2F2F2F] rounded-lg text-sm hover:bg-[#E5E5E5] transition"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>  );
}
