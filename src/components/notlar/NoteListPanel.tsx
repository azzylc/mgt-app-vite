import { useState, useCallback } from "react";
import type { Not, NotKlasor, KlasorFilter } from "./notlarTypes";
import { htmlToPreview, formatTarih, getRenk } from "./notlarTypes";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";

interface NoteListPanelProps {
  liste: Not[];
  klasorler: NotKlasor[];
  seciliNot: Not | null;
  aramaMetni: string;
  seciliKlasor: KlasorFilter;
  copSayisi: number;
  onSelectNot: (not: Not) => void;
  onAramaChange: (val: string) => void;
  onYeniNot: () => void;
  onNotSil: (not: Not) => void;
  onSabitle: (not: Not) => void;
  onNotGeriAl: (not: Not) => void;
  onCopuBosalt: () => void;
  onMobilEditor: () => void;
}

interface MenuState { x: number; y: number; items: ContextMenuItem[]; }

export default function NoteListPanel({
  liste, klasorler, seciliNot, aramaMetni, seciliKlasor, copSayisi,
  onSelectNot, onAramaChange, onYeniNot, onNotSil, onSabitle, onNotGeriAl, onCopuBosalt, onMobilEditor,
}: NoteListPanelProps) {
  const isCop = seciliKlasor === "cop";
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  // ─── Not sağ tuş ────────────────────────────────────────
  const openNotMenu = (e: React.MouseEvent, not: Not) => {
    e.preventDefault();
    e.stopPropagation();

    if (not.silindi) {
      setMenu({
        x: e.clientX, y: e.clientY,
        items: [
          { icon: "↩", label: "Geri Al", onClick: () => onNotGeriAl(not) },
        ],
      });
      return;
    }

    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: "📌", label: not.sabitlendi ? "Sabitlemeyi Kaldır" : "Sabitle", onClick: () => onSabitle(not) },
        { icon: "📝", label: "Yeni Not", onClick: () => onYeniNot() },
        { divider: true, label: "", onClick: () => {} },
        { icon: "🗑️", label: "Çöpe Taşı", onClick: () => onNotSil(not), danger: true },
      ],
    });
  };

  // ─── Boş alan sağ tuş ──────────────────────────────────
  const openEmptyMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, [data-note-card]")) return;
    e.preventDefault();
    if (!isCop) {
      setMenu({
        x: e.clientX, y: e.clientY,
        items: [
          { icon: "📝", label: "Yeni Not", onClick: () => onYeniNot() },
        ],
      });
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden" onContextMenu={openEmptyMenu}>
      {/* Arama */}
      <div className="p-3 border-b">
        <input
          type="text"
          placeholder="Not ara..."
          value={aramaMetni}
          onChange={(e) => onAramaChange(e.target.value)}
          className="w-full px-3 py-2 bg-[#F7F7F7] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#8FAF9A] placeholder:text-[#C5C5C5]"
        />
      </div>

      {/* Çöp kutusu header */}
      {isCop && copSayisi > 0 && (
        <div className="px-4 py-2 bg-red-50 border-b flex items-center justify-between">
          <span className="text-xs text-[#D96C6C]">🗑️ {copSayisi} silinen not</span>
          <button
            onClick={onCopuBosalt}
            className="text-xs text-[#D96C6C] hover:text-red-700 font-medium"
          >
            Tümünü Sil
          </button>
        </div>
      )}

      {/* Not kartları */}
      <div className="flex-1 overflow-y-auto">
        {liste.length === 0 ? (
          <div className="p-6 text-center text-[#8A8A8A] text-sm">
            <p className="text-2xl mb-2">{isCop ? "🗑️" : "📓"}</p>
            <p>{isCop ? "Çöp kutusu boş" : "Henüz not yok"}</p>
            {!isCop && (
              <button onClick={onYeniNot} className="mt-2 text-[#8FAF9A] text-sm hover:underline">
                İlk notunuzu oluşturun →
              </button>
            )}
          </div>
        ) : (
          liste.map(not => {
            const isSecili = seciliNot?.id === not.id;
            const klasor = klasorler.find(k => k.id === not.klasorId);
            const renk = klasor ? getRenk(klasor.renk) : null;

            return (
              <div
                key={not.id}
                data-note-card
                className={`w-full text-left px-4 py-3 border-b border-[#F0F0F0] transition ${
                  isSecili ? "bg-[#8FAF9A]/10" : "hover:bg-[#FAFAFA]"
                } ${not.silindi ? "opacity-60" : ""}`}
                onContextMenu={(e) => openNotMenu(e, not)}
              >
                <button
                  onClick={() => {
                    if (!not.silindi) {
                      onSelectNot(not);
                      onMobilEditor();
                    }
                  }}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-1.5">
                    {not.sabitlendi && !not.silindi && <span className="text-[10px]">📌</span>}
                    {not.paylasimli && <span className="text-[10px]">👥</span>}
                    <h3 className="text-sm font-medium text-[#2F2F2F] truncate">
                      {not.baslik || "Başlıksız Not"}
                    </h3>
                  </div>
                  <p className="text-xs text-[#8A8A8A] truncate mt-0.5">
                    {htmlToPreview(not.icerik) || "Boş not"}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[#C5C5C5]">
                      {formatTarih(not.silindi ? not.silinmeTarihi : not.sonDuzenleme)}
                    </span>
                    {renk && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${renk.light} ${renk.text}`}>
                        {klasor?.ad}
                      </span>
                    )}
                  </div>
                </button>

                {/* Çöp kutusu aksiyonları */}
                {not.silindi && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => onNotGeriAl(not)}
                      className="text-[10px] text-[#8FAF9A] hover:text-[#6B9A7A] font-medium"
                    >
                      ↩ Geri Al
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sağ tuş menüsü */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}
