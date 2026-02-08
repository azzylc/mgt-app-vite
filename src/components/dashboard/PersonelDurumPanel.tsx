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
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}>
      {/* Aktif Çalışanlar */}
      <div className="px-3 py-2 border-b border-stone-50 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
        <span className="text-xs font-semibold text-stone-700">Şu An Çalışıyor</span>
        <span className="text-[10px] text-stone-400">{aktifPersoneller.length}</span>
      </div>
      <div className="p-2.5">
        {aktifPersoneller.length === 0 ? (
          <p className="text-center py-3 text-stone-400 text-xs">Aktif çalışan yok</p>
        ) : (
          <div className="space-y-1">
            {aktifPersoneller.map((p) => {
              const personel = tumPersoneller.find(per => per.id === p.personelId);
              return (
                <div key={p.personelId} className="flex items-center justify-between py-1 px-2 rounded-lg bg-emerald-50/50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{personel?.emoji || "👤"}</span>
                    <span className="text-xs text-stone-700">{p.personelAd}</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-medium">{p.girisSaati}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bugün Gelenler */}
      <div className="px-3 py-2 border-t border-b border-stone-50 flex items-center gap-2">
        <span className="text-xs font-semibold text-stone-700">Bugün Geldi</span>
        <span className="text-[10px] text-stone-400">{bugunGelenler.length}</span>
      </div>
      <div className="p-2.5">
        {bugunGelenler.length === 0 ? (
          <p className="text-center py-3 text-stone-400 text-xs">Henüz kimse gelmedi</p>
        ) : (
          <div className="space-y-1">
            {bugunGelenler.map((p) => {
              const personel = tumPersoneller.find(per => per.id === p.personelId);
              return (
                <div key={p.personelId} className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-stone-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{personel?.emoji || "👤"}</span>
                    <span className="text-xs text-stone-700">{p.personelAd}</span>
                  </div>
                  <div className="text-[10px] text-right">
                    <span className="text-emerald-600">{p.girisSaati}</span>
                    {p.cikisSaati && <span className="text-red-400 ml-1.5">{p.cikisSaati}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {izinliler.length > 0 && (
          <div className="mt-2 pt-2 border-t border-stone-50">
            <p className="text-[10px] text-stone-400 mb-1">İzinli ({izinliler.length})</p>
            {izinliler.map((izin) => (
              <div key={izin.id} className="flex items-center justify-between py-1 px-2 rounded-lg bg-amber-50/50">
                <span className="text-xs text-stone-600">{izin.personelAd} {izin.personelSoyad}</span>
                <span className="text-[10px] text-amber-500">{izin.izinTuru}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
