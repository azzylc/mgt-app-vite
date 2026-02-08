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
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}>
      <div className="px-3 py-2 border-b border-stone-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-rose-400 rounded-full"></span>
          <span className="text-xs font-semibold text-stone-700">{title}</span>
          <span className="text-[10px] text-stone-400">{gelinler.length}</span>
        </div>
        {showToggle && onToggleChange && (
          <div className="flex bg-stone-100 rounded-md p-0.5">
            <button
              onClick={() => onToggleChange('bugun')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                toggleValue === 'bugun' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'
              }`}
            >
              Bugün
            </button>
            <button
              onClick={() => onToggleChange('yarin')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                toggleValue === 'yarin' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'
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
          <p className="text-center py-4 text-stone-400 text-xs">Gelin yok</p>
        ) : (
          <div className="space-y-1 max-h-[250px] overflow-y-auto">
            {gelinler.map((gelin) => (
              <div 
                key={gelin.id}
                onClick={() => onGelinClick(gelin)}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-stone-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone-400 font-mono w-10">{gelin.saat}</span>
                  <div>
                    <p className="text-xs text-stone-700 font-medium">{gelin.isim}</p>
                    <p className="text-[10px] text-stone-400">
                      {gelin.makyaj 
                        ? (gelin.turban && gelin.turban !== gelin.makyaj 
                            ? `${gelin.makyaj} + ${gelin.turban}` 
                            : gelin.makyaj)
                        : 'Atanmamış'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {gelin.ucret === -1 ? (
                    <span className="text-[10px] text-stone-400">—</span>
                  ) : gelin.kalan > 0 ? (
                    <span className="text-xs text-red-400 font-medium">{gelin.kalan.toLocaleString('tr-TR')} ₺</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
