"use client";
import { usePersoneller, getPersonelByIsim } from "../hooks/usePersoneller";

interface Gelin {
  id: string;
  isim: string;
  tarih: string;
  saat: string;
  ucret: number;
  kapora: number;
  kalan: number;
  makyaj: string;
  turban: string;
  kinaGunu?: string;
  telefon?: string;
  esiTelefon?: string;
  instagram?: string;
  fotografci?: string;
  modaevi?: string;
  anlasildigiTarih?: string;
  bilgilendirmeGonderildi?: boolean;
  ucretYazildi?: boolean;
  malzemeListesiGonderildi?: boolean;
  paylasimIzni?: boolean;
  yorumIstesinMi?: string;  // Kişi ismi (örn: "Zehra Kula") veya boş
  yorumIstendiMi?: boolean;
  gelinNotu?: string;
  dekontGorseli?: string;
}

export default function GelinModal({ gelin, onClose }: { gelin: Gelin; onClose: () => void }) {
  const { personeller } = usePersoneller();
  const makyajPersonel = getPersonelByIsim(gelin.makyaj, personeller);
  const turbanPersonel = gelin.turban && gelin.turban !== gelin.makyaj ? getPersonelByIsim(gelin.turban, personeller) : null;
  const formatTarih = (tarih: string) => new Date(tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatDateTime = (tarih: string) => new Date(tarih).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Telefon numarasını WhatsApp formatına çevir (0532xxx → 90532xxx)
  const toWhatsApp = (tel: string) => {
    const temiz = tel.replace(/[\s\-\(\)]/g, '');
    if (temiz.startsWith('+')) return temiz.slice(1);
    if (temiz.startsWith('0')) return '90' + temiz.slice(1);
    if (temiz.startsWith('90')) return temiz;
    return '90' + temiz;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-lg shadow-xl max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 md:p-6">
          <div className="md:hidden w-12 h-1.5 bg-stone-300 rounded-full mx-auto mb-4"></div>
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h3 className="text-lg md:text-xl font-bold text-stone-800 flex items-center gap-2">
              <span>👰</span> Gelin Detayı
            </h3>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-2xl">×</button>
          </div>
          
          <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6 p-3 md:p-4 bg-gradient-to-r from-rose-50 to-purple-50 rounded-lg">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-rose-200 to-purple-200 rounded-lg flex items-center justify-center text-stone-600 text-xl md:text-2xl font-bold">
              {gelin.isim.charAt(0)}
            </div>
            <div>
              <p className="text-lg md:text-xl font-semibold text-stone-800">{gelin.isim}</p>
              <p className="text-sm md:text-base text-stone-600">{formatTarih(gelin.tarih)} • {gelin.saat}</p>
              {gelin.kinaGunu && <p className="text-xs md:text-sm text-stone-500 mt-1">Kına Günü: {gelin.kinaGunu}</p>}
            </div>
          </div>

          <div className="space-y-3 md:space-y-4">
            {gelin.telefon && (
              <div className="bg-blue-50 p-3 md:p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2 md:mb-3 flex items-center gap-2 text-sm md:text-base">
                  <span>📞</span> İletişim Bilgileri
                </h4>
                <div className="space-y-2 text-sm">
                  {gelin.telefon && (
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600 font-medium">Tel:</span>
                      <a href={`tel:${gelin.telefon}`} className="text-blue-700 hover:underline">{gelin.telefon}</a>
                      <a href={`https://wa.me/${toWhatsApp(gelin.telefon)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-7 h-7 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors" title="WhatsApp ile yaz">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </a>
                    </div>
                  )}
                  {gelin.esiTelefon && (
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600 font-medium">Eşi Tel:</span>
                      <a href={`tel:${gelin.esiTelefon}`} className="text-blue-700 hover:underline">{gelin.esiTelefon}</a>
                      <a href={`https://wa.me/${toWhatsApp(gelin.esiTelefon)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-7 h-7 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors" title="WhatsApp ile yaz">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </a>
                    </div>
                  )}
                  {gelin.instagram && (
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600 font-medium">Instagram:</span>
                      <a href={`https://instagram.com/${gelin.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{gelin.instagram}</a>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div className="p-3 md:p-4 bg-rose-50 rounded-lg">
                <p className="text-rose-600 text-xs md:text-sm font-medium mb-2">💄 Makyaj</p>
                {makyajPersonel ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{makyajPersonel.emoji}</span>
                      <span className="font-semibold text-stone-800">{makyajPersonel.isim}</span>
                    </div>
                    {makyajPersonel.instagram && <p className="text-xs text-stone-500 mt-1">{makyajPersonel.instagram}</p>}
                    {makyajPersonel.telefon && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <a href={`tel:${makyajPersonel.telefon}`} className="text-xs text-stone-500 hover:underline">{makyajPersonel.telefon}</a>
                        <a href={`https://wa.me/${toWhatsApp(makyajPersonel.telefon)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-5 h-5 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors" title="WhatsApp">
                          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-stone-500">Atanmamış</p>
                )}
              </div>
              <div className="p-3 md:p-4 bg-purple-50 rounded-lg">
                <p className="text-purple-600 text-xs md:text-sm font-medium mb-2">🧕 Türban</p>
                {turbanPersonel ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-lg md:text-xl">{turbanPersonel.emoji}</span>
                      <span className="font-semibold text-stone-800 text-sm md:text-base">{turbanPersonel.isim}</span>
                    </div>
                    {turbanPersonel.instagram && <p className="text-xs text-stone-500 mt-1">{turbanPersonel.instagram}</p>}
                    {turbanPersonel.telefon && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <a href={`tel:${turbanPersonel.telefon}`} className="text-xs text-stone-500 hover:underline">{turbanPersonel.telefon}</a>
                        <a href={`https://wa.me/${toWhatsApp(turbanPersonel.telefon)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-5 h-5 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors" title="WhatsApp">
                          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </a>
                      </div>
                    )}
                  </>
                ) : makyajPersonel && gelin.turban === gelin.makyaj ? (
                  <p className="text-stone-600 text-xs md:text-sm">Makyaj ile aynı kişi</p>
                ) : (
                  <p className="text-stone-500 text-sm">Atanmamış</p>
                )}
              </div>
            </div>

            {(gelin.fotografci || gelin.modaevi) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {gelin.fotografci && (
                  <div className="bg-orange-50 p-3 md:p-4 rounded-lg">
                    <p className="text-orange-600 text-xs md:text-sm font-medium mb-1">📷 Fotoğrafçı</p>
                    <p className="text-stone-800 font-medium text-sm">{gelin.fotografci}</p>
                  </div>
                )}
                {gelin.modaevi && (
                  <div className="bg-purple-50 p-3 md:p-4 rounded-lg">
                    <p className="text-purple-600 text-xs md:text-sm font-medium mb-1">👗 Modaevi</p>
                    <p className="text-stone-800 font-medium text-sm">{gelin.modaevi}</p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-stone-50 p-3 md:p-4 rounded-lg">
              <h4 className="font-medium text-stone-700 mb-2 md:mb-3 text-sm md:text-base">💰 Ödeme Bilgileri</h4>
              <div className="grid grid-cols-3 gap-2 md:gap-4 mb-3">
                <div>
                  <p className="text-stone-500 text-xs">Ücret</p>
                  <p className="font-bold text-stone-800 text-sm md:text-base">
                    {gelin.ucret === -1 ? <span className="text-stone-400">-</span> : `${gelin.ucret.toLocaleString('tr-TR')} ₺`}
                  </p>
                </div>
                <div>
                  <p className="text-stone-500 text-xs">Kapora</p>
                  <p className="font-bold text-green-600 text-sm md:text-base">{gelin.kapora.toLocaleString('tr-TR')} ₺</p>
                </div>
                <div>
                  <p className="text-stone-500 text-xs">Kalan</p>
                  <p className="font-bold text-red-600 text-sm md:text-base">
                    {gelin.ucret === -1 ? '-' : `${gelin.kalan.toLocaleString('tr-TR')} ₺`}
                  </p>
                </div>
              </div>
              {gelin.anlasildigiTarih && (
                <p className="text-xs text-stone-500">Anlaştığı Tarih: {formatDateTime(gelin.anlasildigiTarih)}</p>
              )}
            </div>

            {/* Takip Listesi - Takvimden Çekilen Checklist */}
            {(() => {
              const checkItems = [
                gelin.bilgilendirmeGonderildi,
                gelin.ucretYazildi,
                gelin.malzemeListesiGonderildi,
                gelin.paylasimIzni,
                !!gelin.yorumIstesinMi,
                gelin.yorumIstendiMi,
              ];
              const tamamlanan = checkItems.filter(Boolean).length;
              const toplam = checkItems.length;
              const yuzde = Math.round((tamamlanan / toplam) * 100);
              return (
            <div className="bg-gradient-to-br from-green-50 to-teal-50 p-3 md:p-4 rounded-lg border border-green-100">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-green-900 flex items-center gap-2 text-sm md:text-base">
                  <span>✅</span> Takip Listesi
                </h4>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tamamlanan === toplam ? 'bg-green-200 text-green-800' : 'bg-amber-100 text-amber-700'}`}>
                  {tamamlanan}/{toplam}
                </span>
              </div>
              <div className="w-full bg-green-200/50 rounded-full h-1.5 mb-3">
                <div className={`h-1.5 rounded-full transition-all ${tamamlanan === toplam ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${yuzde}%` }} />
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className={`text-lg ${gelin.bilgilendirmeGonderildi ? 'opacity-100' : 'opacity-30'}`}>
                    {gelin.bilgilendirmeGonderildi ? '✔️' : '⬜'}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${gelin.bilgilendirmeGonderildi ? 'text-stone-800' : 'text-stone-500'}`}>
                      Bilgilendirme metni gönderildi mi
                    </p>
                    {gelin.bilgilendirmeGonderildi && (
                      <p className="text-[10px] text-amber-600 mt-0.5">✔️ Her gelinin hazırlayan yorum istensin mi kısmını doldurmalı</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <span className={`text-lg ${gelin.ucretYazildi ? 'opacity-100' : 'opacity-30'}`}>
                    {gelin.ucretYazildi ? '✔️' : '⬜'}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${gelin.ucretYazildi ? 'text-stone-800' : 'text-stone-500'}`}>
                      Anlaşılan ve kalan ücret yazıldı mı
                    </p>
                    {gelin.ucretYazildi && (
                      <p className="text-[10px] text-amber-600 mt-0.5">✔️ Her gelinin hazırlayan yorum istensin mi kısmını doldurmalı</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <span className={`text-lg ${gelin.malzemeListesiGonderildi ? 'opacity-100' : 'opacity-30'}`}>
                    {gelin.malzemeListesiGonderildi ? '✔️' : '⬜'}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${gelin.malzemeListesiGonderildi ? 'text-stone-800' : 'text-stone-500'}`}>
                      Malzeme listesi gönderildi mi
                    </p>
                    {gelin.malzemeListesiGonderildi && (
                      <p className="text-[10px] text-amber-600 mt-0.5">✔️ Her gelinin hazırlayan yorum istensin mi kısmını doldurmalı</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <span className={`text-lg ${gelin.paylasimIzni ? 'opacity-100' : 'opacity-30'}`}>
                    {gelin.paylasimIzni ? '✔️' : '⬜'}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${gelin.paylasimIzni ? 'text-stone-800' : 'text-stone-500'}`}>
                      Paylaşım izni var mı
                    </p>
                    {gelin.paylasimIzni && (
                      <p className="text-[10px] text-amber-600 mt-0.5">✔️ Her gelinin hazırlayan yorum istensin mi kısmını doldurmalı</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-green-200 my-3 pt-3">
                  {/* Yorum İstensin Mi - ÖZEL ALAN */}
                  <div className="flex items-start gap-2">
                    <span className={`text-lg ${gelin.yorumIstesinMi ? 'opacity-100' : 'opacity-30'}`}>
                      {gelin.yorumIstesinMi ? '✅' : '⬜'}
                    </span>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${gelin.yorumIstesinMi ? 'text-green-800' : 'text-stone-400'}`}>
                        Yorum istensin mi
                      </p>
                      {gelin.yorumIstesinMi && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                            {gelin.yorumIstesinMi}
                          </span>
                        </div>
                      )}
                      {!gelin.yorumIstesinMi && (
                        <p className="text-xs text-red-600 mt-1 font-medium">
                          ⚠️ Boş! Gelin bitişinden 1 saat sonra makyajcı ve türbancıya otomatik görev atanacak
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Yorum İstendi Mi */}
                  <div className="flex items-start gap-2 mt-2">
                    <span className={`text-lg ${gelin.yorumIstendiMi ? 'opacity-100' : 'opacity-30'}`}>
                      {gelin.yorumIstendiMi ? '✅' : '⬜'}
                    </span>
                    <div>
                      <p className={`text-sm font-medium ${gelin.yorumIstendiMi ? 'text-stone-800' : 'text-stone-500'}`}>
                        Yorum istendi mi
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-green-700 mt-3 italic">
                * Bu bilgiler takvimden otomatik çekilir
              </p>
            </div>
              );
            })()}

            <div className="bg-stone-50 p-3 md:p-4 rounded-lg">
              <h4 className="font-medium text-stone-700 mb-2 text-sm md:text-base">📝 Gelin Notu</h4>
              {gelin.gelinNotu ? (
                <p className="text-stone-700 text-sm whitespace-pre-wrap">{gelin.gelinNotu}</p>
              ) : (
                <p className="text-stone-400 text-sm italic">Henüz not eklenmemiş</p>
              )}
            </div>

            {gelin.dekontGorseli && (
              <div className="bg-emerald-50 p-3 md:p-4 rounded-lg border border-emerald-100">
                <h4 className="font-medium text-emerald-700 mb-2 text-sm md:text-base">🧾 Dekont</h4>
                <a href={gelin.dekontGorseli} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-900 hover:underline font-medium">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Dekont görselini aç
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}