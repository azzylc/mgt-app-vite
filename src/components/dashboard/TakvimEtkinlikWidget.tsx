import { useMemo } from "react";
import { getYaklasanTatiller, getYaklasanDogumGunleri, getYaklasanAnmaGunleri } from "../../lib/data";

interface PersonelBasic {
  id: string;
  ad: string;
  soyad: string;
  dogumTarihi?: string;
  dogumGunu?: string;
  emoji?: string;
  aktif: boolean;
}

interface Props {
  personeller: PersonelBasic[];
}

export default function TakvimEtkinlikWidget({ personeller }: Props) {
  const tatiller = useMemo(() => getYaklasanTatiller(), []);
  const anmaGunleri = useMemo(() => getYaklasanAnmaGunleri(), []);
  const dogumGunleri = useMemo(() => {
    // dogumGunu veya dogumTarihi field'ını normalize et
    const normalized = personeller.map(p => ({
      ...p,
      dogumTarihi: p.dogumTarihi || (p as any).dogumGunu || ""
    }));
    return getYaklasanDogumGunleri(normalized);
  }, [personeller]);

  // Hiçbir şey yoksa gösterme
  if (tatiller.length === 0 && anmaGunleri.length === 0 && dogumGunleri.length === 0) return null;

  const formatTarih = (tarihStr: string) => {
    const d = new Date(tarihStr + "T00:00:00");
    const gun = d.getDate();
    const ay = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"][d.getMonth()];
    const gunAdi = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"][d.getDay()];
    return `${gun} ${ay} ${gunAdi}`;
  };

  const kalanGunLabel = (tarihStr: string) => {
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);
    const hedef = new Date(tarihStr + "T00:00:00");
    const kalan = Math.floor((hedef.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
    if (kalan === 0) return "Bugün!";
    if (kalan === 1) return "Yarın";
    return `${kalan} gün`;
  };

  const kalanGunRenk = (tarihStr: string) => {
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);
    const hedef = new Date(tarihStr + "T00:00:00");
    const kalan = Math.floor((hedef.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
    if (kalan === 0) return "text-green-600 bg-green-50 font-bold";
    if (kalan <= 3) return "text-amber-600 bg-amber-50";
    if (kalan <= 7) return "text-blue-600 bg-blue-50";
    return "text-stone-500 bg-stone-50";
  };

  return (
    <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100 flex items-center gap-2 bg-gradient-to-r from-emerald-50/50 to-transparent">
        <span className="text-sm">📅</span>
        <span className="text-xs font-semibold text-stone-700">Yaklaşan Etkinlikler</span>
      </div>
      <div className="p-2.5 space-y-2 max-h-[220px] overflow-y-auto">

        {/* Resmi Tatiller */}
        {tatiller.slice(0, 3).map((t) => (
          <div key={t.tarih} className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-red-50/40">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
              <span className="text-xs">🏖️</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-stone-700 font-medium truncate">{t.isim}</p>
              <p className="text-[10px] text-stone-400">
                {formatTarih(t.tarih)}
                {t.sure > 1 && ` (${t.sure} gün)`}
              </p>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${kalanGunRenk(t.tarih)}`}>
              {kalanGunLabel(t.tarih)}
            </span>
          </div>
        ))}

        {/* Anma / Yas Günleri */}
        {anmaGunleri.slice(0, 3).map((a) => (
          <div key={a.tarihStr} className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-stone-50/60">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-stone-200 flex items-center justify-center">
              <span className="text-xs">{a.emoji}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-stone-700 font-medium truncate">{a.isim}</p>
              <p className="text-[10px] text-stone-400">{formatTarih(a.tarihStr)}</p>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              a.kalanGun === 0 ? "text-stone-700 bg-stone-200 font-bold" :
              a.kalanGun <= 3 ? "text-stone-600 bg-stone-100" :
              "text-stone-500 bg-stone-50"
            }`}>
              {a.kalanGun === 0 ? "Bugün" : a.kalanGun === 1 ? "Yarın" : `${a.kalanGun} gün`}
            </span>
          </div>
        ))}

        {/* Doğum Günleri */}
        {dogumGunleri.slice(0, 5).map((d) => (
          <div key={d.id} className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-pink-50/40">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-pink-100 flex items-center justify-center">
              <span className="text-xs">🎂</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-stone-700 font-medium truncate">{d.isim}</p>
              <p className="text-[10px] text-stone-400">{formatTarih(d.yaklasanTarih)}</p>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              d.kalanGun === 0 ? "text-pink-600 bg-pink-100 font-bold animate-pulse" :
              d.kalanGun <= 3 ? "text-pink-600 bg-pink-50" :
              d.kalanGun <= 7 ? "text-amber-600 bg-amber-50" :
              "text-stone-500 bg-stone-50"
            }`}>
              {d.kalanGun === 0 ? "🎉 Bugün!" : d.kalanGun === 1 ? "Yarın" : `${d.kalanGun} gün`}
            </span>
          </div>
        ))}

        {/* Hiçbir şey yoksa (normalde yukarıda return null var ama fallback) */}
        {tatiller.length === 0 && anmaGunleri.length === 0 && dogumGunleri.length === 0 && (
          <p className="text-[10px] text-stone-400 text-center py-2">Yaklaşan etkinlik yok</p>
        )}
      </div>
    </div>
  );
}
