import { useState, useEffect } from "react";
import { auth } from "../lib/firebase";
import { usePersoneller } from "../hooks/usePersoneller";
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
}

const CACHE_KEY = "gmt_gelinler_cache";

export default function RaporlarPage() {
  const user = useAuth();
  const [gelinler, setGelinler] = useState<Gelin[]>([]);
  const [selectedAy, setSelectedAy] = useState(new Date().toISOString().slice(0, 7));
  // Personeller (Firebase'den)
  const { personeller } = usePersoneller();

  const aylar = [
    { value: "2026-01", label: "Ocak 2026" }, { value: "2026-02", label: "Şubat 2026" },
    { value: "2026-03", label: "Mart 2026" }, { value: "2026-04", label: "Nisan 2026" },
    { value: "2026-05", label: "Mayıs 2026" }, { value: "2026-06", label: "Haziran 2026" },
    { value: "2026-07", label: "Temmuz 2026" }, { value: "2026-08", label: "Ağustos 2026" },
    { value: "2026-09", label: "Eylül 2026" }, { value: "2026-10", label: "Ekim 2026" },
    { value: "2026-11", label: "Kasım 2026" }, { value: "2026-12", label: "Aralık 2026" },
  ];

  // Seçili aya göre veriler
  const ayGelinler = gelinler.filter(g => g.tarih.startsWith(selectedAy));
  const toplamUcret = ayGelinler.reduce((sum, g) => sum + (g.ucret > 0 ? g.ucret : 0), 0);
  const toplamKapora = ayGelinler.reduce((sum, g) => sum + (g.kapora > 0 ? g.kapora : 0), 0);
  const toplamKalan = ayGelinler.reduce((sum, g) => sum + (g.kalan > 0 ? g.kalan : 0), 0);
  const islenmemis = ayGelinler.filter(g => g.ucret === -1).length;

  // Personel bazlı rapor
  const personelRapor = personeller.map(p => {
    const makyaj = ayGelinler.filter(g => g.makyaj === p.isim).length;
    const turban = ayGelinler.filter(g => g.turban === p.isim && g.makyaj !== p.isim).length;
    return { ...p, makyaj, turban, toplam: makyaj + turban };
  }).sort((a, b) => b.toplam - a.toplam);

  // Haftalık dağılım
  const haftaGunleri = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const gunDagilimi = haftaGunleri.map((gun, index) => ({
    gun,
    sayi: ayGelinler.filter(g => new Date(g.tarih).getDay() === index).length
  }));

  return (
    <div className="min-h-screen bg-stone-50">
      <div>
        <header className="bg-white border-b px-6 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-stone-800">📊 Raporlar</h1>
              <p className="text-sm text-stone-500">Aylık istatistikler ve analizler</p>
            </div>
            <select
              value={selectedAy}
              onChange={(e) => setSelectedAy(e.target.value)}
              className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
            >
              {aylar.map(ay => <option key={ay.value} value={ay.value}>{ay.label}</option>)}
            </select>
          </div>
        </header>

        <main className="p-4 md:p-6">
          {/* Özet Kartları */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-stone-100">
              <p className="text-stone-500 text-xs">Toplam Gelin</p>
              <p className="text-3xl font-bold text-rose-600">{ayGelinler.length}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-stone-100">
              <p className="text-stone-500 text-xs">Toplam Ciro</p>
              <p className="text-2xl font-bold text-blue-600">{toplamUcret.toLocaleString('tr-TR')} ₺</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-stone-100">
              <p className="text-stone-500 text-xs">Alınan Kapora</p>
              <p className="text-2xl font-bold text-green-600">{toplamKapora.toLocaleString('tr-TR')} ₺</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-stone-100">
              <p className="text-stone-500 text-xs">Kalan Bakiye</p>
              <p className="text-2xl font-bold text-red-600">{toplamKalan.toLocaleString('tr-TR')} ₺</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-stone-100">
              <p className="text-stone-500 text-xs">İşlenmemiş</p>
              <p className="text-3xl font-bold text-stone-400">{islenmemis}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Personel Performans */}
            <div className="bg-white rounded-lg shadow-sm border border-stone-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h2 className="font-semibold text-stone-800">👥 Personel Performansı</h2>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {personelRapor.map((p, index) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="text-stone-400 text-sm w-6">{index + 1}.</span>
                      <span className="text-xl">{p.emoji}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-stone-800">{p.isim}</span>
                          <span className="font-bold text-rose-600">{p.toplam}</span>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <span className="text-xs text-rose-500">Makyaj: {p.makyaj}</span>
                          <span className="text-xs text-purple-500">Türban: {p.turban}</span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-2 mt-1">
                          <div 
                            className="bg-gradient-to-r from-rose-400 to-purple-400 h-2 rounded-full"
                            style={{ width: `${Math.min((p.toplam / Math.max(...personelRapor.map(x => x.toplam))) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Gün Dağılımı */}
            <div className="bg-white rounded-lg shadow-sm border border-stone-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h2 className="font-semibold text-stone-800">📅 Haftalık Dağılım</h2>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {gunDagilimi.map((gun) => (
                    <div key={gun.gun} className="flex items-center gap-3">
                      <span className="text-sm text-stone-600 w-24">{gun.gun}</span>
                      <div className="flex-1">
                        <div className="w-full bg-stone-100 rounded-full h-6 relative">
                          <div 
                            className="bg-gradient-to-r from-blue-400 to-blue-500 h-6 rounded-full flex items-center justify-end pr-2"
                            style={{ width: `${Math.max((gun.sayi / Math.max(...gunDagilimi.map(x => x.sayi))) * 100, 10)}%` }}
                          >
                            <span className="text-xs text-white font-medium">{gun.sayi}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Ortalamalar */}
          <div className="mt-6 bg-white rounded-lg shadow-sm border border-stone-100 p-6">
            <h2 className="font-semibold text-stone-800 mb-4">📈 Ortalamalar</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-rose-600">
                  {ayGelinler.length > 0 ? (ayGelinler.length / 30).toFixed(1) : 0}
                </p>
                <p className="text-stone-500 text-sm">Günlük Ortalama</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">
                  {ayGelinler.length > 0 ? Math.round(toplamUcret / ayGelinler.length).toLocaleString('tr-TR') : 0} ₺
                </p>
                <p className="text-stone-500 text-sm">Ortalama Ücret</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {ayGelinler.length > 0 ? Math.round(toplamKapora / ayGelinler.length).toLocaleString('tr-TR') : 0} ₺
                </p>
                <p className="text-stone-500 text-sm">Ortalama Kapora</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">
                  {toplamUcret > 0 ? Math.round((toplamKapora / toplamUcret) * 100) : 0}%
                </p>
                <p className="text-stone-500 text-sm">Kapora Oranı</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
