import { google } from 'googleapis';
import { adminDb } from './firestore-admin';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

// Google Calendar API client
export function getCalendarClient() {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'
  );

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  return google.calendar({ version: 'v3', auth });
}

// Text normalization - NBSP, boşluklar, Türkçe karakterler
function normalizeText(s: string): string {
  return (s ?? '')
    .replace(/\u00A0/g, ' ')  // NBSP → normal space
    .normalize('NFKC')         // Unicode normalize
    .replace(/ +/g, ' ')       // Multiple spaces → single space
    .trim();
}

// Robust financial marker check (çeşitli varyasyonları yakalar)
function hasFinancialMarkers(description: string): boolean {
  const normalized = normalizeText(description);
  // "Anlaşılan Ücret:", "Anlasilan Ucret:", "Kapora:", "Kalan:" varyasyonlarını yakala
  return /anla[şs][ıi]lan\s*[üu]cret\s*:|kapora\s*:|kalan\s*:/i.test(normalized);
}

// ✅ ERTELENDİ KONTROLÜ (İPTAL kayıtlar KALACAK!)
function isErtelendi(title: string): boolean {
  const upper = (title || '').toUpperCase();
  return upper.includes('ERTELENDİ');
}

// Description'dan tüm bilgileri parse et (SAĞLAMLAŞTIRILMIŞ!)
function parseDescription(description: string) {
  // Her satırı normalize et
  const lines = description
    .split('\n')
    .map(line => normalizeText(line));

  const result: any = {
    kinaGunu: '',
    telefon: '',
    esiTelefon: '',
    instagram: '',
    fotografci: '',
    modaevi: '',
    anlasildigiTarih: '',
    bilgilendirmeGonderildi: false,
    ucretYazildi: false,
    malzemeListesiGonderildi: false,
    paylasimIzni: false,
    yorumIstesinMi: '',
    yorumIstendiMi: false,
    gelinNotu: '',
    dekontGorseli: '',
    ucret: 0,
    kapora: 0,
    kalan: 0
  };

  lines.forEach(line => {
    const lower = line.toLowerCase().trim();

    // Kına Günü
    if (!result.kinaGunu && line.includes('Kına') && !line.includes(':')) {
      result.kinaGunu = line.trim();
    }

    // Tel No (eşi tel no hariç)
    if (lower.includes('tel no:') && !lower.includes('eşi')) {
      const value = line.split(':')[1]?.trim() || '';
      result.telefon = value;
    }

    // Eşi Tel No
    if (lower.includes('eşi tel no:')) {
      const value = line.split(':')[1]?.trim() || '';
      result.esiTelefon = value;
    }

    // Instagram
    if (lower.includes('ig:')) {
      result.instagram = line.split(':')[1]?.trim() || '';
    }

    // Fotoğrafçı
    if (lower.includes('fotoğrafçı:')) {
      result.fotografci = line.split(':')[1]?.trim() || '';
    }

    // Modaevi
    if (lower.includes('modaevi:')) {
      result.modaevi = line.split(':')[1]?.trim() || '';
    }

    // Anlaşılan Ücret - ROBUST + SPECIFIC REGEX
    // Sadece "Anlaşılan Ücret:" satırını yakala (varyantlarıyla)
    const ucretMatch = line.match(/^anla[şs][ıi]lan\s*[üu]cret\s*:\s*(.+)/i);
    if (ucretMatch) {
      const value = ucretMatch[1].trim();
      if (value.toUpperCase().includes('X')) {
        result.ucret = -1;
      } else {
        const nums = value.replace(/[^0-9]/g, '');
        result.ucret = parseInt(nums) || 0;
      }
    }

    // Kapora - ROBUST REGEX
    const kaporaMatch = line.match(/^kapora\s*:\s*(.+)/i);
    if (kaporaMatch) {
      const value = kaporaMatch[1].trim();
      const nums = value.replace(/[^0-9]/g, '');
      result.kapora = parseInt(nums) || 0;
    }

    // Kalan - ROBUST + SPECIFIC REGEX
    const kalanMatch = line.match(/^kalan\s*:\s*(.+)/i);
    if (kalanMatch) {
      const value = kalanMatch[1].trim();
      if (value.toUpperCase().includes('X')) {
        result.kalan = -1;
      } else {
        const nums = value.replace(/[^0-9]/g, '');
        result.kalan = parseInt(nums) || 0;
      }
    }

    // Anlaştığı Tarih - ISO formatına çevir
    if (lower.includes('anlaştığı tarih:')) {
      const dateStr = line.split(':').slice(1).join(':').trim();
      const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
      if (match) {
        const [_, day, month, year, hour, minute] = match;
        result.anlasildigiTarih = `${year}-${month}-${day}T${hour}:${minute}:00`;
      }
    }

    // Checkboxlar
    if (lower.includes('bilgilendirme metni gönderildi mi')) {
      result.bilgilendirmeGonderildi = line.includes('✔️') || line.includes('✓');
    }

    if (lower.includes('anlaşılan ve kalan ücret yazıldı mı')) {
      result.ucretYazildi = line.includes('✔️') || line.includes('✓');
    }

    if (lower.includes('malzeme listesi gönderildi mi')) {
      result.malzemeListesiGonderildi = line.includes('✔️') || line.includes('✓');
    }

    if (lower.includes('paylaşım izni var mı')) {
      result.paylasimIzni = line.includes('✔️') || line.includes('✓');
    }

    if (lower.includes('yorum istensin mi') && !lower.includes('istendi')) {
      result.yorumIstesinMi = line.includes('✔️') || line.includes('✓') ? 'Evet' : '';
    }

    if (lower.includes('yorum istendi mi')) {
      result.yorumIstendiMi = line.includes('✔️') || line.includes('✓');
    }

    // Gelin Notu
    if (lower.includes('varsa gelin notu:')) {
      result.gelinNotu = line.split(':').slice(1).join(':').trim();
    }

    // Dekont Görseli
    if (lower.includes('dekont görseli:')) {
      result.dekontGorseli = line.split(':').slice(1).join(':').trim();
    }
  });

  return result;
}

// Personel bilgisini parse et
function parsePersonel(title: string) {
  const kisaltmaMap: { [key: string]: string } = {
    "SA": "Saliha",
    "SE": "Selen",
    "T": "Tansu",
    "K": "Kübra",
    "R": "Rümeysa",
    "B": "Bahar",
    "Z": "Zehra"
  };

  const temizleVeEsle = (str: string) => {
    const temiz = str.replace(/[-–—]/g, '').trim().toUpperCase();
    return kisaltmaMap[temiz] || temiz;
  };

  const parts = title.split('✅');
  const isim = (parts[0] || '').trim();
  const personelStr = (parts[1] || '').replace(/[-–—]/g, ' ').trim();

  let makyaj = '';
  let turban = '';

  if (personelStr.includes('&')) {
    const kisiler = personelStr.split('&').map(x => temizleVeEsle(x.trim()));
    makyaj = kisiler[0] || '';
    turban = kisiler[1] || '';
  } else if (personelStr) {
    const kisi = temizleVeEsle(personelStr);
    makyaj = kisi;
    turban = kisi;
  }

  return { isim, makyaj, turban };
}

// Event'i Firestore formatına çevir
function eventToGelin(event: any): any {
  const title = event.summary || '';
  const description = event.description || '';
  const startDate = event.start?.dateTime || event.start?.date;

  if (!startDate) {
    console.warn('[SKIP] startDate yok:', { id: event.id, title });
    return null;
  }

  // ✅ ERTELENDİ KONTROLÜ - Bunları Firestore'a kaydetme, varsa sil!
  if (isErtelendi(title)) {
    console.warn('[SKIP] ERTELENDİ:', { id: event.id, title });
    return { __delete: true, id: event.id, reason: 'ertelendi' };
  }

  // ✅ FİNANSAL VERİ KONTROLÜ (ROBUST!)
  // ✅ REF İSTİSNASI: REF varsa finansal veri şartı arama!
  const titleUpper = title.toUpperCase();
  const hasFinancialData = hasFinancialMarkers(description) || titleUpper.includes('REF');
  
  if (!hasFinancialData) {
    console.warn('[SKIP] Finansal veri yok:', { id: event.id, title });
    return null;
  }

  const date = new Date(startDate);
  
  // Türkiye saatine çevir (Europe/Istanbul timezone)
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }); // YYYY-MM-DD format
  const timeStr = date.toLocaleTimeString('en-GB', { 
    timeZone: 'Europe/Istanbul', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  }); // HH:MM format

  const parsedData = parseDescription(description);
  const { isim, makyaj, turban } = parsePersonel(title);

  return {
    id: event.id,
    isim,
    tarih: dateStr,
    saat: timeStr,
    ucret: parsedData.ucret,
    kapora: parsedData.kapora,
    kalan: parsedData.kalan,
    makyaj,
    turban,
    kinaGunu: parsedData.kinaGunu,
    telefon: parsedData.telefon,
    esiTelefon: parsedData.esiTelefon,
    instagram: parsedData.instagram,
    fotografci: parsedData.fotografci,
    modaevi: parsedData.modaevi,
    anlasildigiTarih: parsedData.anlasildigiTarih,
    bilgilendirmeGonderildi: parsedData.bilgilendirmeGonderildi,
    ucretYazildi: parsedData.ucretYazildi,
    malzemeListesiGonderildi: parsedData.malzemeListesiGonderildi,
    paylasimIzni: parsedData.paylasimIzni,
    yorumIstesinMi: parsedData.yorumIstesinMi,
    yorumIstendiMi: parsedData.yorumIstendiMi,
    gelinNotu: parsedData.gelinNotu,
    dekontGorseli: parsedData.dekontGorseli,
    updatedAt: new Date().toISOString()
  };
}

// Incremental sync - syncToken kullanarak (with pagination)
export async function incrementalSync(syncToken?: string) {
  const calendar = getCalendarClient();

  const baseParams: any = {
    calendarId: CALENDAR_ID,
    singleEvents: true,
    showDeleted: true,
  };

  if (syncToken) {
    baseParams.syncToken = syncToken;
  } else {
    baseParams.timeMin = new Date('2025-01-01').toISOString();
    baseParams.timeMax = new Date('2030-12-31').toISOString();
  }

  try {
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let totalUpdateCount = 0;
    let deleteCount = 0;
    let batch = adminDb.batch();
    let batchCount = 0;

    // Pagination loop - çok değişiklik varsa tüm sayfaları çek
    do {
      const params = { ...baseParams, pageToken };
      const response: any = await calendar.events.list(params);
      const events = response.data.items || [];
      
      // Next page token (varsa devam et)
      pageToken = response.data.nextPageToken ?? undefined;
      
      // Next sync token (son sayfada gelir)
      if (!pageToken && response.data.nextSyncToken) {
        nextSyncToken = response.data.nextSyncToken;
      }

      // Process events in this page
      for (const event of events) {
        if (event.status === 'cancelled') {
          const docRef = adminDb.collection('gelinler').doc(event.id!);
          batch.delete(docRef);
          totalUpdateCount++;
          deleteCount++;
          batchCount++;
        } else {
          const gelin = eventToGelin(event);
          
          // ✅ ERTELENDİ ise Firestore'dan SİL (İPTAL kayıtlar kalacak)
          if (gelin && gelin.__delete) {
            const docRef = adminDb.collection('gelinler').doc(gelin.id);
            batch.delete(docRef);
            totalUpdateCount++;
            deleteCount++;
            batchCount++;
            console.log(`🗑️ Siliniyor (${gelin.reason}): ${event.summary}`);
          } else if (gelin) {
            const docRef = adminDb.collection('gelinler').doc(gelin.id);
            batch.set(docRef, gelin, { merge: true });
            totalUpdateCount++;
            batchCount++;
          }
        }

        // Commit batch if it reaches 500 (Firestore limit)
        if (batchCount >= 500) {
          await batch.commit();
          console.log(`📦 Batch committed: ${totalUpdateCount} total updates so far`);
          batch = adminDb.batch();
          batchCount = 0;
        }
      }

      console.log(`📄 Page processed: ${events.length} events (total: ${totalUpdateCount} updates, ${deleteCount} deletes)`);
    } while (pageToken);

    // Commit remaining batch
    if (batchCount > 0) {
      await batch.commit();
    }

    return { success: true, updateCount: totalUpdateCount, deleteCount, syncToken: nextSyncToken };
  } catch (error: any) {
    if (error.code === 410) {
      return { success: false, error: 'SYNC_TOKEN_INVALID' };
    }
    throw error;
  }
}

// Full sync - SADECE EKLE (SİLME YOK!)
export async function fullSync() {
  const calendar = getCalendarClient();

  // CALENDAR'DAN TÜM GELİNLERİ ÇEK (PAGINATION İLE!)
  console.log('📥 Calendar\'dan çekiliyor...');
  let allEvents: any[] = [];
  let pageToken: string | null | undefined = undefined;
  let syncToken: string | undefined;

  do {
    const response: any = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: new Date('2025-01-01').toISOString(),
      timeMax: new Date('2030-12-31').toISOString(),
      singleEvents: true,
      maxResults: 2500,
      pageToken: pageToken || undefined
    });

    const events = response.data.items || [];
    allEvents = allEvents.concat(events);
    pageToken = response.data.nextPageToken;
    
    // Son sayfada syncToken gelir
    if (!pageToken && response.data.nextSyncToken) {
      syncToken = response.data.nextSyncToken;
    }

    console.log(`📦 ${events.length} event çekildi (Toplam: ${allEvents.length})`);
  } while (pageToken);

  console.log(`✅ Toplam ${allEvents.length} event çekildi`);

  // 3. FIRESTORE'A YAZ (100'lük BATCH'LERLE!)
  console.log('📝 Firestore\'a yazılıyor...');
  let addedCount = 0;
  let skippedCount = 0;
  let deletedCount = 0;
  let batch = adminDb.batch();
  let batchCount = 0;

  for (const event of allEvents) {
    const gelin = eventToGelin(event);
    
    // ✅ ERTELENDİ ise Firestore'dan SİL (İPTAL kayıtlar kalacak)
    if (gelin && gelin.__delete) {
      const docRef = adminDb.collection('gelinler').doc(gelin.id);
      batch.delete(docRef);
      deletedCount++;
      batchCount++;
      console.log(`🗑️ Siliniyor (${gelin.reason}): ${event.summary}`);
    } else if (gelin) {
      const docRef = adminDb.collection('gelinler').doc(gelin.id);
      batch.set(docRef, gelin);
      addedCount++;
      batchCount++;

      // Firestore batch limiti: 100 (güvenli için)
      if (batchCount >= 100) {
        await batch.commit();
        console.log(`💾 ${addedCount} gelin yazıldı...`);
        batch = adminDb.batch();
        batchCount = 0;
      }
    } else {
      skippedCount++;
    }
  }

  // Son batch'i commit et
  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`✅ Toplam ${addedCount} gelin eklendi`);
  console.log(`🗑️ ${deletedCount} gelin silindi (ertelendi - İPTAL kayıtlar korundu)`);
  console.log(`⚠️ ${skippedCount} event atlandı (finansal veri yok)`);

  return { 
    success: true,
    totalEvents: allEvents.length,
    added: addedCount,
    deleted: deletedCount,
    skipped: skippedCount,
    syncToken: syncToken
  };
}