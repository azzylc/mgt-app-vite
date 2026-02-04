interface SakinGun {
  tarih: string;
  gelinSayisi: number;
}

interface SakinGunlerPanelProps {
  sakinGunler: SakinGun[];
  filtre: number;
  onFiltreChange: (filtre: number) => void;
}

export default function SakinGunlerPanel({
  sakinGunler,
  filtre,
  onFiltreChange
}: SakinGunlerPanelProps) {
  const formatTarih = (tarih: string) => new Date(tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const formatGun = (tarih: string) => {
    const gunIsimleri = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return gunIsimleri[new Date(tarih).getDay()];
  };

  return (
    <div className="bg-white rounded-lg border border-stone-100 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-50 flex items-center justify-between">
        <h2 className="font-medium text-stone-800 flex items-center gap-1.5 text-xs">
          <span>📭</span> Önümüzdeki Sakin Günler
          <span className="bg-rose-50 text-rose-500 text-[10px] px-1.5 py-0.5 rounded-full">
            {sakinGunler.length}
          </span>
        </h2>
        <select 
          value={filtre}
          onChange={(e) => onFiltreChange(Number(e.target.value))}
          className="text-[10px] bg-stone-100 border-0 rounded px-1.5 py-0.5 text-stone-600 focus:ring-1 focus:ring-amber-200"
        >
          <option value={0}>Hiç gelin yok</option>
          <option value={1}>Sadece 1 gelin var</option>
          <option value={2}>Sadece 2 gelin var</option>
        </select>
      </div>
      <div className="p-2.5">
        {sakinGunler.length === 0 ? (
          <div className="text-center py-4 text-stone-500">
            <span className="text-2xl">🔍</span>
            <p className="mt-1 text-xs">Bu kriterde gün bulunamadı</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {sakinGunler.map((gun) => (
              <div key={gun.tarih} className="flex items-center justify-between p-1.5 bg-emerald-50 rounded-md">
                <span className="text-xs text-stone-700">{formatTarih(gun.tarih)}</span>
                <div className="flex items-center gap-1.5">
                  {gun.gelinSayisi > 0 && (
                    <span className="text-[10px] bg-rose-50 text-rose-500 px-1 py-0.5 rounded">
                      {gun.gelinSayisi} gelin
                    </span>
                  )}
                  <span className="text-[10px] text-stone-500">{formatGun(gun.tarih)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
