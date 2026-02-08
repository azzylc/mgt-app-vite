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
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}>
      <div className="px-3 py-2 border-b border-stone-50 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
        <span className="text-xs font-semibold text-stone-700">Dikkat Edilecekler</span>
        <span className="text-[10px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">{toplamDikkat}</span>
      </div>
      <div className="p-2.5 space-y-2">
        {islenmemisUcretler.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">İşlenmemiş Ücretler</span>
              <span className="text-[10px] text-amber-600 font-medium">{islenmemisUcretler.length}</span>
            </div>
            <div className="space-y-0.5">
              {islenmemisUcretler.slice(0, 3).map(g => (
                <div 
                  key={g.id}
                  onClick={() => onGelinClick(g)}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-stone-50 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-700">{g.isim}</span>
                    <span className="text-[10px] text-stone-400">{formatTarih(g.tarih)}</span>
                  </div>
                  <span className="text-[10px] text-amber-500 font-medium">Bekliyor</span>
                </div>
              ))}
              {islenmemisUcretler.length > 3 && (
                <button 
                  onClick={onIslenmemisUcretlerClick}
                  className="text-[10px] text-stone-400 hover:text-stone-600 w-full text-center pt-1"
                >
                  +{islenmemisUcretler.length - 3} daha →
                </button>
              )}
            </div>
          </div>
        )}

        {eksikIzinler.length > 0 && islenmemisUcretler.length > 0 && (
          <div className="border-t border-stone-50"></div>
        )}

        {eksikIzinler.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">Eksik İzin Hakları</span>
              <div className="flex items-center gap-1.5">
                {eksikIzinler.length > 1 && (
                  <button
                    onClick={onTumIzinleriEkle}
                    className="text-[10px] text-amber-600 hover:text-amber-700 font-medium"
                  >
                    Tümünü Ekle
                  </button>
                )}
                <span className="text-[10px] text-stone-400">{eksikIzinler.length}</span>
              </div>
            </div>
            <div className="space-y-0.5">
              {eksikIzinler.slice(0, 5).map(eksik => (
                <div key={eksik.personel.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-stone-50">
                  <div>
                    <span className="text-xs text-stone-700">{eksik.personel.ad} {eksik.personel.soyad}</span>
                    <span className="text-[10px] text-stone-400 ml-1.5">({eksik.calismaYili}. yıl)</span>
                    <span className="text-[10px] text-stone-400 ml-1">{eksik.mevcut}→{eksik.olmasiGereken} gün</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-amber-600">+{eksik.eksik}</span>
                    <button
                      onClick={() => onIzinEkle(eksik)}
                      disabled={izinEkleniyor === eksik.personel.id}
                      className="text-[10px] text-stone-500 hover:text-amber-600 transition disabled:opacity-50 px-1.5 py-0.5 rounded bg-stone-100 hover:bg-amber-50"
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
