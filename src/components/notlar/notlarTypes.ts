import { Timestamp } from "firebase/firestore";

// ─── Tipler ─────────────────────────────────────────────────
export interface NotKlasor {
  id: string;
  ad: string;
  renk: string;
  paylasimli: boolean;
  olusturan: string;
  olusturanAd: string;
  sira: number;
  ustKlasorId: string; // "" = kök klasör
  firmaId: string; // "" = kişisel (firmadan bağımsız)
  olusturulmaTarihi: Timestamp | Date;
}

export interface Not {
  id: string;
  baslik: string;
  icerik: string; // HTML (sanitized)
  klasorId: string;
  sabitlendi: boolean;
  olusturan: string;
  olusturanAd: string;
  paylasimli: boolean;
  silindi: boolean;
  silinmeTarihi: Timestamp | Date | null;
  firmaId: string; // "" = kişisel (firmadan bağımsız)
  olusturulmaTarihi: Timestamp | Date;
  sonDuzenleme: Timestamp | Date;
}

export interface KlasorFormState {
  ad: string;
  renk: string;
  paylasimli: boolean;
  ustKlasorId: string;
}

export type MobilPanelType = "klasor" | "liste" | "editor";
export type KlasorFilter = "tumu" | "kisisel" | "paylasimli" | "cop" | string;

// ─── Sabitler ───────────────────────────────────────────────
export const RENKLER = [
  { id: "gray", bg: "bg-[#8A8A8A]", light: "bg-[#F7F7F7]", text: "text-[#8A8A8A]" },
  { id: "rose", bg: "bg-rose-500", light: "bg-rose-50", text: "text-rose-600" },
  { id: "orange", bg: "bg-orange-500", light: "bg-orange-50", text: "text-orange-600" },
  { id: "green", bg: "bg-[#8FAF9A]", light: "bg-[#EAF2ED]", text: "text-[#6B9A7A]" },
  { id: "blue", bg: "bg-blue-500", light: "bg-blue-50", text: "text-blue-600" },
  { id: "purple", bg: "bg-purple-500", light: "bg-purple-50", text: "text-purple-600" },
  { id: "teal", bg: "bg-teal-500", light: "bg-teal-50", text: "text-teal-600" },
  { id: "indigo", bg: "bg-indigo-500", light: "bg-indigo-50", text: "text-indigo-600" },
];

export const getRenk = (id: string) => RENKLER.find(r => r.id === id) || RENKLER[0];

// ─── HTML → düz metin (önizleme için) ──────────────────────
export function htmlToPreview(html: string, maxLen = 80): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = div.textContent || div.innerText || "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

// ─── Tarih formatı ──────────────────────────────────────────
export function formatTarih(ts: Timestamp | Date | null | undefined): string {
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

// ─── HTML Sanitize (XSS koruması) ───────────────────────────
// Tehlikeli tag'lar ve attribute'lar temizlenir.
// Güvenli: b, i, u, s, h1-h6, p, br, ul, ol, li, blockquote, div, span, input[checkbox]
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "strike", "del",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "div", "span",
  "ul", "ol", "li",
  "blockquote",
  "input", // checklist için
  "label",
]);

const DANGEROUS_ATTRS = /^on|^data-|^style$/i;
const DANGEROUS_TAGS = /^(script|iframe|object|embed|form|link|meta|base|svg)$/i;

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  function clean(node: Element) {
    // Tehlikeli tag'ları sil
    const children = Array.from(node.children);
    for (const child of children) {
      if (DANGEROUS_TAGS.test(child.tagName)) {
        child.remove();
        continue;
      }
      // Tag izin listesinde değilse içeriğini koru, tag'ı kaldır
      if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      // Tehlikeli attribute'ları temizle
      const attrs = Array.from(child.attributes);
      for (const attr of attrs) {
        if (DANGEROUS_ATTRS.test(attr.name)) {
          child.removeAttribute(attr.name);
        }
        // href="javascript:" kontrol
        if (attr.name === "href" && attr.value.toLowerCase().startsWith("javascript:")) {
          child.removeAttribute(attr.name);
        }
      }
      // input sadece checkbox olabilir
      if (child.tagName === "INPUT") {
        if ((child as HTMLInputElement).type !== "checkbox") {
          child.remove();
          continue;
        }
      }
      clean(child);
    }
  }

  clean(doc.body);
  return doc.body.innerHTML;
}

// ─── Checklist HTML oluştur ─────────────────────────────────
export function createChecklistHtml(): string {
  return `<div class="checklist-item" contenteditable="false" style="display:flex;align-items:flex-start;gap:6px;padding:2px 0;"><input type="checkbox" style="margin-top:3px;cursor:pointer;accent-color:#8FAF9A;" /><span contenteditable="true" style="flex:1;outline:none;">Yapılacak</span></div>`;
}

// ─── Boyut kontrolü ─────────────────────────────────────────
export const MAX_ICERIK_SIZE = 200 * 1024; // 200KB
export function icerikBoyutuAsildiMi(html: string): boolean {
  return new Blob([html]).size > MAX_ICERIK_SIZE;
}
