import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "../lib/firebase";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, where, serverTimestamp, Timestamp
} from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";

// ─── Tipler ─────────────────────────────────────────────────
interface NotKlasor {
  id: string;
  ad: string;
  renk: string;
  paylasimli: boolean;
  olusturan: string;
  olusturanAd: string;
  sira: number;
  olusturulmaTarihi: any;
}

interface Not {
  id: string;
  baslik: string;
  icerik: string; // HTML
  klasorId: string;
  sabitlendi: boolean;
  olusturan: string;
  olusturanAd: string;
  paylasimli: boolean;
  olusturulmaTarihi: any;
  sonDuzenleme: any;
}

// ─── Sabitler ───────────────────────────────────────────────
const RENKLER = [
  { id: "gray", bg: "bg-[#8A8A8A]", light: "bg-[#F7F7F7]", text: "text-[#8A8A8A]" },
  { id: "rose", bg: "bg-rose-500", light: "bg-rose-50", text: "text-rose-600" },
  { id: "orange", bg: "bg-orange-500", light: "bg-orange-50", text: "text-orange-600" },
  { id: "green", bg: "bg-[#8FAF9A]", light: "bg-[#EAF2ED]", text: "text-[#6B9A7A]" },
  { id: "blue", bg: "bg-blue-500", light: "bg-blue-50", text: "text-blue-600" },
  { id: "purple", bg: "bg-purple-500", light: "bg-purple-50", text: "text-purple-600" },
  { id: "teal", bg: "bg-teal-500", light: "bg-teal-50", text: "text-teal-600" },
  { id: "indigo", bg: "bg-indigo-500", light: "bg-indigo-50", text: "text-indigo-600" },
];

const getRenk = (id: string) => RENKLER.find(r => r.id === id) || RENKLER[0];

// ─── HTML → düz metin (önizleme için) ──────────────────────
function htmlToPreview(html: string, maxLen = 80): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = div.textContent || div.innerText || "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

// ─── Tarih formatı ──────────────────────────────────────────
function formatTarih(ts: any): string {
  if (!ts) return "";
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Az önce";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} saat önce`;
  if (diff < 172800000) return "Dün";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

// ═════════════════════════════════════════════════════════════
// ANA COMPONENT
// ═════════════════════════════════════════════════════════════
export default function NotlarPage() {
  const user = useAuth();
  const userEmail = user?.email || "";
  const userName = user?.displayName || userEmail;

  // ─── State ──────────────────────────────────────────────
  const [klasorler, setKlasorler] = useState<NotKlasor[]>([]);
  const [notlar, setNotlar] = useState<Not[]>([]);
  const [seciliKlasor, setSeciliKlasor] = useState<string>("tumu"); // "tumu" | "kisisel" | "paylasimli" | klasorId
  const [seciliNot, setSeciliNot] = useState<Not | null>(null);
  const [aramaMetni, setAramaMetni] = useState("");

  // Klasör modal
  const [showKlasorModal, setShowKlasorModal] = useState(false);
  const [editingKlasor, setEditingKlasor] = useState<NotKlasor | null>(null);
  const [klasorForm, setKlasorForm] = useState({ ad: "", renk: "gray", paylasimli: false });

  // Mobil panel kontrolü
  const [mobilPanel, setMobilPanel] = useState<"klasor" | "liste" | "editor">("liste");

  // Editör ref
  const editorRef = useRef<HTMLDivElement>(null);
  const baslikRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<any>(null);

  // ─── Firestore Listeners ────────────────────────────────
  useEffect(() => {
    if (!user) return;

    // Klasörleri dinle
    const klasorQ = query(collection(db, "notKlasorleri"), orderBy("sira", "asc"));
    const unsubKlasor = onSnapshot(klasorQ, (snap) => {
      setKlasorler(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotKlasor)));
    });

    // Notları dinle
    const notQ = query(collection(db, "notlar"), orderBy("sonDuzenleme", "desc"));
    const unsubNot = onSnapshot(notQ, (snap) => {
      const tumNotlar = snap.docs.map(d => ({ id: d.id, ...d.data() } as Not));
      // Kişisel notlar: olusturan === ben VEYA paylasimli === true
      setNotlar(tumNotlar.filter(n => n.paylasimli || n.olusturan === userEmail));
    });

    return () => { unsubKlasor(); unsubNot(); };
  }, [user, userEmail]);

  // ─── Filtrelenmiş notlar ────────────────────────────────
  const filtrelenmisNotlar = useCallback(() => {
    let sonuc = [...notlar];

    // Klasör filtresi
    if (seciliKlasor === "kisisel") {
      sonuc = sonuc.filter(n => !n.paylasimli);
    } else if (seciliKlasor === "paylasimli") {
      sonuc = sonuc.filter(n => n.paylasimli);
    } else if (seciliKlasor !== "tumu") {
      sonuc = sonuc.filter(n => n.klasorId === seciliKlasor);
    }

    // Arama
    if (aramaMetni.trim()) {
      const aranan = aramaMetni.toLowerCase();
      sonuc = sonuc.filter(n =>
        n.baslik.toLowerCase().includes(aranan) ||
        htmlToPreview(n.icerik, 500).toLowerCase().includes(aranan)
      );
    }

    // Sabitlenen üstte, sonra tarih
    sonuc.sort((a, b) => {
      if (a.sabitlendi && !b.sabitlendi) return -1;
      if (!a.sabitlendi && b.sabitlendi) return 1;
      const tA = a.sonDuzenleme instanceof Timestamp ? a.sonDuzenleme.toMillis() : 0;
      const tB = b.sonDuzenleme instanceof Timestamp ? b.sonDuzenleme.toMillis() : 0;
      return tB - tA;
    });

    return sonuc;
  }, [notlar, seciliKlasor, aramaMetni]);

  // ─── Not oluştur ────────────────────────────────────────
  const handleYeniNot = async () => {
    try {
      const paylasimli = seciliKlasor === "paylasimli" ||
        (seciliKlasor !== "tumu" && seciliKlasor !== "kisisel" &&
          klasorler.find(k => k.id === seciliKlasor)?.paylasimli === true);

      const yeniNot = {
        baslik: "",
        icerik: "",
        klasorId: (seciliKlasor !== "tumu" && seciliKlasor !== "kisisel" && seciliKlasor !== "paylasimli") ? seciliKlasor : "",
        sabitlendi: false,
        olusturan: userEmail,
        olusturanAd: userName,
        paylasimli,
        olusturulmaTarihi: serverTimestamp(),
        sonDuzenleme: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "notlar"), yeniNot);
      const not: Not = { ...yeniNot, id: ref.id, olusturulmaTarihi: new Date(), sonDuzenleme: new Date() };
      setSeciliNot(not);
      setMobilPanel("editor");

      // Başlığa focus
      setTimeout(() => baslikRef.current?.focus(), 100);
    } catch (err) {
      Sentry.captureException(err);
      alert("Not oluşturulamadı!");
    }
  };

  // ─── Not kaydet (debounced) ─────────────────────────────
  const kaydetNot = useCallback((not: Not, baslik?: string, icerik?: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const updates: any = { sonDuzenleme: serverTimestamp() };
        if (baslik !== undefined) updates.baslik = baslik;
        if (icerik !== undefined) updates.icerik = icerik;
        await updateDoc(doc(db, "notlar", not.id), updates);
      } catch (err) {
        Sentry.captureException(err);
      }
    }, 600);
  }, []);

  // ─── Not sil ────────────────────────────────────────────
  const handleNotSil = async (not: Not) => {
    if (!confirm(`"${not.baslik || 'Başlıksız not'}" silinecek. Emin misiniz?`)) return;
    try {
      await deleteDoc(doc(db, "notlar", not.id));
      if (seciliNot?.id === not.id) setSeciliNot(null);
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  // ─── Sabitleme toggle ───────────────────────────────────
  const handleSabitle = async (not: Not) => {
    try {
      await updateDoc(doc(db, "notlar", not.id), { sabitlendi: !not.sabitlendi });
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  // ─── Klasör CRUD ────────────────────────────────────────
  const handleKlasorKaydet = async () => {
    if (!klasorForm.ad.trim()) return;
    try {
      if (editingKlasor) {
        await updateDoc(doc(db, "notKlasorleri", editingKlasor.id), {
          ad: klasorForm.ad.trim(),
          renk: klasorForm.renk,
          paylasimli: klasorForm.paylasimli,
        });
      } else {
        await addDoc(collection(db, "notKlasorleri"), {
          ad: klasorForm.ad.trim(),
          renk: klasorForm.renk,
          paylasimli: klasorForm.paylasimli,
          olusturan: userEmail,
          olusturanAd: userName,
          sira: klasorler.length,
          olusturulmaTarihi: serverTimestamp(),
        });
      }
      setShowKlasorModal(false);
      setEditingKlasor(null);
      setKlasorForm({ ad: "", renk: "gray", paylasimli: false });
    } catch (err) {
      Sentry.captureException(err);
      alert("Klasör kaydedilemedi!");
    }
  };

  const handleKlasorSil = async (klasor: NotKlasor) => {
    const klasorNotlari = notlar.filter(n => n.klasorId === klasor.id);
    if (klasorNotlari.length > 0) {
      alert(`"${klasor.ad}" klasöründe ${klasorNotlari.length} not var. Önce notları taşıyın veya silin.`);
      return;
    }
    if (!confirm(`"${klasor.ad}" klasörü silinecek. Emin misiniz?`)) return;
    try {
      await deleteDoc(doc(db, "notKlasorleri", klasor.id));
      if (seciliKlasor === klasor.id) setSeciliKlasor("tumu");
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  // ─── Editör komutları ───────────────────────────────────
  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  // ─── Not seçildiğinde editöre yükle ────────────────────
  useEffect(() => {
    if (seciliNot && editorRef.current) {
      editorRef.current.innerHTML = seciliNot.icerik || "";
    }
  }, [seciliNot?.id]);

  // ─── Seçili klasör bilgisi ─────────────────────────────
  const seciliKlasorBilgi = seciliKlasor !== "tumu" && seciliKlasor !== "kisisel" && seciliKlasor !== "paylasimli"
    ? klasorler.find(k => k.id === seciliKlasor)
    : null;

  const kisiselKlasorler = klasorler.filter(k => !k.paylasimli);
  const paylasimliKlasorler = klasorler.filter(k => k.paylasimli);

  const liste = filtrelenmisNotlar();

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="bg-white border-b px-4 md:px-6 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Mobil geri butonu */}
          {mobilPanel !== "liste" && (
            <button
              onClick={() => setMobilPanel(mobilPanel === "editor" ? "liste" : "liste")}
              className="md:hidden text-[#8A8A8A] hover:text-[#2F2F2F]"
            >
              ←
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-[#2F2F2F]">📝 Notlar</h1>
            <p className="text-xs text-[#8A8A8A]">
              {seciliKlasor === "tumu" ? "Tüm Notlar" :
                seciliKlasor === "kisisel" ? "Kişisel Notlar" :
                  seciliKlasor === "paylasimli" ? "Paylaşımlı Notlar" :
                    seciliKlasorBilgi?.ad || ""}
              {" "}· {liste.length} not
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobil klasör butonu */}
          <button
            onClick={() => setMobilPanel("klasor")}
            className="md:hidden w-9 h-9 rounded-lg bg-[#F7F7F7] hover:bg-[#E5E5E5] flex items-center justify-center text-sm"
          >
            📁
          </button>
          <button
            onClick={handleYeniNot}
            className="px-3 py-2 bg-[#8FAF9A] hover:bg-[#7A9E86] text-white rounded-lg text-sm font-medium transition flex items-center gap-1.5"
          >
            <span className="text-base">+</span> Yeni Not
          </button>
        </div>
      </header>

      {/* ── 3 Panel Layout ─────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── SOL: Klasörler ────────────────────────── */}
        <aside className={`${mobilPanel === "klasor" ? "flex" : "hidden"} md:flex flex-col w-full md:w-56 border-r bg-[#FAFAFA] overflow-y-auto flex-shrink-0`}>
          <div className="p-3 space-y-1">
            {/* Sabit filtreler */}
            {[
              { id: "tumu", label: "Tüm Notlar", icon: "📋", count: notlar.length },
              { id: "kisisel", label: "Kişisel", icon: "🔒", count: notlar.filter(n => !n.paylasimli).length },
              { id: "paylasimli", label: "Paylaşımlı", icon: "👥", count: notlar.filter(n => n.paylasimli).length },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => { setSeciliKlasor(f.id); setMobilPanel("liste"); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition ${seciliKlasor === f.id
                  ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium"
                  : "text-[#8A8A8A] hover:bg-white"
                  }`}
              >
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
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider">Kişisel Klasörler</span>
            </div>
            {kisiselKlasorler.map(k => {
              const renk = getRenk(k.renk);
              const count = notlar.filter(n => n.klasorId === k.id).length;
              return (
                <button
                  key={k.id}
                  onClick={() => { setSeciliKlasor(k.id); setMobilPanel("liste"); }}
                  onContextMenu={(e) => { e.preventDefault(); setEditingKlasor(k); setKlasorForm({ ad: k.ad, renk: k.renk, paylasimli: k.paylasimli }); setShowKlasorModal(true); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center justify-between transition ${seciliKlasor === k.id
                    ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium"
                    : "text-[#8A8A8A] hover:bg-white"
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
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider">Paylaşımlı Klasörler</span>
            </div>
            {paylasimliKlasorler.map(k => {
              const renk = getRenk(k.renk);
              const count = notlar.filter(n => n.klasorId === k.id).length;
              return (
                <button
                  key={k.id}
                  onClick={() => { setSeciliKlasor(k.id); setMobilPanel("liste"); }}
                  onContextMenu={(e) => { e.preventDefault(); setEditingKlasor(k); setKlasorForm({ ad: k.ad, renk: k.renk, paylasimli: k.paylasimli }); setShowKlasorModal(true); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center justify-between transition ${seciliKlasor === k.id
                    ? "bg-[#8FAF9A]/15 text-[#2F2F2F] font-medium"
                    : "text-[#8A8A8A] hover:bg-white"
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

          {/* Klasör ekle butonu */}
          <div className="px-3 mt-3 mb-3">
            <button
              onClick={() => { setEditingKlasor(null); setKlasorForm({ ad: "", renk: "gray", paylasimli: false }); setShowKlasorModal(true); }}
              className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#8A8A8A] hover:bg-white hover:text-[#2F2F2F] transition flex items-center gap-2"
            >
              <span>+</span> Yeni Klasör
            </button>
          </div>
        </aside>

        {/* ─── ORTA: Not Listesi ─────────────────────── */}
        <div className={`${mobilPanel === "liste" ? "flex" : "hidden"} md:flex flex-col w-full md:w-72 border-r overflow-y-auto flex-shrink-0`}>
          {/* Arama */}
          <div className="p-3 border-b">
            <input
              type="text"
              placeholder="Not ara..."
              value={aramaMetni}
              onChange={(e) => setAramaMetni(e.target.value)}
              className="w-full px-3 py-2 bg-[#F7F7F7] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#8FAF9A] placeholder:text-[#C5C5C5]"
            />
          </div>

          {/* Not kartları */}
          <div className="flex-1 overflow-y-auto">
            {liste.length === 0 ? (
              <div className="p-6 text-center text-[#8A8A8A] text-sm">
                <p className="text-2xl mb-2">📝</p>
                <p>Henüz not yok</p>
                <button onClick={handleYeniNot} className="mt-2 text-[#8FAF9A] text-sm hover:underline">
                  İlk notunuzu oluşturun →
                </button>
              </div>
            ) : (
              liste.map(not => {
                const isSecili = seciliNot?.id === not.id;
                const klasor = klasorler.find(k => k.id === not.klasorId);
                const renk = klasor ? getRenk(klasor.renk) : null;

                return (
                  <button
                    key={not.id}
                    onClick={() => { setSeciliNot(not); setMobilPanel("editor"); }}
                    className={`w-full text-left px-4 py-3 border-b border-[#F0F0F0] transition ${isSecili ? "bg-[#8FAF9A]/10" : "hover:bg-[#FAFAFA]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {not.sabitlendi && <span className="text-[10px]">📌</span>}
                          {not.paylasimli && <span className="text-[10px]">👥</span>}
                          <h3 className="text-sm font-medium text-[#2F2F2F] truncate">
                            {not.baslik || "Başlıksız Not"}
                          </h3>
                        </div>
                        <p className="text-xs text-[#8A8A8A] truncate mt-0.5">
                          {htmlToPreview(not.icerik) || "Boş not"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-[#C5C5C5]">{formatTarih(not.sonDuzenleme)}</span>
                          {renk && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${renk.light} ${renk.text}`}>
                              {klasor?.ad}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ─── SAĞ: Editör ───────────────────────────── */}
        <div className={`${mobilPanel === "editor" ? "flex" : "hidden"} md:flex flex-col flex-1 overflow-hidden`}>
          {seciliNot ? (
            <>
              {/* Toolbar */}
              <div className="border-b px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-1 flex-wrap">
                  <button onClick={() => execCmd("bold")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm font-bold" title="Kalın">B</button>
                  <button onClick={() => execCmd("italic")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm italic" title="İtalik">I</button>
                  <button onClick={() => execCmd("underline")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm underline" title="Altı Çizili">U</button>
                  <button onClick={() => execCmd("strikeThrough")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm line-through" title="Üstü Çizili">S</button>
                  <div className="w-px h-5 bg-[#E5E5E5] mx-1" />
                  <button onClick={() => execCmd("formatBlock", "h1")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs font-bold" title="Başlık 1">H1</button>
                  <button onClick={() => execCmd("formatBlock", "h2")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs font-bold" title="Başlık 2">H2</button>
                  <button onClick={() => execCmd("formatBlock", "h3")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs font-bold" title="Başlık 3">H3</button>
                  <div className="w-px h-5 bg-[#E5E5E5] mx-1" />
                  <button onClick={() => execCmd("insertUnorderedList")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm" title="Madde Listesi">•</button>
                  <button onClick={() => execCmd("insertOrderedList")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs" title="Numaralı Liste">1.</button>
                  <div className="w-px h-5 bg-[#E5E5E5] mx-1" />
                  <button onClick={() => execCmd("formatBlock", "blockquote")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm" title="Alıntı">❝</button>
                  <button onClick={() => execCmd("removeFormat")} className="w-8 h-8 rounded hover:bg-[#F7F7F7] text-xs text-[#8A8A8A]" title="Formatı Temizle">✕</button>
                </div>

                {/* Sağ taraf: aksiyonlar */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleSabitle(seciliNot)}
                    className={`w-8 h-8 rounded hover:bg-[#F7F7F7] text-sm ${seciliNot.sabitlendi ? "text-[#8FAF9A]" : "text-[#C5C5C5]"}`}
                    title={seciliNot.sabitlendi ? "Sabitlemeyi Kaldır" : "Sabitle"}
                  >
                    📌
                  </button>

                  {/* Klasör değiştir */}
                  <select
                    value={seciliNot.klasorId || ""}
                    onChange={async (e) => {
                      try {
                        const yeniKlasor = e.target.value;
                        const klasorObj = klasorler.find(k => k.id === yeniKlasor);
                        await updateDoc(doc(db, "notlar", seciliNot.id), {
                          klasorId: yeniKlasor,
                          paylasimli: klasorObj?.paylasimli ?? false,
                          sonDuzenleme: serverTimestamp(),
                        });
                      } catch (err) {
                        Sentry.captureException(err);
                      }
                    }}
                    className="text-xs border border-[#E5E5E5] rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#8FAF9A] max-w-[120px]"
                    title="Klasör"
                  >
                    <option value="">Klasörsüz</option>
                    {klasorler.map(k => (
                      <option key={k.id} value={k.id}>{k.paylasimli ? "👥 " : ""}{k.ad}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleNotSil(seciliNot)}
                    className="w-8 h-8 rounded hover:bg-red-50 text-sm text-[#D96C6C]"
                    title="Notu Sil"
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
                  onChange={(e) => {
                    const yeniBaslik = e.target.value;
                    setSeciliNot({ ...seciliNot, baslik: yeniBaslik });
                    // Listedeki notu da güncelle
                    setNotlar(prev => prev.map(n => n.id === seciliNot.id ? { ...n, baslik: yeniBaslik } : n));
                    kaydetNot(seciliNot, yeniBaslik);
                  }}
                  placeholder="Başlık"
                  className="w-full text-2xl font-bold text-[#2F2F2F] placeholder:text-[#D5D5D5] focus:outline-none"
                />
                <div className="flex items-center gap-3 mt-1 text-[10px] text-[#C5C5C5]">
                  <span>{formatTarih(seciliNot.sonDuzenleme)}</span>
                  {seciliNot.paylasimli && <span>👥 Paylaşımlı</span>}
                  <span>{seciliNot.olusturanAd}</span>
                </div>
              </div>

              {/* İçerik editörü */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  const icerik = editorRef.current?.innerHTML || "";
                  setNotlar(prev => prev.map(n => n.id === seciliNot!.id ? { ...n, icerik } : n));
                  kaydetNot(seciliNot!, undefined, icerik);
                }}
                className="flex-1 px-6 py-4 overflow-y-auto text-sm text-[#2F2F2F] leading-relaxed focus:outline-none prose prose-sm max-w-none
                  [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-4
                  [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3
                  [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                  [&_li]:my-0.5
                  [&_blockquote]:border-l-3 [&_blockquote]:border-[#8FAF9A] [&_blockquote]:pl-3 [&_blockquote]:text-[#8A8A8A] [&_blockquote]:italic [&_blockquote]:my-2"
                data-placeholder="Yazmaya başlayın..."
                style={{ minHeight: "200px" }}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#C5C5C5]">
              <div className="text-center">
                <p className="text-4xl mb-3">📝</p>
                <p className="text-sm">Bir not seçin veya yeni not oluşturun</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Klasör Modal ═══════════════════════════════════ */}
      {showKlasorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-[#2F2F2F]">
                {editingKlasor ? "✏️ Klasör Düzenle" : "📁 Yeni Klasör"}
              </h3>
              <button onClick={() => { setShowKlasorModal(false); setEditingKlasor(null); }} className="text-[#8A8A8A] hover:text-[#2F2F2F] text-xl">×</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Klasör Adı *</label>
                <input
                  type="text"
                  value={klasorForm.ad}
                  onChange={(e) => setKlasorForm({ ...klasorForm, ad: e.target.value })}
                  className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm"
                  placeholder="Toplantı Notları"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-2">Renk</label>
                <div className="flex gap-2">
                  {RENKLER.map(r => (
                    <button
                      key={r.id}
                      onClick={() => setKlasorForm({ ...klasorForm, renk: r.id })}
                      className={`w-7 h-7 rounded-full ${r.bg} transition ${klasorForm.renk === r.id ? "ring-2 ring-offset-2 ring-[#2F2F2F] scale-110" : "hover:scale-110"}`}
                    />
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={klasorForm.paylasimli}
                    onChange={(e) => setKlasorForm({ ...klasorForm, paylasimli: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-[#E5E5E5] rounded-full peer-checked:bg-[#8FAF9A] transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#2F2F2F]">Paylaşımlı Klasör</p>
                  <p className="text-xs text-[#8A8A8A]">Herkes bu klasördeki notları görebilir</p>
                </div>
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={handleKlasorKaydet} className="flex-1 px-4 py-2.5 bg-[#8FAF9A] text-white rounded-lg hover:bg-[#7A9E86] transition text-sm font-medium">
                💾 Kaydet
              </button>
              {editingKlasor && (
                <button onClick={() => handleKlasorSil(editingKlasor)} className="px-4 py-2.5 bg-white border border-[#D96C6C] text-[#D96C6C] rounded-lg hover:bg-red-50 transition text-sm">
                  🗑️
                </button>
              )}
              <button onClick={() => { setShowKlasorModal(false); setEditingKlasor(null); }} className="px-4 py-2.5 bg-[#F7F7F7] text-[#2F2F2F] rounded-lg hover:bg-[#E5E5E5] transition text-sm">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editör placeholder CSS */}
      <style>{`
        [contenteditable=true]:empty:before {
          content: attr(data-placeholder);
          color: #D5D5D5;
          pointer-events: none;
          display: block;
        }
      `}</style>
    </div>
  );
}
