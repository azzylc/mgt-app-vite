import { GorevAyarlari } from "./types";

interface GorevAyarlarPanelProps {
  gorevAyarlari: GorevAyarlari;
  senkronizeLoading: string | null;
  onAyarDegistir: (ayarlar: GorevAyarlari) => void;
  onSenkronizeEt: () => void;
  onKapat: () => void;
}

interface AyarSatirProps {
  emoji: string;
  baslik: string;
  aciklama: string;
  aktif: boolean;
  tarih: string;
  onTarihDegistir: (tarih: string) => void;
}

function AyarSatir({ emoji, baslik, aciklama, aktif, tarih, onTarihDegistir }: AyarSatirProps) {
  return (
    <div className={`p-3 rounded-lg border ${aktif ? "border-[#8FAF9A] bg-[#EAF2ED]" : "border-[#E5E5E5] bg-[#F7F7F7]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-lg">{emoji}</span>
          <div>
            <h3 className="font-semibold text-[#2F2F2F] text-sm">{baslik}</h3>
            <p className="text-xs text-[#8A8A8A]">{aciklama}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date" min="2020-01-01" max="2099-12-31"
            value={tarih}
            onChange={(e) => onTarihDegistir(e.target.value)}
            className="px-2 py-1 border border-[#E5E5E5] rounded text-sm w-36"
          />
          {aktif && (
            <span className="px-2 py-0.5 bg-[#8FAF9A] text-white text-xs rounded-full">✓</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GorevAyarlarPanel({
  gorevAyarlari,
  senkronizeLoading,
  onAyarDegistir,
  onSenkronizeEt,
  onKapat,
}: GorevAyarlarPanelProps) {
  const ayarGuncelle = (key: keyof GorevAyarlari, tarih: string) => {
    onAyarDegistir({
      ...gorevAyarlari,
      [key]: { ...gorevAyarlari[key], baslangicTarihi: tarih }
    });
  };

  return (
    <div className="mb-4 bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
      <div className="bg-[#2F2F2F] text-white px-4 py-2.5 flex items-center justify-between">
        <h2 className="font-bold text-sm">⚙️ Otomatik Görev Ayarları</h2>
        <button onClick={onKapat} className="text-[#8A8A8A] hover:text-white">✕</button>
      </div>
      
      <div className="p-4 space-y-4">
        <AyarSatir
          emoji="📝"
          baslik="Yorum İstensin Mi"
          aciklama="Düğünü geçmiş + alan boş → Makyajcı/Türbancıya görev"
          aktif={gorevAyarlari?.yorumIstesinMi?.aktif}
          tarih={gorevAyarlari?.yorumIstesinMi?.baslangicTarihi}
          onTarihDegistir={(t) => ayarGuncelle("yorumIstesinMi", t)}
        />
        <AyarSatir
          emoji="📸"
          baslik="Paylaşım İzni Var Mı"
          aciklama="Düğünü geçmiş + alan boş → Makyajcı/Türbancıya görev"
          aktif={gorevAyarlari?.paylasimIzni?.aktif}
          tarih={gorevAyarlari?.paylasimIzni?.baslangicTarihi}
          onTarihDegistir={(t) => ayarGuncelle("paylasimIzni", t)}
        />
        <AyarSatir
          emoji="💬"
          baslik="Yorum İstendi Mi"
          aciklama="Düğünü geçmiş + alan boş → Makyajcı/Türbancıya görev"
          aktif={gorevAyarlari?.yorumIstendiMi?.aktif}
          tarih={gorevAyarlari?.yorumIstendiMi?.baslangicTarihi}
          onTarihDegistir={(t) => ayarGuncelle("yorumIstendiMi", t)}
        />
        <AyarSatir
          emoji="💰"
          baslik="Ödeme Takip"
          aciklama="Düğünü geçmiş + ödeme alınmamış → Yöneticilere acil görev"
          aktif={gorevAyarlari?.odemeTakip?.aktif}
          tarih={gorevAyarlari?.odemeTakip?.baslangicTarihi}
          onTarihDegistir={(t) => ayarGuncelle("odemeTakip", t)}
        />

        {/* Senkronize Butonu */}
        <div className="pt-3 border-t border-[#E5E5E5]">
          <button
            onClick={onSenkronizeEt}
            disabled={senkronizeLoading !== null}
            className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {senkronizeLoading ? "⏳ İşleniyor..." : "🔄 Tümünü Kaydet & Senkronize Et"}
          </button>
          <p className="text-xs text-[#8A8A8A] mt-2 text-center">
            Belirlediğiniz tarihten bugüne kadarki gelinler kontrol edilir. Gelecek gelinler hesaba katılmaz.
          </p>
          <p className="text-xs text-purple-600 mt-1 text-center font-medium">
            🔄 Senkronize ettikten sonra sistem saatte bir otomatik kontrol yapacaktır. Alan doldurulunca görevler anında silinir.
          </p>
        </div>
      </div>
    </div>
  );
}
