import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
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
import { useAuth } from "../context/RoleProvider";

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

export default function YonetimPage() {
  const user = useAuth();
  const [yetkisiz, setYetkisiz] = useState(false);
  const [gelinler, setGelinler] = useState<Gelin[]>([]);
  const [hedefler, setHedefler] = useState<HedefAy[]>([]);
  const [selectedAy, setSelectedAy] = useState("");
  const [hedefInput, setHedefInput] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  
  // Bugünkü ay satırı için ref
  const bugunAyRef = useRef<HTMLDivElement>(null);

  const bugun = new Date().toISOString().split('T')[0];
  const buAy = new Date().toISOString().slice(0, 7);

  // Auth kontrolü
  // ✅ Gelinler - 2025: localStorage cache, 2026+: Firestore real-time
  useEffect(() => {
    if (!user) return;

    let gelinler2025: Gelin[] = [];

    // 2025 verisi - localStorage'dan veya Firestore'dan
    const load2025 = async () => {
      const cached = localStorage.getItem(CACHE_KEY_2025);
      
      if (cached) {
        gelinler2025 = JSON.parse(cached);
      } else {
        const q2025 = query(
          collection(db, "gelinler"),
          where("tarih", ">=", "2025-01-01"),
          where("tarih", "<", "2026-01-01"),
          orderBy("tarih", "asc")
        );
        
        const snapshot = await getDocs(q2025);
        gelinler2025 = snapshot.docs.map(doc => ({
          id: doc.id,
          isim: doc.data().isim || "",
          tarih: doc.data().tarih || "",
          saat: doc.data().saat || "",
          ucret: doc.data().ucret || 0,
          kapora: doc.data().kapora || 0,
          kalan: doc.data().kalan || 0,
          makyaj: doc.data().makyaj || "",
          turban: doc.data().turban || "",
          anlasildigiTarih: doc.data().anlasildigiTarih || "",
        } as Gelin));
        
        localStorage.setItem(CACHE_KEY_2025, JSON.stringify(gelinler2025));
      }
      
      setGelinler(gelinler2025);
    };

    load2025();

    // 2026+ verisi - Real-time listener
    const q2026 = query(
      collection(db, "gelinler"),
      where("tarih", ">=", "2026-01-01"),
      orderBy("tarih", "asc")
    );

    const unsubscribe = onSnapshot(q2026, (snapshot) => {
      const gelinler2026 = snapshot.docs.map(doc => ({
        id: doc.id,
        isim: doc.data().isim || "",
        tarih: doc.data().tarih || "",
        saat: doc.data().saat || "",
        ucret: doc.data().ucret || 0,
        kapora: doc.data().kapora || 0,
        kalan: doc.data().kalan || 0,
        makyaj: doc.data().makyaj || "",
        turban: doc.data().turban || "",
        anlasildigiTarih: doc.data().anlasildigiTarih || "",
      } as Gelin));

      
      const cached = localStorage.getItem(CACHE_KEY_2025);
      const cached2025 = cached ? JSON.parse(cached) : [];
      setGelinler([...cached2025, ...gelinler2026]);
    });

    return () => unsubscribe();
  }, [user]);

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

  // Sayfa yüklendiğinde bugünkü aya scroll yap
  useEffect(() => {
    if (bugunAyRef.current && gelinler.length > 0) {
      setTimeout(() => {
        bugunAyRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 300);
    }
  }, [gelinler]);

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
    } catch {
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

  // Bu ayın verileri
  const buAyVerileri = getAyVerileri(buAy);

  // Bu ay + önümüzdeki 11 ay
  const ayListesi = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    return d.toISOString().slice(0, 7);
  });

  // Bugünden itibaren önümüzdeki 12 ay + geçmişten 6 ay (scroll için)
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

  if (yetkisiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <span className="text-6xl">🚫</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-4">Yetkisiz Erişim</h1>
          <p className="text-gray-500 mt-2">Bu sayfaya erişim yetkiniz bulunmamaktadır.</p>
          <button 
            onClick={() => navigate("/")}
            className="mt-4 bg-pink-500 text-white px-6 py-2 rounded-xl hover:bg-pink-600 transition"
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div>
        <header className="bg-white border-b px-6 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">👑 Yönetim Paneli</h1>
              <p className="text-sm text-gray-500">Finansal özet ve hedef yönetimi</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/yonetim/compare")}
                className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-sm font-medium"
              >
                🔍 Karşılaştır
              </button>
            </div>
          </div>
        </header>

        <main className="p-3 md:p-6">
          {/* Üst Kartlar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
            <div className="bg-white rounded-2xl p-3 md:p-4 shadow-sm border border-gray-100">
              <p className="text-gray-500 text-[10px] md:text-xs">Bu Ay Gelin</p>
              <p className="text-lg md:text-2xl font-bold text-pink-600 mt-1">
                {buAyVerileri.toplamGelin}
                {buAyVerileri.hedef > 0 && (
                  <span className="text-xs md:text-sm text-gray-400 font-normal">/{buAyVerileri.hedef}</span>
                )}
              </p>
              {buAyVerileri.hedef > 0 && (
                <div className="mt-2">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-pink-500 rounded-full transition-all"
                      style={{ width: `${Math.min((buAyVerileri.toplamGelin / buAyVerileri.hedef) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] md:text-xs text-gray-400 mt-1">
                    %{Math.round((buAyVerileri.toplamGelin / buAyVerileri.hedef) * 100)} tamamlandı
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-3 md:p-4 shadow-sm border border-gray-100">
              <p className="text-gray-500 text-[10px] md:text-xs">Bu Ayın Cirosu</p>
              <p className="text-lg md:text-2xl font-bold text-blue-600 mt-1">
                {buAyVerileri.toplamUcret.toLocaleString('tr-TR')} ₺
              </p>
              <p className="text-[10px] md:text-xs text-gray-400 mt-1">Anlaşılan ücret</p>
            </div>

            <div className="bg-white rounded-2xl p-3 md:p-4 shadow-sm border border-gray-100">
              <p className="text-gray-500 text-[10px] md:text-xs">Bu Ay Kapora</p>
              <p className="text-lg md:text-2xl font-bold text-green-600 mt-1">
                {buAyAnlasanKapora.toLocaleString('tr-TR')} ₺
              </p>
              <p className="text-[10px] md:text-xs text-gray-400 mt-1">Anlaşan gelinlerden</p>
            </div>

            <div className="bg-white rounded-2xl p-3 md:p-4 shadow-sm border border-gray-100">
              <p className="text-gray-500 text-[10px] md:text-xs">Bu Ay Kalan Bakiye</p>
              <p className="text-lg md:text-2xl font-bold text-red-600 mt-1">
                {buAyKalanBakiye.toLocaleString('tr-TR')} ₺
              </p>
              <p className="text-[10px] md:text-xs text-gray-400 mt-1">Bugün ve sonrası</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sol: Hedef Belirleme */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span>🎯</span> Aylık Hedef Belirleme
              </h2>
              
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {ayListesi.map(ay => {
                  const mevcutHedef = hedefler.find(h => h.ay === ay)?.hedef || 0;
                  const ayVerileri = getAyVerileri(ay);
                  const yuzde = mevcutHedef > 0 ? Math.round((ayVerileri.toplamGelin / mevcutHedef) * 100) : 0;
                  const isEditing = selectedAy === ay;
                  
                  return (
                    <div key={ay} className={`p-3 rounded-xl transition ${isEditing ? 'bg-pink-50 ring-2 ring-pink-300' : 'bg-gray-50 hover:bg-gray-100'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-gray-700 min-w-[100px]">{formatAy(ay)}</span>
                        
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="number"
                              value={hedefInput}
                              onChange={(e) => setHedefInput(e.target.value)}
                              placeholder="Hedef"
                              className="w-20 px-3 py-1.5 border border-pink-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-center text-sm"
                              autoFocus
                            />
                            <button
                              onClick={handleHedefKaydet}
                              disabled={saving}
                              className="bg-pink-500 hover:bg-pink-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50"
                            >
                              {saving ? "..." : "✓"}
                            </button>
                            <button
                              onClick={() => { setSelectedAy(""); setHedefInput(""); }}
                              className="text-gray-400 hover:text-gray-600 px-2 py-1.5 text-sm"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 flex-1">
                            {mevcutHedef > 0 ? (
                              <>
                                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${yuzde >= 100 ? 'bg-green-500' : 'bg-pink-500'}`}
                                    style={{ width: `${Math.min(yuzde, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-sm font-bold min-w-[60px] text-right ${yuzde >= 100 ? 'text-green-600' : 'text-gray-600'}`}>
                                  {ayVerileri.toplamGelin}/{mevcutHedef}
                                </span>
                              </>
                            ) : (
                              <span className="text-gray-400 text-sm flex-1">Hedef yok</span>
                            )}
                            <button
                              onClick={() => { setSelectedAy(ay); setHedefInput(mevcutHedef > 0 ? mevcutHedef.toString() : ""); }}
                              className="text-pink-500 hover:text-pink-600 text-sm font-medium px-2"
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
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span>💰</span> Bugün Ödeme Bekleyen
                {bugunOdemeBekleyen.length > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    {bugunOdemeBekleyen.length}
                  </span>
                )}
              </h2>

              {bugunOdemeBekleyen.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <span className="text-4xl">✅</span>
                  <p className="mt-2">Bugün ödeme bekleyen yok</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bugunOdemeBekleyen.map(g => (
                    <div key={g.id} className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                      <div>
                        <p className="font-medium text-gray-800">{g.isim}</p>
                        <p className="text-xs text-gray-500">{g.saat}</p>
                      </div>
                      <span className="text-lg font-bold text-red-600">
                        {Number(g.kalan || 0).toLocaleString('tr-TR')} ₺
                      </span>
                    </div>
                  ))}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-600">Toplam</span>
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
          <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span>📊</span> Aylık Finansal Özet
            </h2>

            {/* Mobile: card view, Desktop: table view */}
            {/* Desktop tablo */}
            <div className="hidden md:block overflow-x-auto -mx-2">
              <div className="min-w-[680px] mx-2">
                {/* Header */}
                <div className="flex bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
                  <div className="w-[15%] text-left text-xs font-medium text-gray-500 uppercase">Ay</div>
                  <div className="w-[10%] text-center text-xs font-medium text-gray-500 uppercase">Gelin</div>
                  <div className="w-[15%] text-center text-xs font-medium text-gray-500 uppercase">Hedef</div>
                  <div className="w-[20%] text-right text-xs font-medium text-gray-500 uppercase">Toplam Ücret</div>
                  <div className="w-[20%] text-right text-xs font-medium text-gray-500 uppercase">Kapora</div>
                  <div className="w-[20%] text-right text-xs font-medium text-gray-500 uppercase">Kalan</div>
                </div>

                {/* Body - vertical scroll */}
                <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-200">
                  {tumAylar.map(ay => {
                    const veri = getAyVerileri(ay);
                    const isBuAy = ay === buAy;
                    return (
                      <div
                        key={ay}
                        ref={isBuAy ? bugunAyRef : null}
                        className={`flex px-4 py-3 ${isBuAy ? 'bg-pink-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className="w-[15%] text-left">
                          <span className={`font-medium ${isBuAy ? 'text-pink-600' : 'text-gray-700'}`}>
                            {formatAy(ay)}
                          </span>
                        </div>
                        <div className="w-[10%] text-center">
                          <span className={`font-bold ${isBuAy ? 'text-pink-600' : 'text-gray-800'}`}>
                            {veri.toplamGelin}
                          </span>
                        </div>
                        <div className="w-[15%] text-center">
                          {veri.hedef > 0 ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-gray-600">{veri.hedef}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                                veri.toplamGelin >= veri.hedef
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                %{Math.round((veri.toplamGelin / veri.hedef) * 100)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                        <div className="w-[20%] text-right font-medium text-gray-800">
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
            </div>

            {/* Mobile kart görünümü */}
            <div className="md:hidden max-h-[400px] overflow-y-auto space-y-2">
              {tumAylar.map(ay => {
                const veri = getAyVerileri(ay);
                const isBuAy = ay === buAy;
                return (
                  <div
                    key={ay}
                    ref={isBuAy ? bugunAyRef : null}
                    className={`p-3 rounded-lg border ${isBuAy ? 'bg-pink-50 border-pink-200' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-bold text-sm ${isBuAy ? 'text-pink-600' : 'text-gray-700'}`}>
                        {formatAy(ay)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${isBuAy ? 'text-pink-600' : 'text-gray-800'}`}>
                          {veri.toplamGelin} gelin
                        </span>
                        {veri.hedef > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            veri.toplamGelin >= veri.hedef ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                          }`}>
                            %{Math.round((veri.toplamGelin / veri.hedef) * 100)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Toplam</span>
                        <p className="font-semibold text-gray-800">{veri.toplamUcret.toLocaleString('tr-TR')} ₺</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Kapora</span>
                        <p className="font-semibold text-green-600">{veri.toplamKapora.toLocaleString('tr-TR')} ₺</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Kalan</span>
                        <p className="font-semibold text-red-600">{veri.toplamKalan.toLocaleString('tr-TR')} ₺</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}