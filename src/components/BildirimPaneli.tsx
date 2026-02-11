import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useBildirimler } from "../hooks/useBildirimler";
import { BILDIRIM_AYARLARI, zamanFormat } from "../lib/bildirimHelper";
import type { Bildirim } from "../lib/bildirimHelper";

interface BildirimPaneliProps {
  userEmail: string | null | undefined;
  /** Kompakt mod: sadece ikon, dropdown küçük (desktop sidebar için) */
  kompakt?: boolean;
}

export default function BildirimPaneli({ userEmail, kompakt = false }: BildirimPaneliProps) {
  const { bildirimler, okunmamisSayisi, loading, okunduYap, tumunuOkunduYap, sil } = useBildirimler(userEmail);
  const [acik, setAcik] = useState(false);
  const [silmeAnimasyon, setSilmeAnimasyon] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // ─── Dışına tıklayınca kapat ──────────────────────────────────
  useEffect(() => {
    if (!acik) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    };

    // Tiny delay to prevent same-click close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [acik]);

  // ESC ile kapat
  useEffect(() => {
    if (!acik) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAcik(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [acik]);

  // ─── Bildirime tıkla ─────────────────────────────────────────
  const bildirimTikla = useCallback(
    async (b: Bildirim) => {
      if (!b.okundu) {
        await okunduYap(b.id);
      }
      setAcik(false);
      if (b.route) {
        // Görev deep link — gorevId varsa custom event fire et
        const gorevIdMatch = b.route.match(/gorevId=([^&]+)/);
        if (gorevIdMatch) {
          navigate("/gorevler");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("openGorevDetay", { detail: gorevIdMatch[1] }));
          }, 100);
        } else {
          navigate(b.route);
        }
      }
    },
    [okunduYap, navigate]
  );

  // ─── Bildirim sil (swipe animasyonlu) ─────────────────────────
  const bildirimSilAnimasyonlu = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setSilmeAnimasyon(id);
      // Animasyon bitsin
      setTimeout(async () => {
        await sil(id);
        setSilmeAnimasyon(null);
      }, 250);
    },
    [sil]
  );

  // ─── Badge Render ─────────────────────────────────────────────
  const badge = okunmamisSayisi > 0 && (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-[#D96C6C] text-white text-[10px] font-bold rounded-full leading-none animate-badge-pop">
      {okunmamisSayisi > 99 ? "99+" : okunmamisSayisi}
    </span>
  );

  return (
    <div ref={panelRef} className="relative">
      {/* ─── Zil Butonu ──────────────────────────────────────── */}
      <button
        onClick={() => setAcik(!acik)}
        className={`relative flex items-center justify-center rounded-lg transition-all active:scale-95 ${
          kompakt
            ? "w-8 h-8 hover:bg-white/60"
            : "w-9 h-9 hover:bg-[#F7F7F7]"
        } ${acik ? (kompakt ? "bg-white/60" : "bg-[#F7F7F7]") : ""}`}
        aria-label={`Bildirimler${okunmamisSayisi > 0 ? ` (${okunmamisSayisi} okunmamış)` : ""}`}
      >
        <svg
          className={`${kompakt ? "w-[18px] h-[18px]" : "w-5 h-5"} ${
            okunmamisSayisi > 0 ? "text-[#2F2F2F]" : "text-[#8A8A8A]"
          } transition-colors`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {badge}
        {/* Pulse animasyonu - yeni bildirim varsa */}
        {okunmamisSayisi > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-[#D96C6C] rounded-full animate-ping opacity-30 pointer-events-none" />
        )}
      </button>

      {/* ─── Dropdown Panel ──────────────────────────────────── */}
      {acik && (
        <div
          className={`absolute z-[100] bg-white rounded-xl shadow-xl border border-[#E5E5E5]/80 overflow-hidden
            ${kompakt
              ? "left-0 top-full mt-2 w-80"
              : "right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-24px)]"
            }
            animate-dropdown-in
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5E5] bg-[#F7F7F7]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#2F2F2F]">Bildirimler</h3>
              {okunmamisSayisi > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#D96C6C]/20 text-[#D96C6C] rounded-full">
                  {okunmamisSayisi}
                </span>
              )}
            </div>
            {okunmamisSayisi > 0 && (
              <button
                onClick={async () => {
                  await tumunuOkunduYap();
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors hover:underline"
              >
                Tümünü okundu yap
              </button>
            )}
          </div>

          {/* Bildirim Listesi */}
          <div className="max-h-[400px] overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#8FAF9A]" />
              </div>
            ) : bildirimler.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="w-12 h-12 bg-[#F7F7F7] rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-[#8A8A8A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                </div>
                <p className="text-sm text-[#8A8A8A] font-medium">Bildirim yok</p>
                <p className="text-xs text-[#8A8A8A] mt-0.5">Her şey güncel 👍</p>
              </div>
            ) : (
              bildirimler.map((b) => {
                const ayar = BILDIRIM_AYARLARI[b.tip] || BILDIRIM_AYARLARI.sistem;
                const siliniyor = silmeAnimasyon === b.id;

                return (
                  <div
                    key={b.id}
                    onClick={() => bildirimTikla(b)}
                    className={`
                      group relative flex items-start gap-3 px-4 py-3 cursor-pointer
                      transition-all duration-200 border-b border-[#E5E5E5]/50 last:border-b-0
                      ${!b.okundu
                        ? "bg-blue-50/40 hover:bg-blue-50/70"
                        : "hover:bg-[#F7F7F7]"
                      }
                      ${siliniyor ? "opacity-0 -translate-x-full h-0 py-0 overflow-hidden" : ""}
                    `}
                  >
                    {/* Okunmamış noktası */}
                    {!b.okundu && (
                      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    )}

                    {/* Tip ikonu */}
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-base ${ayar.renk}`}>
                      {ayar.ikon}
                    </div>

                    {/* İçerik */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] leading-snug ${!b.okundu ? "font-semibold text-[#2F2F2F]" : "font-medium text-[#2F2F2F]"}`}>
                        {b.baslik}
                      </p>
                      <p className="text-xs text-[#8A8A8A] mt-0.5 line-clamp-2 leading-relaxed">
                        {b.mesaj}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-[#8A8A8A]">
                          {zamanFormat(b.tarih)}
                        </span>
                        {b.gonderenAd && (
                          <>
                            <span className="text-[10px] text-[#8A8A8A]">•</span>
                            <span className="text-[10px] text-[#8A8A8A]">{b.gonderenAd}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Sil butonu (hover'da görünür) */}
                    <button
                      onClick={(e) => bildirimSilAnimasyonlu(e, b.id)}
                      className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center
                        opacity-0 group-hover:opacity-100 transition-opacity
                        text-[#8A8A8A] hover:text-[#D96C6C] hover:bg-[#D96C6C]/10"
                      title="Sil"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer - toplam bildirim sayısı */}
          {bildirimler.length > 0 && (
            <div className="px-4 py-2 border-t border-[#E5E5E5] bg-[#F7F7F7]">
              <p className="text-[10px] text-[#8A8A8A] text-center">
                Son {bildirimler.length} bildirim gösteriliyor
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
