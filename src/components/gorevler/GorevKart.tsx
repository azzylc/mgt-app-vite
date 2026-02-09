import { useState } from "react";
import { Gorev, oncelikRenk, durumBadge, durumEmojiyon, durumLabel } from "./types";

interface GorevKartProps {
  gorev: Gorev;
  aktifSekme: string;
  userEmail: string;
  userRole: string;
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

export default function GorevKart({
  gorev,
  aktifSekme,
  userEmail,
  userRole,
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
  const canDelete = userRole === "Kurucu" || userRole === "Yönetici" || gorev.atayan === userEmail;

  return (
    <div
      onClick={() => onDetayAc(gorev)}
      className={`bg-white rounded-xl border border-stone-100 border-l-[3px] ${oncelikRenk(gorev.oncelik)} p-3 transition hover:shadow-md cursor-pointer`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Başlık + Badge'ler */}
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <h3 className="text-xs md:text-sm font-semibold text-stone-800 truncate">{gorev.baslik}</h3>
            {gorev.otomatikMi && (
              <span className="bg-purple-50 text-purple-600 text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0">🤖 Oto</span>
            )}
            {!gorev.otomatikMi && gorev.oncelik && gorev.oncelik !== "normal" && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                gorev.oncelik === "acil" ? "bg-red-50 text-red-600" :
                gorev.oncelik === "yuksek" ? "bg-amber-50 text-amber-600" :
                "bg-sky-50 text-sky-600"
              }`}>
                {gorev.oncelik === "acil" ? "Acil" : gorev.oncelik === "yuksek" ? "Yüksek" : "Düşük"}
              </span>
            )}
          </div>

          {/* Açıklama */}
          {gorev.aciklama && (
            <p className="text-[10px] md:text-xs text-stone-500 mb-1.5 line-clamp-1 break-all">{gorev.aciklama}</p>
          )}

          {/* Meta Bilgiler */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-stone-400">
            {(aktifSekme === "tumgorevler" || aktifSekme === "verdigim") && (
              <div className="flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full">
                <span>🎯</span>
                <span className="font-medium text-emerald-700">Atanan: {gorev.atananAd}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span>👤</span>
              <span>
                {gorev.atayan === "Sistem" ? (
                  <span className="font-medium text-purple-600">Sistem (Otomatik)</span>
                ) : (
                  <span>Atayan: {gorev.atayanAd}</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span>📅</span>
              <span>{gorev.olusturulmaTarihi?.toDate?.().toLocaleDateString('tr-TR')}</span>
            </div>
            {gorev.sonTarih && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${
                new Date(gorev.sonTarih) < new Date() && gorev.durum !== "tamamlandi" 
                  ? "bg-red-50 text-red-600 font-medium" 
                  : "bg-stone-50"
              }`}>
                <span>⏰</span>
                <span>Son: {new Date(gorev.sonTarih).toLocaleDateString('tr-TR')}</span>
              </div>
            )}
            {gorev.gelinId && (
              <div className="flex items-center gap-1">
                <span>💄</span>
                <span className="text-rose-600">Gelin görevi</span>
              </div>
            )}
            {(gorev.yorumlar?.length || 0) > 0 && (
              <div className="flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-full">
                <span>💬</span>
                <span className="text-blue-600 font-medium">{gorev.yorumlar!.length} yorum</span>
              </div>
            )}
          </div>
        </div>

        {/* Durum Badge */}
        <div className="shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${durumBadge(gorev.durum)}`}>
            {durumEmojiyon(gorev.durum)} {durumLabel(gorev.durum)}
          </span>
        </div>
      </div>

      {/* Otomatik görevlerde gelin bilgisi */}
      {gorev.otomatikMi && gorev.gelinId && (
        <div className="mt-2 p-2 bg-purple-50/50 rounded-lg" onClick={e => e.stopPropagation()}>
          {gorev.gelinBilgi ? (
            <button 
              onClick={() => onGelinTikla(gorev.gelinId!)}
              className="w-full flex items-center gap-2 hover:bg-purple-100/50 p-1 rounded-lg transition cursor-pointer text-left"
            >
              <span className="text-sm">💍</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-purple-800 truncate">{gorev.gelinBilgi.isim}</p>
                <p className="text-[10px] text-purple-500">
                  {new Date(gorev.gelinBilgi.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} • {gorev.gelinBilgi.saat}
                </p>
              </div>
              <span className="text-purple-300 text-xs">→</span>
            </button>
          ) : (
            <p className="text-[10px] text-stone-400">Yükleniyor...</p>
          )}
        </div>
      )}

      {/* Manuel görev aksiyon butonları */}
      {!gorev.otomatikMi && gorev.durum !== "tamamlandi" && (
        <div className="mt-2" onClick={e => e.stopPropagation()}>
          {tamamlaGorevId === gorev.id ? (
            <div className="space-y-2">
              <textarea
                value={tamamlaYorum}
                onChange={e => onTamamlaYorumDegistir(e.target.value)}
                placeholder="Ne yaptınız? Kısa bir not bırakın..."
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs resize-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 outline-none"
                rows={2}
                autoFocus
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => onTamamla(gorev.id)}
                  className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition"
                >
                  ✅ Onayla
                </button>
                <button
                  onClick={onTamamlaIptal}
                  className="px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs hover:bg-stone-200 transition"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onTamamlaBasla(gorev.id)}
                className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition"
              >
                ✅ Tamamla
              </button>
              {canDelete && (
                <button
                  onClick={() => onSil(gorev.id)}
                  className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                >
                  🗑️
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tamamlanmış görev */}
      {!gorev.otomatikMi && gorev.durum === "tamamlandi" && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-600" onClick={e => e.stopPropagation()}>
          <span>✅ Tamamlandı</span>
          {gorev.yorumlar && gorev.yorumlar.length > 0 && (
            <span className="text-stone-400">• {gorev.yorumlar.length} yorum</span>
          )}
          {canDelete && (
            <button
              onClick={() => onSil(gorev.id)}
              className="ml-auto p-1 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded transition"
            >
              🗑️
            </button>
          )}
        </div>
      )}
      
      {/* Otomatik görevlerde Yaptım butonu */}
      {gorev.otomatikMi && (
        <div className="mt-2 flex items-center justify-between" onClick={e => e.stopPropagation()}>
          <span className={`text-[10px] italic ${gorev.gorevTuru === "odemeTakip" ? "text-red-400" : "text-purple-400"}`}>
            {gorev.gorevTuru === "odemeTakip" 
              ? '💰 "--" eklenince silinir'
              : "ℹ️ Alan dolunca silinir"}
          </span>
          <button
            onClick={() => onYaptim(gorev)}
            disabled={yaptimLoading === gorev.id}
            className="px-2.5 py-1 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 transition"
          >
            {yaptimLoading === gorev.id ? "⏳..." : "✅ Yaptım"}
          </button>
        </div>
      )}
    </div>
  );
}
