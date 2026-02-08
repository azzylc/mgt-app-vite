interface PersonelGunlukDurum {
  personelId: string;
  personelAd: string;
  girisSaati: string | null;
  cikisSaati: string | null;
  aktifMi: boolean;
}

interface Personel {
  id: string;
  ad?: string;
  isim?: string;
  emoji?: string;
}

interface IzinKaydi {
  id: string;
  personelAd: string;
  personelSoyad: string;
  personelId: string;
  izinTuru: string;
  baslangic: string;
  bitis: string;
  durum: string;
  gunSayisi: number;
}

interface PersonelDurumPanelProps {
  aktifPersoneller: PersonelGunlukDurum[];
  bugunGelenler: PersonelGunlukDurum[];
  izinliler: IzinKaydi[];
  tumPersoneller: Personel[];
}

export default function PersonelDurumPanel({
  aktifPersoneller,
  bugunGelenler,
  izinliler,
  tumPersoneller
}: PersonelDurumPanelProps) {
  return (
    <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
      {/* Aktif Çalışanlar */}
      <div className="px-3 py-2 border-b border-stone-100 flex items-center gap-2 bg-gradient-to-r from-emerald-50/50 to-transparent">
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
        <span className="text-xs font-semibold text-stone-700">Şu An Çalışıyor</span>
        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">{aktifPersoneller.length}</span>
      </div>
      <div className="p-2.5">
        {aktifPersoneller.length === 0 ? (
          <div className="text-center py-3">
            <span className="text-lg">😴</span>
            <p className="text-stone-400 text-xs mt-1">Aktif çalışan yok</p>
          </div>
        ) : (
          <div className="space-y-1">
            {aktifPersoneller.map((p) => {
              const personel = tumPersoneller.find(per => per.id === p.personelId);
              return (
                <div key={p.personelId} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-emerald-50/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{personel?.emoji || "👤"}</span>
                    <span className="text-xs text-stone-700 font-medium">{p.personelAd}</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-100/50 px-1.5 py-0.5 rounded">{p.girisSaati}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bugün Gelenler */}
      <div className="px-3 py-2 border-t border-b border-stone-100 flex items-center gap-2 bg-gradient-to-r from-sky-50/30 to-transparent">
        <span className="text-sm">📋</span>
        <span className="text-xs font-semibold text-stone-700">Bugün Geldi</span>
        <span className="text-[10px] text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full font-medium">{bugunGelenler.length}</span>
      </div>
      <div className="p-2.5">
        {bugunGelenler.length === 0 ? (
          <p className="text-center py-3 text-stone-400 text-xs">Henüz kimse gelmedi</p>
        ) : (
          <div className="space-y-1">
            {bugunGelenler.map((p) => {
              const personel = tumPersoneller.find(per => per.id === p.personelId);
              return (
                <div key={p.personelId} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-stone-50 transition">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{personel?.emoji || "👤"}</span>
                    <span className="text-xs text-stone-700">{p.personelAd}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-emerald-500 font-medium bg-emerald-50 px-1 py-0.5 rounded">{p.girisSaati}</span>
                    {p.cikisSaati && <span className="text-[10px] text-red-400 font-medium bg-red-50 px-1 py-0.5 rounded">{p.cikisSaati}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {izinliler.length > 0 && (
          <div className="mt-2 pt-2 border-t border-stone-100">
            <p className="text-[10px] text-stone-500 font-semibold mb-1 flex items-center gap-1">
              <span>🏖️</span> İzinli ({izinliler.length})
            </p>
            {izinliler.map((izin) => (
              <div key={izin.id} className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-amber-50/40">
                <span className="text-xs text-stone-600">{izin.personelAd} {izin.personelSoyad}</span>
                <span className="text-[10px] text-amber-500 bg-amber-100/50 px-1.5 py-0.5 rounded font-medium">{izin.izinTuru}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
