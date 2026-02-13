import { useState } from "react";
import { useNotlar } from "../hooks/useNotlar";
import FolderPanel from "../components/notlar/FolderPanel";
import NoteListPanel from "../components/notlar/NoteListPanel";
import EditorPanel from "../components/notlar/EditorPanel";
import KlasorModal from "../components/notlar/KlasorModal";
import type { MobilPanelType } from "../components/notlar/notlarTypes";

export default function NotlarPage() {
  const n = useNotlar();
  const [mobilPanel, setMobilPanel] = useState<MobilPanelType>("klasor");

  const liste = n.filtrelenmisNotlar();
  const isCop = n.seciliKlasor === "cop";

  const seciliKlasorBilgi =
    n.seciliKlasor !== "tumu" && n.seciliKlasor !== "kisisel" &&
    n.seciliKlasor !== "paylasimli" && n.seciliKlasor !== "cop"
      ? n.klasorler.find(k => k.id === n.seciliKlasor)
      : null;

  const firmaLabel = n.seciliFirma === "kisisel"
    ? "Kişisel / Herkes"
    : n.firmalar.find(f => f.id === n.seciliFirma)?.firmaAdi || "";

  const headerLabel =
    n.seciliKlasor === "tumu" ? "Tüm Notlar" :
    n.seciliKlasor === "kisisel" ? "Kişisel Notlar" :
    n.seciliKlasor === "paylasimli" ? "Paylaşımlı Notlar" :
    n.seciliKlasor === "cop" ? "🗑️ Çöp Kutusu" :
    seciliKlasorBilgi?.ad || "";

  const handleBaslikChange = (yeniBaslik: string) => {
    if (!n.seciliNot) return;
    const now = new Date();
    const guncelNot = { ...n.seciliNot, baslik: yeniBaslik, sonDuzenleme: now };
    n.setSeciliNot(guncelNot);
    n.setNotlar(prev => prev.map(x => x.id === n.seciliNot!.id ? { ...x, baslik: yeniBaslik, sonDuzenleme: now } : x));
    n.kaydetNot(n.seciliNot, yeniBaslik);
  };

  const handleIcerikChange = (icerik: string) => {
    if (!n.seciliNot) return;
    const now = new Date();
    n.setNotlar(prev => prev.map(x => x.id === n.seciliNot!.id ? { ...x, icerik, sonDuzenleme: now } : x));
    n.kaydetNot(n.seciliNot, undefined, icerik);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="bg-white border-b px-4 md:px-6 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {mobilPanel !== "klasor" && (
            <button
              onClick={() => setMobilPanel(mobilPanel === "editor" ? "liste" : "klasor")}
              className="md:hidden text-[#8A8A8A] hover:text-[#2F2F2F]"
            >
              ←
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-[#2F2F2F]">📝 Notlar</h1>
            <p className="text-xs text-[#8A8A8A]">
              {firmaLabel && n.firmalar.length > 0 ? `${firmaLabel} · ` : ""}{headerLabel} · {liste.length} not
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mobilPanel !== "klasor" && (
            <button
              onClick={() => setMobilPanel("klasor")}
              className="md:hidden w-9 h-9 rounded-lg bg-[#F7F7F7] hover:bg-[#E5E5E5] flex items-center justify-center text-sm"
            >
              📁
            </button>
          )}
          {!isCop && (
            <button
              onClick={async () => {
                const not = await n.handleYeniNot();
                if (not) setMobilPanel("editor");
              }}
              className="px-3 py-2 bg-[#8FAF9A] hover:bg-[#7A9E86] text-white rounded-lg text-sm font-medium transition flex items-center gap-1.5"
            >
              <span className="text-base">+</span> Yeni Not
            </button>
          )}
        </div>
      </header>

      {/* ── Firma Tab'ları ──────────────────────────────── */}
      {n.firmalar.length > 0 && (
        <div className="bg-white border-b px-4 md:px-6 py-2 flex items-center gap-2 overflow-x-auto sticky top-[57px] z-20">
          <button
            onClick={() => n.setSeciliFirma("kisisel")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              n.seciliFirma === "kisisel"
                ? "bg-[#8FAF9A] text-white"
                : "bg-[#F7F7F7] text-[#8A8A8A] hover:bg-[#E5E5E5]"
            }`}
          >
            🔑 Kişisel / Herkes
          </button>
          {n.firmalar.map(f => (
            <button
              key={f.id}
              onClick={() => n.setSeciliFirma(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                n.seciliFirma === f.id
                  ? "bg-[#8FAF9A] text-white"
                  : "bg-[#F7F7F7] text-[#8A8A8A] hover:bg-[#E5E5E5]"
              }`}
            >
              🏢 {f.firmaAdi}
            </button>
          ))}
        </div>
      )}

      {/* ── 3 Panel Layout ──────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* SOL: Klasörler */}
        <aside className={`${mobilPanel === "klasor" ? "flex" : "hidden"} md:flex flex-col w-full md:w-56 border-r bg-[#FAFAFA] overflow-y-auto flex-shrink-0`}>
          <FolderPanel
            klasorler={n.klasorler}
            notlar={n.notlar}
            seciliKlasor={n.seciliKlasor}
            copSayisi={n.copSayisi}
            seciliFirma={n.seciliFirma}
            onSelectKlasor={n.setSeciliKlasor}
            onOpenKlasorModal={n.openKlasorModal}
            onKlasorSil={n.handleKlasorSil}
            onYeniNot={async () => {
              const not = await n.handleYeniNot();
              if (not) setMobilPanel("editor");
              return not;
            }}
            onMobilPanelChange={() => setMobilPanel("liste")}
          />
        </aside>

        {/* ORTA: Not Listesi */}
        <div className={`${mobilPanel === "liste" ? "flex" : "hidden"} md:flex flex-col w-full md:w-72 border-r overflow-y-auto flex-shrink-0`}>
          <NoteListPanel
            liste={liste}
            klasorler={n.klasorler}
            seciliNot={n.seciliNot}
            aramaMetni={n.aramaMetni}
            seciliKlasor={n.seciliKlasor}
            copSayisi={n.copSayisi}
            onSelectNot={n.setSeciliNot}
            onAramaChange={n.setAramaMetni}
            onYeniNot={n.handleYeniNot}
            onNotSil={n.handleNotSil}
            onSabitle={n.handleSabitle}
            onNotGeriAl={n.handleNotGeriAl}
            onCopuBosalt={n.handleCopuBosalt}
            onMobilEditor={() => setMobilPanel("editor")}
          />
        </div>

        {/* SAĞ: Editör */}
        <div className={`${mobilPanel === "editor" ? "flex" : "hidden"} md:flex flex-col flex-1 overflow-hidden`}>
          <EditorPanel
            seciliNot={n.seciliNot}
            klasorler={n.klasorler}
            sonKayit={n.sonKayit}
            kaydediliyor={n.kaydediliyor}
            editorRef={n.editorRef as React.RefObject<HTMLDivElement>}
            baslikRef={n.baslikRef as React.RefObject<HTMLInputElement>}
            onBaslikChange={handleBaslikChange}
            onIcerikChange={handleIcerikChange}
            onSabitle={n.handleSabitle}
            onKlasorDegistir={n.handleKlasorDegistir}
            onSil={n.handleNotSil}
          />
        </div>
      </div>

      {/* Klasör Modal */}
      <KlasorModal
        show={n.showKlasorModal}
        editing={n.editingKlasor}
        form={n.klasorForm}
        klasorler={n.klasorler}
        seciliFirma={n.seciliFirma}
        onFormChange={n.setKlasorForm}
        onSave={n.handleKlasorKaydet}
        onDelete={n.handleKlasorSil}
        onClose={n.closeKlasorModal}
      />

      {/* Editör placeholder + checklist CSS */}
      <style>{`
        [contenteditable=true]:empty:before {
          content: attr(data-placeholder);
          color: #D5D5D5;
          pointer-events: none;
          display: block;
        }
        .checklist-item {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 2px 0;
        }
        .checklist-item input[type="checkbox"] {
          margin-top: 3px;
          cursor: pointer;
          accent-color: #8FAF9A;
        }
        .checklist-item span[contenteditable="true"] {
          flex: 1;
          outline: none;
        }
      `}</style>
    </div>
  );
}
