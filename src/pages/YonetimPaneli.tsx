import { useState, useEffect, useRef } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc,
  setDoc,
  orderBy,
  getDocs
} from "firebase/firestore";

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
  anlasildigiTarih: string;
}

interface HedefAy {
  ay: string;
  hedef: number;
}

const CACHE_KEY_2025 = "yonetim_gelinler_2025";

export default function YonetimPaneli() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [yetkisiz, setYetkisiz] = useState(false);
  const [gelinler, setGelinler] = useState<Gelin[]>([]);
  const [hedefler, setHedefler] = useState<HedefAy[]>([]);
  const [selectedAy, setSelectedAy] = useState("");
  const [hedefInput, setHedefInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing2025, setRefreshing2025] = useState(false);
  const navigate = useNavigate();
  
  const bugunAyRef = useRef<HTMLDivElement>(null);
  const bugun = new Date().toISOString().split('T')[0];
  const buAy = new Date().toISOString().slice(0, 7);

  // Auth kontrolü
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        const q = query(
          collection(db, "personnel"),
          where("email", "==", user.email)
        );
        const unsubPersonel = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            const gruplar = data.grupEtiketleri || [];
            const kullaniciTuru = data.kullaniciTuru || '';
            const isYetkili = gruplar.some((g: string) => g.toLowerCase() === "kurucu") || 
                            kullaniciTuru.toLowerCase() === "kurucu";
            if (!isYetkili) {
              setYetkisiz(true);
            }
          } else {
            setYetkisiz(true);
          }
          setLoading(false);
        });
        return () => unsubPersonel();
      } else {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Gelinler - 2025: localStorage cache, 2026+: Firestore real-time
  useEffect(() => {
    if (!user) return;

    let gelinler2025: Gelin[] = [];

    const load2025 = async () => {
      const cached = localStorage.getItem(CACHE_KEY_2025);
      
      if (cached) {
        gelinler2025 = JSON.parse(cached);
        console.log(`📦 2025: ${gelinler2025.length} gelin (cache'den)`);
      } else {
        console.log("🔄 2025 verisi Firestore'dan yükleniyor...");
        const q = query(
          collection(db, "gelinler"),
          where("tarih", ">=", "2025-01-01"),
          where("tarih", "<", "2026-01-01"),
          orderBy("tarih", "asc")
        );
        const snapshot = await getDocs(q);
        gelinler2025 = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Gelin));
        localStorage.setItem(CACHE_KEY_2025, JSON.stringify(gelinler2025));
        console.log(`✅ 2025: ${gelinler2025.length} gelin cache'e kaydedildi`);
      }
    };

    const init = async () => {
      await load2025();

      const q = query(
        collection(db, "gelinler"),
        where("tarih", ">=", "2026-01-01"),
        orderBy("tarih", "asc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const gelinler2026Plus = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Gelin));
        
        setGelinler([...gelinler2025, ...gelinler2026Plus]);
        console.log(`✅ Toplam: ${gelinler2025.length + gelinler2026Plus.length} gelin yüklendi`);
      });

      return unsubscribe;
    };

    init();
  }, [user]);

  // 2025 cache yenile
  const refresh2025Cache = async () => {
    setRefreshing2025(true);
    try {
      localStorage.removeItem(CACHE_KEY_2025);
      const q = query(
        collection(db, "gelinler"),
        where("tarih", ">=", "2025-01-01"),
        where("tarih", "<", "2026-01-01"),
        orderBy("tarih", "asc")
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Gelin));
      localStorage.setItem(CACHE_KEY_2025, JSON.stringify(data));
      
      // Tüm gelinleri güncelle
      const gelinler2026Plus = gelinler.filter(g => g.tarih >= "2026-01-01");
      setGelinler([...data, ...gelinler2026Plus]);
      
      alert(`✅ 2025 verisi yenilendi: ${data.length} gelin`);
    } catch (error) {
      console.error("2025 yenileme hatası:", error);
      alert("❌ Yenileme başarısız!");
    }
    setRefreshing2025(false);
  };

  // Hedefleri Firebase'den çek
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, "monthlyTargets"), (snapshot) => {
      const data = snapshot.docs.map(docSnap => ({
        ay: docSnap.id,
        hedef: docSnap.data().hedef
      } as HedefAy));
      data.sort((a, b) => b.ay.localeCompare(a.ay));
      setHedefler(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Bugünkü aya scroll
  useEffect(() => {
    if (!loading && bugunAyRef.current && gelinler.length > 0) {
      setTimeout(() => {
        bugunAyRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 300);
    }
  }, [loading, gelinler]);

  // Hedef kaydet
  const handleHedefKaydet = async () => {
    if (!selectedAy || !hedefInput) {
      alert("Lütfen ay ve hedef girin!");
      return;
    }
    
    setSaving(true);
    try {
      await setDoc(doc(db, "monthlyTargets", selectedAy), {
        hedef: parseInt(hedefInput),
        guncellenmeTarihi: new Date().toISOString(),
        guncelleyenEmail: user?.email
      });
      setSelectedAy("");
      setHedefInput("");
      alert("Hedef kaydedildi!");
    } catch (error) {
      console.error("Hedef kaydetme hatası:", error);
      alert("Hedef kaydedilemedi!");
    }
    setSaving(false);
  };

  // Ay bazlı hesaplamalar
  const getAyVerileri = (ayStr: string) => {
    const ayGelinler = gelinler.filter(g => g.tarih.startsWith(ayStr));
    const toplamGelin = ayGelinler.length;
    const toplamUcret = ayGelinler.reduce((sum, g) => sum + Number(g.ucret || 0), 0);
    const toplamKapora = ayGelinler.reduce((sum, g) => sum + Number(g.kapora || 0), 0);
    const toplamKalan = ayGelinler.reduce((sum, g) => sum + Number(g.kalan || 0), 0);
    const hedef = hedefler.find(h => h.ay === ayStr)?.hedef || 0;
    
    return { toplamGelin, toplamUcret, toplamKapora, toplamKalan, hedef };
  };

  // Bu ay anlaşılan gelinlerin kaporası
  const buAyAnlasanKapora = gelinler
    .filter(g => {
      if (!g.anlasildigiTarih) return false;
      const anlasmaTarihi = g.anlasildigiTarih.slice(0, 10);
      const ayBasi = buAy + "-01";
      return anlasmaTarihi >= ayBasi && anlasmaTarihi <= bugun;
    })
    .reduce((sum, g) => sum + Number(g.kapora || 0), 0);

  // Bugün ve sonrası için kalan bakiye
  const buAyKalanBakiye = gelinler
    .filter(g => g.tarih.startsWith(buAy) && g.tarih >= bugun)
    .reduce((sum, g) => sum + Number(g.kalan || 0), 0);

  // Bugün ödeme bekleyenler
  const bugunGelinler = gelinler.filter(g => g.tarih === bugun);
  const bugunOdemeBekleyen = bugunGelinler.filter(g => g.kalan > 0);

  const buAyVerileri = getAyVerileri(buAy);

  // Bu ay + önümüzdeki 11 ay
  const ayListesi = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    return d.toISOString().slice(0, 7);
  });

  // Geçmişten 6 ay + gelecekten 12 ay
  const tumAylar = Array.from({ length: 18 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 6 + i);
    return d.toISOString().slice(0, 7);
  });

  const ayIsimleri: Record<string, string> = {
    "01": "Ocak", "02": "Şubat", "03": "Mart", "04": "Nisan",
    "05": "Mayıs", "06": "Haziran", "07": "Temmuz", "08": "Ağustos",
    "09": "Eylül", "10": "Ekim", "11": "Kasım", "12": "Aralık"
  };

  const formatAy = (ayStr: string) => {
    const [yil, ay] = ayStr.split("-");
    return `${ayIsimleri[ay]} ${yil}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-400"></div>
      </div>
    );
  }

  if (yetkisiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <span className="text-6xl">🚫</span>
          <h1 className="text-2xl font-bold text-stone-800 mt-4">Yetkisiz Erişim</h1>
          <p className="text-stone-500 mt-2">Bu sayfaya erişim yetkiniz bulunmamaktadır.</p>
          <button 
            onClick={() => navigate("/")}
            className="mt-4 bg-amber-500 text-white px-6 py-2 rounded-xl hover:bg-amber-600 transition"
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b px-6 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-800">👑 Yönetim Paneli</h1>
            <p className="text-sm text-stone-500">Finansal özet ve hedef yönetimi</p>
          </div>
          <button
            onClick={refresh2025Cache}
            disabled={refreshing2025}
            className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium disabled:opacity-50"
            title="2025 verilerini yeniden yükle"
          >
            {refreshing2025 ? "⏳" : "🔄"} 2025
          </button>
        </div>
      </header>

      <main className="p-6">
        {/* Üst Kartlar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
            <p className="text-stone-500 text-xs">Bu Ay Gelin</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {buAyVerileri.toplamGelin}
              {buAyVerileri.hedef > 0 && (
                <span className="text-sm text-stone-400 font-normal">/{buAyVerileri.hedef}</span>
              )}
            </p>
            {buAyVerileri.hedef > 0 && (
              <div className="mt-2">
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${Math.min((buAyVerileri.toplamGelin / buAyVerileri.hedef) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  %{Math.round((buAyVerileri.toplamGelin / buAyVerileri.hedef) * 100)} tamamlandı
                </p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
            <p className="text-stone-500 text-xs">Bu Ayın Cirosu</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {buAyVerileri.toplamUcret.toLocaleString('tr-TR')} ₺
            </p>
            <p className="text-xs text-stone-400 mt-1">Anlaşılan ücret</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
            <p className="text-stone-500 text-xs">Bu Ay Kapora</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {buAyAnlasanKapora.toLocaleString('tr-TR')} ₺
            </p>
            <p className="text-xs text-stone-400 mt-1">Anlaşan gelinlerden</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
            <p className="text-stone-500 text-xs">Bu Ay Kalan Bakiye</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {buAyKalanBakiye.toLocaleString('tr-TR')} ₺
            </p>
            <p className="text-xs text-stone-400 mt-1">Bugün ve sonrası</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sol: Hedef Belirleme */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
            <h2 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
              <span>🎯</span> Aylık Hedef Belirleme
            </h2>
            
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {ayListesi.map(ay => {
                const mevcutHedef = hedefler.find(h => h.ay === ay)?.hedef || 0;
                const ayVerileri = getAyVerileri(ay);
                const yuzde = mevcutHedef > 0 ? Math.round((ayVerileri.toplamGelin / mevcutHedef) * 100) : 0;
                const isEditing = selectedAy === ay;
                
                return (
                  <div key={ay} className={`p-3 rounded-xl transition ${isEditing ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-stone-50 hover:bg-stone-100'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-stone-700 min-w-[100px]">{formatAy(ay)}</span>
                      
                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="number"
                            value={hedefInput}
                            onChange={(e) => setHedefInput(e.target.value)}
                            placeholder="Hedef"
                            className="w-20 px-3 py-1.5 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-center text-sm"
                            autoFocus
                          />
                          <button
                            onClick={handleHedefKaydet}
                            disabled={saving}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50"
                          >
                            {saving ? "..." : "✓"}
                          </button>
                          <button
                            onClick={() => { setSelectedAy(""); setHedefInput(""); }}
                            className="text-stone-400 hover:text-stone-600 px-2 py-1.5 text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 flex-1">
                          {mevcutHedef > 0 ? (
                            <>
                              <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${yuzde >= 100 ? 'bg-green-500' : 'bg-amber-500'}`}
                                  style={{ width: `${Math.min(yuzde, 100)}%` }}
                                />
                              </div>
                              <span className={`text-sm font-bold min-w-[60px] text-right ${yuzde >= 100 ? 'text-green-600' : 'text-stone-600'}`}>
                                {ayVerileri.toplamGelin}/{mevcutHedef}
                              </span>
                            </>
                          ) : (
                            <span className="text-stone-400 text-sm flex-1">Hedef yok</span>
                          )}
                          <button
                            onClick={() => { setSelectedAy(ay); setHedefInput(mevcutHedef > 0 ? mevcutHedef.toString() : ""); }}
                            className="text-amber-500 hover:text-amber-600 text-sm font-medium px-2"
                          >
                            {mevcutHedef > 0 ? "Düzenle" : "Ekle"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sağ: Bugün Ödeme Bekleyen */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
            <h2 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
              <span>💰</span> Bugün Ödeme Bekleyen
              {bugunOdemeBekleyen.length > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {bugunOdemeBekleyen.length}
                </span>
              )}
            </h2>

            {bugunOdemeBekleyen.length === 0 ? (
              <div className="text-center py-8 text-stone-400">
                <span className="text-4xl">✅</span>
                <p className="mt-2">Bugün ödeme bekleyen yok</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bugunOdemeBekleyen.map(g => (
                  <div key={g.id} className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                    <div>
                      <p className="font-medium text-stone-800">{g.isim}</p>
                      <p className="text-xs text-stone-500">{g.saat}</p>
                    </div>
                    <span className="text-lg font-bold text-red-600">
                      {Number(g.kalan || 0).toLocaleString('tr-TR')} ₺
                    </span>
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t border-stone-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-stone-600">Toplam</span>
                    <span className="text-xl font-bold text-red-600">
                      {bugunOdemeBekleyen.reduce((sum, g) => sum + Number(g.kalan || 0), 0).toLocaleString('tr-TR')} ₺
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Aylık Özet Tablosu */}
        <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
          <h2 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
            <span>📊</span> Aylık Finansal Özet
          </h2>
          
          {/* Header */}
          <div className="flex bg-stone-50 px-4 py-3 border-b border-stone-200 rounded-t-lg">
            <div className="w-[15%] text-left text-xs font-medium text-stone-500 uppercase">Ay</div>
            <div className="w-[10%] text-center text-xs font-medium text-stone-500 uppercase">Gelin</div>
            <div className="w-[15%] text-center text-xs font-medium text-stone-500 uppercase">Hedef</div>
            <div className="w-[20%] text-right text-xs font-medium text-stone-500 uppercase">Toplam Ücret</div>
            <div className="w-[20%] text-right text-xs font-medium text-stone-500 uppercase">Kapora</div>
            <div className="w-[20%] text-right text-xs font-medium text-stone-500 uppercase">Kalan</div>
          </div>

          {/* Body - SADECE BU KISIM SCROLL */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-stone-200">
            {tumAylar.map(ay => {
              const veri = getAyVerileri(ay);
              const isBuAy = ay === buAy;
              return (
                <div
                  key={ay}
                  ref={isBuAy ? bugunAyRef : null}
                  className={`flex px-4 py-3 ${isBuAy ? 'bg-amber-50' : 'hover:bg-stone-50'}`}
                >
                  <div className="w-[15%] text-left">
                    <span className={`font-medium ${isBuAy ? 'text-amber-600' : 'text-stone-700'}`}>
                      {formatAy(ay)}
                    </span>
                  </div>
                  <div className="w-[10%] text-center">
                    <span className={`font-bold ${isBuAy ? 'text-amber-600' : 'text-stone-800'}`}>
                      {veri.toplamGelin}
                    </span>
                  </div>
                  <div className="w-[15%] text-center">
                    {veri.hedef > 0 ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-stone-600">{veri.hedef}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                          veri.toplamGelin >= veri.hedef 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-stone-100 text-stone-600'
                        }`}>
                          %{Math.round((veri.toplamGelin / veri.hedef) * 100)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-stone-400">-</span>
                    )}
                  </div>
                  <div className="w-[20%] text-right font-medium text-stone-800">
                    {veri.toplamUcret.toLocaleString('tr-TR')} ₺
                  </div>
                  <div className="w-[20%] text-right font-medium text-green-600">
                    {veri.toplamKapora.toLocaleString('tr-TR')} ₺
                  </div>
                  <div className="w-[20%] text-right font-medium text-red-600">
                    {veri.toplamKalan.toLocaleString('tr-TR')} ₺
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
