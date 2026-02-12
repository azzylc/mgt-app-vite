import type { NotKlasor, KlasorFormState } from "./notlarTypes";
import { RENKLER } from "./notlarTypes";

interface KlasorModalProps {
  show: boolean;
  editing: NotKlasor | null;
  form: KlasorFormState;
  onFormChange: (form: KlasorFormState) => void;
  onSave: () => void;
  onDelete: (klasor: NotKlasor) => void;
  onClose: () => void;
}

export default function KlasorModal({
  show, editing, form, onFormChange, onSave, onDelete, onClose,
}: KlasorModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-[#2F2F2F]">
            {editing ? "✏️ Klasör Düzenle" : "📁 Yeni Klasör"}
          </h3>
          <button onClick={onClose} className="text-[#8A8A8A] hover:text-[#2F2F2F] text-xl">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Klasör Adı *</label>
            <input
              type="text"
              value={form.ad}
              onChange={(e) => onFormChange({ ...form, ad: e.target.value })}
              className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm"
              placeholder="Toplantı Notları"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#2F2F2F] mb-2">Renk</label>
            <div className="flex gap-2">
              {RENKLER.map(r => (
                <button
                  key={r.id}
                  onClick={() => onFormChange({ ...form, renk: r.id })}
                  className={`w-7 h-7 rounded-full ${r.bg} transition ${
                    form.renk === r.id ? "ring-2 ring-offset-2 ring-[#2F2F2F] scale-110" : "hover:scale-110"
                  }`}
                />
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={form.paylasimli}
                onChange={(e) => onFormChange({ ...form, paylasimli: e.target.checked })}
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
          <button onClick={onSave} className="flex-1 px-4 py-2.5 bg-[#8FAF9A] text-white rounded-lg hover:bg-[#7A9E86] transition text-sm font-medium">
            💾 Kaydet
          </button>
          {editing && (
            <button onClick={() => onDelete(editing)} className="px-4 py-2.5 bg-white border border-[#D96C6C] text-[#D96C6C] rounded-lg hover:bg-red-50 transition text-sm">
              🗑️
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2.5 bg-[#F7F7F7] text-[#2F2F2F] rounded-lg hover:bg-[#E5E5E5] transition text-sm">
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}
