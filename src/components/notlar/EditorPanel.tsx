import { useEffect, useRef } from "react";
import type { Not, NotKlasor } from "./notlarTypes";
import { formatTarih, createChecklistHtml } from "./notlarTypes";

interface EditorPanelProps {
  seciliNot: Not | null;
  klasorler: NotKlasor[];
  sonKayit: Date | null;
  kaydediliyor: boolean;
  editorRef: React.RefObject<HTMLDivElement>;
  baslikRef: React.RefObject<HTMLInputElement>;
  onBaslikChange: (baslik: string) => void;
  onIcerikChange: (icerik: string) => void;
  onSabitle: (not: Not) => void;
  onKlasorDegistir: (not: Not, klasorId: string) => void;
  onSil: (not: Not) => void;
}

export default function EditorPanel({
  seciliNot, klasorler, sonKayit, kaydediliyor,
  editorRef, baslikRef,
  onBaslikChange, onIcerikChange, onSabitle, onKlasorDegistir, onSil,
}: EditorPanelProps) {

  // ─── Not seçildiğinde editöre yükle ────────────────────
  useEffect(() => {
    if (seciliNot && editorRef.current) {
      editorRef.current.innerHTML = seciliNot.icerik || "";
      setupChecklistListeners(editorRef.current);
    }
  }, [seciliNot?.id]);

  // ─── Editör komutları ──────────────────────────────────
  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  // ─── Checklist ekle ────────────────────────────────────
  const insertChecklist = () => {
    const html = createChecklistHtml();
    document.execCommand("insertHTML", false, html + "<br/>");
    editorRef.current?.focus();
    // Yeni eklenen checklist'e listener
    setTimeout(() => {
      if (editorRef.current) setupChecklistListeners(editorRef.current);
    }, 50);
  };

  // ─── Checklist checkbox handler ────────────────────────
  const setupChecklistListeners = (container: HTMLElement) => {
    const checkboxes = container.querySelectorAll('.checklist-item input[type="checkbox"]');
    checkboxes.forEach(cb => {
      (cb as HTMLElement).onclick = (e) => {
        e.stopPropagation();
        const span = (cb as HTMLElement).nextElementSibling as HTMLElement;
        if (span) {
          if ((cb as HTMLInputElement).checked) {
            span.style.textDecoration = "line-through";
            span.style.opacity = "0.5";
          } else {
            span.style.textDecoration = "none";
            span.style.opacity = "1";
          }
        }
        // İçerik değişti, kaydet
        const icerik = container.innerHTML || "";
        onIcerikChange(icerik);
      };
    });
  };

  // ─── Kayıt durumu metni ───────────────────────────────
  const kayitDurumu = () => {
    if (kaydediliyor) return "Kaydediliyor...";
    if (sonKayit) {
      const saat = sonKayit.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      return `Son kayıt: ${saat}`;
    }
    return "";
  };

  // ─── Boş durum ────────────────────────────────────────
  if (!seciliNot) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#C5C5C5]">
        <div className="text-center">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-sm">Bir not seçin veya yeni not oluşturun</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => execCmd("bold")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm font-bold" title="Kalın (Ctrl+B)">B</button>
          <button onClick={() => execCmd("italic")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm italic" title="İtalik (Ctrl+I)">I</button>
          <button onClick={() => execCmd("underline")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm underline" title="Altı Çizili (Ctrl+U)">U</button>
          <button onClick={() => execCmd("strikeThrough")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm line-through" title="Üstü Çizili">S</button>
          <div className="w-px h-5 bg-[#E5E5E5] mx-1" />
          <button onClick={() => execCmd("formatBlock", "h1")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs font-bold" title="Başlık 1">H1</button>
          <button onClick={() => execCmd("formatBlock", "h2")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs font-bold" title="Başlık 2">H2</button>
          <button onClick={() => execCmd("formatBlock", "h3")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs font-bold" title="Başlık 3">H3</button>
          <div className="w-px h-5 bg-[#E5E5E5] mx-1" />
          <button onClick={() => execCmd("insertUnorderedList")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm" title="Madde Listesi">•</button>
          <button onClick={() => execCmd("insertOrderedList")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs" title="Numaralı Liste">1.</button>
          <button onClick={insertChecklist} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm" title="Checklist">☑</button>
          <div className="w-px h-5 bg-[#E5E5E5] mx-1" />
          <button onClick={() => execCmd("formatBlock", "blockquote")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm" title="Alıntı">❝</button>
          <button onClick={() => execCmd("removeFormat")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs text-[#8A8A8A]" title="Formatı Temizle">✕</button>
        </div>

        {/* Sağ taraf: aksiyonlar */}
        <div className="flex items-center gap-1">
          {/* Kayıt durumu */}
          <span className="text-[10px] text-[#C5C5C5] mr-2 hidden md:inline">
            {kayitDurumu()}
          </span>

          <button
            onClick={() => onSabitle(seciliNot)}
            className={`w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm ${seciliNot.sabitlendi ? "text-[#8FAF9A]" : "text-[#C5C5C5]"}`}
            title={seciliNot.sabitlendi ? "Sabitlemeyi Kaldır" : "Sabitle"}
          >
            📌
          </button>

          <select
            value={seciliNot.klasorId || ""}
            onChange={(e) => onKlasorDegistir(seciliNot, e.target.value)}
            className="text-xs border border-[#E5E5E5] rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#8FAF9A] max-w-[120px]"
            title="Klasör"
          >
            <option value="">Klasörsüz</option>
            {klasorler.map(k => (
              <option key={k.id} value={k.id}>{k.paylasimli ? "👥 " : ""}{k.ad}</option>
            ))}
          </select>

          <button
            onClick={() => onSil(seciliNot)}
            className="w-8 h-8 rounded hover:bg-red-50 text-sm text-[#D96C6C]"
            title="Çöp Kutusuna Taşı"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Başlık */}
      <div className="px-6 pt-4">
        <input
          ref={baslikRef}
          type="text"
          value={seciliNot.baslik}
          onChange={(e) => onBaslikChange(e.target.value)}
          placeholder="Başlık"
          className="w-full text-2xl font-bold text-[#2F2F2F] placeholder:text-[#D5D5D5] focus:outline-none"
        />
        <div className="flex items-center gap-3 mt-1 text-[10px] text-[#C5C5C5]">
          <span>{formatTarih(seciliNot.sonDuzenleme)}</span>
          {seciliNot.paylasimli && <span>👥 Paylaşımlı</span>}
          <span>{seciliNot.olusturanAd}</span>
          <span className="md:hidden">{kayitDurumu()}</span>
        </div>
      </div>

      {/* İçerik editörü */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          const icerik = editorRef.current?.innerHTML || "";
          onIcerikChange(icerik);
        }}
        onKeyDown={(e) => {
          // Ctrl+B, I, U kısayolları zaten browser'da çalışır
          // Checklist'te Enter = yeni checklist item
          if (e.key === "Enter") {
            const sel = window.getSelection();
            const node = sel?.anchorNode?.parentElement;
            if (node?.closest(".checklist-item")) {
              e.preventDefault();
              const html = createChecklistHtml();
              document.execCommand("insertHTML", false, "<br/>" + html);
              setTimeout(() => {
                if (editorRef.current) setupChecklistListeners(editorRef.current);
              }, 50);
            }
          }
        }}
        className="flex-1 px-6 py-4 overflow-y-auto text-sm text-[#2F2F2F] leading-relaxed focus:outline-none prose prose-sm max-w-none
          [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-4
          [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3
          [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
          [&_li]:my-0.5
          [&_blockquote]:border-l-3 [&_blockquote]:border-[#8FAF9A] [&_blockquote]:pl-3 [&_blockquote]:text-[#8A8A8A] [&_blockquote]:italic [&_blockquote]:my-2
          [&_.checklist-item]:flex [&_.checklist-item]:items-start [&_.checklist-item]:gap-1.5 [&_.checklist-item]:py-0.5"
        data-placeholder="Yazmaya başlayın..."
        style={{ minHeight: "200px" }}
      />
    </>
  );
}
