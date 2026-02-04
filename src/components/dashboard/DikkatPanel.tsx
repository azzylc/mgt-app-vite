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
  esiTelefon?: string;
  instagram?: string;
  fotografci?: string;
  modaevi?: string;
  anlasildigiTarih?: string;
  bilgilendirmeGonderildi?: boolean;
  ucretYazildi?: boolean;
  malzemeListesiGonderildi?: boolean;
  paylasimIzni?: boolean;
  yorumIstesinMi?: string;
  yorumIstendiMi?: boolean;
  gelinNotu?: string;
  dekontGorseli?: string;
}

interface EksikIzin {
  personel: {
    id: string;
    ad: string;
    soyad: string;
    iseBaslama?: string;
    yillikIzinHakki?: number;
    kullaniciTuru?: string;
    aktif: boolean;
  };
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

  if (toplamDikkat === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-stone-100 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-50">
        <h2 className="font-medium text-stone-800 flex items-center gap-1.5 text-xs">
          <span>⚠️</span> Dikkat Edilecekler
          <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full">
            {toplamDikkat}
          </span>
        </h2>
      </div>
      <div className="p-2.5">
        <div className="space-y-2">
          {/* İşlenmemiş Ücretler */}
          {islenmemisUcretler.length > 0 && (
            <div className="bg-amber-50/80 border border-amber-100 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-600 text-sm">💰</span>
                  <h4 className="font-medium text-amber-900 text-xs">İşlenmemiş Ücretler</h4>
                </div>
                <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                  {islenmemisUcretler.length}
                </span>
              </div>
              <div className="space-y-1">
                {islenmemisUcretler.slice(0, 3).map(g => (
                  <div 
                    key={g.id}
                    onClick={() => onGelinClick(g)}
                    className="flex items-center justify-between p-1.5 bg-white rounded-md hover:bg-stone-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-stone-800">{g.isim}</span>
                      <span className="text-[10px] text-stone-500">{formatTarih(g.tarih)}</span>
                    </div>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">X₺</span>
                  </div>
                ))}
                {islenmemisUcretler.length > 3 && (
                  <button 
                    onClick={onIslenmemisUcretlerClick}
                    className="text-amber-600 text-[10px] font-medium hover:text-amber-700 w-full text-center pt-1"
                  >
                    +{islenmemisUcretler.length - 3} daha gör →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Eksik İzin Hakları */}
          {eksikIzinler.length > 0 && (
            <div className="bg-emerald-50/80 border border-emerald-100 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 text-sm">🏖️</span>
                  <h4 className="font-medium text-emerald-900 text-xs">Eksik İzin Hakları</h4>
                </div>
                <div className="flex items-center gap-1.5">
                  {eksikIzinler.length > 1 && (
                    <button
                      onClick={onTumIzinleriEkle}
                      className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-emerald-600 transition"
                    >
                      Tümünü Ekle
                    </button>
                  )}
                  <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                    {eksikIzinler.length}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                {eksikIzinler.slice(0, 5).map(eksik => (
                  <div 
                    key={eksik.personel.id}
                    className="flex items-center justify-between p-1.5 bg-white rounded-md"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-stone-800">
                          {eksik.personel.ad} {eksik.personel.soyad}
                        </span>
                        <span className="text-[10px] text-stone-500">({eksik.calismaYili}. yıl)</span>
                      </div>
                      <div className="text-[10px] text-stone-500">
                        {eksik.mevcut} → {eksik.olmasiGereken} gün
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-emerald-600">+{eksik.eksik}</span>
                      <button
                        onClick={() => onIzinEkle(eksik)}
                        disabled={izinEkleniyor === eksik.personel.id}
                        className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-emerald-600 transition disabled:opacity-50"
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
    </div>
  );
}
