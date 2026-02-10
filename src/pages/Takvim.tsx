import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "../lib/firebase";
import GelinModal from "../components/GelinModal";
import { resmiTatiller } from "../lib/data";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  kisaltma?: string;
  dogumGunu?: string;
  aktif: boolean;
}

interface Gelin {
  id: string;
  isim: string;
  tarih: string;
  saat: string;
  bitisSaati?: string;
  ucret: number;
  kapora: number;
  kalan: number;
  makyaj: string;
  turban: string;
  kinaGunu?: string;
  telefon?: string;
  esiTelefon?: string;
  instagram?: string;
  fotografci?: string;
  modaevi?: string;
  anlasildigiTarih?: string;
  bilgilendirmeGonderildi?: boolean;
  ucretYazildi?: boolean;
  malzemeListesiGonderildi?: boolean;
  paylasimIzni?: boolean;
  yorumIstesinMi?: string;  // Kişi ismi veya boş
  yorumIstendiMi?: boolean;
  gelinNotu?: string;
  dekontGorseli?: string;
  firma?: string;
}

interface FirmaInfo {
  id: string;
  firmaAdi: string;
  kisaltma: string;
}

export default function TakvimPage() {
  const user = useAuth();
  const [gelinler, setGelinler] = useState<Gelin[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedGelin, setSelectedGelin] = useState<Gelin | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [tumFirmalar, setTumFirmalar] = useState<FirmaInfo[]>([]);
  const [aktifFirmaKodlari, setAktifFirmaKodlari] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLDivElement>(null);
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const gunler = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  // Auth kontrolü
  // ✅ Personel verisi - Firestore'dan (real-time)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || "",
        soyad: doc.data().soyad || "",
        kisaltma: doc.data().kisaltma || "",
        dogumGunu: doc.data().dogumGunu || "",
        aktif: doc.data().aktif !== false
      } as Personel));
      setPersoneller(data.filter(p => p.aktif));
    });
    return () => unsubscribe();
  }, [user]);

  // ✅ Gelin verisi - Sadece görüntülenen ay (dinamik, real-time)
  useEffect(() => {
    if (!user) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Bu ay için tarih aralığı
    const ayBasi = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const sonrakiAy = month === 11 ? 0 : month + 1;
    const sonrakiYil = month === 11 ? year + 1 : year;
    const sonrakiAyBasi = `${sonrakiYil}-${String(sonrakiAy + 1).padStart(2, '0')}-01`;

    
    const q = query(
      collection(db, "gelinler"),
      where("tarih", ">=", ayBasi),
      where("tarih", "<", sonrakiAyBasi),
      orderBy("tarih", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Gelin));

      setGelinler(data);
      setDataLoading(false);
    }, (error) => {
      Sentry.captureException(error);
      setDataLoading(false);
    });

    return () => unsubscribe();
  }, [user, currentDate]);

  // Click outside - arama dropdown'ı kapat
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
    const currentPersonel = personeller.find(p => 
      (p as any).email === user.email
    );
    if (!currentPersonel) return;
    const isKurucu = (currentPersonel as any).kullaniciTuru === 'Kurucu';
    const kullaniciFirmalariIds = (currentPersonel as any).firmalar || [];
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
    const currentPersonel = personeller.find(p => (p as any).email === user.email);
    if (!currentPersonel) return [];
    const isKurucu = (currentPersonel as any).kullaniciTuru === 'Kurucu';
    if (isKurucu) return tumFirmalar;
    const firmaIds = (currentPersonel as any).firmalar || [];
    return tumFirmalar.filter(f => firmaIds.includes(f.id));
  }, [user, personeller, tumFirmalar]);

  // ✅ Firma bazlı filtrelenmiş gelinler
  const filteredGelinler = useMemo(() => {
    if (aktifFirmaKodlari.size === 0) return gelinler;
    return gelinler.filter(g => !g.firma || aktifFirmaKodlari.has(g.firma));
  }, [gelinler, aktifFirmaKodlari]);

  // Arama sonuçları
  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const q = searchQuery.toLocaleLowerCase('tr-TR');
    return filteredGelinler.filter(g => 
      g.isim.toLocaleLowerCase('tr-TR').includes(q) ||
      g.telefon?.includes(searchQuery) ||
      g.esiTelefon?.includes(searchQuery)
    ).slice(0, 10);
  }, [searchQuery, filteredGelinler]);

  const getKisaltma = (isim: string): string => {
    if (!isim) return "-";
    const normalized = isim.trim();
    const personel = personeller.find(p => 
      p.ad.toLocaleLowerCase('tr-TR') === normalized.toLocaleLowerCase('tr-TR')
    );
    return personel?.kisaltma || normalized;
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  let startDay = firstDayOfMonth.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const daysInMonth = lastDayOfMonth.getDate();
  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;

  const bugun = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  
  // 3 ay öncesi limiti
  const ucAyOnce = new Date();
  ucAyOnce.setMonth(ucAyOnce.getMonth() - 3);
  const minYear = ucAyOnce.getFullYear();
  const minMonth = ucAyOnce.getMonth();
  
  const canGoPrev = year > minYear || (year === minYear && month > minMonth);
  
  const prevMonth = () => {
    if (canGoPrev) {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  };
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const getGelinlerForDate = (date: string) => filteredGelinler.filter(g => g.tarih === date);

  const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const isTatil = (tarih: string) => {
    return resmiTatiller.some(t => {
      const tatilTarih = new Date(t.tarih);
      for (let i = 0; i < t.sure; i++) {
        const gun = new Date(tatilTarih);
        gun.setDate(tatilTarih.getDate() + i);
        if (toLocalDateStr(gun) === tarih) return true;
      }
      return false;
    });
  };

  const getTatilIsmi = (tarih: string) => {
    for (const t of resmiTatiller) {
      const tatilTarih = new Date(t.tarih);
      for (let i = 0; i < t.sure; i++) {
        const gun = new Date(tatilTarih);
        gun.setDate(tatilTarih.getDate() + i);
        if (toLocalDateStr(gun) === tarih) return t.isim;
      }
    }
    return null;
  };

  // Doğum günü kontrolü (ay ve gün eşleşmesi)
  const getDogumGunuPersoneller = (tarih: string) => {
    const [, ay, gun] = tarih.split('-');
    return personeller.filter(p => {
      if (!p.dogumGunu || !p.aktif) return false;
      const [, pAy, pGun] = p.dogumGunu.split('-');
      return pAy === ay && pGun === gun;
    });
  };

  const ayGelinler = filteredGelinler.filter(g => g.tarih.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
  
  // En yoğun 4 günü hesapla
  const gunBazindaGelinler = ayGelinler.reduce((acc, gelin) => {
    const gun = gelin.tarih.split('-')[2]; // "2026-05-15" -> "15"
    if (!acc[gun]) acc[gun] = 0;
    acc[gun]++;
    return acc;
  }, {} as Record<string, number>);
  
  const enYogunGunler = Object.entries(gunBazindaGelinler)
    .map(([gun, sayi]) => ({ gun: parseInt(gun), sayi }))
    .sort((a, b) => b.sayi - a.sayi)
    .slice(0, 4); // En yoğun 4 gün

  return (
    <div className="min-h-screen bg-gray-100">
      <div>
        <header className="page-header">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-shrink-0">
              <h1 className="page-title">📅 Takvim</h1>
              <p className="page-subtitle">Aylık program görünümü</p>
            </div>
            
            {/* Gelin Arama */}
            <div ref={searchRef} className="hidden md:block flex-1 max-w-xs relative">
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
                  placeholder="Gelin ara..."
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
              
              {/* Arama Sonuçları Dropdown */}
              {showSearchDropdown && searchQuery.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-lg shadow-lg border border-stone-100 overflow-hidden z-50 max-h-[300px] overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <div className="px-3 py-4 text-center text-stone-500">
                      <span className="text-xl block mb-1">🔍</span>
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
                            // Gelinin tarihine git
                            const gelinTarih = new Date(gelin.tarih);
                            setCurrentDate(new Date(gelinTarih.getFullYear(), gelinTarih.getMonth(), 1));
                          }}
                          className="px-3 py-2 hover:bg-amber-50 cursor-pointer border-b border-stone-50 last:border-0 transition"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-stone-800 text-xs">{gelin.isim}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-stone-500">📅 {new Date(gelin.tarih).toLocaleDateString('tr-TR')}</span>
                                <span className="text-[10px] text-stone-500">🕐 {gelin.saat}{gelin.bitisSaati ? ` - ${gelin.bitisSaati}` : ''}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              {gelin.kalan > 0 && (
                                <p className="text-[10px] text-red-500">{gelin.kalan.toLocaleString('tr-TR')} ₺</p>
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

            <div className="flex items-center gap-2 flex-shrink-0">
              <button 
                onClick={() => {
                  if (canGoPrev) {
                    setCurrentDate(new Date(year, month - 1, 1));
                  } else {
                    alert("📅 En fazla 3 ay öncesine bakabilirsiniz.");
                  }
                }} 
                className="p-1.5 hover:bg-stone-100 rounded-lg transition"
              >◀️</button>
              <div className="gradient-primary text-white px-3 py-1.5 rounded-lg font-medium min-w-[140px] text-center text-sm">
                {aylar[month]} {year}
              </div>
              <button onClick={nextMonth} className="p-1.5 hover:bg-stone-100 rounded-lg transition">▶️</button>
              <button onClick={goToToday} className="btn btn-ghost btn-sm ml-1">
                Bugün
              </button>
            </div>
          </div>
        </header>

        {/* Firma Filtre Logoları */}
        {kullaniciFirmalari.length > 1 && (
          <div className="bg-white/60 backdrop-blur-sm border-b border-stone-100 px-4 py-1.5">
            <div className="flex items-center gap-2">
              {kullaniciFirmalari.map(firma => {
                const aktif = aktifFirmaKodlari.has(firma.kisaltma);
                const logoSrc = `/logos/${firma.kisaltma.toLowerCase()}.png`;
                return (
                  <button
                    key={firma.id}
                    onClick={() => toggleFirma(firma.kisaltma)}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      aktif
                        ? 'bg-amber-500/10 ring-1 ring-amber-400/30'
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

        <main className="p-4">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="stat-card">
              <p className="stat-label">Gelin Sayısı</p>
              <p className="stat-value stat-value-primary">{ayGelinler.length}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">En Yoğun Günler</p>
              <div className="mt-2 space-y-1.5">
                {enYogunGunler.length > 0 ? (
                  enYogunGunler.map((item, idx) => {
                    const gunTarihi = `${year}-${String(month + 1).padStart(2, '0')}-${String(item.gun).padStart(2, '0')}`;
                    return (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedDay(gunTarihi)}
                        className="flex justify-between items-center text-sm cursor-pointer hover:bg-rose-50 px-2 py-1 rounded transition-colors"
                      >
                        <span className="text-stone-700 font-medium">
                          {item.gun} {aylar[month].slice(0, 3)}
                        </span>
                        <span className="text-rose-600 font-bold">
                          {item.sayi}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-stone-400 text-xs italic text-center py-2">Veri yok</p>
                )}
              </div>
            </div>
            <div className="stat-card">
              <p className="stat-label">Günlük Ortalama</p>
              <p className="stat-value stat-value-gold">{(ayGelinler.length / daysInMonth).toFixed(1)}</p>
            </div>
          </div>

          {/* Calendar - Firestore'dan (her ay dinamik) */}
          <div className="bg-white rounded-lg shadow-sm border border-stone-100 overflow-hidden">
            <div className="grid grid-cols-7 bg-neutral-cream border-b">
              {gunler.map((gun) => (
                <div key={gun} className="p-1.5 md:p-2 text-center text-[10px] md:text-xs font-medium text-stone-600 uppercase">{gun}</div>
              ))}
            </div>

            {dataLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {Array.from({ length: totalCells }).map((_, index) => {
                  const dayNumber = index - startDay + 1;
                  const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth;
                  const dateStr = isValidDay ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}` : '';
                  const dayGelinler = isValidDay ? getGelinlerForDate(dateStr) : [];
                  const isToday = dateStr === bugun;
                  const tatilIsmi = isValidDay ? getTatilIsmi(dateStr) : null;
                  const dayOfWeek = isValidDay ? new Date(dateStr).getDay() : -1;
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const isSelected = dateStr === selectedDay;

                  return (
                    <div 
                      key={index}
                      className={`
                        border border-stone-100 p-1 md:p-2 cursor-pointer transition-colors
                        ${isMobile ? 'min-h-[48px]' : 'min-h-[120px]'}
                        ${!isValidDay ? 'bg-stone-50' : ''}
                        ${isToday ? 'bg-blue-50 border-blue-300' : ''}
                        ${isSelected && isMobile ? 'bg-amber-50 border-amber-400 border-2' : ''}
                        ${tatilIsmi ? 'bg-red-50' : ''}
                        ${isWeekend && !tatilIsmi ? 'bg-orange-50' : ''}
                        hover:bg-stone-50
                      `}
                      onClick={() => {
                        if (isValidDay) {
                          setSelectedDay(dateStr);
                        }
                      }}
                    >
                      {isValidDay && (
                        <>
                          <div className="flex items-center justify-between mb-0.5 md:mb-1">
                            <span className={`
                              text-xs md:text-sm font-medium
                              ${isToday ? 'text-blue-600' : ''}
                              ${tatilIsmi ? 'text-red-600' : ''}
                              ${isWeekend && !tatilIsmi ? 'text-orange-600' : ''}
                            `}>
                              {dayNumber}
                            </span>
                            {dayGelinler.length > 0 && (
                              <span className="text-[10px] md:text-xs bg-primary-500 text-white px-1 md:px-1.5 py-0.5 rounded-full">
                                {dayGelinler.length}
                              </span>
                            )}
                          </div>

                          {/* Mobilde sadece badge, masaüstünde event kartları */}
                          {!isMobile && (
                            <>
                              {tatilIsmi && (
                                <div className="text-xs text-red-600 font-medium mb-1">
                                  🎉 {tatilIsmi}
                                </div>
                              )}

                              {getDogumGunuPersoneller(dateStr).map(p => (
                                <div key={p.id} className="text-xs text-rose-600 font-medium mb-1">
                                  🎂 {p.kisaltma || p.ad}
                                </div>
                              ))}

                              <div className="space-y-1">
                                {dayGelinler.slice(0, 3).map((gelin) => (
                                  <div 
                                    key={gelin.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedGelin(gelin);
                                    }}
                                    className="text-xs bg-white border border-stone-200 rounded p-1 hover:bg-primary-50 hover:border-primary-300 transition-colors cursor-pointer"
                                  >
                                    <div className="font-medium text-stone-900 truncate">{gelin.isim}</div>
                                    <div className="text-stone-500 text-[10px]">{gelin.saat}{gelin.bitisSaati ? ` - ${gelin.bitisSaati}` : ''}</div>
                                    <div className="text-stone-600 text-[10px] flex items-center gap-1">
                                      <span>{getKisaltma(gelin.makyaj)}</span>
                                      {gelin.turban && gelin.turban !== gelin.makyaj && (
                                        <>
                                          <span className="text-stone-400">&</span>
                                          <span>{getKisaltma(gelin.turban)}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {dayGelinler.length > 3 && (
                                  <div className="text-xs text-center text-stone-500 py-1">
                                    +{dayGelinler.length - 3} daha
                                  </div>
                                )}
                              </div>
                            </>
                          )}

                          {/* Mobilde tatil/doğum günü nokta göster */}
                          {isMobile && tatilIsmi && (
                            <div className="text-[9px] text-red-600 truncate">🎉</div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mobilde seçili gün detay paneli (grid altında) */}
          {isMobile && selectedDay && (() => {
            const dayGelinlerMobil = getGelinlerForDate(selectedDay);
            const tatil = getTatilIsmi(selectedDay);
            const dogumlar = getDogumGunuPersoneller(selectedDay);
            return (
              <div className="mt-3 bg-white rounded-lg shadow-sm border border-amber-200 overflow-hidden">
                <div className="bg-amber-50 px-3 py-2 border-b border-amber-200 flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-stone-800">
                    {new Date(selectedDay).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  <button onClick={() => setSelectedDay(null)} className="text-stone-400 text-lg">✕</button>
                </div>
                <div className="p-3 space-y-2">
                  {tatil && <div className="text-sm text-red-600 font-medium">🎉 {tatil}</div>}
                  {dogumlar.map(p => (
                    <div key={p.id} className="text-sm text-rose-600">🎂 {p.kisaltma || p.ad} doğum günü</div>
                  ))}
                  {dayGelinlerMobil.length === 0 && !tatil && dogumlar.length === 0 && (
                    <p className="text-sm text-stone-400 text-center py-2">Bu günde etkinlik yok</p>
                  )}
                  {dayGelinlerMobil.map(gelin => (
                    <div 
                      key={gelin.id}
                      onClick={() => setSelectedGelin(gelin)}
                      className="flex items-center gap-3 p-2.5 bg-stone-50 rounded-lg border border-stone-200 active:bg-primary-50 cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-stone-900 truncate">{gelin.isim}</div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          🕐 {gelin.saat}{gelin.bitisSaati ? ` - ${gelin.bitisSaati}` : ''} · {getKisaltma(gelin.makyaj)}
                          {gelin.turban && gelin.turban !== gelin.makyaj && ` & ${getKisaltma(gelin.turban)}`}
                        </div>
                      </div>
                      <span className="text-stone-400">→</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </main>
      </div>

      {/* Gelin detay modal */}
      {selectedGelin && (
        <GelinModal
          gelin={selectedGelin}
          onClose={() => setSelectedGelin(null)}
        />
      )}

      {/* Gün detay modal - sadece masaüstü */}
      {selectedDay && !isMobile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {new Date(selectedDay).toLocaleDateString('tr-TR', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h2>
              <button 
                onClick={() => setSelectedDay(null)}
                className="text-stone-500 hover:text-stone-700"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              {/* Doğum günleri */}
              {getDogumGunuPersoneller(selectedDay).length > 0 && (
                <div className="mb-4 p-4 bg-rose-50 rounded-lg border border-rose-200">
                  <h4 className="font-semibold text-rose-700 mb-2">🎂 Doğum Günleri</h4>
                  <div className="flex flex-wrap gap-2">
                    {getDogumGunuPersoneller(selectedDay).map(p => (
                      <span key={p.id} className="px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-sm font-medium">
                        🎉 {p.ad} {p.soyad}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {getGelinlerForDate(selectedDay).length === 0 ? (
                <p className="text-stone-500 text-center py-8">Bu gün için gelin kaydı yok</p>
              ) : (
                <div className="space-y-3">
                  {getGelinlerForDate(selectedDay).map((gelin) => (
                    <div 
                      key={gelin.id}
                      onClick={() => {
                        setSelectedDay(null);
                        setSelectedGelin(gelin);
                      }}
                      className="border border-stone-200 rounded-lg p-4 hover:bg-stone-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-lg">{gelin.isim}</h3>
                        <span className="text-sm text-stone-500">{gelin.saat}{gelin.bitisSaati ? ` - ${gelin.bitisSaati}` : ''}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-stone-500">Makyaj:</span>{' '}
                          <span className="font-medium">{gelin.makyaj || '-'}</span>
                        </div>
                        <div>
                          <span className="text-stone-500">Türban:</span>{' '}
                          <span className="font-medium">{gelin.turban || '-'}</span>
                        </div>
                        <div>
                          <span className="text-stone-500">Ücret:</span>{' '}
                          <span className="font-medium">{gelin.ucret.toLocaleString('tr-TR')} ₺</span>
                        </div>
                        <div>
                          <span className="text-stone-500">Kalan:</span>{' '}
                          <span className="font-medium text-amber-600">{gelin.kalan.toLocaleString('tr-TR')} ₺</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}