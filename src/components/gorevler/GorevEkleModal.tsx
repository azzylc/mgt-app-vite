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
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 text-white px-4 py-3 rounded-t-xl flex items-center justify-between">
          <h2 className="font-bold text-sm">➕ Yeni Görev Ata</h2>
          <button onClick={onKapat} className="text-white/80 hover:text-white text-xl">✕</button>
        </div>
        
        <div className="p-5 space-y-4">
          {/* Başlık */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Görev Başlığı *</label>
            <input
              type="text"
              value={yeniGorev.baslik}
              onChange={e => onFormDegistir({...yeniGorev, baslik: e.target.value})}
              placeholder="Görev başlığını yazın..."
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Açıklama</label>
            <textarea
              value={yeniGorev.aciklama}
              onChange={e => onFormDegistir({...yeniGorev, aciklama: e.target.value})}
              placeholder="Görev detaylarını yazın..."
              rows={3}
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          {/* Atanacak Kişiler */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Atanacak Kişi(ler) *</label>
            <div className="border border-stone-300 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
              {/* Tümünü Seç */}
              <label className="flex items-center gap-2 p-1.5 rounded hover:bg-amber-50 cursor-pointer border-b border-stone-100 pb-2 mb-1">
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
                  className="rounded border-stone-300 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm font-medium text-stone-700">Tümünü Seç ({ekipPersonelleri.length})</span>
              </label>
              {[...ekipPersonelleri].sort((a, b) => {
                if (a.email === userEmail) return -1;
                if (b.email === userEmail) return 1;
                return 0;
              }).map(p => (
                <label key={p.id} className={`flex items-center gap-2 p-1.5 rounded cursor-pointer ${p.email === userEmail ? "hover:bg-amber-50 bg-amber-50/30" : "hover:bg-stone-50"}`}>
                  <input
                    type="checkbox"
                    checked={yeniGorev.atananlar.includes(p.email)}
                    onChange={() => {
                      const yeni = yeniGorev.atananlar.includes(p.email)
                        ? yeniGorev.atananlar.filter(e => e !== p.email)
                        : [...yeniGorev.atananlar, p.email];
                      onFormDegistir({...yeniGorev, atananlar: yeni});
                    }}
                    className="rounded border-stone-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-sm text-stone-700">
                    {p.email === userEmail 
                      ? <span className="font-medium text-amber-600">📌 Kendime Görev / Not</span>
                      : `${p.ad} ${p.soyad}`
                    }
                  </span>
                </label>
              ))}
            </div>
            {yeniGorev.atananlar.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">{yeniGorev.atananlar.length} kişi seçildi</p>
            )}
          </div>

          {/* Ortak / Kişisel Seçimi - sadece 2+ kişi seçiliyse göster */}
          {yeniGorev.atananlar.length > 1 && (
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
              <p className="text-sm font-medium text-stone-700 mb-2">Görev türü</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onFormDegistir({...yeniGorev, ortakMi: false})}
                  className={`px-3 py-2.5 rounded-lg text-xs font-medium transition border ${
                    !yeniGorev.ortakMi
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                  }`}
                >
                  👤 Kişisel
                  <p className={`text-[10px] mt-0.5 ${!yeniGorev.ortakMi ? "text-amber-100" : "text-stone-400"}`}>
                    Herkese ayrı görev
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onFormDegistir({...yeniGorev, ortakMi: true})}
                  className={`px-3 py-2.5 rounded-lg text-xs font-medium transition border ${
                    yeniGorev.ortakMi
                      ? "bg-purple-500 text-white border-purple-500"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                  }`}
                >
                  👥 Ortak Görev
                  <p className={`text-[10px] mt-0.5 ${yeniGorev.ortakMi ? "text-purple-100" : "text-stone-400"}`}>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Aciliyet</label>
              <select
                value={yeniGorev.oncelik}
                onChange={e => onFormDegistir({...yeniGorev, oncelik: e.target.value as Gorev["oncelik"]})}
                className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="dusuk">🔵 Düşük</option>
                <option value="normal">⚪ Normal</option>
                <option value="yuksek">🟠 Yüksek</option>
                <option value="acil">🔴 Acil</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Son Tarih</label>
              <input
                type="date"
                value={yeniGorev.sonTarih}
                onChange={e => onFormDegistir({...yeniGorev, sonTarih: e.target.value})}
                className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Kaydet */}
          <button
            onClick={onOlustur}
            disabled={loading}
            className="w-full py-3 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 disabled:opacity-50 transition text-sm"
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
