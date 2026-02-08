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
    const gunIsimleri = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    return gunIsimleri[new Date(tarih).getDay()];
  };

  return (
    <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100 flex items-center justify-between bg-gradient-to-r from-violet-50/30 to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔭</span>
          <span className="text-xs font-semibold text-stone-700">Sakin Günler</span>
          <span className="text-[10px] text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded-full font-medium">{sakinGunler.length}</span>
        </div>
        <select 
          value={filtre}
          onChange={(e) => onFiltreChange(Number(e.target.value))}
          className="text-[10px] bg-stone-100 border-0 rounded-lg px-2 py-1 text-stone-500 focus:ring-1 focus:ring-violet-200 cursor-pointer"
        >
          <option value={0}>Hiç gelin yok</option>
          <option value={1}>Max 1 gelin</option>
          <option value={2}>Max 2 gelin</option>
        </select>
      </div>
      <div className="p-2.5">
        {sakinGunler.length === 0 ? (
          <div className="text-center py-4">
            <span className="text-lg">🔍</span>
            <p className="text-stone-400 text-xs mt-1">Bu kriterde gün bulunamadı</p>
          </div>
        ) : (
          <div className="space-y-0.5 max-h-[250px] overflow-y-auto">
            {sakinGunler.map((gun) => (
              <div key={gun.tarih} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-violet-50/30 transition">
                <span className="text-xs text-stone-600 font-medium">{formatTarih(gun.tarih)}</span>
                <div className="flex items-center gap-2">
                  {gun.gelinSayisi > 0 && (
                    <span className="text-[10px] text-rose-400 bg-rose-50 px-1.5 py-0.5 rounded font-medium">
                      {gun.gelinSayisi} gelin
                    </span>
                  )}
                  <span className="text-[10px] text-stone-400 w-7 text-right">{formatGun(gun.tarih)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
