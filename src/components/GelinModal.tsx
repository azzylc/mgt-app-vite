"use client";
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { usePersoneller, getPersonelByIsim } from "../hooks/usePersoneller";

interface Gelin {
  id: string;
  isim: string;
  tarih: string;
  saat: string;
  bitisSaati?: string;
  ucret: number;
  kapora: number;
  kalan: number;
  makyaj: string;
  turban: string;
  firma?: string;
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
  yorumIstesinMi?: string;
  yorumIstendiMi?: boolean;
  gelinNotu?: string;
  dekontGorseli?: string;
  sacModeliBelirlendi?: boolean;
  provaTermini?: string;
  provaTarihiBelirlendi?: boolean;
  etkinlikTuru?: string;
  cekimUcretiAlindi?: boolean;
  fotografPaylasimIzni?: boolean;
  ciftinIsiBitti?: boolean;
  dosyaSahipligiAktarildi?: boolean;
  ekHizmetler?: string;
  merasimTarihi?: string;
  gelinlikci?: string;
  kuafor?: string;
}

interface CheckItem {
  label: string;
  checked: boolean;
  value?: string;
  warn?: boolean;
  warnText?: string;
  subText?: string;
}

function getChecklistItems(gelin: Gelin): CheckItem[] {
  const firma = gelin.firma || 'GYS';
  if (firma === 'TCB') {
    return [
      { label: 'Bilgilendirme metni gönderildi mi', checked: !!gelin.bilgilendirmeGonderildi },
      { label: 'Anlaşılan ve kalan ücret yazıldı mı', checked: !!gelin.ucretYazildi },
      { label: 'Saç modeli belirlendi mi', checked: !!gelin.sacModeliBelirlendi },
      { label: 'Paylaşım izni var mı', checked: !!gelin.paylasimIzni },
      { label: 'Prova tercihi', checked: !!gelin.provaTermini, value: gelin.provaTermini || '' },
      { label: 'Prova tarihi belirlendi mi', checked: !!gelin.provaTarihiBelirlendi },
    ];
  }
  if (firma === 'MG') {
    return [
      { label: 'Müşteriye bilgilendirme metni gönderildi mi', checked: !!gelin.bilgilendirmeGonderildi },
      { label: 'Çekim ücreti alındı mı', checked: !!gelin.cekimUcretiAlindi },
      { label: 'Fotoğraf paylaşım izni', checked: !!gelin.fotografPaylasimIzni },
      { label: 'Çiftin işi bitti mi', checked: !!gelin.ciftinIsiBitti },
      { label: 'Dosya sahipliği aktarıldı mı', checked: !!gelin.dosyaSahipligiAktarildi },
      { label: 'Ek hizmetler', checked: !!gelin.ekHizmetler, value: gelin.ekHizmetler || '' },
    ];
  }
  return [
    { label: 'Bilgilendirme metni gönderildi mi', checked: !!gelin.bilgilendirmeGonderildi },
    { label: 'Anlaşılan ve kalan ücret yazıldı mı', checked: !!gelin.ucretYazildi },
    { label: 'Malzeme listesi gönderildi mi', checked: !!gelin.malzemeListesiGonderildi },
    { label: 'Paylaşım izni var mı', checked: !!gelin.paylasimIzni },
  ];
}

// WhatsApp helper
function toWhatsApp(tel: string) {
  const temiz = tel.replace(/[\s\-\(\)]/g, '');
  if (temiz.startsWith('+')) return temiz.slice(1);
  if (temiz.startsWith('0')) return '90' + temiz.slice(1);
  if (temiz.startsWith('90')) return temiz;
  return '90' + temiz;
}

const WaIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.121.553 4.114 1.519 5.847L.525 23.499l5.767-.991A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.82c-1.997 0-3.87-.557-5.47-1.522l-.392-.234-3.422.588.604-3.347-.258-.41A9.785 9.785 0 012.18 12c0-5.422 4.398-9.82 9.82-9.82 5.422 0 9.82 4.398 9.82 9.82 0 5.422-4.398 9.82-9.82 9.82z"/>
  </svg>
);

function PersonelBadge({ label, personelIsim, personeller }: {
  label: string; personelIsim: string; personeller: any[];
}) {
  const personel = getPersonelByIsim(personelIsim, personeller);
  if (!personelIsim && !personel) return null;
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-6 h-6 rounded-full bg-[#F7F7F7] flex items-center justify-center text-xs">
        {personel?.emoji || personelIsim?.charAt(0) || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-[#8A8A8A] uppercase tracking-wider leading-none">{label}</p>
        <p className="text-xs font-medium text-[#2F2F2F] truncate">{personel?.isim || personelIsim}</p>
      </div>
    </div>
  );
}

export default function GelinModal({ gelin: initialGelin, onClose }: { gelin: Gelin; onClose: () => void }) {
  const { personeller } = usePersoneller();
  const [gelin, setGelin] = useState<Gelin>(initialGelin);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "gelinler", initialGelin.id), (snapshot) => {
      if (snapshot.exists()) {
        setGelin({ id: snapshot.id, ...snapshot.data() } as Gelin);
      }
    });
    return () => unsubscribe();
  }, [initialGelin.id]);

  const firma = gelin.firma || 'GYS';
  const isMG = firma === 'MG';

  const checkItems = getChecklistItems(gelin);
  const yorumItems: CheckItem[] = [
    { label: 'Yorum istensin mi', checked: !!gelin.yorumIstesinMi, value: gelin.yorumIstesinMi || '', warn: !gelin.yorumIstesinMi, warnText: 'Otomatik görev atanacak' },
    { label: 'Yorum istendi mi', checked: !!gelin.yorumIstendiMi },
  ];
  const allItems = [...checkItems, ...yorumItems];
  const tamamlanan = allItems.filter(i => i.checked).length;
  const toplam = allItems.length;
  const yuzde = Math.round((tamamlanan / toplam) * 100);

  const formatTarih = (t: string) => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });

  const accent = firma === 'TCB' ? 'violet' : firma === 'MG' ? 'amber' : 'rose';
  const accentMap: Record<string, { bg: string; text: string; badge: string }> = {
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700' },
    amber: { bg: 'bg-[#EAF2ED]', text: 'text-[#2F2F2F]', badge: 'bg-[#EAF2ED] text-[#2F2F2F]' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-700' },
  };
  const c = accentMap[accent];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-end md:items-center justify-center z-50 md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] md:max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Drag handle (mobile) */}
        <div className="md:hidden w-10 h-1 bg-[#E5E5E5] rounded-full mx-auto mt-2.5 mb-1" />

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pb-4">

          {/* Header */}
          <div className="sticky top-0 bg-white pt-3 pb-3 z-10">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {firma !== 'GYS' && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.badge}`}>{firma}</span>
                  )}
                  {gelin.etkinlikTuru && (
                    <span className="text-[10px] text-[#8A8A8A]">{gelin.etkinlikTuru}</span>
                  )}
                </div>
                <h2 className="text-base font-bold text-[#2F2F2F] tracking-tight truncate">{gelin.isim}</h2>
                <p className="text-xs text-[#8A8A8A] mt-0.5">
                  {formatTarih(gelin.tarih)} · {gelin.saat}{gelin.bitisSaati ? `–${gelin.bitisSaati}` : ''}
                </p>
                {gelin.kinaGunu && <p className="text-xs text-[#8A8A8A] mt-0.5">Kına: {gelin.kinaGunu}</p>}
                {gelin.merasimTarihi && <p className="text-xs text-[#8A8A8A] mt-0.5">Merasim: {gelin.merasimTarihi}</p>}
              </div>
              <button onClick={onClose} className="ml-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F7F7F7] text-[#8A8A8A] hover:text-[#2F2F2F] transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Progress ring */}
          <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${c.bg} mb-3`}>
            <div className="relative w-8 h-8">
              <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="text-[#8A8A8A]" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className={c.text} strokeWidth="3"
                  strokeDasharray={`${yuzde} 100`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#2F2F2F]">{yuzde}%</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#2F2F2F]">Takip Durumu</p>
              <p className="text-[11px] text-[#8A8A8A]">{tamamlanan}/{toplam} tamamlandı</p>
            </div>
          </div>

          {/* Ekip */}
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1 px-1">Ekip</p>
            <div className="bg-[#F7F7F7] rounded-xl px-3 divide-y divide-[#E5E5E5]">
              {isMG ? (
                <>
                  <PersonelBadge label="Gelinlikçi" personelIsim={gelin.gelinlikci || ''} personeller={personeller} />
                  <PersonelBadge label="Kuaför" personelIsim={gelin.kuafor || ''} personeller={personeller} />
                </>
              ) : (
                <>
                  <PersonelBadge label="Makyaj" personelIsim={gelin.makyaj} personeller={personeller} />
                  <PersonelBadge label="Türban" personelIsim={gelin.turban} personeller={personeller} />
                  {gelin.fotografci && <PersonelBadge label="Fotoğrafçı" personelIsim={gelin.fotografci} personeller={personeller} />}
                  {gelin.modaevi && <PersonelBadge label="Modaevi" personelIsim={gelin.modaevi} personeller={personeller} />}
                </>
              )}
            </div>
          </div>

          {/* İletişim */}
          {(gelin.telefon || gelin.esiTelefon || gelin.instagram) && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1 px-1">İletişim</p>
              <div className="bg-[#F7F7F7] rounded-xl px-3 divide-y divide-[#E5E5E5]">
                {gelin.telefon && (
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-[10px] text-[#8A8A8A]">{isMG ? 'Gelin' : 'Telefon'}</p>
                      <a href={`tel:${gelin.telefon}`} className="text-xs font-medium text-[#2F2F2F]">{gelin.telefon}</a>
                    </div>
                    <a href={`https://wa.me/${toWhatsApp(gelin.telefon)}`} target="_blank" rel="noopener noreferrer"
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-[#8FAF9A] hover:bg-[#7A9E86] text-white transition-colors">
                      <WaIcon />
                    </a>
                  </div>
                )}
                {gelin.esiTelefon && (
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-[10px] text-[#8A8A8A]">{isMG ? 'Damat' : 'Eşi'}</p>
                      <a href={`tel:${gelin.esiTelefon}`} className="text-xs font-medium text-[#2F2F2F]">{gelin.esiTelefon}</a>
                    </div>
                    <a href={`https://wa.me/${toWhatsApp(gelin.esiTelefon)}`} target="_blank" rel="noopener noreferrer"
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-[#8FAF9A] hover:bg-[#7A9E86] text-white transition-colors">
                      <WaIcon />
                    </a>
                  </div>
                )}
                {gelin.instagram && (
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-[10px] text-[#8A8A8A]">Instagram</p>
                      <a href={`https://instagram.com/${gelin.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline">{gelin.instagram}</a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ödeme */}
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1 px-1">Ödeme</p>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-[#F7F7F7] rounded-lg p-2 text-center">
                <p className="text-[9px] text-[#8A8A8A] mb-0.5">Ücret</p>
                <p className="text-sm font-bold text-[#2F2F2F]">
                  {gelin.ucret === -1 ? '—' : `${gelin.ucret.toLocaleString('tr-TR')}₺`}
                </p>
              </div>
              <div className="bg-[#EAF2ED] rounded-lg p-2 text-center">
                <p className="text-[9px] text-[#8FAF9A] mb-0.5">Kapora</p>
                <p className="text-sm font-bold text-[#8FAF9A]">{gelin.kapora.toLocaleString('tr-TR')}₺</p>
              </div>
              <div className={`rounded-lg p-2 text-center ${gelin.kalan > 0 ? 'bg-[#D96C6C]/10' : 'bg-[#F7F7F7]'}`}>
                <p className={`text-[9px] mb-0.5 ${gelin.kalan > 0 ? 'text-[#D96C6C]' : 'text-[#8A8A8A]'}`}>Kalan</p>
                <p className={`text-sm font-bold ${gelin.kalan > 0 ? 'text-[#D96C6C]' : 'text-[#2F2F2F]'}`}>
                  {gelin.ucret === -1 ? '—' : `${gelin.kalan.toLocaleString('tr-TR')}₺`}
                </p>
              </div>
            </div>
            {gelin.anlasildigiTarih && (
              <p className="text-[11px] text-[#8A8A8A] mt-1.5 px-1">
                Anlaşma: {new Date(gelin.anlasildigiTarih).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            )}
          </div>

          {/* MG: Ek Hizmetler */}
          {isMG && gelin.ekHizmetler && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1 px-1">Ek Hizmetler</p>
              <div className="bg-[#EAF2ED] rounded-xl px-3 py-2">
                <p className="text-xs text-[#2F2F2F]">{gelin.ekHizmetler}</p>
              </div>
            </div>
          )}

          {/* Checklist */}
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5 px-1">Takip Listesi</p>
            <div className="space-y-0.5">
              {checkItems.map((item, i) => (
                <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${item.checked ? 'bg-[#EAF2ED]/60' : 'bg-[#F7F7F7]'}`}>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${item.checked ? 'bg-[#8FAF9A] text-white' : 'border-2 border-[#E5E5E5]'}`}>
                    {item.checked && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs ${item.checked ? 'text-[#2F2F2F]' : 'text-[#8A8A8A]'}`}>{item.label}</p>
                    {item.checked && item.value && (
                      <span className="text-[11px] text-[#8FAF9A] font-medium">{item.value}</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Yorum separator */}
              <div className="h-px bg-[#F7F7F7] my-1.5" />

              {/* Yorum istensin mi */}
              <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${gelin.yorumIstesinMi ? 'bg-[#EAF2ED]/60' : 'bg-[#D96C6C]/10/60'}`}>
                <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${gelin.yorumIstesinMi ? 'bg-[#8FAF9A] text-white' : 'border-2 border-[#D96C6C]'}`}>
                  {gelin.yorumIstesinMi && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className="flex-1">
                  <p className={`text-xs ${gelin.yorumIstesinMi ? 'text-[#2F2F2F]' : 'text-[#D96C6C] font-medium'}`}>Yorum istensin mi</p>
                  {gelin.yorumIstesinMi ? (
                    <span className="text-[11px] text-[#8FAF9A] font-medium">{gelin.yorumIstesinMi}</span>
                  ) : (
                    <p className="text-[10px] text-[#D96C6C]">Boş — otomatik görev atanacak</p>
                  )}
                </div>
              </div>

              {/* Yorum istendi mi */}
              <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${gelin.yorumIstendiMi ? 'bg-[#EAF2ED]/60' : 'bg-[#F7F7F7]'}`}>
                <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${gelin.yorumIstendiMi ? 'bg-[#8FAF9A] text-white' : 'border-2 border-[#E5E5E5]'}`}>
                  {gelin.yorumIstendiMi && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <p className={`text-xs ${gelin.yorumIstendiMi ? 'text-[#2F2F2F]' : 'text-[#8A8A8A]'}`}>Yorum istendi mi</p>
              </div>
            </div>
          </div>

          {/* Not */}
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1 px-1">{isMG ? 'Çift Notu' : 'Gelin Notu'}</p>
            <div className="bg-[#F7F7F7] rounded-xl px-3 py-2">
              {gelin.gelinNotu ? (
                <p className="text-xs text-[#2F2F2F] whitespace-pre-wrap leading-relaxed">{gelin.gelinNotu}</p>
              ) : (
                <p className="text-xs text-[#8A8A8A] italic">Henüz not eklenmemiş</p>
              )}
            </div>
          </div>

          {/* Dekont */}
          {gelin.dekontGorseli && (
            <div className="mb-2">
              <p className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1 px-1">Dekont</p>
              <a href={gelin.dekontGorseli} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#EAF2ED] hover:bg-[#EAF2ED] rounded-xl px-3 py-2 transition-colors group">
                <div className="w-6 h-6 rounded-lg bg-[#EAF2ED] flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[#8FAF9A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <span className="text-xs font-medium text-[#8FAF9A] group-hover:underline">Dekont görselini aç</span>
              </a>
            </div>
          )}

          {/* Footer note */}
          <p className="text-[10px] text-[#8A8A8A] text-center mt-3 pb-1">Veriler Google Takvim'den otomatik çekilir</p>
        </div>
      </div>
    </div>
  );
}
