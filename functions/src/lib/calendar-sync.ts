import { google, calendar_v3 } from 'googleapis';
import { adminDb } from './firestore-admin';

// ============================================
// Firma tipi
// ============================================
export type FirmaKodu = 'GYS' | 'TCB' | 'MG';

export function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

// Takvimi service account'ın listesine ekle (yoksa ekler, varsa sessizce geçer)
async function ensureCalendarInList(calendarId: string) {
  const calendar = getCalendarClient();
  try {
    await calendar.calendarList.insert({ requestBody: { id: calendarId } });
    console.log(`[calendarList] ✅ Takvim listeye eklendi: ${calendarId}`);
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code === 409) {
      // Zaten listede, sorun yok
    } else {
      console.warn(`[calendarList] Eklenemedi (${calendarId}):`, err);
    }
  }
}

function normalizeText(s: string): string {
  return (s ?? '').replace(/\u00A0/g, ' ').normalize('NFKC').replace(/ +/g, ' ').trim();
}

function hasFinancialMarkers(description: string): boolean {
  return /anla[şs][ıi]lan\s*[üu]cret\s*:|kapora\s*:|kalan\s*:/i.test(normalizeText(description));
}

function isErtelendi(title: string): boolean {
  return (title || '').toUpperCase().includes('ERTELENDİ');
}

function parseDescription(description: string) {
  const lines = description.split('\n').map(line => normalizeText(line));
  // Helper: tüm check mark varyantlarını yakala (✔ ✔️ ✓ ✅)
  const hasCheck = (l: string) => l.includes('\u2714') || l.includes('\u2713') || l.includes('\u2705');
  const result: Record<string, unknown> = {
    kinaGunu: '', telefon: '', esiTelefon: '', instagram: '', fotografci: '', modaevi: '',
    anlasildigiTarih: '', bilgilendirmeGonderildi: false, ucretYazildi: false,
    malzemeListesiGonderildi: false, paylasimIzni: false, yorumIstesinMi: '',
    yorumIstendiMi: false, gelinNotu: '', dekontGorseli: '', ucret: 0, kapora: 0, kalan: 0,
    // TCB fields
    sacModeliBelirlendi: false, provaTermini: '', provaTarihiBelirlendi: false, etkinlikTuru: '',
    // REF fields
    gidecegiYerSaat: '', gidecegiYer: '',
    // MG fields
    cekimUcretiAlindi: false, fotografPaylasimIzni: false, ciftinIsiBitti: false,
    dosyaSahipligiAktarildi: false, ekHizmetler: '', merasimTarihi: '',
    gelinlikci: '', kuafor: ''
  };
  lines.forEach(line => {
    const lower = line.toLowerCase().trim();
    if (!result.kinaGunu && line.includes('Kına') && !line.includes(':')) result.kinaGunu = line.trim();
    // İletişim - GYS/TCB format
    if (lower.includes('tel no:') && !lower.includes('eşi')) result.telefon = line.split(':')[1]?.trim() || '';
    if (lower.includes('eşi tel no:')) result.esiTelefon = line.split(':')[1]?.trim() || '';
    // İletişim - MG format
    if (lower.includes('gelin tel:')) result.telefon = line.split(':')[1]?.trim() || '';
    if (lower.includes('damat tel:')) result.esiTelefon = line.split(':')[1]?.trim() || '';
    if (lower.includes('ig:')) result.instagram = line.split(':')[1]?.trim() || '';
    if (lower.includes('fotoğrafçı:')) result.fotografci = line.split(':')[1]?.trim() || '';
    if (lower.includes('modaevi:')) result.modaevi = line.split(':')[1]?.trim() || '';
    // MG personel
    if (lower.includes('gelinlikçi:')) result.gelinlikci = line.split(':')[1]?.trim() || '';
    if (lower.includes('kuaför:')) result.kuafor = line.split(':')[1]?.trim() || '';
    // MG merasim tarihi
    if (lower.includes('merasim tarihi:')) result.merasimTarihi = line.split(':').slice(1).join(':').trim();
    // Ücret - tüm firmalar
    const ucretMatch = line.match(/^anla[şs][ıi]lan\s*[üu]cret\s*:\s*(.+)/i);
    if (ucretMatch) result.ucret = ucretMatch[1].toUpperCase().includes('X') ? -1 : parseInt(ucretMatch[1].replace(/[^0-9]/g, '')) || 0;
    const kaporaMatch = line.match(/^kapora\s*:\s*(.+)/i);
    if (kaporaMatch) result.kapora = parseInt(kaporaMatch[1].replace(/[^0-9]/g, '')) || 0;
    const kalanMatch = line.match(/^kalan\s*:\s*(.+)/i);
    if (kalanMatch) result.kalan = kalanMatch[1].toUpperCase().includes('X') ? -1 : parseInt(kalanMatch[1].replace(/[^0-9]/g, '')) || 0;
    if (lower.includes('anlaştığı tarih:')) {
      const match = line.split(':').slice(1).join(':').trim().match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
      if (match) result.anlasildigiTarih = match[3]+'-'+match[2]+'-'+match[1]+'T'+match[4]+':'+match[5]+':00';
    }
    // Checklist - GYS
    if (lower.includes('bilgilendirme metni gönderildi mi')) result.bilgilendirmeGonderildi = hasCheck(line);
    if (lower.includes('bilgilendirme pdf gönderildi mi')) result.bilgilendirmeGonderildi = hasCheck(line);
    if (lower.includes('müşteriye bilgilendirme metni gönderildi mi')) result.bilgilendirmeGonderildi = hasCheck(line);
    // TCB PRV: "prova bilgilendirmesi gönderildi mi"
    if (lower.includes('prova bilgilendirmesi gönderildi mi')) result.bilgilendirmeGonderildi = hasCheck(line);
    // REF: "ref bilgilendirmesi gönderildi mi"
    if (lower.includes('ref bilgilendirmesi gönderildi mi')) result.bilgilendirmeGonderildi = hasCheck(line);
    if (lower.includes('anlaşılan ve kalan ücret yazıldı mı')) result.ucretYazildi = hasCheck(line);
    if (lower.includes('malzeme listesi gönderildi mi')) result.malzemeListesiGonderildi = hasCheck(line);
    if (lower.includes('paylaşım izni var mı')) result.paylasimIzni = hasCheck(line);
    // Checklist - TCB
    if (lower.includes('saç modeli belirlendi') && lower.includes('mi')) result.sacModeliBelirlendi = hasCheck(line);
    if (lower.includes('prova tercihi:')) result.provaTermini = line.split(':').slice(1).join(':').trim();
    if (lower.includes('prova tarihi belirlendi mi') || lower.includes('prova günü belirlendi mi')) result.provaTarihiBelirlendi = hasCheck(line);
    // REF fields
    if (lower.includes('gideceği yerde bulunması gereken saat:')) result.gidecegiYerSaat = line.split(':').slice(1).join(':').trim();
    if (lower.includes('gideceği yer:')) result.gidecegiYer = line.split(':').slice(1).join(':').trim();
    // Checklist - MG
    if (lower.includes('çekim ücreti alındı mı')) result.cekimUcretiAlindi = hasCheck(line);
    if (lower.includes('fotoğraf paylaşım izni')) result.fotografPaylasimIzni = hasCheck(line);
    if (lower.includes('çiftin işi bitti mi')) result.ciftinIsiBitti = hasCheck(line);
    if (lower.includes('dosya sahipliği aktarıldı mı')) result.dosyaSahipligiAktarildi = hasCheck(line);
    if (lower.includes('ek hizmetler:')) result.ekHizmetler = line.split(':').slice(1).join(':').trim();
    // Ortak
    if (lower.includes('yorum istensin mi') && !lower.includes('istendi')) result.yorumIstesinMi = (hasCheck(line)) ? 'Evet' : '';
    if (lower.includes('yorum istendi mi')) result.yorumIstendiMi = hasCheck(line);
    if (lower.includes('varsa gelin notu:') || lower.includes('varsa çift notu:')) result.gelinNotu = line.split(':').slice(1).join(':').trim();
    if (lower.includes('dekont görseli:')) result.dekontGorseli = line.split(':').slice(1).join(':').trim();
  });
  // TCB/GYS: ilk satır etkinlik türü olabilir (Nişan Günü, Düğün, Nikah / Düğün Günü için Makyaj PRV vs.)
  const firstLine = lines[0]?.trim();
  if (firstLine && !firstLine.includes(':') && !firstLine.includes('---') && firstLine.length < 50) {
    result.etkinlikTuru = firstLine;
  }
  return result;
}

// ============================================
// Kısaltma haritasını Firestore personelden çek
// ============================================
async function getKisaltmaMap(): Promise<Record<string, string>> {
  const snap = await adminDb.collection('personnel').where('aktif', '==', true).get();
  const map: Record<string, string> = {};
  for (const doc of snap.docs) {
    const data = doc.data();
    const ad = (data.ad || '').trim();
    const soyad = (data.soyad || '').trim();
    const tamIsim = soyad ? `${ad} ${soyad}` : ad;
    const kisaltma = (data.kisaltma || '').trim();
    if (!ad) continue;
    // Kısaltma virgülle ayrılmış olabilir: "Sa, Kü, Rü"
    if (kisaltma) {
      const parcalar = kisaltma.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
      for (const k of parcalar) {
        map[k] = tamIsim;
      }
    }
    // Ad'ın kendisini de ekle (büyük harf)
    map[ad.toUpperCase()] = tamIsim;
  }
  return map;
}

function parsePersonelWithMap(title: string, kisaltmaMap: Record<string, string>) {
  const temizle = (s: string) => {
    const t = s.replace(/[-–—]/g, '').trim().toUpperCase();
    return kisaltmaMap[t] || t;
  };
  const parts = title.split('✅');
  const rawIsim = (parts[0] || '').trim();
  const pRaw = (parts[1] || '').trim();
  const odemeTamamlandi = pRaw.includes('--');

  // ✅'den önceki kısmı analiz et
  const upper = rawIsim.toUpperCase();

  // FRLNC tespiti
  const freelance = upper.includes('FRLNC');

  // ÇT (çift türban) tespiti
  const ciftTurban = /\bÇT\b/.test(upper);

  // PRV (prova) tespiti
  const prova = upper.includes('PRV');

  // REF (referans/işbirliği) tespiti
  const ref = /\bREF\b/.test(upper);

  // Hizmet türü tespiti (Makyaj/Türban/Sac keyword'leri ✅'den ÖNCE)
  const hasMakyaj = upper.includes('MAKYAJ');
  const hasTurban = upper.includes('TÜRBAN') || upper.includes('TURBAN');
  const hasSac = /\bSAC\b/.test(upper) || upper.includes('SADECE SAC') || upper.includes('SAÇ');

  let hizmetTuru: 'makyaj+turban' | 'makyaj' | 'turban' | 'makyaj+sac' | 'sac' = 'makyaj+turban';
  if (hasSac && hasMakyaj) hizmetTuru = 'makyaj+sac';
  else if (hasSac && !hasMakyaj) hizmetTuru = 'sac';
  else if (hasMakyaj && !hasTurban && !hasSac) hizmetTuru = 'makyaj';
  else if (hasTurban && !hasMakyaj) hizmetTuru = 'turban';
  // TCB: başlıkta hiçbir şey yoksa → firma prefix'ine göre default belirlenecek (eventToGelin'de)

  // İsim temizle — tcb/gys/mg prefix, Makyaj, Türban, Sac, FRLNC, ÇT, PRV, +, sadece, ekstra boşlukları kaldır
  let isim = rawIsim
    .replace(/^(tcb|gys|mg)\s+/i, '')
    .replace(/\bFRLNC\b/gi, '')
    .replace(/\bÇT\b/g, '')
    .replace(/\bPRV\b/gi, '')
    .replace(/\bREF\b/gi, '')
    .replace(/\bMakyaj\b/gi, '')
    .replace(/\bTürban\b/gi, '')
    .replace(/\bTurban\b/gi, '')
    .replace(/\bSac\b/gi, '')
    .replace(/\bSaç\b/gi, '')
    .replace(/\bsadece\b/gi, '')
    .replace(/\+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Sondaki tire/boşlukları temizle
  isim = isim.replace(/[-–—\s]+$/, '').trim();

  // ✅'den sonraki kısaltmalardan personel belirle
  const pStr = pRaw.replace(/[-–—]/g, ' ').trim();
  let makyaj = '', turban = '';

  // İPTAL tespiti
  const iptal = pStr.toUpperCase().includes('İPTAL') || pStr.toUpperCase().includes('IPTAL');

  if (!iptal) {
    if (pStr.includes('&')) {
      const k = pStr.split('&').map(x => temizle(x.trim()));
      makyaj = k[0] || '';
      turban = k[1] || '';
    } else if (pStr) {
      const kisi = temizle(pStr);
      if (hizmetTuru === 'makyaj+turban' || hizmetTuru === 'makyaj+sac') {
        // Tek kişi hem makyaj hem türban/saç yapmış
        makyaj = kisi;
        turban = kisi;
      } else if (hizmetTuru === 'makyaj') {
        makyaj = kisi;
        turban = 'Sadece Makyaj';
      } else if (hizmetTuru === 'turban') {
        turban = kisi;
        makyaj = 'Sadece Türban';
      } else if (hizmetTuru === 'sac') {
        turban = kisi;
        makyaj = 'Sadece Saç';
      }
    }
  }

  return { isim, makyaj, turban, odemeTamamlandi, hizmetTuru, freelance, ciftTurban, prova, ref, iptal };
}

type CalendarEvent = calendar_v3.Schema$Event;
interface GelinData {
  id: string; isim: string; tarih: string; saat: string; bitisSaati: string;
  ucret: number; kapora: number; kalan: number; makyaj: string; turban: string;
  odemeTamamlandi: boolean; kontrolZamani: string; kinaGunu: string; telefon: string;
  esiTelefon: string; instagram: string; fotografci: string; modaevi: string;
  anlasildigiTarih: string; bilgilendirmeGonderildi: boolean; ucretYazildi: boolean;
  malzemeListesiGonderildi: boolean; paylasimIzni: boolean; yorumIstesinMi: string;
  yorumIstendiMi: boolean; gelinNotu: string; dekontGorseli: string; updatedAt: string;
  firma: FirmaKodu;
  // Hizmet detayları
  hizmetTuru: 'makyaj+turban' | 'makyaj' | 'turban' | 'makyaj+sac' | 'sac';
  freelance: boolean;
  ciftTurban: boolean;
  prova: boolean;
  ref: boolean;
  iptal: boolean;
  // TCB fields
  sacModeliBelirlendi: boolean; provaTermini: string; provaTarihiBelirlendi: boolean; etkinlikTuru: string;
  // REF fields
  gidecegiYerSaat: string; gidecegiYer: string;
  // MG fields
  cekimUcretiAlindi: boolean; fotografPaylasimIzni: boolean; ciftinIsiBitti: boolean;
  dosyaSahipligiAktarildi: boolean; ekHizmetler: string; merasimTarihi: string;
  gelinlikci: string; kuafor: string; videocu: string;
  __delete?: boolean; reason?: string;
}

function eventToGelin(event: CalendarEvent, firma: FirmaKodu, kisaltmaMap: Record<string, string>): GelinData | null {
  const title = event.summary || '', description = event.description || '', startDate = event.start?.dateTime || event.start?.date;
  if (!startDate) return null;
  if (isErtelendi(title)) return { __delete: true, id: event.id!, reason: 'ertelendi', firma } as GelinData;
  if (!hasFinancialMarkers(description)) return null;
  const date = new Date(startDate);
  const endDateStr = event.end?.dateTime || event.end?.date;
  const endDate = endDateStr ? new Date(endDateStr) : date;
  const parsedData = parseDescription(description);
  const parsed = parsePersonelWithMap(title, kisaltmaMap);
  let { isim, makyaj, turban, odemeTamamlandi, freelance, ciftTurban, prova, ref, iptal } = parsed;
  let hizmetTuru = parsed.hizmetTuru;
  // TCB: default hizmet "makyaj+sac" (türban yok), GYS: default "makyaj+turban"
  if (firma === 'TCB' && hizmetTuru === 'makyaj+turban') hizmetTuru = 'makyaj+sac';

  // MG: title'daki kısaltmalar fotoğrafçı & videocu (makyaj/turban değil)
  let mgFotografci = '';
  let mgVideocu = '';
  if (firma === 'MG') {
    const pRawCheck = (title.split('✅')[1] || '').trim();
    const hasAmpersand = pRawCheck.includes('&');
    if (hasAmpersand) {
      mgFotografci = makyaj || '';  // ilk kişi = fotoğrafçı
      mgVideocu = turban || '';     // ikinci kişi = videocu
    } else {
      mgFotografci = makyaj || '';  // tek kişi = sadece fotoğrafçı
      mgVideocu = '';               // videocu yok
    }
    makyaj = '';
    turban = '';
  }
  // kontrolZamani = bitiş saati + 1 saat
  const kontrolDate = new Date(endDate.getTime() + 1 * 60 * 60 * 1000);

  return {
    id: event.id!, isim,
    tarih: date.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }),
    saat: date.toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }),
    bitisSaati: endDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }),
    ucret: parsedData.ucret as number, kapora: parsedData.kapora as number, kalan: parsedData.kalan as number,
    makyaj, turban, odemeTamamlandi, hizmetTuru, freelance, ciftTurban, prova, ref, iptal,
    kontrolZamani: kontrolDate.toISOString(),
    kinaGunu: parsedData.kinaGunu as string, telefon: parsedData.telefon as string,
    esiTelefon: parsedData.esiTelefon as string, instagram: parsedData.instagram as string,
    fotografci: firma === 'MG' ? mgFotografci : (parsedData.fotografci as string),
    modaevi: parsedData.modaevi as string,
    anlasildigiTarih: parsedData.anlasildigiTarih as string,
    bilgilendirmeGonderildi: parsedData.bilgilendirmeGonderildi as boolean,
    ucretYazildi: parsedData.ucretYazildi as boolean,
    malzemeListesiGonderildi: parsedData.malzemeListesiGonderildi as boolean,
    paylasimIzni: parsedData.paylasimIzni as boolean,
    yorumIstesinMi: parsedData.yorumIstesinMi as string,
    yorumIstendiMi: parsedData.yorumIstendiMi as boolean,
    gelinNotu: parsedData.gelinNotu as string,
    dekontGorseli: parsedData.dekontGorseli as string,
    // TCB fields
    sacModeliBelirlendi: parsedData.sacModeliBelirlendi as boolean,
    provaTermini: parsedData.provaTermini as string,
    provaTarihiBelirlendi: parsedData.provaTarihiBelirlendi as boolean,
    etkinlikTuru: parsedData.etkinlikTuru as string,
    // REF fields
    gidecegiYerSaat: parsedData.gidecegiYerSaat as string,
    gidecegiYer: parsedData.gidecegiYer as string,
    // MG fields
    cekimUcretiAlindi: parsedData.cekimUcretiAlindi as boolean,
    fotografPaylasimIzni: parsedData.fotografPaylasimIzni as boolean,
    ciftinIsiBitti: parsedData.ciftinIsiBitti as boolean,
    dosyaSahipligiAktarildi: parsedData.dosyaSahipligiAktarildi as boolean,
    ekHizmetler: parsedData.ekHizmetler as string,
    merasimTarihi: parsedData.merasimTarihi as string,
    gelinlikci: parsedData.gelinlikci as string,
    kuafor: parsedData.kuafor as string,
    videocu: firma === 'MG' ? mgVideocu : '',
    updatedAt: new Date().toISOString(),
    firma
  };
}

// ============================================
// INCREMENTAL SYNC (firma bazlı)
// ============================================
export async function incrementalSync(syncToken: string | undefined, calendarId: string, firma: FirmaKodu) {
  await ensureCalendarInList(calendarId);
  const calendar = getCalendarClient();
  const kisaltmaMap = await getKisaltmaMap();
  try {
    let pageToken: string | undefined, nextSyncToken: string | undefined, totalUpdateCount = 0, deleteCount = 0, batch = adminDb.batch(), batchCount = 0;
    do {
      const response = await calendar.events.list({ calendarId, singleEvents: true, showDeleted: true, syncToken, pageToken, timeMin: syncToken ? undefined : new Date('2025-01-01').toISOString(), timeMax: syncToken ? undefined : new Date('2030-12-31').toISOString() });
      const events = response.data.items || [];
      pageToken = response.data.nextPageToken ?? undefined;
      if (!pageToken && response.data.nextSyncToken) nextSyncToken = response.data.nextSyncToken;
      for (const event of events) {
        if (event.status === 'cancelled') { batch.delete(adminDb.collection('gelinler').doc(event.id!)); totalUpdateCount++; deleteCount++; batchCount++; }
        else {
          const gelin = eventToGelin(event, firma, kisaltmaMap);
          if (gelin?.__delete) { batch.delete(adminDb.collection('gelinler').doc(gelin.id)); totalUpdateCount++; deleteCount++; batchCount++; }
          else if (gelin) { batch.set(adminDb.collection('gelinler').doc(gelin.id), gelin, { merge: true }); totalUpdateCount++; batchCount++; }
          else if (event.id) { batch.delete(adminDb.collection('gelinler').doc(event.id)); batchCount++; }
        }
        if (batchCount >= 500) { await batch.commit(); batch = adminDb.batch(); batchCount = 0; }
      }
    } while (pageToken);
    if (batchCount > 0) await batch.commit();
    return { success: true, updateCount: totalUpdateCount, deleteCount, syncToken: nextSyncToken };
  } catch (error: unknown) { if ((error as { code?: number }).code === 410) return { success: false, error: 'SYNC_TOKEN_INVALID' }; throw error; }
}

// ============================================
// FULL SYNC (firma bazlı)
// ============================================
export async function fullSync(calendarId: string, firma: FirmaKodu) {
  await ensureCalendarInList(calendarId);
  const calendar = getCalendarClient();
  const kisaltmaMap = await getKisaltmaMap();
  const allEvents: CalendarEvent[] = [];
  let pageToken: string | undefined, syncToken: string | undefined;
  do {
    const response = await calendar.events.list({ calendarId, timeMin: new Date('2025-01-01').toISOString(), timeMax: new Date('2030-12-31').toISOString(), singleEvents: true, maxResults: 2500, pageToken });
    allEvents.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken ?? undefined;
    if (!pageToken && response.data.nextSyncToken) syncToken = response.data.nextSyncToken;
  } while (pageToken);
  let addedCount = 0, skippedCount = 0, deletedCount = 0, batch = adminDb.batch(), batchCount = 0;
  for (const event of allEvents) {
    const gelin = eventToGelin(event, firma, kisaltmaMap);
    if (gelin?.__delete) { batch.delete(adminDb.collection('gelinler').doc(gelin.id)); deletedCount++; batchCount++; }
    else if (gelin) { batch.set(adminDb.collection('gelinler').doc(gelin.id), gelin, { merge: true }); addedCount++; batchCount++; if (batchCount >= 100) { await batch.commit(); batch = adminDb.batch(); batchCount = 0; } }
    else {
      // Gelin olarak sayılmayan event — Firestore'da varsa sil (eski sync'ten kalmış olabilir)
      if (event.id) { batch.delete(adminDb.collection('gelinler').doc(event.id)); batchCount++; }
      skippedCount++;
    }
  }
  if (batchCount > 0) await batch.commit();
  return { success: true, totalEvents: allEvents.length, added: addedCount, deleted: deletedCount, skipped: skippedCount, syncToken };
}
