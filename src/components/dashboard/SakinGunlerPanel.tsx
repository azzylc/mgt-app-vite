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
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}>
      <div className="px-3 py-2 border-b border-stone-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-sky-400 rounded-full"></span>
          <span className="text-xs font-semibold text-stone-700">Sakin Günler</span>
          <span className="text-[10px] text-stone-400">{sakinGunler.length}</span>
        </div>
        <select 
          value={filtre}
          onChange={(e) => onFiltreChange(Number(e.target.value))}
          className="text-[10px] bg-stone-100 border-0 rounded-md px-1.5 py-0.5 text-stone-500 focus:ring-1 focus:ring-amber-200"
        >
          <option value={0}>Hiç gelin yok</option>
          <option value={1}>Max 1 gelin</option>
          <option value={2}>Max 2 gelin</option>
        </select>
      </div>
      <div className="p-2.5">
        {sakinGunler.length === 0 ? (
          <p className="text-center py-4 text-stone-400 text-xs">Bu kriterde gün yok</p>
        ) : (
          <div className="space-y-0.5 max-h-[250px] overflow-y-auto">
            {sakinGunler.map((gun) => (
              <div key={gun.tarih} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-stone-50">
                <span className="text-xs text-stone-600">{formatTarih(gun.tarih)}</span>
                <div className="flex items-center gap-2">
                  {gun.gelinSayisi > 0 && (
                    <span className="text-[10px] text-stone-400">{gun.gelinSayisi} gelin</span>
                  )}
                  <span className="text-[10px] text-stone-400 w-6 text-right">{formatGun(gun.tarih)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
