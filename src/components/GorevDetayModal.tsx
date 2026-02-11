import { useState } from "react";
import { Gorev, durumEmojiyon, durumLabel } from "./types";

interface GorevDetayModalProps {
  gorev: Gorev;
  userEmail: string;
  userRole: string;
  yorumLoading: boolean;
  onKapat: () => void;
  onTamamla: (gorevId: string) => void;
  onSil: (gorevId: string) => void;
  onYorumEkle: (yorum: string) => void;
  onDuzenle: (data: { baslik: string; aciklama: string; oncelik: Gorev["oncelik"]; sonTarih: string }) => void;
}

export default function GorevDetayModal({
  gorev,
  userEmail,
  userRole,
  yorumLoading,
  onKapat,
  onTamamla,
  onSil,
  onYorumEkle,
  onDuzenle,
}: GorevDetayModalProps) {
  const [duzenleMode, setDuzenleMode] = useState(false);
  const [duzenleData, setDuzenleData] = useState({
    baslik: gorev.baslik,
    aciklama: gorev.aciklama,
    oncelik: gorev.oncelik,
    sonTarih: gorev.sonTarih || ""
  });
  const [yeniYorum, setYeniYorum] = useState("");
  const [tamamlaAcik, setTamamlaAcik] = useState(false);
  const [tamamlaYorum, setTamamlaYorum] = useState("");

  const canDelete = userRole === "Kurucu" || userRole === "Yönetici" || gorev.atayan === userEmail;

  const handleKapat = () => {
    setDuzenleMode(false);
    setYeniYorum("");
    onKapat();
  };

  const handleDuzenleKaydet = () => {
    onDuzenle(duzenleData);
    setDuzenleMode(false);
  };

  const handleYorumGonder = () => {
    if (!yeniYorum.trim()) return;
    onYorumEkle(yeniYorum.trim());
    setYeniYorum("");
  };

  const handleTamamlaOnayla = () => {
    const mevcutYorumVar = gorev.yorumlar && gorev.yorumlar.length > 0;
    if (!mevcutYorumVar && !tamamlaYorum.trim()) {
      alert("Lütfen ne yaptığınızı yazın!");
      return;
    }
    // Eğer yeni yorum yazıldıysa onu da ekle
    if (tamamlaYorum.trim()) {
      onYorumEkle(tamamlaYorum.trim());
    }
    onTamamla(gorev.id);
    setTamamlaAcik(false);
    setTamamlaYorum("");
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3" onClick={handleKapat}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`px-4 py-3 rounded-t-xl flex items-center justify-between ${
          gorev.oncelik === "acil" ? "bg-gradient-to-r from-[#D96C6C]/100 to-red-400 text-white" :
          gorev.oncelik === "yuksek" ? "bg-gradient-to-r from-[#8FAF9A] to-[#7A9E86] text-white" :
          gorev.oncelik === "dusuk" ? "bg-gradient-to-r from-sky-500 to-sky-400 text-white" :
          "bg-gradient-to-r from-[#2F2F2F] to-[#4A4A4A] text-white"
        }`}>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm md:text-base truncate">{gorev.baslik}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {gorev.ortakMi && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">
                  👥 Ortak ({gorev.atananlar?.length || 0})
                </span>
              )}
              <span className="text-[10px] opacity-80">
                {gorev.oncelik === "acil" ? "Acil" : gorev.oncelik === "yuksek" ? "Yüksek" : gorev.oncelik === "dusuk" ? "Düşük" : "Normal"} 
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
                {durumEmojiyon(gorev.durum)} {durumLabel(gorev.durum)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!gorev.otomatikMi && gorev.atayan === userEmail && !duzenleMode && (
              <button
                onClick={() => {
                  setDuzenleMode(true);
                  setDuzenleData({
                    baslik: gorev.baslik,
                    aciklama: gorev.aciklama,
                    oncelik: gorev.oncelik,
                    sonTarih: gorev.sonTarih || ""
                  });
                }}
                className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition"
              >
                ✏️ Düzenle
              </button>
            )}
            <button onClick={handleKapat} className="text-white/80 hover:text-white text-xl">✕</button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* DÜZENLEME MODU */}
          {duzenleMode ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Başlık</label>
                <input
                  type="text"
                  value={duzenleData.baslik}
                  onChange={e => setDuzenleData({...duzenleData, baslik: e.target.value})}
                  className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Açıklama</label>
                <textarea
                  value={duzenleData.aciklama}
                  onChange={e => setDuzenleData({...duzenleData, aciklama: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Aciliyet</label>
                  <select
                    value={duzenleData.oncelik}
                    onChange={e => setDuzenleData({...duzenleData, oncelik: e.target.value as Gorev["oncelik"]})}
                    className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] bg-white"
                  >
                    <option value="dusuk">🔵 Düşük</option>
                    <option value="normal">⚪ Normal</option>
                    <option value="yuksek">🟠 Yüksek</option>
                    <option value="acil">🔴 Acil</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Son Tarih</label>
                  <input
                    type="date"
                    value={duzenleData.sonTarih}
                    onChange={e => setDuzenleData({...duzenleData, sonTarih: e.target.value})}
                    className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleDuzenleKaydet} className="flex-1 py-2.5 bg-[#8FAF9A] text-white rounded-lg font-semibold hover:bg-[#7A9E86] transition text-sm">
                  ✅ Kaydet
                </button>
                <button onClick={() => setDuzenleMode(false)} className="px-4 py-2.5 bg-[#E5E5E5] text-[#2F2F2F] rounded-lg font-medium hover:bg-[#E5E5E5] transition text-sm">
                  İptal
                </button>
              </div>
            </div>
          ) : (
          /* GÖRÜNTÜLEME MODU */
          <div className="space-y-3">
            {gorev.aciklama && (
              <div className="p-3 bg-[#F7F7F7] rounded-lg">
                <p className="text-xs font-medium text-[#8A8A8A] mb-1">📝 Açıklama</p>
                <p className="text-sm text-[#2F2F2F] whitespace-pre-wrap">{gorev.aciklama}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              {!gorev.ortakMi && (
              <div className="p-3 bg-[#F7F7F7] rounded-lg">
                <p className="text-xs font-medium text-[#8A8A8A] mb-1">🎯 Atanan</p>
                <p className="text-[#2F2F2F] font-medium">{gorev.atananAd}</p>
              </div>
              )}
              <div className="p-3 bg-[#F7F7F7] rounded-lg">
                <p className="text-xs font-medium text-[#8A8A8A] mb-1">👤 Atayan</p>
                <p className="text-[#2F2F2F] font-medium">
                  {gorev.atayan === "Sistem" ? "🤖 Sistem (Otomatik)" : gorev.atayanAd}
                </p>
              </div>
              <div className="p-3 bg-[#F7F7F7] rounded-lg">
                <p className="text-xs font-medium text-[#8A8A8A] mb-1">📅 Oluşturulma</p>
                <p className="text-[#2F2F2F]">{gorev.olusturulmaTarihi?.toDate?.().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              {gorev.sonTarih && (
                <div className={`p-3 rounded-lg ${
                  new Date(gorev.sonTarih) < new Date() && gorev.durum !== "tamamlandi"
                    ? "bg-[#D96C6C]/10 border border-red-200"
                    : "bg-[#F7F7F7]"
                }`}>
                  <p className="text-xs font-medium text-[#8A8A8A] mb-1">⏰ Son Tarih</p>
                  <p className={`font-medium ${
                    new Date(gorev.sonTarih) < new Date() && gorev.durum !== "tamamlandi"
                      ? "text-[#D96C6C]" : "text-[#2F2F2F]"
                  }`}>
                    {new Date(gorev.sonTarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {new Date(gorev.sonTarih) < new Date() && gorev.durum !== "tamamlandi" && " ⚠️ Gecikmiş!"}
                  </p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Ortak Görev - Kişiler Paneli */}
          {gorev.ortakMi && gorev.atananlar && gorev.atananAdlar && (
            <div className="p-3 bg-violet-50 rounded-xl border border-violet-100">
              <p className="text-xs font-semibold text-violet-800 mb-2 flex items-center gap-1">
                👥 Ortak Görev — {gorev.tamamlayanlar?.length || 0}/{gorev.atananlar.length} tamamladı
              </p>
              <div className="space-y-1.5">
                {gorev.atananlar.map((email, idx) => {
                  const ad = gorev.atananAdlar![idx] || email;
                  const tamamladi = gorev.tamamlayanlar?.includes(email);
                  const benMiyim = email === userEmail;
                  return (
                    <div key={email} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs ${
                      tamamladi ? "bg-[#EAF2ED] text-[#8FAF9A]" : "bg-white text-[#2F2F2F]"
                    }`}>
                      <span className="font-medium">
                        {benMiyim ? `${ad} (Sen)` : ad}
                      </span>
                      <span>{tamamladi ? "✅ Tamamladı" : "⏳ Bekliyor"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Durum Değiştirme */}
          {!gorev.otomatikMi && (
            <div className="flex flex-wrap gap-2 p-3 bg-[#F7F7F7] rounded-xl">
              {gorev.durum !== "tamamlandi" && (
                <>
                  {/* Ortak görevde zaten tamamladıysa gösterme */}
                  {gorev.ortakMi && gorev.tamamlayanlar?.includes(userEmail) ? (
                    <span className="text-xs text-[#8FAF9A] font-medium">✅ Siz tamamladınız — diğerleri bekleniyor</span>
                  ) : (
                  <>
                  <button 
                    onClick={() => setTamamlaAcik(true)}
                    className="px-3 py-1.5 bg-[#8FAF9A] text-white rounded-lg text-xs font-medium hover:bg-[#7A9E86] transition">
                    ✅ Tamamla
                  </button>
                  {tamamlaAcik && (
                    <div className="w-full mt-2 space-y-2">
                      <textarea
                        value={tamamlaYorum}
                        onChange={e => setTamamlaYorum(e.target.value)}
                        placeholder={gorev.yorumlar && gorev.yorumlar.length > 0 ? "Ekstra not (opsiyonel)..." : "Ne yaptınız? Kısa bir not bırakın..."}
                        className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none"
                        rows={2}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleTamamlaOnayla}
                          className="px-3 py-1.5 bg-[#8FAF9A] text-white rounded-lg text-xs font-medium hover:bg-[#7A9E86] transition">
                          ✅ Onayla
                        </button>
                        <button
                          onClick={() => { setTamamlaAcik(false); setTamamlaYorum(""); }}
                          className="px-3 py-1.5 bg-[#F7F7F7] text-[#2F2F2F] rounded-lg text-xs hover:bg-[#E5E5E5] transition">
                          Vazgeç
                        </button>
                      </div>
                    </div>
                  )}
                </>
                  )}
                </>
              )}
              {gorev.durum === "tamamlandi" && (
                <span className="text-xs text-[#8FAF9A] font-medium">
                  ✅ {gorev.ortakMi ? `Herkes tamamladı (${gorev.tamamlayanlar?.length || 0}/${gorev.atananlar?.length || 0})` : "Bu görev tamamlandı"}
                </span>
              )}
              {canDelete && (
                <button 
                  onClick={() => { onSil(gorev.id); handleKapat(); }}
                  className="ml-auto px-2.5 py-1.5 text-[#D96C6C] hover:bg-[#D96C6C]/10 rounded-lg text-xs transition">
                  🗑️ Sil
                </button>
              )}
            </div>
          )}

          {/* Yorumlar */}
          <div>
            <h3 className="font-semibold text-[#2F2F2F] text-sm mb-2 flex items-center gap-2">
              💬 Yorumlar
              <span className="text-[10px] bg-[#F7F7F7] px-1.5 py-0.5 rounded-full text-[#8A8A8A]">
                {gorev.yorumlar?.length || 0}
              </span>
            </h3>

            {/* Yorum Listesi */}
            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
              {(!gorev.yorumlar || gorev.yorumlar.length === 0) ? (
                <p className="text-sm text-[#8A8A8A] text-center py-4">Henüz yorum yok. İlk yorumu ekleyin!</p>
              ) : (
                gorev.yorumlar.map((yorum) => (
                  <div key={yorum.id} className="p-3 bg-[#F7F7F7] rounded-lg border border-[#E5E5E5]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[#2F2F2F]">👤 {yorum.yazanAd}</span>
                      <span className="text-[10px] text-[#8A8A8A]">
                        {new Date(yorum.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} {new Date(yorum.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-[#2F2F2F] whitespace-pre-wrap">{yorum.yorum}</p>
                  </div>
                ))
              )}
            </div>

            {/* Yorum Ekle */}
            <div className="flex gap-2">
              <textarea
                value={yeniYorum}
                onChange={e => setYeniYorum(e.target.value)}
                placeholder="Yorum veya not ekleyin... (ne yaptınız, nasıl yaptınız)"
                rows={2}
                className="flex-1 px-3 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm resize-none"
              />
              <button
                onClick={handleYorumGonder}
                disabled={yorumLoading || !yeniYorum.trim()}
                className="px-4 py-2 bg-[#8FAF9A] text-white rounded-lg text-sm font-medium hover:bg-[#7A9E86] disabled:opacity-50 transition self-end"
              >
                {yorumLoading ? "⏳" : "Gönder"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
