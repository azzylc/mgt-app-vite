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

function GelinRow({ gelin, onClick }: { gelin: Gelin; onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="flex items-center justify-between p-2 bg-stone-50 rounded-lg hover:bg-stone-100 transition cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <div className="bg-rose-50 text-rose-500 w-8 h-8 rounded-md flex items-center justify-center font-medium text-[10px]">
          {gelin.saat}
        </div>
        <div>
          <p className="font-medium text-stone-800 text-xs">{gelin.isim}</p>
          <div className="flex gap-1 mt-0.5">
            <span className={`text-[10px] px-1 py-0.5 rounded ${gelin.makyaj ? 'bg-rose-50 text-rose-500' : 'bg-stone-200 text-stone-500'}`}>
              {gelin.makyaj 
                ? (gelin.turban && gelin.turban !== gelin.makyaj 
                    ? `${gelin.makyaj} & ${gelin.turban}` 
                    : gelin.makyaj)
                : 'Atanmamış'}
            </span>
          </div>
        </div>
      </div>
      <div className="text-right">
        {gelin.ucret === -1 ? (
          <p className="text-stone-400 text-[10px]">İşlenmemiş</p>
        ) : (
          <p className="text-red-500 font-medium text-xs">{gelin.kalan.toLocaleString('tr-TR')} ₺</p>
        )}
      </div>
    </div>
  );
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
    <div className="bg-white rounded-lg border border-stone-100 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-stone-800 flex items-center gap-1.5 text-xs">
            <span>💄</span> {title}
            <span className="bg-rose-50 text-rose-500 text-[10px] px-1.5 py-0.5 rounded-full">
              {gelinler.length}
            </span>
          </h2>
          {showToggle && onToggleChange && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={() => onToggleChange('bugun')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                  toggleValue === 'bugun' 
                    ? 'bg-rose-500 text-white' 
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Bugün
              </button>
              <button
                onClick={() => onToggleChange('yarin')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                  toggleValue === 'yarin' 
                    ? 'bg-rose-500 text-white' 
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Yarın
              </button>
            </div>
          )}
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="text-stone-400 hover:text-stone-600 text-[10px]">🔄</button>
        )}
      </div>
      <div className="p-2.5">
        {loading ? (
          <div className="text-center py-6 text-stone-500 text-xs">Yükleniyor...</div>
        ) : gelinler.length === 0 ? (
          <div className="text-center py-6 text-stone-500">
            <span className="text-2xl">🎉</span>
            <p className="mt-1 text-xs">İş yok!</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
            {gelinler.map((gelin) => (
              <GelinRow key={gelin.id} gelin={gelin} onClick={() => onGelinClick(gelin)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
