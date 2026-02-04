// Grup Etiketleri Renk Paleti ve Helper Fonksiyonları
// Dosya: lib/grupEtiketleri.ts

// Kullanılabilir renkler - Ayarlar sayfasında seçim için
export const RENK_PALETI = [
  { id: "blue", label: "Mavi", bg: "bg-blue-500", bgLight: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  { id: "purple", label: "Mor", bg: "bg-purple-500", bgLight: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  { id: "pink", label: "Pembe", bg: "bg-pink-500", bgLight: "bg-pink-50", border: "border-pink-200", text: "text-pink-700" },
  { id: "orange", label: "Turuncu", bg: "bg-orange-500", bgLight: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  { id: "green", label: "Yeşil", bg: "bg-green-500", bgLight: "bg-green-50", border: "border-green-200", text: "text-green-700" },
  { id: "red", label: "Kırmızı", bg: "bg-red-500", bgLight: "bg-red-50", border: "border-red-200", text: "text-red-700" },
  { id: "yellow", label: "Sarı", bg: "bg-yellow-500", bgLight: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700" },
  { id: "indigo", label: "İndigo", bg: "bg-indigo-500", bgLight: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700" },
  { id: "teal", label: "Teal", bg: "bg-teal-500", bgLight: "bg-teal-50", border: "border-teal-200", text: "text-teal-700" },
  { id: "cyan", label: "Cyan", bg: "bg-cyan-500", bgLight: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700" },
  { id: "gray", label: "Gri", bg: "bg-gray-500", bgLight: "bg-gray-50", border: "border-gray-200", text: "text-gray-700" },
];

// Renk ID'sine göre stil bilgilerini getir
export function getRenkStilleri(renkId: string) {
  const renk = RENK_PALETI.find(r => r.id === renkId);
  if (!renk) {
    // Default: gray
    return {
      bg: "bg-gray-500",
      bgLight: "bg-gray-50",
      border: "border-gray-200",
      text: "text-gray-700"
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