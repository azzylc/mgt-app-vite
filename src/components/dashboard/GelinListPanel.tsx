interface Gelin {
  id: string;
  isim: string;
  tarih: string;
  saat: string;
  bitisSaati?: string;
  ucret: number;
  kapora: number;
  kalan: number;
  makyaj: string;
  turban: string;
}

interface GelinListPanelProps {
  title: string;
  gelinler: Gelin[];
  loading?: boolean;
  onGelinClick: (gelin: Gelin) => void;
  onRefresh?: () => void;
  showToggle?: boolean;
  toggleValue?: 'bugun' | 'yarin';
  onToggleChange?: (value: 'bugun' | 'yarin') => void;
}

export default function GelinListPanel({
  title,
  gelinler,
  loading = false,
  onGelinClick,
  onRefresh,
  showToggle = false,
  toggleValue = 'bugun',
  onToggleChange
}: GelinListPanelProps) {
  return (
    <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100 flex items-center justify-between bg-gradient-to-r from-rose-50/40 to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-sm">💄</span>
          <span className="text-xs font-semibold text-stone-700">{title}</span>
          <span className="text-[10px] text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-full font-medium">{gelinler.length}</span>
        </div>
        {showToggle && onToggleChange && (
          <div className="flex bg-stone-100 rounded-lg p-0.5">
            <button
              onClick={() => onToggleChange('bugun')}
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition ${
                toggleValue === 'bugun' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-600'
              }`}
            >
              Bugün
            </button>
            <button
              onClick={() => onToggleChange('yarin')}
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition ${
                toggleValue === 'yarin' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-600'
              }`}
            >
              Yarın
            </button>
          </div>
        )}
      </div>
      <div className="p-2.5">
        {loading ? (
          <p className="text-center py-4 text-stone-400 text-xs">Yükleniyor...</p>
        ) : gelinler.length === 0 ? (
          <div className="text-center py-5">
            <span className="text-2xl">🎉</span>
            <p className="text-stone-400 text-xs mt-1">İş yok!</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[250px] overflow-y-auto">
            {gelinler.map((gelin) => (
              <div 
                key={gelin.id}
                onClick={() => onGelinClick(gelin)}
                className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-rose-50/40 transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] text-stone-400 font-mono w-[4.5rem] bg-stone-50 group-hover:bg-rose-50 px-1 py-0.5 rounded text-center transition">{gelin.saat}{gelin.bitisSaati ? `-${gelin.bitisSaati}` : ''}</span>
                  <div>
                    <p className="text-xs text-stone-700 font-medium">{gelin.isim}</p>
                    <p className="text-[10px] text-stone-400">
                      {gelin.makyaj 
                        ? (gelin.turban && gelin.turban !== gelin.makyaj 
                            ? `${gelin.makyaj} + ${gelin.turban}` 
                            : gelin.makyaj)
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {gelin.ucret === -1 ? (
                    <span className="text-[10px] text-stone-300">—</span>
                  ) : gelin.kalan > 0 ? (
                    <span className="text-xs text-red-500 font-semibold">{gelin.kalan.toLocaleString('tr-TR')} ₺</span>
                  ) : (
                    <span className="text-[10px] text-emerald-400">✓</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
