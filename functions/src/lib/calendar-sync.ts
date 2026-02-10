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
  const result: Record<string, unknown> = {
    kinaGunu: '', telefon: '', esiTelefon: '', instagram: '', fotografci: '', modaevi: '',
    anlasildigiTarih: '', bilgilendirmeGonderildi: false, ucretYazildi: false,
    malzemeListesiGonderildi: false, paylasimIzni: false, yorumIstesinMi: '',
    yorumIstendiMi: false, gelinNotu: '', dekontGorseli: '', ucret: 0, kapora: 0, kalan: 0
  };
  lines.forEach(line => {
    const lower = line.toLowerCase().trim();
    if (!result.kinaGunu && line.includes('Kına') && !line.includes(':')) result.kinaGunu = line.trim();
    if (lower.includes('tel no:') && !lower.includes('eşi')) result.telefon = line.split(':')[1]?.trim() || '';
    if (lower.includes('eşi tel no:')) result.esiTelefon = line.split(':')[1]?.trim() || '';
    if (lower.includes('ig:')) result.instagram = line.split(':')[1]?.trim() || '';
    if (lower.includes('fotoğrafçı:')) result.fotografci = line.split(':')[1]?.trim() || '';
    if (lower.includes('modaevi:')) result.modaevi = line.split(':')[1]?.trim() || '';
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
    if (lower.includes('bilgilendirme metni gönderildi mi')) result.bilgilendirmeGonderildi = line.includes('✔️') || line.includes('✓');
    if (lower.includes('anlaşılan ve kalan ücret yazıldı mı')) result.ucretYazildi = line.includes('✔️') || line.includes('✓');
    if (lower.includes('malzeme listesi gönderildi mi')) result.malzemeListesiGonderildi = line.includes('✔️') || line.includes('✓');
    if (lower.includes('paylaşım izni var mı')) result.paylasimIzni = line.includes('✔️') || line.includes('✓');
    if (lower.includes('yorum istensin mi') && !lower.includes('istendi')) result.yorumIstesinMi = (line.includes('✔️') || line.includes('✓')) ? 'Evet' : '';
    if (lower.includes('yorum istendi mi')) result.yorumIstendiMi = line.includes('✔️') || line.includes('✓');
    if (lower.includes('varsa gelin notu:')) result.gelinNotu = line.split(':').slice(1).join(':').trim();
    if (lower.includes('dekont görseli:')) result.dekontGorseli = line.split(':').slice(1).join(':').trim();
  });
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
    const kisaltma = (data.kisaltma || '').trim();
    if (!ad) continue;
    // Kısaltma virgülle ayrılmış olabilir: "Sa, Kü, Rü"
    if (kisaltma) {
      const parcalar = kisaltma.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
      for (const k of parcalar) {
        map[k] = ad;
      }
    }
    // Ad'ın kendisini de ekle (büyük harf)
    map[ad.toUpperCase()] = ad;
  }
  return map;
}

function parsePersonelWithMap(title: string, kisaltmaMap: Record<string, string>) {
  const temizle = (s: string) => {
    const t = s.replace(/[-–—]/g, '').trim().toUpperCase();
    return kisaltmaMap[t] || t;
  };
  const parts = title.split('✅'), isim = (parts[0] || '').trim(), pRaw = (parts[1] || '').trim();
  const odemeTamamlandi = pRaw.includes('--');
  const pStr = pRaw.replace(/[-–—]/g, ' ').trim();
  let makyaj = '', turban = '';
  if (pStr.includes('&')) { const k = pStr.split('&').map(x => temizle(x.trim())); makyaj = k[0] || ''; turban = k[1] || ''; }
  else if (pStr) { makyaj = turban = temizle(pStr); }
  return { isim, makyaj, turban, odemeTamamlandi };
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
  __delete?: boolean; reason?: string;
}

function eventToGelin(event: CalendarEvent, firma: FirmaKodu, kisaltmaMap: Record<string, string>): GelinData | null {
  const title = event.summary || '', description = event.description || '', startDate = event.start?.dateTime || event.start?.date;
  if (!startDate) return null;
  if (isErtelendi(title)) return { __delete: true, id: event.id!, reason: 'ertelendi', firma } as GelinData;
  if (!hasFinancialMarkers(description) && !title.toUpperCase().includes('REF')) return null;
  const date = new Date(startDate);
  const endDateStr = event.end?.dateTime || event.end?.date;
  const endDate = endDateStr ? new Date(endDateStr) : date;
  const parsedData = parseDescription(description);
  const { isim, makyaj, turban, odemeTamamlandi } = parsePersonelWithMap(title, kisaltmaMap);
  const kontrolDate = new Date(date.getTime() + 5 * 60 * 60 * 1000);

  return {
    id: event.id!, isim,
    tarih: date.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }),
    saat: date.toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }),
    bitisSaati: endDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }),
    ucret: parsedData.ucret as number, kapora: parsedData.kapora as number, kalan: parsedData.kalan as number,
    makyaj, turban, odemeTamamlandi,
    kontrolZamani: kontrolDate.toISOString(),
    kinaGunu: parsedData.kinaGunu as string, telefon: parsedData.telefon as string,
    esiTelefon: parsedData.esiTelefon as string, instagram: parsedData.instagram as string,
    fotografci: parsedData.fotografci as string, modaevi: parsedData.modaevi as string,
    anlasildigiTarih: parsedData.anlasildigiTarih as string,
    bilgilendirmeGonderildi: parsedData.bilgilendirmeGonderildi as boolean,
    ucretYazildi: parsedData.ucretYazildi as boolean,
    malzemeListesiGonderildi: parsedData.malzemeListesiGonderildi as boolean,
    paylasimIzni: parsedData.paylasimIzni as boolean,
    yorumIstesinMi: parsedData.yorumIstesinMi as string,
    yorumIstendiMi: parsedData.yorumIstendiMi as boolean,
    gelinNotu: parsedData.gelinNotu as string,
    dekontGorseli: parsedData.dekontGorseli as string,
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
    else { skippedCount++; }
  }
  if (batchCount > 0) await batch.commit();
  return { success: true, totalEvents: allEvents.length, added: addedCount, deleted: deletedCount, skipped: skippedCount, syncToken };
}
