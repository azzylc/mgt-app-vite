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
    <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
      <div className="px-3 py-2 border-b border-[#E5E5E5] flex items-center gap-2 bg-gradient-to-r from-[#D96C6C]/10 to-transparent">
        <span className="text-sm">⚠️</span>
        <span className="text-xs font-semibold text-[#2F2F2F]">Dikkat Edilecekler</span>
        <span className="text-[10px] text-[#D96C6C] bg-[#D96C6C]/10 px-1.5 py-0.5 rounded-full font-medium">{toplamDikkat}</span>
      </div>
      <div className="p-2.5 space-y-2.5">
        {islenmemisUcretler.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">💰</span>
                <span className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wide">İşlenmemiş Ücretler</span>
              </div>
              <span className="text-[10px] text-[#E6B566] bg-[#EAF2ED] px-1.5 py-0.5 rounded-full font-medium">{islenmemisUcretler.length}</span>
            </div>
            <div className="space-y-1.5">
              {islenmemisUcretler.slice(0, 3).map(g => (
                <div 
                  key={g.id}
                  onClick={() => onGelinClick(g)}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#F7F7F7] hover:bg-[#EAF2ED] transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#2F2F2F] font-medium">{g.isim}</span>
                    <span className="text-[10px] text-[#8A8A8A]">{formatTarih(g.tarih)}</span>
                  </div>
                  <span className="text-[10px] text-[#8FAF9A] bg-[#EAF2ED] px-1.5 py-0.5 rounded font-medium">Bekliyor</span>
                </div>
              ))}
              {islenmemisUcretler.length > 3 && (
                <button 
                  onClick={onIslenmemisUcretlerClick}
                  className="text-[10px] text-[#E6B566] hover:text-[#8FAF9A] w-full text-center pt-1 font-medium"
                >
                  +{islenmemisUcretler.length - 3} daha →
                </button>
              )}
            </div>
          </div>
        )}

        {eksikIzinler.length > 0 && islenmemisUcretler.length > 0 && (
          <div className="border-t border-[#E5E5E5]"></div>
        )}

        {eksikIzinler.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">🏖️</span>
                <span className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wide">Eksik İzin Hakları</span>
              </div>
              <div className="flex items-center gap-1.5">
                {eksikIzinler.length > 1 && (
                  <button
                    onClick={onTumIzinleriEkle}
                    className="text-[10px] text-[#8FAF9A] hover:text-[#8FAF9A] font-medium bg-[#EAF2ED] px-2 py-0.5 rounded hover:bg-[#EAF2ED] transition"
                  >
                    Tümünü Ekle
                  </button>
                )}
                <span className="text-[10px] text-[#8FAF9A] bg-[#EAF2ED] px-1.5 py-0.5 rounded-full font-medium">{eksikIzinler.length}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {eksikIzinler.slice(0, 5).map(eksik => (
                <div key={eksik.personel.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#F7F7F7] hover:bg-[#EAF2ED] transition">
                  <div>
                    <span className="text-xs text-[#2F2F2F] font-medium">{eksik.personel.ad} {eksik.personel.soyad}</span>
                    <span className="text-[10px] text-[#8A8A8A] ml-1.5">({eksik.calismaYili}. yıl)</span>
                    <span className="text-[10px] text-[#8A8A8A] ml-1">{eksik.mevcut}→{eksik.olmasiGereken}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#8FAF9A]">+{eksik.eksik}</span>
                    <button
                      onClick={() => onIzinEkle(eksik)}
                      disabled={izinEkleniyor === eksik.personel.id}
                      className="text-[10px] text-white bg-[#8FAF9A] hover:bg-[#7A9E86] px-2 py-0.5 rounded transition disabled:opacity-50 font-medium"
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
