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

interface EksikIzin {
  personel: { id: string; ad: string; soyad: string; aktif: boolean; };
  calismaYili: number;
  olmasiGereken: number;
  mevcut: number;
  eksik: number;
}

interface DikkatPanelProps {
  islenmemisUcretler: Gelin[];
  eksikIzinler: EksikIzin[];
  onGelinClick: (gelin: Gelin) => void;
  onIzinEkle: (eksik: EksikIzin) => void;
  onTumIzinleriEkle: () => void;
  izinEkleniyor: string | null;
  onIslenmemisUcretlerClick: () => void;
}

export default function DikkatPanel({
  islenmemisUcretler,
  eksikIzinler,
  onGelinClick,
  onIzinEkle,
  onTumIzinleriEkle,
  izinEkleniyor,
  onIslenmemisUcretlerClick
}: DikkatPanelProps) {
  const formatTarih = (tarih: string) => new Date(tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const toplamDikkat = islenmemisUcretler.length + eksikIzinler.length;

  if (toplamDikkat === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100 flex items-center gap-2 bg-gradient-to-r from-red-50/50 to-transparent">
        <span className="text-sm">⚠️</span>
        <span className="text-xs font-semibold text-stone-700">Dikkat Edilecekler</span>
        <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full font-medium">{toplamDikkat}</span>
      </div>
      <div className="p-2.5 space-y-2.5">
        {islenmemisUcretler.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">💰</span>
                <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">İşlenmemiş Ücretler</span>
              </div>
              <span className="text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">{islenmemisUcretler.length}</span>
            </div>
            <div className="space-y-1.5">
              {islenmemisUcretler.slice(0, 3).map(g => (
                <div 
                  key={g.id}
                  onClick={() => onGelinClick(g)}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-stone-50/60 hover:bg-amber-50/50 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-700 font-medium">{g.isim}</span>
                    <span className="text-[10px] text-stone-400">{formatTarih(g.tarih)}</span>
                  </div>
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">Bekliyor</span>
                </div>
              ))}
              {islenmemisUcretler.length > 3 && (
                <button 
                  onClick={onIslenmemisUcretlerClick}
                  className="text-[10px] text-amber-500 hover:text-amber-600 w-full text-center pt-1 font-medium"
                >
                  +{islenmemisUcretler.length - 3} daha →
                </button>
              )}
            </div>
          </div>
        )}

        {eksikIzinler.length > 0 && islenmemisUcretler.length > 0 && (
          <div className="border-t border-stone-100"></div>
        )}

        {eksikIzinler.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">🏖️</span>
                <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">Eksik İzin Hakları</span>
              </div>
              <div className="flex items-center gap-1.5">
                {eksikIzinler.length > 1 && (
                  <button
                    onClick={onTumIzinleriEkle}
                    className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded hover:bg-emerald-100 transition"
                  >
                    Tümünü Ekle
                  </button>
                )}
                <span className="text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">{eksikIzinler.length}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {eksikIzinler.slice(0, 5).map(eksik => (
                <div key={eksik.personel.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-stone-50/60 hover:bg-emerald-50/50 transition">
                  <div>
                    <span className="text-xs text-stone-700 font-medium">{eksik.personel.ad} {eksik.personel.soyad}</span>
                    <span className="text-[10px] text-stone-400 ml-1.5">({eksik.calismaYili}. yıl)</span>
                    <span className="text-[10px] text-stone-400 ml-1">{eksik.mevcut}→{eksik.olmasiGereken}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-emerald-500">+{eksik.eksik}</span>
                    <button
                      onClick={() => onIzinEkle(eksik)}
                      disabled={izinEkleniyor === eksik.personel.id}
                      className="text-[10px] text-white bg-emerald-500 hover:bg-emerald-600 px-2 py-0.5 rounded transition disabled:opacity-50 font-medium"
                    >
                      {izinEkleniyor === eksik.personel.id ? "..." : "Ekle"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
