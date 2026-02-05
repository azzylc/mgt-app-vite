import { google, calendar_v3 } from 'googleapis';
import { adminDb } from './firestore-admin';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || '';

export function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  return google.calendar({ version: 'v3', auth });
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

function parsePersonel(title: string) {
  const kisaltmaMap: Record<string, string> = { SA: 'Saliha', SE: 'Selen', T: 'Tansu', K: 'Kübra', R: 'Rümeysa', B: 'Bahar', Z: 'Zehra' };
  const temizle = (s: string) => { const t = s.replace(/[-–—]/g, '').trim().toUpperCase(); return kisaltmaMap[t] || t; };
  const parts = title.split('✅'), isim = (parts[0] || '').trim(), pStr = (parts[1] || '').replace(/[-–—]/g, ' ').trim();
  let makyaj = '', turban = '';
  if (pStr.includes('&')) { const k = pStr.split('&').map(x => temizle(x.trim())); makyaj = k[0] || ''; turban = k[1] || ''; }
  else if (pStr) { makyaj = turban = temizle(pStr); }
  return { isim, makyaj, turban };
}

type CalendarEvent = calendar_v3.Schema$Event;
interface GelinData { id: string; isim: string; tarih: string; saat: string; ucret: number; kapora: number; kalan: number; makyaj: string; turban: string; kinaGunu: string; telefon: string; esiTelefon: string; instagram: string; fotografci: string; modaevi: string; anlasildigiTarih: string; bilgilendirmeGonderildi: boolean; ucretYazildi: boolean; malzemeListesiGonderildi: boolean; paylasimIzni: boolean; yorumIstesinMi: string; yorumIstendiMi: boolean; gelinNotu: string; dekontGorseli: string; updatedAt: string; __delete?: boolean; reason?: string; }

function eventToGelin(event: CalendarEvent): GelinData | null {
  const title = event.summary || '', description = event.description || '', startDate = event.start?.dateTime || event.start?.date;
  if (!startDate) return null;
  if (isErtelendi(title)) return { __delete: true, id: event.id!, reason: 'ertelendi' } as GelinData;
  if (!hasFinancialMarkers(description) && !title.toUpperCase().includes('REF')) return null;
  const date = new Date(startDate);
  const parsedData = parseDescription(description), { isim, makyaj, turban } = parsePersonel(title);
  return { id: event.id!, isim, tarih: date.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }), saat: date.toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }), ucret: parsedData.ucret as number, kapora: parsedData.kapora as number, kalan: parsedData.kalan as number, makyaj, turban, kinaGunu: parsedData.kinaGunu as string, telefon: parsedData.telefon as string, esiTelefon: parsedData.esiTelefon as string, instagram: parsedData.instagram as string, fotografci: parsedData.fotografci as string, modaevi: parsedData.modaevi as string, anlasildigiTarih: parsedData.anlasildigiTarih as string, bilgilendirmeGonderildi: parsedData.bilgilendirmeGonderildi as boolean, ucretYazildi: parsedData.ucretYazildi as boolean, malzemeListesiGonderildi: parsedData.malzemeListesiGonderildi as boolean, paylasimIzni: parsedData.paylasimIzni as boolean, yorumIstesinMi: parsedData.yorumIstesinMi as string, yorumIstendiMi: parsedData.yorumIstendiMi as boolean, gelinNotu: parsedData.gelinNotu as string, dekontGorseli: parsedData.dekontGorseli as string, updatedAt: new Date().toISOString() };
}

export async function incrementalSync(syncToken?: string) {
  const calendar = getCalendarClient();
  try {
    let pageToken: string | undefined, nextSyncToken: string | undefined, totalUpdateCount = 0, deleteCount = 0, batch = adminDb.batch(), batchCount = 0;
    do {
      const response = await calendar.events.list({ calendarId: CALENDAR_ID, singleEvents: true, showDeleted: true, syncToken, pageToken, timeMin: syncToken ? undefined : new Date('2025-01-01').toISOString(), timeMax: syncToken ? undefined : new Date('2030-12-31').toISOString() });
      const events = response.data.items || [];
      pageToken = response.data.nextPageToken ?? undefined;
      if (!pageToken && response.data.nextSyncToken) nextSyncToken = response.data.nextSyncToken;
      for (const event of events) {
        if (event.status === 'cancelled') { batch.delete(adminDb.collection('gelinler').doc(event.id!)); totalUpdateCount++; deleteCount++; batchCount++; }
        else { const gelin = eventToGelin(event); if (gelin?.__delete) { batch.delete(adminDb.collection('gelinler').doc(gelin.id)); totalUpdateCount++; deleteCount++; batchCount++; } else if (gelin) { batch.set(adminDb.collection('gelinler').doc(gelin.id), gelin, { merge: true }); totalUpdateCount++; batchCount++; } }
        if (batchCount >= 500) { await batch.commit(); batch = adminDb.batch(); batchCount = 0; }
      }
    } while (pageToken);
    if (batchCount > 0) await batch.commit();
    return { success: true, updateCount: totalUpdateCount, deleteCount, syncToken: nextSyncToken };
  } catch (error: unknown) { if ((error as { code?: number }).code === 410) return { success: false, error: 'SYNC_TOKEN_INVALID' }; throw error; }
}

export async function fullSync() {
  const calendar = getCalendarClient();
  const allEvents: CalendarEvent[] = [];
  let pageToken: string | undefined, syncToken: string | undefined;
  do {
    const response = await calendar.events.list({ calendarId: CALENDAR_ID, timeMin: new Date('2025-01-01').toISOString(), timeMax: new Date('2030-12-31').toISOString(), singleEvents: true, maxResults: 2500, pageToken });
    allEvents.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken ?? undefined;
    if (!pageToken && response.data.nextSyncToken) syncToken = response.data.nextSyncToken;
  } while (pageToken);
  let addedCount = 0, skippedCount = 0, deletedCount = 0, batch = adminDb.batch(), batchCount = 0;
  for (const event of allEvents) {
    const gelin = eventToGelin(event);
    if (gelin?.__delete) { batch.delete(adminDb.collection('gelinler').doc(gelin.id)); deletedCount++; batchCount++; }
    else if (gelin) { batch.set(adminDb.collection('gelinler').doc(gelin.id), gelin); addedCount++; batchCount++; if (batchCount >= 100) { await batch.commit(); batch = adminDb.batch(); batchCount = 0; } }
    else { skippedCount++; }
  }
  if (batchCount > 0) await batch.commit();
  return { success: true, totalEvents: allEvents.length, added: addedCount, deleted: deletedCount, skipped: skippedCount, syncToken };
}
