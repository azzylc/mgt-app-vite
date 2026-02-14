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
    <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#E5E5E5] flex items-center justify-between bg-gradient-to-r from-rose-50/40 to-transparent flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">💄</span>
          <span className="text-xs font-semibold text-[#2F2F2F]">{title}</span>
          <span className="text-[10px] text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-full font-medium">{gelinler.length}</span>
        </div>
        {showToggle && onToggleChange && (
          <div className="flex bg-[#F7F7F7] rounded-lg p-0.5">
            <button
              onClick={() => onToggleChange('bugun')}
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition ${
                toggleValue === 'bugun' ? 'bg-white text-[#2F2F2F] shadow-sm' : 'text-[#8A8A8A] hover:text-[#2F2F2F]'
              }`}
            >
              Bugün
            </button>
            <button
              onClick={() => onToggleChange('yarin')}
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition ${
                toggleValue === 'yarin' ? 'bg-white text-[#2F2F2F] shadow-sm' : 'text-[#8A8A8A] hover:text-[#2F2F2F]'
              }`}
            >
              Yarın
            </button>
          </div>
        )}
      </div>
      <div className="p-2.5 flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <p className="text-center py-4 text-[#8A8A8A] text-xs">Yükleniyor...</p>
        ) : gelinler.length === 0 ? (
          <div className="text-center py-5">
            <span className="text-2xl">🎉</span>
            <p className="text-[#8A8A8A] text-xs mt-1">İş yok!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {gelinler.map((gelin) => (
              <div 
                key={gelin.id}
                onClick={() => onGelinClick(gelin)}
                className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-rose-50/40 transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] text-[#8A8A8A] font-mono w-[6.5rem] bg-[#F7F7F7] group-hover:bg-rose-50 px-1.5 py-0.5 rounded text-center transition whitespace-nowrap">{gelin.saat}{gelin.bitisSaati ? ` - ${gelin.bitisSaati}` : ''}</span>
                  <div>
                    <p className="text-xs text-[#2F2F2F] font-medium">{gelin.isim}</p>
                    <p className="text-[10px] text-[#8A8A8A]">
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
                    <span className="text-[10px] text-[#8A8A8A]">—</span>
                  ) : gelin.kalan > 0 ? (
                    <span className="text-xs text-[#D96C6C] font-semibold">{gelin.kalan.toLocaleString('tr-TR')} ₺</span>
                  ) : (
                    <span className="text-[10px] text-[#8FAF9A]">✓</span>
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
