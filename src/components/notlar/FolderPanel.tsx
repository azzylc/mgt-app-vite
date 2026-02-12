import type { Not, NotKlasor, KlasorFilter } from "./notlarTypes";
import { getRenk } from "./notlarTypes";

interface FolderPanelProps {
  klasorler: NotKlasor[];
  notlar: Not[];
  seciliKlasor: KlasorFilter;
  copSayisi: number;
  onSelectKlasor: (id: KlasorFilter) => void;
  onOpenKlasorModal: (klasor?: NotKlasor) => void;
  onMobilPanelChange: () => void; // liste'ye geç
}

export default function FolderPanel({
  klasorler, notlar, seciliKlasor, copSayisi,
  onSelectKlasor, onOpenKlasorModal, onMobilPanelChange,
}: FolderPanelProps) {
  const aktifNotlar = notlar.filter(n => !n.silindi);
  const kisiselKlasorler = klasorler.filter(k => !k.paylasimli);
  const paylasimliKlasorler = klasorler.filter(k => k.paylasimli);

  const handleSelect = (id: KlasorFilter) => {
    onSelectKlasor(id);
    onMobilPanelChange();
  };

  const btnClass = (id: string) =>
    `w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition ${
      seciliKlasor === id
        ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium"
        : "text-[#8A8A8A] hover:bg-white"
    }`;

  return (
    <div className="flex flex-col h-full">
      {/* Sabit filtreler */}
      <div className="p-3 space-y-1">
        {[
          { id: "tumu" as const, label: "Tüm Notlar", icon: "📋", count: aktifNotlar.length },
          { id: "kisisel" as const, label: "Kişisel", icon: "🔒", count: aktifNotlar.filter(n => !n.paylasimli).length },
          { id: "paylasimli" as const, label: "Paylaşımlı", icon: "👥", count: aktifNotlar.filter(n => n.paylasimli).length },
        ].map(f => (
          <button key={f.id} onClick={() => handleSelect(f.id)} className={btnClass(f.id)}>
            <span className="flex items-center gap-2">
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </span>
            <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded-full">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Kişisel Klasörler */}
      <div className="px-3 mt-3">
        <span className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider">Kişisel Klasörler</span>
        {kisiselKlasorler.map(k => {
          const renk = getRenk(k.renk);
          const count = aktifNotlar.filter(n => n.klasorId === k.id).length;
          return (
            <button
              key={k.id}
              onClick={() => handleSelect(k.id)}
              onContextMenu={(e) => { e.preventDefault(); onOpenKlasorModal(k); }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center justify-between transition mt-0.5 ${
                seciliKlasor === k.id ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium" : "text-[#8A8A8A] hover:bg-white"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${renk.bg}`} />
                <span className="truncate">{k.ad}</span>
              </span>
              <span className="text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Paylaşımlı Klasörler */}
      <div className="px-3 mt-3">
        <span className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider">Paylaşımlı Klasörler</span>
        {paylasimliKlasorler.map(k => {
          const renk = getRenk(k.renk);
          const count = aktifNotlar.filter(n => n.klasorId === k.id).length;
          return (
            <button
              key={k.id}
              onClick={() => handleSelect(k.id)}
              onContextMenu={(e) => { e.preventDefault(); onOpenKlasorModal(k); }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center justify-between transition mt-0.5 ${
                seciliKlasor === k.id ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium" : "text-[#8A8A8A] hover:bg-white"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${renk.bg}`} />
                <span className="truncate">{k.ad}</span>
                <span className="text-[9px]">👥</span>
              </span>
              <span className="text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Yeni Klasör */}
      <div className="px-3 mt-3">
        <button
          onClick={() => onOpenKlasorModal()}
          className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#8A8A8A] hover:bg-white hover:text-[#2F2F2F] transition flex items-center gap-2"
        >
          <span>+</span> Yeni Klasör
        </button>
      </div>

      {/* Çöp Kutusu — en altta */}
      <div className="mt-auto px-3 pb-3 pt-2 border-t">
        <button onClick={() => handleSelect("cop")} className={btnClass("cop")}>
          <span className="flex items-center gap-2">
            <span>🗑️</span>
            <span>Çöp Kutusu</span>
          </span>
          {copSayisi > 0 && (
            <span className="text-[10px] bg-red-50 text-[#D96C6C] px-1.5 py-0.5 rounded-full">{copSayisi}</span>
          )}
        </button>
      </div>
    </div>
  );
}
