import { useState } from "react";
import type { Not, NotKlasor, KlasorFilter } from "./notlarTypes";
import { getRenk } from "./notlarTypes";

interface FolderPanelProps {
  klasorler: NotKlasor[];
  notlar: Not[];
  seciliKlasor: KlasorFilter;
  copSayisi: number;
  seciliFirma: string; // "kisisel" | firmaId
  onSelectKlasor: (id: KlasorFilter) => void;
  onOpenKlasorModal: (klasor?: NotKlasor, ustKlasorId?: string, paylasimli?: boolean) => void;
  onMobilPanelChange: () => void;
}

// ─── Alt klasör ID'lerini recursive topla ────────────────
function getAltKlasorIds(klasorId: string, klasorler: NotKlasor[]): string[] {
  const direkt = klasorler.filter(k => k.ustKlasorId === klasorId);
  let ids: string[] = [];
  for (const k of direkt) {
    ids.push(k.id);
    ids = ids.concat(getAltKlasorIds(k.id, klasorler));
  }
  return ids;
}

function notSayisi(klasorId: string, notlar: Not[], klasorler: NotKlasor[]): number {
  const altIds = [klasorId, ...getAltKlasorIds(klasorId, klasorler)];
  return notlar.filter(n => !n.silindi && altIds.includes(n.klasorId)).length;
}

export default function FolderPanel({
  klasorler, notlar, seciliKlasor, copSayisi, seciliFirma,
  onSelectKlasor, onOpenKlasorModal, onMobilPanelChange,
}: FolderPanelProps) {
  const aktifNotlar = notlar.filter(n => !n.silindi);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["kisisel", "paylasimli"]));

  const isFirmaMode = seciliFirma !== "kisisel";

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelect = (id: KlasorFilter) => {
    onSelectKlasor(id);
    onMobilPanelChange();
  };

  // ─── Kök klasörler ────────────────────────────────────
  const kokKisisel = klasorler.filter(k => !k.paylasimli && (!k.ustKlasorId || k.ustKlasorId === ""));
  const kokPaylasimli = klasorler.filter(k => k.paylasimli && (!k.ustKlasorId || k.ustKlasorId === ""));
  const kokTumu = klasorler.filter(k => !k.ustKlasorId || k.ustKlasorId === "");

  // ─── Recursive klasör item ────────────────────────────
  const KlasorItem = ({ klasor, depth }: { klasor: NotKlasor; depth: number }) => {
    const renk = getRenk(klasor.renk);
    const count = notSayisi(klasor.id, notlar, klasorler);
    const children = klasorler.filter(k => k.ustKlasorId === klasor.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(klasor.id);
    const isSelected = seciliKlasor === klasor.id;

    return (
      <>
        <div
          className={`w-full text-left rounded-lg text-sm flex items-center justify-between transition cursor-pointer group ${
            isSelected ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium" : "text-[#8A8A8A] hover:bg-white"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "12px", paddingTop: "5px", paddingBottom: "5px" }}
          onClick={() => handleSelect(klasor.id)}
          onContextMenu={(e) => { e.preventDefault(); onOpenKlasorModal(klasor); }}
        >
          <span className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(klasor.id, e)}
                className="w-4 h-4 flex items-center justify-center text-[10px] text-[#8A8A8A] hover:text-[#2F2F2F] flex-shrink-0"
              >
                {isExpanded ? "▼" : "▶"}
              </button>
            ) : (
              <span className="w-4 flex-shrink-0" />
            )}
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${renk.bg}`} />
            <span className="truncate">{klasor.ad}</span>
            {klasor.paylasimli && <span className="text-[9px] flex-shrink-0">👥</span>}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenKlasorModal(undefined, klasor.id, klasor.paylasimli); }}
              className="w-5 h-5 rounded text-[10px] text-[#C5C5C5] hover:text-[#8FAF9A] hover:bg-[#EAF2ED] opacity-0 group-hover:opacity-100 transition flex items-center justify-center flex-shrink-0"
              title="Alt klasör ekle"
            >
              +
            </button>
            <span className="text-[10px] flex-shrink-0 min-w-[16px] text-right">{count}</span>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {children.map(child => (
              <KlasorItem key={child.id} klasor={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </>
    );
  };

  // ─── Sabit buton stili ────────────────────────────────
  const btnClass = (id: string) =>
    `w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition ${
      seciliKlasor === id
        ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium"
        : "text-[#8A8A8A] hover:bg-white"
    }`;

  return (
    <div className="flex flex-col h-full">
      {/* Tüm Notlar */}
      <div className="p-3 space-y-1">
        <button onClick={() => handleSelect("tumu")} className={btnClass("tumu")}>
          <span className="flex items-center gap-2">
            <span>📋</span>
            <span>Tüm Notlar</span>
          </span>
          <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded-full">{aktifNotlar.length}</span>
        </button>
      </div>

      {/* ═══ KİŞİSEL MOD: Kişisel + Paylaşımlı parent node'lar ═══ */}
      {!isFirmaMode && (
        <div className="px-3 space-y-0.5">
          {/* 🔒 Kişisel — expandable parent */}
          <div>
            <div
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition cursor-pointer group ${
                seciliKlasor === "kisisel" ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium" : "text-[#8A8A8A] hover:bg-white"
              }`}
              onClick={() => handleSelect("kisisel")}
              onContextMenu={(e) => { e.preventDefault(); onOpenKlasorModal(undefined, undefined, false); }}
            >
              <span className="flex items-center gap-1.5">
                {kokKisisel.length > 0 ? (
                  <button
                    onClick={(e) => toggleExpand("kisisel", e)}
                    className="w-4 h-4 flex items-center justify-center text-[10px] text-[#8A8A8A] hover:text-[#2F2F2F]"
                  >
                    {expanded.has("kisisel") ? "▼" : "▶"}
                  </button>
                ) : (
                  <span className="w-4" />
                )}
                <span>🔒</span>
                <span>Kişisel</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenKlasorModal(undefined, undefined, false); }}
                  className="w-5 h-5 rounded text-[10px] text-[#C5C5C5] hover:text-[#8FAF9A] hover:bg-[#EAF2ED] opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                  title="Kişisel klasör ekle"
                >
                  +
                </button>
                <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded-full">
                  {aktifNotlar.filter(n => !n.paylasimli).length}
                </span>
              </div>
            </div>
            {expanded.has("kisisel") && kokKisisel.length > 0 && (
              <div>
                {kokKisisel.map(k => (
                  <KlasorItem key={k.id} klasor={k} depth={1} />
                ))}
              </div>
            )}
          </div>

          {/* 👥 Paylaşımlı — expandable parent */}
          <div>
            <div
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition cursor-pointer group ${
                seciliKlasor === "paylasimli" ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium" : "text-[#8A8A8A] hover:bg-white"
              }`}
              onClick={() => handleSelect("paylasimli")}
              onContextMenu={(e) => { e.preventDefault(); onOpenKlasorModal(undefined, undefined, true); }}
            >
              <span className="flex items-center gap-1.5">
                {kokPaylasimli.length > 0 ? (
                  <button
                    onClick={(e) => toggleExpand("paylasimli", e)}
                    className="w-4 h-4 flex items-center justify-center text-[10px] text-[#8A8A8A] hover:text-[#2F2F2F]"
                  >
                    {expanded.has("paylasimli") ? "▼" : "▶"}
                  </button>
                ) : (
                  <span className="w-4" />
                )}
                <span>👥</span>
                <span>Paylaşımlı</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenKlasorModal(undefined, undefined, true); }}
                  className="w-5 h-5 rounded text-[10px] text-[#C5C5C5] hover:text-[#8FAF9A] hover:bg-[#EAF2ED] opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                  title="Paylaşımlı klasör ekle"
                >
                  +
                </button>
                <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded-full">
                  {aktifNotlar.filter(n => n.paylasimli).length}
                </span>
              </div>
            </div>
            {expanded.has("paylasimli") && kokPaylasimli.length > 0 && (
              <div>
                {kokPaylasimli.map(k => (
                  <KlasorItem key={k.id} klasor={k} depth={1} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ FİRMA MODU: Sadece klasörler (kişisel/paylaşımlı ayrımı yok) ═══ */}
      {isFirmaMode && (
        <div className="px-3 space-y-0.5">
          {kokTumu.map(k => (
            <KlasorItem key={k.id} klasor={k} depth={0} />
          ))}
          <button
            onClick={() => onOpenKlasorModal()}
            className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#8A8A8A] hover:bg-white hover:text-[#2F2F2F] transition flex items-center gap-2 mt-1"
          >
            <span>+</span> Yeni Klasör
          </button>
        </div>
      )}

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
