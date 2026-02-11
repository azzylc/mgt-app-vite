import { Gorev, Personel } from "./types";

interface YeniGorevForm {
  baslik: string;
  aciklama: string;
  atananlar: string[];
  oncelik: Gorev["oncelik"];
  sonTarih: string;
  ortakMi: boolean;
}

interface GorevEkleModalProps {
  yeniGorev: YeniGorevForm;
  ekipPersonelleri: Personel[];
  loading: boolean;
  userEmail: string;
  onFormDegistir: (form: YeniGorevForm) => void;
  onOlustur: () => void;
  onKapat: () => void;
}

export default function GorevEkleModal({
  yeniGorev,
  ekipPersonelleri,
  loading,
  userEmail,
  onFormDegistir,
  onOlustur,
  onKapat,
}: GorevEkleModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3" onClick={onKapat}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#8FAF9A] to-[#7A9E86] text-white px-4 py-3 rounded-t-xl flex items-center justify-between">
          <h2 className="font-bold text-sm">➕ Yeni Görev Ata</h2>
          <button onClick={onKapat} className="text-white/80 hover:text-white text-xl">✕</button>
        </div>
        
        <div className="p-5 space-y-4">
          {/* Başlık */}
          <div>
            <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Görev Başlığı *</label>
            <input
              type="text"
              value={yeniGorev.baslik}
              onChange={e => onFormDegistir({...yeniGorev, baslik: e.target.value})}
              placeholder="Görev başlığını yazın..."
              className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]"
            />
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Açıklama</label>
            <textarea
              value={yeniGorev.aciklama}
              onChange={e => onFormDegistir({...yeniGorev, aciklama: e.target.value})}
              placeholder="Görev detaylarını yazın..."
              rows={3}
              className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] resize-none"
            />
          </div>

          {/* Atanacak Kişiler */}
          <div>
            <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Atanacak Kişi(ler) *</label>
            <div className="border border-[#E5E5E5] rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
              {/* Tümünü Seç */}
              <label className="flex items-center gap-2 p-1.5 rounded hover:bg-[#EAF2ED] cursor-pointer border-b border-[#E5E5E5] pb-2 mb-1">
                <input
                  type="checkbox"
                  checked={yeniGorev.atananlar.length === ekipPersonelleri.length}
                  onChange={() => {
                    if (yeniGorev.atananlar.length === ekipPersonelleri.length) {
                      onFormDegistir({...yeniGorev, atananlar: []});
                    } else {
                      onFormDegistir({...yeniGorev, atananlar: ekipPersonelleri.map(p => p.email)});
                    }
                  }}
                  className="rounded border-[#E5E5E5] text-[#E6B566] focus:ring-[#8FAF9A]"
                />
                <span className="text-sm font-medium text-[#2F2F2F]">Tümünü Seç ({ekipPersonelleri.length})</span>
              </label>
              {[...ekipPersonelleri].sort((a, b) => {
                if (a.email === userEmail) return -1;
                if (b.email === userEmail) return 1;
                return 0;
              }).map(p => (
                <label key={p.id} className={`flex items-center gap-2 p-1.5 rounded cursor-pointer ${p.email === userEmail ? "hover:bg-[#EAF2ED] bg-[#EAF2ED]" : "hover:bg-[#F7F7F7]"}`}>
                  <input
                    type="checkbox"
                    checked={yeniGorev.atananlar.includes(p.email)}
                    onChange={() => {
                      const yeni = yeniGorev.atananlar.includes(p.email)
                        ? yeniGorev.atananlar.filter(e => e !== p.email)
                        : [...yeniGorev.atananlar, p.email];
                      onFormDegistir({...yeniGorev, atananlar: yeni});
                    }}
                    className="rounded border-[#E5E5E5] text-[#E6B566] focus:ring-[#8FAF9A]"
                  />
                  <span className="text-sm text-[#2F2F2F]">
                    {p.email === userEmail 
                      ? <span className="font-medium text-[#8FAF9A]">📌 Kendime Görev / Not</span>
                      : `${p.ad} ${p.soyad}`
                    }
                  </span>
                </label>
              ))}
            </div>
            {yeniGorev.atananlar.length > 0 && (
              <p className="text-xs text-[#8FAF9A] mt-1">{yeniGorev.atananlar.length} kişi seçildi</p>
            )}
          </div>

          {/* Ortak / Kişisel Seçimi - sadece 2+ kişi seçiliyse göster */}
          {yeniGorev.atananlar.length > 1 && (
            <div className="p-3 bg-[#F7F7F7] rounded-lg border border-[#E5E5E5]">
              <p className="text-sm font-medium text-[#2F2F2F] mb-2">Görev türü</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onFormDegistir({...yeniGorev, ortakMi: false})}
                  className={`px-3 py-2.5 rounded-lg text-xs font-medium transition border ${
                    !yeniGorev.ortakMi
                      ? "bg-[#8FAF9A] text-white border-[#8FAF9A]"
                      : "bg-white text-[#2F2F2F] border-[#E5E5E5] hover:bg-[#F7F7F7]"
                  }`}
                >
                  👤 Kişisel
                  <p className={`text-[10px] mt-0.5 ${!yeniGorev.ortakMi ? "text-[#EAF2ED]" : "text-[#8A8A8A]"}`}>
                    Herkese ayrı görev
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onFormDegistir({...yeniGorev, ortakMi: true})}
                  className={`px-3 py-2.5 rounded-lg text-xs font-medium transition border ${
                    yeniGorev.ortakMi
                      ? "bg-purple-500 text-white border-purple-500"
                      : "bg-white text-[#2F2F2F] border-[#E5E5E5] hover:bg-[#F7F7F7]"
                  }`}
                >
                  👥 Ortak Görev
                  <p className={`text-[10px] mt-0.5 ${yeniGorev.ortakMi ? "text-purple-100" : "text-[#8A8A8A]"}`}>
                    Tek görev, birlikte
                  </p>
                </button>
              </div>
              {yeniGorev.ortakMi && (
                <p className="text-[10px] text-purple-600 mt-2 flex items-center gap-1">
                  💡 Herkes yorumları görür, herkes tamamlayınca kapanır
                </p>
              )}
            </div>
          )}

          {/* Aciliyet + Son Tarih */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Aciliyet</label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { value: "dusuk", label: "Düşük", emoji: "🔵" },
                  { value: "normal", label: "Normal", emoji: "⚪" },
                  { value: "yuksek", label: "Yüksek", emoji: "🟠" },
                  { value: "acil", label: "Acil", emoji: "🔴" },
                ] as const).map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onFormDegistir({...yeniGorev, oncelik: o.value})}
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition border ${
                      yeniGorev.oncelik === o.value
                        ? o.value === "acil" ? "bg-[#D96C6C] text-white border-red-500"
                        : o.value === "yuksek" ? "bg-[#8FAF9A] text-white border-[#8FAF9A]"
                        : o.value === "dusuk" ? "bg-sky-500 text-white border-sky-500"
                        : "bg-[#2F2F2F] text-white border-[#2F2F2F]"
                        : "bg-white text-[#2F2F2F] border-[#E5E5E5] hover:bg-[#F7F7F7]"
                    }`}
                  >
                    {o.emoji} {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Son Tarih</label>
              <div className="flex gap-1.5 mb-2">
                {(() => {
                  const bugun = new Date();
                  const formatTarih = (d: Date) => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, "0");
                    const day = String(d.getDate()).padStart(2, "0");
                    return `${y}-${m}-${day}`;
                  };
                  const gunAd = (d: Date) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
                  const secenekler = [
                    { label: "Bugün", tarih: formatTarih(bugun) },
                    { label: "Yarın", tarih: formatTarih(new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() + 1)) },
                    { label: "3 Gün", tarih: formatTarih(new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() + 3)) },
                    { label: "1 Hafta", tarih: formatTarih(new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() + 7)) },
                  ];
                  return secenekler.map(s => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => onFormDegistir({...yeniGorev, sonTarih: s.tarih})}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition border ${
                        yeniGorev.sonTarih === s.tarih
                          ? "bg-[#8FAF9A] text-white border-[#8FAF9A]"
                          : "bg-white text-[#2F2F2F] border-[#E5E5E5] hover:bg-[#F7F7F7]"
                      }`}
                    >
                      <div>{s.label}</div>
                      <div className={`text-[10px] ${yeniGorev.sonTarih === s.tarih ? "text-[#EAF2ED]" : "text-[#8A8A8A]"}`}>{gunAd(new Date(s.tarih + "T12:00:00"))}</div>
                    </button>
                  ));
                })()}
              </div>
              <input
                type="date"
                value={yeniGorev.sonTarih}
                onChange={e => onFormDegistir({...yeniGorev, sonTarih: e.target.value})}
                className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm"
              />
              {yeniGorev.sonTarih && (
                <button
                  type="button"
                  onClick={() => onFormDegistir({...yeniGorev, sonTarih: ""})}
                  className="text-[10px] text-[#D96C6C] hover:text-[#D96C6C] mt-1"
                >
                  ✕ Tarihi kaldır
                </button>
              )}
            </div>
          </div>

          {/* Kaydet */}
          <button
            onClick={onOlustur}
            disabled={loading}
            className="w-full py-3 bg-[#8FAF9A] text-white rounded-lg font-semibold hover:bg-[#7A9E86] disabled:opacity-50 transition text-sm"
          >
            {loading ? "⏳ Oluşturuluyor..." : yeniGorev.ortakMi 
              ? `👥 Ortak Görev Oluştur (${yeniGorev.atananlar.length} kişi)` 
              : `✅ Görev Oluştur${yeniGorev.atananlar.length > 1 ? ` (${yeniGorev.atananlar.length} kişi)` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
