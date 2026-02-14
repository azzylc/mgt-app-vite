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
  bugunGelenler,
  izinliler,
  tumPersoneller
}: PersonelDurumPanelProps) {
  const calisanlar = bugunGelenler.filter(p => p.aktifMi);
  const cikanlar = bugunGelenler.filter(p => !p.aktifMi && p.cikisSaati);

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
      {/* Bugün Geldi Header */}
      <div className="px-3 py-2 border-b border-[#E5E5E5] flex items-center gap-2 bg-gradient-to-r from-[#EAF2ED] to-transparent">
        <span className="text-sm">📋</span>
        <span className="text-xs font-semibold text-[#2F2F2F]">Bugün Geldi</span>
        <span className="text-[10px] text-[#8FAF9A] bg-[#EAF2ED] px-1.5 py-0.5 rounded-full font-medium">{bugunGelenler.length}</span>
      </div>

      <div className="p-2.5">
        {bugunGelenler.length === 0 ? (
          <div className="text-center py-3">
            <span className="text-lg">😴</span>
            <p className="text-[#8A8A8A] text-xs mt-1">Henüz kimse gelmedi</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Çalışıyor (yeşil arka plan, üstte) */}
            {calisanlar.map((p) => {
              const personel = tumPersoneller.find(per => per.id === p.personelId);
              return (
                <div key={p.personelId} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#EAF2ED]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#8FAF9A] rounded-full animate-pulse flex-shrink-0"></span>
                    <span className="text-xs">{personel?.emoji || "👤"}</span>
                    <span className="text-xs text-[#2F2F2F] font-medium">{p.personelAd}</span>
                  </div>
                  <span className="text-[10px] text-[#8FAF9A] font-semibold">{p.girisSaati}</span>
                </div>
              );
            })}

            {/* Çıktı (normal arka plan, altta) */}
            {cikanlar.map((p) => {
              const personel = tumPersoneller.find(per => per.id === p.personelId);
              return (
                <div key={p.personelId} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#F7F7F7]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#E5E5E5] rounded-full flex-shrink-0"></span>
                    <span className="text-xs">{personel?.emoji || "👤"}</span>
                    <span className="text-xs text-[#8A8A8A]">{p.personelAd}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#8A8A8A] font-medium">{p.girisSaati}</span>
                    <span className="text-[10px] text-[#8A8A8A]">→</span>
                    <span className="text-[10px] text-[#D96C6C] font-medium">{p.cikisSaati}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* İzinliler */}
        {izinliler.length > 0 && (
          <div className="mt-2 pt-2 border-t border-[#E5E5E5]">
            <p className="text-[10px] text-[#8A8A8A] font-semibold mb-1 flex items-center gap-1">
              <span>🏖️</span> İzinli ({izinliler.length})
            </p>
            {izinliler.map((izin) => (
              <div key={izin.id} className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-[#EAF2ED]">
                <span className="text-xs text-[#2F2F2F]">{izin.personelAd} {izin.personelSoyad}</span>
                <span className="text-[10px] text-[#E6B566] bg-[#EAF2ED] px-1.5 py-0.5 rounded font-medium">{izin.izinTuru}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}