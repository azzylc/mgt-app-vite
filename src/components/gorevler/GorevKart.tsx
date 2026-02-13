import { Gorev, oncelikRenk, durumBadge, durumEmojiyon, durumLabel, toDateSafe } from "./types";

interface GorevKartProps {
  gorev: Gorev;
  aktifSekme: string;
  userEmail: string;
  userRole: string;
  gorevSilmeYetkisi: string;
  tamamlaGorevId: string | null;
  tamamlaYorum: string;
  yaptimLoading: string | null;
  onDetayAc: (gorev: Gorev) => void;
  onTamamlaBasla: (gorevId: string) => void;
  onTamamlaIptal: () => void;
  onTamamlaYorumDegistir: (yorum: string) => void;
  onTamamla: (gorevId: string) => void;
  onSil: (gorevId: string) => void;
  onYaptim: (gorev: Gorev) => void;
  onGelinTikla: (gelinId: string) => void;
}

// Tarih kısaltma: "13 Şub" formatı
function kisaTarih(tarihStr: string): string {
  try {
    return new Date(tarihStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch { return tarihStr; }
}

// Gecikmiş mi?
function gecikmisMi(sonTarih?: string, durum?: string): boolean {
  if (!sonTarih || durum === "tamamlandi") return false;
  return new Date(sonTarih) < new Date();
}

export default function GorevKart({
  gorev,
  aktifSekme,
  userEmail,
  userRole,
  gorevSilmeYetkisi,
  tamamlaGorevId,
  tamamlaYorum,
  yaptimLoading,
  onDetayAc,
  onTamamlaBasla,
  onTamamlaIptal,
  onTamamlaYorumDegistir,
  onTamamla,
  onSil,
  onYaptim,
  onGelinTikla,
}: GorevKartProps) {
  const canDelete = (() => {
    if (gorevSilmeYetkisi === "sadece_kurucu") return userRole === "Kurucu";
    if (gorevSilmeYetkisi === "yonetici") return userRole === "Kurucu" || userRole === "Yönetici" || gorev.atayan === userEmail;
    // "atayan_kurucu" (default)
    return userRole === "Kurucu" || gorev.atayan === userEmail;
  })();
  const geciken = gecikmisMi(gorev.sonTarih, gorev.durum);

  // Tamamla textarea açıksa geniş göster
  if (tamamlaGorevId === gorev.id) {
    return (
      <div className={`bg-white rounded-xl border border-[#8FAF9A] border-l-[3px] ${oncelikRenk(gorev.oncelik)} p-3`}>
        <p className="text-xs font-semibold text-[#2F2F2F] mb-2">{gorev.baslik}</p>
        <div className="space-y-2" onClick={e => e.stopPropagation()}>
          <textarea
            value={tamamlaYorum}
            onChange={e => onTamamlaYorumDegistir(e.target.value)}
            placeholder="Ne yaptınız? Kısa bir not bırakın..."
            className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg text-xs resize-none focus:ring-2 focus:ring-[#8FAF9A]/30 focus:border-[#8FAF9A] outline-none"
            rows={2}
            autoFocus
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => onTamamla(gorev.id)}
              className="px-3 py-1.5 bg-[#8FAF9A] text-white rounded-lg text-xs font-medium hover:bg-[#7A9E86] transition"
            >
              ✅ Onayla
            </button>
            <button
              onClick={onTamamlaIptal}
              className="px-3 py-1.5 bg-[#F7F7F7] text-[#2F2F2F] rounded-lg text-xs hover:bg-[#E5E5E5] transition"
            >
              Vazgeç
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onDetayAc(gorev)}
      className={`group bg-white rounded-xl border border-[#E5E5E5] border-l-[3px] ${oncelikRenk(gorev.oncelik)} px-3 py-2.5 transition hover:shadow-md cursor-pointer`}
    >
      {/* Satır 1: Başlık + Badge'ler + Durum */}
      <div className="flex items-center gap-1.5 min-w-0">
        <h3 className="text-xs md:text-sm font-semibold text-[#2F2F2F] truncate flex-1 min-w-0">
          {gorev.baslik}
        </h3>

        {/* Mini badge'ler */}
        {gorev.otomatikMi && (
          <span className="bg-purple-50 text-purple-600 text-[9px] px-1 py-px rounded-full font-medium shrink-0">🤖</span>
        )}
        {gorev.ortakMi && (
          <span className="bg-violet-50 text-violet-600 text-[9px] px-1 py-px rounded-full font-medium shrink-0">
            👥{gorev.atananlar?.length || 0}
          </span>
        )}
        {!gorev.otomatikMi && gorev.oncelik === "acil" && (
          <span className="bg-[#D96C6C]/10 text-[#D96C6C] text-[9px] px-1 py-px rounded-full font-medium shrink-0">🔴</span>
        )}
        {!gorev.otomatikMi && gorev.oncelik === "yuksek" && (
          <span className="bg-amber-50 text-amber-600 text-[9px] px-1 py-px rounded-full font-medium shrink-0">🟠</span>
        )}
        {(gorev.yorumlar?.length || 0) > 0 && (
          <span className="text-[9px] text-blue-500 shrink-0">💬{gorev.yorumlar!.length}</span>
        )}

        {/* Durum Badge */}
        <span className={`px-1.5 py-px rounded-full text-[9px] font-medium shrink-0 ${durumBadge(gorev.durum)}`}>
          {durumEmojiyon(gorev.durum)} {durumLabel(gorev.durum)}
        </span>
      </div>

      {/* Satır 2: Meta bilgiler — tek satır, · ile ayrılmış */}
      <div className="flex items-center gap-1 mt-1 text-[10px] text-[#8A8A8A] min-w-0 flex-wrap">
        {/* Atanan (sadece tüm görevler / verdiğim sekmesinde) */}
        {(aktifSekme === "tumgorevler" || aktifSekme === "verdigim") && !gorev.ortakMi && (
          <>
            <span className="text-[#8FAF9A] font-medium truncate max-w-[100px]">🎯 {gorev.atananAd}</span>
            <span>·</span>
          </>
        )}
        {gorev.ortakMi && gorev.atananlar && (
          <>
            <span className="text-violet-600 font-medium">
              {(gorev.tamamlayanlar?.length || 0)}/{gorev.atananlar.length} tamamladı
            </span>
            <span>·</span>
          </>
        )}

        {/* Atayan */}
        <span className="truncate max-w-[90px]">
          {gorev.atayan === "Sistem" ? (
            <span className="text-purple-500 font-medium">🤖 Sistem</span>
          ) : (
            <>👤 {gorev.atayanAd}</>
          )}
        </span>

        {/* Oluşturma tarihi */}
        <span>·</span>
        <span>📅 {toDateSafe(gorev.olusturulmaTarihi)?.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</span>

        {/* Son tarih */}
        {gorev.sonTarih && (
          <>
            <span>·</span>
            <span className={geciken ? "text-[#D96C6C] font-semibold" : ""}>
              ⏰ {kisaTarih(gorev.sonTarih)}{geciken && " ⚠️"}
            </span>
          </>
        )}

        {/* Gelin (kompakt — tıklanabilir) */}
        {gorev.gelinId && gorev.gelinBilgi && (
          <>
            <span>·</span>
            <button
              onClick={e => { e.stopPropagation(); onGelinTikla(gorev.gelinId!); }}
              className="text-rose-500 font-medium hover:underline truncate max-w-[100px]"
            >
              💍 {gorev.gelinBilgi.isim}
            </button>
          </>
        )}
        {gorev.gelinId && !gorev.gelinBilgi && (
          <>
            <span>·</span>
            <span className="text-rose-400">💍 Gelin görevi</span>
          </>
        )}
      </div>

      {/* Açıklama — varsa tek satır */}
      {gorev.aciklama && (
        <p className="text-[10px] text-[#8A8A8A] mt-1 line-clamp-1 break-all">{gorev.aciklama}</p>
      )}

      {/* Aksiyon butonları — kompakt satır */}
      <div className="mt-1.5 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {/* Manuel görev aksiyonları */}
        {!gorev.otomatikMi && gorev.durum !== "tamamlandi" && (
          <>
            {gorev.ortakMi && gorev.tamamlayanlar?.includes(userEmail) ? (
              <span className="text-[10px] text-[#8FAF9A] font-medium">✅ Siz tamamladınız</span>
            ) : (
              <button
                onClick={() => onTamamlaBasla(gorev.id)}
                className="px-2.5 py-1 bg-[#8FAF9A] text-white rounded-lg text-[10px] font-medium hover:bg-[#7A9E86] transition"
              >
                ✅ Tamamla
              </button>
            )}
          </>
        )}

        {/* Tamamlanmış görev */}
        {!gorev.otomatikMi && gorev.durum === "tamamlandi" && (
          <span className="text-[10px] text-[#8FAF9A] font-medium">
            ✅ {gorev.ortakMi ? `${gorev.tamamlayanlar?.length || 0}/${gorev.atananlar?.length || 0} tamamlandı` : "Tamamlandı"}
          </span>
        )}

        {/* Otomatik görev Yaptım butonu */}
        {gorev.otomatikMi && (
          <>
            <span className={`text-[10px] italic ${gorev.gorevTuru === "odemeTakip" ? "text-[#D96C6C]" : "text-purple-400"}`}>
              {gorev.gorevTuru === "odemeTakip" ? '💰 "--" ile silinir' : "ℹ️ Alan dolunca silinir"}
            </span>
            <button
              onClick={() => onYaptim(gorev)}
              disabled={yaptimLoading === gorev.id}
              className="ml-auto px-2.5 py-1 bg-[#8FAF9A] text-white rounded-lg text-[10px] font-medium hover:bg-[#7A9E86] disabled:opacity-50 transition"
            >
              {yaptimLoading === gorev.id ? "⏳..." : "✅ Yaptım"}
            </button>
          </>
        )}

        {/* Sil butonu — hover'da görünür */}
        {canDelete && !gorev.otomatikMi && (
          <button
            onClick={() => onSil(gorev.id)}
            className="ml-auto p-1 text-[#8A8A8A] hover:text-[#D96C6C] hover:bg-[#D96C6C]/10 rounded-lg transition opacity-0 group-hover:opacity-100"
            title="Görevi sil"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}
