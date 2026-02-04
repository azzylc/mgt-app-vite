import { useState, useEffect, useRef, useMemo } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
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
} from "firebase/firestore";
import GelinModal from "../components/GelinModal";
import MetricCard from "../components/dashboard/MetricCard";
import GelinListPanel from "../components/dashboard/GelinListPanel";
import PersonelDurumPanel from "../components/dashboard/PersonelDurumPanel";
import DikkatPanel from "../components/dashboard/DikkatPanel";
import SakinGunlerPanel from "../components/dashboard/SakinGunlerPanel";
import { usePersoneller } from "../hooks/usePersoneller";
import { getYaklasanDogumGunleri, getYaklasanTatiller } from "../lib/data";

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
  title: string;
  content: string;
  important: boolean;
  group: string;
  author: string;
  createdAt: any;
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

interface SakinGun {
  tarih: string;
  gelinSayisi: number;
}

// Cache keys
const CACHE_KEY = "gmt_gelinler_cache";
const CACHE_TIME_KEY = "gmt_gelinler_cache_time";
const CACHE_DURATION = 30 * 60 * 1000; // 30 dakika

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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
    haftaBasi.setDate(haftaBasi.getDate() - haftaBasi.getDay() + 1);
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
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Duyurular
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "duyurular"),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Duyuru[];
      setDuyurular(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Gelinler
  useEffect(() => {
    if (!user) return;

    loadFromCache();

    const otuzGunOnce = new Date();
    otuzGunOnce.setDate(otuzGunOnce.getDate() - 30);
    const doksanGunSonra = new Date();
    doksanGunSonra.setDate(doksanGunSonra.getDate() + 90);

    const q = query(
      collection(db, "gelinler"),
      where("tarih", ">=", otuzGunOnce.toISOString().split("T")[0]),
      where("tarih", "<=", doksanGunSonra.toISOString().split("T")[0]),
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
    });

    return () => unsubscribe();
  }, [user]);

  // Attendance (Şu an çalışanlar)
  useEffect(() => {
    if (!user) return;
    const bugunBasi = `${bugun}T00:00:00.000Z`;
    const bugunSonu = `${bugun}T23:59:59.999Z`;

    const q = query(
      collection(db, "attendance"),
      where("tarih", ">=", bugunBasi),
      where("tarih", "<=", bugunSonu),
      orderBy("tarih", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setBugunAttendance(records);

      // Personel durumlarını hesapla
      const personelMap = new Map<string, PersonelGunlukDurum>();

      records.forEach((r: any) => {
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
        const saat = new Date(r.tarih).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
        
        if (r.tip === "giris") {
          durum.girisSaati = saat;
          durum.aktifMi = true;
        } else if (r.tip === "cikis") {
          durum.cikisSaati = saat;
          durum.aktifMi = false;
        }
      });

      setPersonelDurumlar(Array.from(personelMap.values()));
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

  // Body overflow (modal açıkken)
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
      console.error("İzin ekleme hatası:", error);
      setIzinEkleniyor(null);
    }
  };

  const handleTumIzinleriEkle = async () => {
    for (const eksik of eksikIzinler) {
      await handleIzinEkle(eksik);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-400 mx-auto"></div>
          <p className="mt-4 text-stone-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-stone-100 px-4 md:px-5 py-2.5 md:py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-shrink-0">
            <h1 className="text-sm md:text-base font-semibold text-stone-800">Merhaba, {user?.email?.split('@')[0]}!</h1>
            <p className="text-[11px] md:text-xs text-stone-500">{formatTarihUzun(bugun)} • {formatGun(bugun)}</p>
          </div>
          
          {/* Desktop Search */}
          <div ref={searchRef} className="hidden md:block flex-1 max-w-sm relative">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onFocus={() => setShowSearchDropdown(true)}
                placeholder="Gelin ara... (isim, telefon)"
                className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 focus:bg-white transition"
              />
              {searchQuery && (
                <button 
                  onClick={() => { setSearchQuery(""); setShowSearchDropdown(false); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* Search Dropdown */}
            {showSearchDropdown && searchQuery.length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-lg shadow-lg border border-stone-100 overflow-hidden z-50 max-h-[350px] overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-6 text-center text-stone-500">
                    <span className="text-lg block mb-1.5">🔍</span>
                    <p className="text-xs">"{searchQuery}" için sonuç bulunamadı</p>
                  </div>
                ) : (
                  <div>
                    <div className="px-3 py-1.5 bg-stone-50 border-b border-stone-100 text-[10px] text-stone-500 font-medium">
                      {searchResults.length} sonuç bulundu
                    </div>
                    {searchResults.map((gelin) => (
                      <div
                        key={gelin.id}
                        onClick={() => {
                          setSelectedGelin(gelin);
                          setSearchQuery("");
                          setShowSearchDropdown(false);
                        }}
                        className="px-3 py-2 hover:bg-amber-50 cursor-pointer border-b border-stone-50 last:border-0 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-stone-800 text-xs">{gelin.isim}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-stone-500">📅 {new Date(gelin.tarih).toLocaleDateString('tr-TR')}</span>
                              <span className="text-[10px] text-stone-500">🕐 {gelin.saat}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-[10px] text-stone-500">
                              {gelin.makyaj && <span className="bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded text-[10px]">💄</span>}
                              {gelin.turban && <span className="bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded text-[10px]">🧕</span>}
                            </div>
                            {gelin.kalan > 0 && (
                              <p className="text-[10px] text-red-500 mt-0.5">{gelin.kalan.toLocaleString('tr-TR')} ₺</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Search Button */}
          <button 
            onClick={() => setShowMobileSearch(true)}
            className="md:hidden w-8 h-8 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 hover:bg-stone-200 transition text-sm"
          >
            🔍
          </button>

          <div className="flex items-center gap-2 flex-shrink-0">
            {lastUpdate && (
              <div className="hidden md:block bg-green-50 px-2 py-1 rounded-md border border-green-100">
                <span className="text-green-600 text-[11px] font-medium">✓ Anlık: {lastUpdate}</span>
              </div>
            )}
            {dataLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400"></div>
            )}
          </div>
        </div>
      </header>

      <main className="p-3 md:p-3">
        <div className="max-w-[1400px] mx-auto">
          
          {/* Duyurular */}
          {duyurular.length > 0 && (
            <div className="mb-3 md:mb-4 bg-gradient-to-r from-amber-50/80 to-orange-50/80 border border-amber-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">📢</span>
                  <h3 className="font-semibold text-amber-800 text-sm">Duyurular</h3>
                  <span className="bg-amber-200 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full">{duyurular.length}</span>
                </div>
                <button
                  onClick={() => navigate("/duyurular")}
                  className="text-amber-600 hover:text-amber-700 text-[11px] font-medium"
                >
                  Tümünü gör →
                </button>
              </div>
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                {duyurular.map((d) => (
                  <div 
                    key={d.id} 
                    onClick={() => setSelectedDuyuru(d)}
                    className={`p-2 rounded-md cursor-pointer hover:shadow-sm transition ${d.important ? 'bg-white/80 border border-amber-200' : 'bg-white/50 hover:bg-white/70'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-amber-900 truncate">{d.title}</p>
                        <p className="text-[10px] text-amber-700 mt-0.5 line-clamp-1">{d.content}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {d.important && <span className="text-[10px]">🔥</span>}
                        <span className="text-[10px] text-amber-500">→</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dikkat Paneli */}
          <div className="mb-3 md:mb-4">
            <DikkatPanel
              islenmemisUcretler={islenmemisUcretler}
              eksikIzinler={eksikIzinler}
              onGelinClick={(g) => setSelectedGelin(g)}
              onIzinEkle={handleIzinEkle}
              onTumIzinleriEkle={handleTumIzinleriEkle}
              izinEkleniyor={izinEkleniyor}
              onIslenmemisUcretlerClick={() => navigate("/takvim")}
            />
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
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
              onClick={() => setGelinListeModal({ open: true, title: `${["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][bugunDate.getMonth()]} Ayı Gelinleri`, gelinler: buAyGelinler })}
            />
            <MetricCard
              title="Aktif"
              value={suAnCalisanlar.length}
              icon="🟢"
              color="green"
            />
          </div>

          {/* Alt Paneller */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Sol: Personel Durumu */}
            <div>
              <PersonelDurumPanel
                aktifPersoneller={suAnCalisanlar}
                bugunGelenler={personelDurumlar}
                izinliler={[]}
                tumPersoneller={personeller}
              />
            </div>

            {/* Orta: Bugün Gelinler */}
            <div>
              <GelinListPanel
                title={gelinGunSecim === 'bugun' ? "Bugün" : "Yarın"}
                gelinler={gelinGunSecim === 'bugun' ? bugunGelinler : yarinGelinler}
                onGelinClick={(g) => setSelectedGelin(g)}
                showToggle
                toggleValue={gelinGunSecim}
                onToggleChange={(v) => setGelinGunSecim(v)}
              />
            </div>

            {/* Sağ: Sakin Günler */}
            <div>
              <SakinGunlerPanel
                sakinGunler={sakinGunler}
                filtre={sakinGunFiltre}
                onFiltreChange={(f) => setSakinGunFiltre(f)}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {selectedGelin && (
        <GelinModal gelin={selectedGelin} onClose={() => setSelectedGelin(null)} />
      )}

      {/* Gelin Liste Modal */}
      {gelinListeModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setGelinListeModal({ open: false, title: "", gelinler: [] })}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-stone-800">{gelinListeModal.title}</h3>
                <button onClick={() => setGelinListeModal({ open: false, title: "", gelinler: [] })} className="text-stone-400 hover:text-stone-600 text-2xl">×</button>
              </div>
              <div className="space-y-2">
                {gelinListeModal.gelinler.map((g) => (
                  <div
                    key={g.id}
                    onClick={() => {
                      setSelectedGelin(g);
                      setGelinListeModal({ open: false, title: "", gelinler: [] });
                    }}
                    className="flex items-center justify-between p-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition cursor-pointer"
                  >
                    <div>
                      <p className="font-medium text-stone-800">{g.isim}</p>
                      <p className="text-xs text-stone-500">{g.saat} • {formatTarih(g.tarih)}</p>
                    </div>
                    <div className="text-right">
                      {g.kalan > 0 && (
                        <p className="text-red-500 font-medium text-sm">{g.kalan.toLocaleString('tr-TR')} ₺</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duyuru Modal */}
      {selectedDuyuru && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDuyuru(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-amber-900">{selectedDuyuru.title}</h3>
                <button onClick={() => setSelectedDuyuru(null)} className="text-stone-400 hover:text-stone-600 text-2xl">×</button>
              </div>
              <p className="text-stone-700 whitespace-pre-wrap">{selectedDuyuru.content}</p>
              <div className="mt-4 text-xs text-stone-500">
                <p>Yazan: {selectedDuyuru.author}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Search Modal */}
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
                className="flex-1 px-4 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
              <button
                onClick={() => {
                  setShowMobileSearch(false);
                  setSearchQuery("");
                }}
                className="px-4 py-2 bg-stone-100 rounded-lg text-sm font-medium"
              >
                İptal
              </button>
            </div>
            <div className="space-y-2">
              {searchResults.map((gelin) => (
                <div
                  key={gelin.id}
                  onClick={() => {
                    setSelectedGelin(gelin);
                    setShowMobileSearch(false);
                    setSearchQuery("");
                  }}
                  className="p-3 bg-stone-50 rounded-lg"
                >
                  <p className="font-medium text-stone-800">{gelin.isim}</p>
                  <p className="text-xs text-stone-500 mt-1">{formatTarih(gelin.tarih)} • {gelin.saat}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
