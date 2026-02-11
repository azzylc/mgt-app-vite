// Grup Etiketleri Renk Paleti ve Helper Fonksiyonları
// Dosya: lib/grupEtiketleri.ts

// Kullanılabilir renkler - Ayarlar sayfasında seçim için
export const RENK_PALETI = [
  { id: "blue", label: "Mavi", bg: "bg-blue-500", bgLight: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  { id: "purple", label: "Mor", bg: "bg-purple-500", bgLight: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  { id: "pink", label: "Pembe", bg: "bg-pink-500", bgLight: "bg-pink-50", border: "border-pink-200", text: "text-pink-700" },
  { id: "orange", label: "Turuncu", bg: "bg-[#E6B566]", bgLight: "bg-[#E6B566]/10", border: "border-orange-200", text: "text-orange-700" },
  { id: "green", label: "Yeşil", bg: "bg-[#8FAF9A]", bgLight: "bg-[#EAF2ED]", border: "border-green-200", text: "text-[#8FAF9A]" },
  { id: "red", label: "Kırmızı", bg: "bg-[#D96C6C]", bgLight: "bg-[#D96C6C]/10", border: "border-[#D96C6C]/30", text: "text-[#D96C6C]" },
  { id: "yellow", label: "Sarı", bg: "bg-[#E6B566]", bgLight: "bg-[#E6B566]/10", border: "border-yellow-200", text: "text-[#E6B566]" },
  { id: "indigo", label: "İndigo", bg: "bg-indigo-500", bgLight: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700" },
  { id: "teal", label: "Teal", bg: "bg-teal-500", bgLight: "bg-teal-50", border: "border-teal-200", text: "text-teal-700" },
  { id: "cyan", label: "Cyan", bg: "bg-cyan-500", bgLight: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700" },
  { id: "gray", label: "Gri", bg: "bg-[#8A8A8A]", bgLight: "bg-[#F7F7F7]", border: "border-[#E5E5E5]", text: "text-[#2F2F2F]" },
];

// Renk ID'sine göre stil bilgilerini getir
export function getRenkStilleri(renkId: string) {
  const renk = RENK_PALETI.find(r => r.id === renkId);
  if (!renk) {
    // Default: gray
    return {
      bg: "bg-[#8A8A8A]",
      bgLight: "bg-[#F7F7F7]",
      border: "border-[#E5E5E5]",
      text: "text-[#2F2F2F]"
    };
  }
  return {
    bg: renk.bg,
    bgLight: renk.bgLight,
    border: renk.border,
    text: renk.text
  };
}

// Grup badge class'ı oluştur (seçili/seçili değil)
export function getGrupBadgeClass(renkId: string, selected: boolean = false) {
  const stiller = getRenkStilleri(renkId);
  if (selected) {
    return `${stiller.bg} text-white`;
  }
  return `${stiller.bgLight} ${stiller.text} ${stiller.border} border`;
}

// Default grup etiketleri (ilk kurulum veya migration için)
export const DEFAULT_GRUP_ETIKETLERI = [
  { grupAdi: "Genel", renk: "blue", sira: 0 },
  { grupAdi: "MG", renk: "purple", sira: 1 },
  { grupAdi: "GYS", renk: "pink", sira: 2 },
  { grupAdi: "TCB", renk: "orange", sira: 3 },
  { grupAdi: "ekip", renk: "green", sira: 4 },
  { grupAdi: "serbest", renk: "gray", sira: 5 },
];