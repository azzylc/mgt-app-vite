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
  izinTuru: string;
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
    <div className="space-y-3">
      {/* Şu An Çalışanlar */}
      <div className="bg-white rounded-lg border border-stone-100 overflow-hidden">
        <div className="px-3 py-2 border-b border-stone-50">
          <h2 className="font-medium text-stone-800 flex items-center gap-1.5 text-xs">
            <span>🟢</span> Şu An {aktifPersoneller.length} Kişi Çalışıyor
          </h2>
        </div>
        <div className="p-2.5">
          {aktifPersoneller.length === 0 ? (
            <div className="text-center py-4 text-stone-500">
              <span className="text-2xl">😴</span>
              <p className="mt-1 text-xs">Şu anda aktif çalışan yok</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {aktifPersoneller.map((p) => {
                const personel = tumPersoneller.find(per => per.id === p.personelId);
                return (
                  <div key={p.personelId} className="flex items-center justify-between p-1.5 bg-emerald-50 rounded-md border border-emerald-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{personel?.emoji || "👤"}</span>
                      <span className="text-xs font-medium text-stone-700">{p.personelAd}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-emerald-600 font-medium">Giriş: {p.girisSaati}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bugün Gelenler */}
      <div className="bg-white rounded-lg border border-stone-100 overflow-hidden">
        <div className="px-3 py-2 border-b border-stone-50">
          <h2 className="font-medium text-stone-800 flex items-center gap-1.5 text-xs">
            <span>📋</span> Bugün {bugunGelenler.length} Kişi Geldi
          </h2>
        </div>
        <div className="p-2.5">
          {bugunGelenler.length === 0 ? (
            <div className="text-center py-4 text-stone-500">
              <span className="text-2xl">🕐</span>
              <p className="mt-1 text-xs">Henüz kimse giriş yapmadı</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {bugunGelenler.map((p) => {
                const personel = tumPersoneller.find(per => per.id === p.personelId);
                return (
                  <div key={p.personelId} className="flex items-center justify-between p-1.5 bg-stone-50 rounded-md">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{personel?.emoji || "👤"}</span>
                      <span className="text-xs font-medium text-stone-700">{p.personelAd}</span>
                    </div>
                    <div className="text-right text-[10px]">
                      <p className="text-emerald-600">Giriş: {p.girisSaati}</p>
                      {p.cikisSaati && <p className="text-red-500">Çıkış: {p.cikisSaati}</p>}
                      {!p.cikisSaati && <p className="text-stone-400">Çıkış: -</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* İzinli Olanlar */}
          {izinliler.length > 0 && (
            <div className="mt-2 pt-2 border-t border-stone-100">
              <p className="text-[10px] text-stone-500 mb-1.5">İzinli ({izinliler.length})</p>
              <div className="space-y-1">
                {izinliler.map((izin) => (
                  <div key={izin.id} className="flex items-center justify-between p-1.5 bg-amber-50 rounded-md border border-amber-100">
                    <span className="text-xs font-medium text-amber-800">{izin.personelAd}</span>
                    <span className="text-[10px] text-amber-600">{izin.izinTuru}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
