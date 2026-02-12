import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated, onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { incrementalSync, fullSync, FirmaKodu } from './lib/calendar-sync';
import { adminDb, adminAuth, adminMessaging } from './lib/firestore-admin';
import { sendPasswordResetEmail } from './lib/email';
import { uploadFileToDrive } from './lib/drive-upload';

// Secret tanımları
const calendarId = defineSecret('GOOGLE_CALENDAR_ID');
const webhookToken = defineSecret('WEBHOOK_TOKEN');
const resendApiKey = defineSecret('RESEND_API_KEY');
const driveClientId = defineSecret('DRIVE_CLIENT_ID');
const driveClientSecret = defineSecret('DRIVE_CLIENT_SECRET');
const driveRefreshToken = defineSecret('DRIVE_REFRESH_TOKEN');

// ============================================
// HELPER: Rastgele şifre üret
// ============================================
function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================
// SABİTLER
// ============================================
const ADMIN_ROLES = ['Kurucu', 'Yönetici'];

// ============================================
// HELPER: Sistem hata logu
// ============================================
async function logSystemError(type: string, error: unknown) {
  await adminDb.collection('system').doc('errors').set({
    lastError: new Date().toISOString(),
    type,
    message: String(error)
  }, { merge: true });
}

// ============================================
// HELPER: Bildirim gönder (push + Firestore)
// ============================================
type BildirimTip = 'gorev_atama' | 'gorev_tamam' | 'gorev_yorum' | 'duyuru' | 'izin' | 'sistem';

async function sendNotification(params: {
  alici: string;
  title: string;
  body: string;
  tip: BildirimTip;
  route?: string;
  gonderen?: string | null;
  gonderenAd?: string | null;
}): Promise<void> {
  const { alici, title, body, tip, route, gonderen, gonderenAd } = params;

  // Push bildirim
  await sendPushToUser(alici, title, body, route ? { route } : undefined);

  // Firestore bildirim kaydı
  await adminDb.collection('bildirimler').add({
    alici,
    baslik: title,
    mesaj: body,
    tip,
    okundu: false,
    tarih: new Date(),
    route: route || null,
    gonderen: gonderen || null,
    gonderenAd: gonderenAd || null,
  });
}

// Toplu bildirim gönder (birden fazla alıcı)
async function sendNotificationBatch(
  alicilar: Iterable<string>,
  params: Omit<Parameters<typeof sendNotification>[0], 'alici'>
): Promise<void> {
  for (const email of alicilar) {
    await sendNotification({ ...params, alici: email });
  }
}

// ============================================
// HELPER: Input validation
// ============================================
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-() ]{7,20}$/;

function validatePersonelInput(data: Record<string, unknown>) {
  const { email, ad, soyad, sicilNo, telefon } = data;
  if (!email || !ad || !soyad || !sicilNo || !telefon) {
    throw new HttpsError('invalid-argument', 'Zorunlu alanlar eksik: email, ad, soyad, sicilNo, telefon');
  }
  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    throw new HttpsError('invalid-argument', 'Geçersiz email formatı');
  }
  if (typeof telefon !== 'string' || !PHONE_REGEX.test(telefon)) {
    throw new HttpsError('invalid-argument', 'Geçersiz telefon formatı');
  }
  if (typeof ad !== 'string' || ad.trim().length < 2) {
    throw new HttpsError('invalid-argument', 'Ad en az 2 karakter olmalı');
  }
  if (typeof soyad !== 'string' || soyad.trim().length < 2) {
    throw new HttpsError('invalid-argument', 'Soyad en az 2 karakter olmalı');
  }
}

// ============================================
// HELPER: onCall Auth + Rol kontrolü
// ============================================
async function verifyCallableAuth(request: any, requiredRoles?: string[]): Promise<{ email: string; role: string; uid: string }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Giriş yapmanız gerekiyor');
  }

  const email = request.auth.token.email;
  if (!email) {
    throw new HttpsError('unauthenticated', 'Email bulunamadı');
  }

  const personnelSnapshot = await adminDb
    .collection('personnel')
    .where('email', '==', email)
    .limit(1)
    .get();

  if (personnelSnapshot.empty) {
    throw new HttpsError('not-found', 'Kullanıcı bulunamadı');
  }

  const userData = personnelSnapshot.docs[0].data();
  const userRole = userData.kullaniciTuru || 'Personel';

  if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(userRole)) {
    throw new HttpsError('permission-denied', `Yetkiniz yok. Gerekli: ${requiredRoles.join(', ')}`);
  }

  return { email, role: userRole, uid: request.auth.uid };
}
export const calendarWebhook = onRequest({ region: 'europe-west1', cors: true, secrets: [calendarId, webhookToken] }, async (req, res) => {
  try {
    process.env.GOOGLE_CALENDAR_ID = calendarId.value();
    const channelId = req.headers['x-goog-channel-id'] as string;
    const resourceId = req.headers['x-goog-resource-id'] as string;
    const resourceState = req.headers['x-goog-resource-state'] as string;
    const messageNumber = req.headers['x-goog-message-number'] as string;

    console.log('Webhook received:', { channelId, resourceId, resourceState, messageNumber });

    await adminDb.collection('system').doc('webhookLog').set({
      lastReceived: new Date().toISOString(),
      resourceState,
      channelId
    }, { merge: true });

    if (resourceState === 'sync') { res.json({ status: 'sync_acknowledged' }); return; }

    if (resourceState === 'exists') {
      const syncTokenDoc = await adminDb.collection('system').doc('sync').get();
      const result = await incrementalSync(syncTokenDoc.data()?.lastSyncToken, calendarId.value(), 'GYS' as FirmaKodu);

      if (result.success && result.syncToken) {
        await adminDb.collection('system').doc('sync').set({
          lastSyncToken: result.syncToken,
          lastSync: new Date().toISOString(),
          lastSyncResult: { success: true, updates: result.updateCount }
        }, { merge: true });
        res.json({ status: 'success', updates: result.updateCount }); return;
      } else if (result.error === 'SYNC_TOKEN_INVALID') {
        const fullResult = await fullSync(calendarId.value(), 'GYS' as FirmaKodu);
        if (fullResult.syncToken) {
          await adminDb.collection('system').doc('sync').set({
            lastSyncToken: fullResult.syncToken,
            lastFullSync: new Date().toISOString(),
            lastSyncResult: { success: true, type: 'full', added: fullResult.added }
          }, { merge: true });
        }
        res.json({ status: 'full_sync_completed', result: fullResult }); return;
      }
    }
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    await logSystemError('webhook', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================
// 2. FULL SYNC
// ============================================
export const fullSyncEndpoint = onRequest({ region: 'europe-west1', cors: true, timeoutSeconds: 540, secrets: [calendarId] }, async (req, res) => {
  try {
    process.env.GOOGLE_CALENDAR_ID = calendarId.value();
    console.log('Full sync başlatılıyor... Calendar ID:', calendarId.value());
    const result = await fullSync(calendarId.value(), 'GYS' as FirmaKodu);
    if (result.syncToken) {
      await adminDb.collection('system').doc('sync').set({
        lastSyncToken: result.syncToken,
        lastFullSync: new Date().toISOString(),
        needsFullSync: false
      }, { merge: true });
    }
    res.json(result);
  } catch (error) {
    console.error('Full sync error:', error);
    await logSystemError('fullSync', error);
    res.status(500).json({ error: 'Full sync failed', details: String(error) });
  }
});

// ============================================
// 3. SETUP WATCH
// ============================================
export const setupWatch = onRequest({ region: 'europe-west1', cors: true, secrets: [calendarId, webhookToken] }, async (req, res) => {
  try {
    const result = await createWebhookChannel(calendarId.value(), webhookToken.value());
    res.json(result);
  } catch (error) {
    console.error('Setup watch error:', error);
    res.status(500).json({ error: 'Setup watch failed', details: String(error) });
  }
});

// ============================================
// 4. HEALTH CHECK
// ============================================
export const health = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  const syncDoc = await adminDb.collection('system').doc('sync').get();
  const webhookDoc = await adminDb.collection('system').doc('webhookLog').get();
  const errorDoc = await adminDb.collection('system').doc('errors').get();
  const channelsSnapshot = await adminDb.collection('webhookChannels').orderBy('createdAt', 'desc').limit(1).get();

  let webhookStatus = 'unknown';
  let webhookExpires = null;

  if (!channelsSnapshot.empty) {
    const channel = channelsSnapshot.docs[0].data();
    const expiration = new Date(channel.expiration).getTime();
    const now = Date.now();
    webhookExpires = channel.expiration;

    if (expiration > now) {
      const hoursLeft = Math.round((expiration - now) / (1000 * 60 * 60));
      webhookStatus = `active (${hoursLeft}h left)`;
    } else {
      webhookStatus = 'expired';
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    lastSync: syncDoc.data()?.lastSync || 'never',
    lastFullSync: syncDoc.data()?.lastFullSync || 'never',
    lastWebhookReceived: webhookDoc.data()?.lastReceived || 'never',
    webhookStatus,
    webhookExpires,
    lastError: errorDoc.data()?.lastError || null,
    lastErrorType: errorDoc.data()?.type || null
  });
});

// ============================================
// 5. SCHEDULED: Webhook yenileme
// ============================================
export const renewWebhook = onSchedule({
  region: 'europe-west1',
  schedule: 'every 24 hours',
  secrets: [calendarId, webhookToken]
}, async (event) => {
  console.log('Webhook renewal check started...');

  try {
    const channelsSnapshot = await adminDb.collection('webhookChannels')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (channelsSnapshot.empty) {
      console.log('No webhook channel found, creating new one...');
      await createWebhookChannel(calendarId.value(), webhookToken.value());
      return;
    }

    const channel = channelsSnapshot.docs[0].data();
    const expiration = new Date(channel.expiration).getTime();
    const now = Date.now();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

    if (expiration - now < twoDaysMs) {
      console.log('Webhook expiring soon, renewing...');
      await createWebhookChannel(calendarId.value(), webhookToken.value());
      console.log('Webhook renewed successfully');
    } else {
      const hoursLeft = Math.round((expiration - now) / (1000 * 60 * 60));
      console.log(`Webhook still valid, ${hoursLeft} hours left`);
    }
  } catch (error) {
    console.error('Webhook renewal failed:', error);
    await logSystemError('webhookRenewal', error);
  }
});

// ============================================
// 6. SCHEDULED: Günlük sağlık kontrolü
// ============================================
export const dailyHealthCheck = onSchedule({
  region: 'europe-west1',
  schedule: 'every day 09:00',
  timeZone: 'Europe/Istanbul',
  secrets: [calendarId]
}, async (event) => {
  console.log('Daily health check started...');

  try {
    const syncDoc = await adminDb.collection('system').doc('sync').get();
    const lastSync = syncDoc.data()?.lastSync;

    if (lastSync) {
      const lastSyncTime = new Date(lastSync).getTime();
      const now = Date.now();
      const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);

      if (hoursSinceSync > 48) {
        console.warn(`WARNING: No sync in ${Math.round(hoursSinceSync)} hours!`);
        await logSystemError('healthCheck', `No sync in ${Math.round(hoursSinceSync)} hours`);
      } else {
        console.log(`Health check OK. Last sync ${Math.round(hoursSinceSync)} hours ago.`);
      }
    }

    await adminDb.collection('system').doc('healthCheck').set({
      lastCheck: new Date().toISOString(),
      status: 'ok'
    }, { merge: true });

  } catch (error) {
    console.error('Health check failed:', error);
  }
});

// ============================================
// HELPER: Email'i doc ID'de kullanılabilir hale getir
// ============================================
function sanitizeEmailForId(email: string): string {
  return email.replace(/[^a-zA-Z0-9]/g, '_');
}

function gorevCompositeId(gelinId: string, gorevTuru: string, atananEmail: string): string {
  return `${gelinId}_${gorevTuru}_${sanitizeEmailForId(atananEmail)}`;
}

function alanBosMu(gelin: Record<string, unknown>, gorevTuru: string): boolean {
  if (gorevTuru === 'yorumIstesinMi') return !gelin.yorumIstesinMi || (gelin.yorumIstesinMi as string).trim() === '';
  if (gorevTuru === 'paylasimIzni') return !gelin.paylasimIzni;
  if (gorevTuru === 'yorumIstendiMi') return !gelin.yorumIstendiMi;
  if (gorevTuru === 'odemeTakip') return gelin.odemeTamamlandi !== true;
  return false;
}

// REF gelinler referans — ücret alınmaz, odemeTakip görevi oluşturulmaz
function isRefGelin(gelin: Record<string, unknown>): boolean {
  const isim = ((gelin.isim as string) || '').toLocaleLowerCase('tr-TR');
  return isim.includes(' ref ') || isim.includes(' ref-') || isim.endsWith(' ref');
}

// ============================================
// 6b. SHARED: Görev oluşturma mantığı (reconcile)
// ============================================
async function gorevReconcile() {
  const simdi = new Date();
  const trNow = new Date(simdi.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const bugun = `${trNow.getFullYear()}-${String(trNow.getMonth()+1).padStart(2,'0')}-${String(trNow.getDate()).padStart(2,'0')}`;

  const ayarDoc = await adminDb.collection('settings').doc('gorevAyarlari').get();
  if (!ayarDoc.exists) {
    console.log('[Reconcile] Görev ayarları bulunamadı.');
    return { olusturulan: 0, silinen: 0 };
  }
  const ayarlar = ayarDoc.data() as Record<string, { aktif: boolean; baslangicTarihi: string }>;

  const personelSnap = await adminDb.collection('personnel').where('aktif', '==', true).get();
  const personeller = personelSnap.docs.map(d => ({
    email: d.data().email,
    ad: d.data().ad,
    soyad: d.data().soyad,
    kullaniciTuru: d.data().kullaniciTuru || ''
  }));
  const yoneticiler = personeller.filter(p => ADMIN_ROLES.includes(p.kullaniciTuru));

  const gelinlerSnap = await adminDb.collection('gelinler')
    .where('kontrolZamani', '<=', simdi.toISOString())
    .get();

  const mevcutGorevlerSnap = await adminDb.collection('gorevler')
    .where('otomatikMi', '==', true)
    .get();
  const mevcutGorevIds = new Set(mevcutGorevlerSnap.docs.map(d => d.id));

  const gorevTurleri = ['yorumIstesinMi', 'paylasimIzni', 'yorumIstendiMi', 'odemeTakip'] as const;
  const gorevBasliklar: Record<string, string> = {
    yorumIstesinMi: 'Yorum istensin mi alanını doldur',
    paylasimIzni: 'Paylaşım izni alanını doldur',
    yorumIstendiMi: 'Yorum istendi mi alanını doldur',
    odemeTakip: 'Ödeme alınmadı!'
  };

  let toplamOlusturulan = 0;
  let toplamSilinen = 0;

  for (const gelinDoc of gelinlerSnap.docs) {
    const gelin = gelinDoc.data();
    const gelinId = gelinDoc.id;
    const gelinTarih = gelin.tarih as string;

    for (const gorevTuru of gorevTurleri) {
      const ayar = ayarlar[gorevTuru];
      if (!ayar?.aktif || !ayar.baslangicTarihi) continue;
      if (gelinTarih < ayar.baslangicTarihi || gelinTarih > bugun) continue;

      // REF gelinlerde ücret alınmaz → odemeTakip görevi oluşturma
      if (gorevTuru === 'odemeTakip' && isRefGelin(gelin)) continue;

      const bos = alanBosMu(gelin, gorevTuru);

      if (gorevTuru === 'odemeTakip') {
        for (const yonetici of yoneticiler) {
          const compositeId = gorevCompositeId(gelinId, gorevTuru, yonetici.email);
          if (bos && !mevcutGorevIds.has(compositeId)) {
            await adminDb.collection('gorevler').doc(compositeId).set({
              baslik: `${gelin.isim} - ${gorevBasliklar[gorevTuru]}`,
              aciklama: `${gelin.isim} gelinin düğünü ${gelinTarih} tarihinde gerçekleşti. Takvime "--" eklenmesi gerekiyor.`,
              atayan: 'Sistem', atayanAd: 'Sistem (Otomatik)',
              atanan: yonetici.email, atananAd: `${yonetici.ad} ${yonetici.soyad}`,
              durum: 'bekliyor', oncelik: 'acil', olusturulmaTarihi: new Date(),
              gelinId, otomatikMi: true, gorevTuru,
              gelinBilgi: { isim: gelin.isim, tarih: gelinTarih, saat: gelin.saat || '' }
            });
            toplamOlusturulan++;
          } else if (!bos && mevcutGorevIds.has(compositeId)) {
            await adminDb.collection('gorevler').doc(compositeId).delete();
            toplamSilinen++;
          }
        }
      } else {
        const makyajci = personeller.find(p => p.ad.toLocaleLowerCase('tr-TR') === (gelin.makyaj || '').toLocaleLowerCase('tr-TR'));
        const turbanci = personeller.find(p => p.ad.toLocaleLowerCase('tr-TR') === (gelin.turban || '').toLocaleLowerCase('tr-TR'));
        const ayniKisi = makyajci?.email === turbanci?.email;

        const kisiler: { email: string; ad: string; soyad: string; rol: string }[] = [];
        if (makyajci?.email) kisiler.push({ ...makyajci, rol: 'Makyaj' });
        if (turbanci?.email && !ayniKisi) kisiler.push({ ...turbanci, rol: 'Türban' });

        for (const kisi of kisiler) {
          const compositeId = gorevCompositeId(gelinId, gorevTuru, kisi.email);
          if (bos && !mevcutGorevIds.has(compositeId)) {
            await adminDb.collection('gorevler').doc(compositeId).set({
              baslik: `${gelin.isim} - ${gorevBasliklar[gorevTuru]}`,
              aciklama: `${gelin.isim} için "${gorevBasliklar[gorevTuru]}" alanı boş. Takvimden doldurun. (${kisi.rol})`,
              atayan: 'Sistem', atayanAd: 'Sistem (Otomatik)',
              atanan: kisi.email, atananAd: `${kisi.ad} ${kisi.soyad}`,
              durum: 'bekliyor', oncelik: 'yuksek', olusturulmaTarihi: new Date(),
              gelinId, otomatikMi: true, gorevTuru,
              gelinBilgi: { isim: gelin.isim, tarih: gelinTarih, saat: gelin.saat || '' }
            });
            toplamOlusturulan++;
          } else if (!bos && mevcutGorevIds.has(compositeId)) {
            await adminDb.collection('gorevler').doc(compositeId).delete();
            toplamSilinen++;
          }
        }
      }
    }
  }

  return { olusturulan: toplamOlusturulan, silinen: toplamSilinen };
}

// ============================================
// 6b. SCHEDULED: Saatlik görev reconcile
// ============================================
export const hourlyGorevReconcile = onSchedule({
  region: 'europe-west1',
  schedule: 'every 1 hours',
  timeZone: 'Europe/Istanbul',
}, async () => {
  console.log('[RECONCILE] Saatlik görev reconcile başladı...');
  try {
    const result = await gorevReconcile();
    console.log(`[RECONCILE] Tamamlandı. Oluşturulan: ${result.olusturulan}, Silinen: ${result.silinen}`);
    await adminDb.collection('system').doc('gorevKontrol').set({
      lastRun: new Date().toISOString(),
      ...result
    }, { merge: true });

    // Yeni görev oluşturulduysa → 10 birikti eşik kontrolü
    if (result.olusturulan > 0) {
      await checkOtomatikGorevThreshold();
    }
  } catch (error) {
    console.error('[RECONCILE] Görev reconcile hatası:', error);
  }
});

// ============================================
// HELPER: Otomatik görev eşik kontrolü (10 adet birikti)
// Kişi ilk kez 10'a ulaşınca tek seferlik bildirim gönderir
// 10 altına düşerse flag temizlenir, tekrar 10'a çıkınca yeniden bildirim
// ============================================
async function checkOtomatikGorevThreshold() {
  try {
    const otomatikSnap = await adminDb.collection('gorevler')
      .where('otomatikMi', '==', true)
      .where('durum', 'in', ['bekliyor', 'devam-ediyor'])
      .get();

    // Kişi başına say
    const perPerson: Record<string, number> = {};
    for (const doc of otomatikSnap.docs) {
      const email = doc.data().atanan;
      if (email && email !== 'Sistem') {
        perPerson[email] = (perPerson[email] || 0) + 1;
      }
    }

    // Daha önce kimlere "birikti" bildirimi gönderildi?
    const logRef = adminDb.doc('settings/otomatikBildirimLog');
    const logSnap = await logRef.get();
    const bildirimLog: Record<string, string> = logSnap.exists ? (logSnap.data() || {}) as Record<string, string> : {};

    let degisti = false;

    for (const [email, count] of Object.entries(perPerson)) {
      const key = sanitizeEmailForId(email);

      if (count >= 10 && !bildirimLog[key]) {
        console.log(`[THRESHOLD] ${email}: ${count} otomatik görev birikti → bildirim gönderiliyor`);

        await sendNotification({
          alici: email,
          title: '📋 Otomatik Görevler Birikti',
          body: `${count} adet otomatik göreviniz birikti. Lütfen kontrol edin.`,
          tip: 'gorev_atama',
          route: '/gorevler',
        });

        bildirimLog[key] = new Date().toISOString();
        degisti = true;
      } else if (count < 10 && bildirimLog[key]) {
        delete bildirimLog[key];
        degisti = true;
      }
    }

    // Artık görevi olmayan kişileri temizle
    for (const key of Object.keys(bildirimLog)) {
      const halaVar = Object.entries(perPerson).some(
        ([email]) => sanitizeEmailForId(email) === key
      );
      if (!halaVar) {
        delete bildirimLog[key];
        degisti = true;
      }
    }

    if (degisti) {
      await logRef.set(bildirimLog);
    }
  } catch (error) {
    console.error('[THRESHOLD] Otomatik görev eşik kontrolü hatası:', error);
  }
}

// ============================================
// 6d. SCHEDULED: Günlük otomatik görev hatırlatma (10:00)
// 10+ aktif otomatik görevi olan kişilere her sabah hatırlatma
// ============================================
export const dailyOtomatikHatirlatma = onSchedule({
  region: 'europe-west1',
  schedule: 'every day 10:00',
  timeZone: 'Europe/Istanbul',
}, async () => {
  console.log('[OTOMATİK-HATIRLATMA] Günlük otomatik görev hatırlatma başladı (10:00)...');

  try {
    const otomatikSnap = await adminDb.collection('gorevler')
      .where('otomatikMi', '==', true)
      .where('durum', 'in', ['bekliyor', 'devam-ediyor'])
      .get();

    const perPerson: Record<string, number> = {};
    for (const doc of otomatikSnap.docs) {
      const email = doc.data().atanan;
      if (email && email !== 'Sistem') {
        perPerson[email] = (perPerson[email] || 0) + 1;
      }
    }

    let gonderilen = 0;

    for (const [email, count] of Object.entries(perPerson)) {
      if (count >= 10) {
        console.log(`[OTOMATİK-HATIRLATMA] ${email}: ${count} görev → hatırlatma gönderiliyor`);

        await sendNotification({
          alici: email,
          title: '⏰ Otomatik Görev Hatırlatma',
          body: `${count} adet otomatik göreviniz bekliyor. Lütfen kontrol edin.`,
          tip: 'gorev_atama',
          route: '/gorevler',
        });

        gonderilen++;
      }
    }

    console.log(`[OTOMATİK-HATIRLATMA] ${gonderilen} kişiye hatırlatma gönderildi`);

    await adminDb.doc('system/otomatikHatirlatmaLog').set({
      lastRun: new Date().toISOString(),
      gonderilen,
      detay: Object.entries(perPerson)
        .filter(([, c]) => c >= 10)
        .map(([e, c]) => ({ email: e, count: c }))
    });
  } catch (error) {
    console.error('[OTOMATİK-HATIRLATMA] Hata:', error);
    await logSystemError('otomatikHatirlatma', error);
  }
});

// ============================================
// 6c. TRIGGER: Gelin güncellendiğinde görev sil (real-time)
// ============================================
export const onGelinUpdated = onDocumentUpdated({
  document: 'gelinler/{gelinId}',
  region: 'europe-west1',
}, async (event) => {
  if (!event.data) return;
  const before = event.data.before.data();
  const after = event.data.after.data();
  const gelinId = event.params.gelinId;

  const alanlar: { alan: string; gorevTuru: string; beforeVal: unknown; afterVal: unknown }[] = [
    { alan: 'yorumIstesinMi', gorevTuru: 'yorumIstesinMi', beforeVal: before.yorumIstesinMi, afterVal: after.yorumIstesinMi },
    { alan: 'paylasimIzni', gorevTuru: 'paylasimIzni', beforeVal: before.paylasimIzni, afterVal: after.paylasimIzni },
    { alan: 'yorumIstendiMi', gorevTuru: 'yorumIstendiMi', beforeVal: before.yorumIstendiMi, afterVal: after.yorumIstendiMi },
    { alan: 'odemeTamamlandi', gorevTuru: 'odemeTakip', beforeVal: before.odemeTamamlandi, afterVal: after.odemeTamamlandi }
  ];

  const degisen = alanlar.filter(a => String(a.beforeVal ?? '') !== String(a.afterVal ?? ''));
  if (degisen.length === 0) return;

  for (const { gorevTuru, afterVal } of degisen) {
    let alanDolu = false;
    if (gorevTuru === 'yorumIstesinMi') alanDolu = !!afterVal && String(afterVal).trim() !== '';
    else if (gorevTuru === 'paylasimIzni') alanDolu = !!afterVal;
    else if (gorevTuru === 'yorumIstendiMi') alanDolu = !!afterVal;
    else if (gorevTuru === 'odemeTakip') alanDolu = afterVal === true;

    if (alanDolu) {
      const gorevlerSnap = await adminDb.collection('gorevler')
        .where('gelinId', '==', gelinId)
        .where('gorevTuru', '==', gorevTuru)
        .where('otomatikMi', '==', true)
        .get();

      for (const gorevDoc of gorevlerSnap.docs) {
        await adminDb.collection('gorevler').doc(gorevDoc.id).delete();
        console.log(`[Trigger] Görev silindi: ${gorevDoc.id} (${gorevTuru})`);
      }
    }
  }
});

// ============================================
// 6b. GELİN SİLİNDİĞİNDE OTOMATİK GÖREVLERİ TEMİZLE
// ============================================
export const onGelinDeleted = onDocumentDeleted({
  document: 'gelinler/{gelinId}',
  region: 'europe-west1',
}, async (event) => {
  const gelinId = event.params.gelinId;
  console.log(`[onGelinDeleted] Gelin silindi: ${gelinId}, otomatik görevler temizleniyor...`);

  const gorevlerSnap = await adminDb.collection('gorevler')
    .where('gelinId', '==', gelinId)
    .where('otomatikMi', '==', true)
    .get();

  if (gorevlerSnap.empty) {
    console.log(`[onGelinDeleted] ${gelinId} için otomatik görev bulunamadı.`);
    return;
  }

  const batch = adminDb.batch();
  gorevlerSnap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log(`[onGelinDeleted] ${gorevlerSnap.size} otomatik görev silindi (gelinId: ${gelinId})`);
});

// ============================================
// 7. PERSONEL API (Yeni oluştur + Güncelle)
// ============================================
// ============================================
// 7a. PERSONEL OLUŞTUR (onCall)
// ============================================
export const personelCreate = onCall({
  region: 'europe-west1',
  secrets: [resendApiKey]
}, async (request) => {
  process.env.RESEND_API_KEY = resendApiKey.value();
  const user = await verifyCallableAuth(request, ADMIN_ROLES);

  const {
    email, password, ad, soyad, sicilNo, telefon, kisaltma,
    calismaSaati, iseBaslama, kullaniciTuru, yoneticiId,
    grupEtiketleri, yetkiliGruplar, aktif, ayarlar, foto,
    firmalar, yonettigiFirmalar, dogumGunu
  } = request.data;

  console.log(`[personelCreate] Yeni: ${ad} ${soyad} (${email}) - by ${user.email}`);

  validatePersonelInput(request.data);

  const finalPassword = password || generatePassword(8);

  // 1. Firebase Auth kullanıcı oluştur
  let userRecord;
  try {
    userRecord = await adminAuth.createUser({
      email,
      password: finalPassword,
      displayName: `${ad} ${soyad}`,
      disabled: aktif === false
    });
    console.log(`✅ Auth user created: ${userRecord.uid}`);
  } catch (authErr: any) {
    if (authErr.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Bu email adresi zaten kayıtlı');
    }
    throw new HttpsError('internal', authErr.message);
  }

  // 2. Firestore'a kaydet
  const personelData: any = {
    email, ad, soyad, sicilNo, telefon,
    kisaltma: kisaltma || '',
    calismaSaati: calismaSaati || 'serbest',
    iseBaslama: iseBaslama || '',
    istenAyrilma: '',
    kullaniciTuru: kullaniciTuru || 'Personel',
    yoneticiId: yoneticiId || '',
    grup: '',
    grupEtiketleri: grupEtiketleri || [],
    yetkiliGruplar: yetkiliGruplar || [],
    aktif: aktif !== false,
    foto: foto || '',
    firmalar: firmalar || [],
    yonettigiFirmalar: yonettigiFirmalar || [],
    dogumGunu: dogumGunu || '',
    ayarlar: ayarlar || {
      otoCikis: false, qrKamerali: false, konumSecim: false,
      qrCihazModu: false, girisHatirlatici: false, mazeretEkran: false, konumDisi: false,
    },
    createdAt: new Date().toISOString(),
    createdBy: user.email,
    authUid: userRecord.uid
  };

  await adminDb.collection('personnel').doc(userRecord.uid).set(personelData);
  console.log(`✅ Firestore personel saved: ${userRecord.uid}`);

  // 3. Şifre maili gönder
  try {
    await sendPasswordResetEmail(email, `${ad} ${soyad}`, finalPassword);
    console.log(`✅ Password email sent: ${email}`);
  } catch (emailError) {
    console.error('Mail gönderme hatası:', emailError);
  }

  return {
    success: true,
    message: 'Personel başarıyla oluşturuldu',
    uid: userRecord.uid,
    email,
    password: finalPassword
  };
});

// ============================================
// 7b. PERSONEL GÜNCELLE (onCall)
// ============================================
export const personelUpdate = onCall({
  region: 'europe-west1'
}, async (request) => {
  const user = await verifyCallableAuth(request, ADMIN_ROLES);

  const { id, password, ...updateData } = request.data;

  console.log(`[personelUpdate] Güncelle: ${id} - by ${user.email}`);

  if (!id) {
    throw new HttpsError('invalid-argument', 'Personel ID gerekli');
  }

  // Firestore'dan authUid al (eski kayıtlarda doc ID ≠ Auth UID olabilir)
  const personelDoc = await adminDb.collection('personnel').doc(id).get();
  const authUid = personelDoc.exists ? (personelDoc.data()?.authUid || id) : id;

  // Şifre değişikliği
  if (password && password.length >= 6) {
    try {
      await adminAuth.updateUser(authUid, { password });
      console.log(`✅ Password updated: ${authUid}`);
    } catch (authErr: any) {
      console.error('Auth password update error:', authErr);
    }
  }

  // Email değişikliği
  if (updateData.email) {
    try {
      await adminAuth.updateUser(authUid, { email: updateData.email });
      console.log(`✅ Email updated: ${authUid} → ${updateData.email}`);
    } catch (authErr: any) {
      console.error('Auth email update error:', authErr);
      throw new HttpsError('invalid-argument', 'Email güncellenemedi: ' + authErr.message);
    }
  }

  // İşten ayrılma tarihi → otomatik pasif yap
  if (updateData.istenAyrilma !== undefined) {
    updateData.aktif = !updateData.istenAyrilma || updateData.istenAyrilma === '';
  }

  // Aktiflik durumu → Auth disable/enable
  if (updateData.aktif !== undefined) {
    try {
      await adminAuth.updateUser(authUid, { disabled: !updateData.aktif });
      console.log(`✅ Status updated: ${authUid} → ${updateData.aktif ? 'Active' : 'Disabled'}`);
    } catch (authErr: any) {
      console.error('Auth status update error:', authErr);
    }
  }

  // Firestore güncelle
  await adminDb.collection('personnel').doc(id).update({
    ...updateData,
    updatedAt: new Date().toISOString(),
    updatedBy: user.email
  });

  console.log(`✅ Personel updated: ${id}`);
  return { success: true, message: 'Personel başarıyla güncellendi' };
});

// ============================================
// 8. PERSONEL ACTIONS (Şifre sıfırla, Devre dışı, Telefon kopar)
// ============================================
export const personelActions = onCall({
  region: 'europe-west1',
  secrets: [resendApiKey]
}, async (request) => {
  process.env.RESEND_API_KEY = resendApiKey.value();
  const user = await verifyCallableAuth(request, ADMIN_ROLES);

  const { action, personelId } = request.data;

  if (!action) {
    throw new HttpsError('invalid-argument', 'Action gerekli');
  }

  switch (action) {
    // =====================
    // 🔑 ŞİFRE SIFIRLA
    // =====================
    case 'reset-password': {
      if (!personelId) throw new HttpsError('invalid-argument', 'personelId gerekli');

      const personelDoc = await adminDb.collection('personnel').doc(personelId).get();
      if (!personelDoc.exists) throw new HttpsError('not-found', 'Personel bulunamadı');

      const personelData = personelDoc.data()!;
      const authUid = personelData.authUid || personelId;
      const personelEmail = personelData.email;
      const personelName = `${personelData.ad} ${personelData.soyad}`;

      if (!personelEmail) throw new HttpsError('invalid-argument', 'Bu personelin email adresi yok');

      const newPassword = generatePassword(8);

      await adminAuth.updateUser(authUid, { password: newPassword });

      await adminDb.collection('personnel').doc(personelId).update({
        lastPasswordReset: new Date().toISOString(),
        passwordResetBy: user.email
      });

      const emailSent = await sendPasswordResetEmail(personelEmail, personelName, newPassword);

      return {
        success: true,
        message: emailSent ? 'Şifre sıfırlandı ve email gönderildi' : 'Şifre sıfırlandı (email gönderilemedi)',
        newPassword,
        email: personelEmail,
        emailSent
      };
    }

    // =====================
    // 🚫 DEVRE DIŞI / AKTİF ET
    // =====================
    case 'toggle-status': {
      if (!personelId) throw new HttpsError('invalid-argument', 'personelId gerekli');

      const personelDoc = await adminDb.collection('personnel').doc(personelId).get();
      if (!personelDoc.exists) throw new HttpsError('not-found', 'Personel bulunamadı');

      const personelData = personelDoc.data()!;
      const currentStatus = personelData.aktif;
      const newStatus = !currentStatus;
      const authUid = personelData.authUid || personelId;

      try {
        await adminAuth.updateUser(authUid, { disabled: !newStatus });
      } catch (e) {
        console.error('Auth toggle error:', e);
      }

      await adminDb.collection('personnel').doc(personelId).update({
        aktif: newStatus,
        statusChangedAt: new Date().toISOString(),
        statusChangedBy: user.email,
        ...(newStatus === false && { istenAyrilma: new Date().toISOString().split('T')[0] })
      });

      return {
        success: true,
        message: newStatus ? 'Personel aktif edildi' : 'Personel devre dışı bırakıldı',
        newStatus
      };
    }

    // =====================
    // 📱 TELEFON BAĞINI KOPAR
    // =====================
    case 'unbind-device': {
      if (!personelId) throw new HttpsError('invalid-argument', 'personelId gerekli');

      const personelDoc = await adminDb.collection('personnel').doc(personelId).get();
      if (!personelDoc.exists) throw new HttpsError('not-found', 'Personel bulunamadı');

      await adminDb.collection('personnel').doc(personelId).update({
        deviceId: null,
        deviceName: null,
        deviceBoundAt: null,
        deviceUnboundAt: new Date().toISOString(),
        deviceUnboundBy: user.email
      });

      return {
        success: true,
        message: 'Telefon bağı koparıldı. Personel yeni cihazla giriş yapabilir.'
      };
    }

    default:
      throw new HttpsError('invalid-argument', `Bilinmeyen action: ${action}`);
  }
});

// ============================================
// Helper: Webhook channel oluştur
// ============================================
async function createWebhookChannel(calId: string, token: string) {
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/calendar'] });
  const calendar = google.calendar({ version: 'v3', auth });

  const channelIdVal = `gys-channel-${Date.now()}`;
  const webhookUrl = `https://europe-west1-gmt-test-99b30.cloudfunctions.net/calendarWebhook`;

  const response = await calendar.events.watch({
    calendarId: calId,
    requestBody: { id: channelIdVal, type: 'web_hook', address: webhookUrl, token, params: { ttl: '604800' } }
  });

  await adminDb.collection('webhookChannels').doc(channelIdVal).set({
    channelId: channelIdVal,
    resourceId: response.data.resourceId,
    webhookToken: token,
    expiration: new Date(parseInt(response.data.expiration || '0')).toISOString(),
    createdAt: new Date().toISOString()
  });

  console.log('New webhook channel created:', channelIdVal);

  return {
    success: true,
    channelId: channelIdVal,
    resourceId: response.data.resourceId,
    expiration: response.data.expiration
  };
}

// ============================================
// HELPER: Push bildirim gönder
// ============================================
async function sendPushToUser(email: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
  try {
    const tokenDoc = await adminDb.collection('pushTokens').doc(email).get();
    if (!tokenDoc.exists) {
      console.log(`[PUSH] No token for ${email}`);
      return false;
    }

    const token = tokenDoc.data()?.token;
    if (!token) {
      console.log(`[PUSH] Empty token for ${email}`);
      return false;
    }

    await adminMessaging.send({
      token,
      notification: { title, body },
      data: data || {},
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } }
    });

    console.log(`[PUSH] ✅ Sent to ${email}: ${title}`);
    return true;
  } catch (error: any) {
    // Token geçersizse sil
    if (error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token') {
      console.log(`[PUSH] Invalid token for ${email}, deleting...`);
      await adminDb.collection('pushTokens').doc(email).delete();
    } else {
      console.error(`[PUSH] Error sending to ${email}:`, error);
    }
    return false;
  }
}

// ============================================
// 9. GÖREV BİLDİRİMLERİ (Firestore Trigger)
// Client'tan çağrı GEREKMEZ — Firestore otomatik tetikler
// ============================================

// 9a. Yeni görev oluşturulunca → atanan kişi(ler)e bildirim
export const onGorevCreated = onDocumentCreated({
  document: 'gorevler/{gorevId}',
  region: 'europe-west1'
}, async (event) => {
  const data = event.data?.data();
  if (!data) return;

  // Otomatik görevlere tek tek bildirim gönderme (eşik sistemi var)
  if (data.otomatikMi) return;

  const gorevId = event.params.gorevId;
  const { atayan, atayanAd, baslik, oncelik, ortakMi, atananlar, atanan } = data;

  const oncelikEmoji = oncelik === 'acil' ? '🔴' : oncelik === 'yuksek' ? '🟠' : '';
  const title = `${oncelikEmoji} Yeni Görev Atandı`.trim();
  const body = `${atayanAd || 'Birisi'} size bir görev atadı: ${baslik}`;
  const route = `/gorevler?gorevId=${gorevId}`;

  // Bildirim alacak kişileri belirle
  const alicilar: string[] = [];
  if (ortakMi && Array.isArray(atananlar)) {
    for (const email of atananlar) {
      if (email !== atayan) alicilar.push(email);
    }
  } else if (atanan && atanan !== atayan) {
    alicilar.push(atanan);
  }

  if (alicilar.length === 0) return;

  console.log(`[GOREV-BILDIRIM] ${atayanAd} → ${alicilar.length} kişi: ${baslik}`);

  await sendNotificationBatch(alicilar, {
    title, body, tip: 'gorev_atama', route,
    gonderen: atayan || null,
    gonderenAd: atayanAd || null,
  });
});

// 9b. Görev güncellenince → tamamlama + yorum bildirimi
export const onGorevUpdated = onDocumentUpdated({
  document: 'gorevler/{gorevId}',
  region: 'europe-west1'
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;

  const gorevId = event.params.gorevId;
  const route = `/gorevler?gorevId=${gorevId}`;
  const durumDegisti = before.durum !== after.durum;
  const beforeYorumlar = before.yorumlar || [];
  const afterYorumlar = after.yorumlar || [];
  const yeniYorumVar = afterYorumlar.length > beforeYorumlar.length;
  const isOrtak = after.ortakMi === true && Array.isArray(after.atananlar);

  // Ortak görevde bireysel tamamlama (durum henüz tamamlandi olmadı ama tamamlayanlar değişti)
  const beforeTamamlayanlar = before.tamamlayanlar || [];
  const afterTamamlayanlar = after.tamamlayanlar || [];
  const yeniTamamlayanVar = isOrtak && afterTamamlayanlar.length > beforeTamamlayanlar.length;

  // === ORTAK GÖREV: Biri tamamladığında (herkes tamamlamadan) ===
  if (yeniTamamlayanVar && after.durum !== 'tamamlandi') {
    const yeniTamamlayan = afterTamamlayanlar.find((e: string) => !beforeTamamlayanlar.includes(e));
    if (yeniTamamlayan) {
      const sonYorum = afterYorumlar[afterYorumlar.length - 1];
      const tamamlayanAd = sonYorum?.yazanAd || 'Birisi';

      const title = '📋 Ortak Görev Güncellendi';
      const body = `${tamamlayanAd} tamamladı (${afterTamamlayanlar.length}/${after.atananlar.length}): ${after.baslik}`;

      // Atayan + diğer atananlar (tamamlayan hariç)
      const bildirimAlacaklar = new Set<string>();
      if (after.atayan && after.atayan !== yeniTamamlayan && after.atayan !== 'Sistem') {
        bildirimAlacaklar.add(after.atayan);
      }
      for (const email of after.atananlar) {
        if (email !== yeniTamamlayan) bildirimAlacaklar.add(email);
      }

      for (const email of bildirimAlacaklar) {
        await sendNotification({
          alici: email, title, body, tip: 'gorev_tamam', route,
          gonderen: yeniTamamlayan, gonderenAd: tamamlayanAd,
        });
      }

      // Tamamlama yorumu tekrar bildirim göndermesin
      return;
    }
  }

  // === TAMAMLAMA BİLDİRİMİ (herkes tamamladı veya kişisel görev) ===
  if (durumDegisti && after.durum === 'tamamlandi') {
    const sonYorum = afterYorumlar[afterYorumlar.length - 1];
    const tamamlayan = sonYorum?.yazan || after.atanan;
    const tamamlayanAd = sonYorum?.yazanAd || after.atananAd || 'Birisi';

    if (isOrtak) {
      // Ortak görev tamamen tamamlandı → herkese bildir
      const title = '✅ Ortak Görev Tamamlandı';
      const body = `Herkes tamamladı: ${after.baslik}`;

      const bildirimAlacaklar = new Set<string>();
      if (after.atayan && after.atayan !== 'Sistem') bildirimAlacaklar.add(after.atayan);
      for (const email of after.atananlar) bildirimAlacaklar.add(email);

      for (const email of bildirimAlacaklar) {
        await sendNotification({
          alici: email, title, body, tip: 'gorev_tamam', route,
          gonderen: tamamlayan, gonderenAd: tamamlayanAd,
        });
      }
    } else {
      // Kişisel görev — atayan kişiye bildir
      if (after.atayan && after.atayan !== tamamlayan && after.atayan !== 'Sistem') {
        console.log(`[GOREV-TAMAM] ${tamamlayanAd} tamamladı → ${after.atayan}: ${after.baslik}`);

        const title = '✅ Görev Tamamlandı';
        const body = `${tamamlayanAd} görevi tamamladı: ${after.baslik}`;

        await sendNotification({
          alici: after.atayan, title, body, tip: 'gorev_tamam', route,
          gonderen: tamamlayan, gonderenAd: tamamlayanAd,
        });
      }
    }

    // Tamamlama ile birlikte gelen yorumu tekrar bildirim olarak gönderme
    return;
  }

  // === YORUM BİLDİRİMİ ===
  if (yeniYorumVar) {
    const yeniYorum = afterYorumlar[afterYorumlar.length - 1];
    const yorumYapan = yeniYorum?.yazan;
    const yorumYapanAd = yeniYorum?.yazanAd || 'Birisi';

    console.log(`[GOREV-YORUM] ${yorumYapanAd} yorum yaptı: ${after.baslik}`);

    const title = '💬 Göreve Yorum Yapıldı';
    const body = `${yorumYapanAd} yorum yaptı: ${after.baslik}`;

    // Görevdeki herkese gönder (yorum yapan hariç)
    const bildirimAlacaklar = new Set<string>();
    if (after.atayan && after.atayan !== yorumYapan && after.atayan !== 'Sistem') {
      bildirimAlacaklar.add(after.atayan);
    }
    if (isOrtak) {
      // Ortak görev — tüm atananlara
      for (const email of after.atananlar) {
        if (email !== yorumYapan) bildirimAlacaklar.add(email);
      }
    } else if (after.atanan && after.atanan !== yorumYapan) {
      bildirimAlacaklar.add(after.atanan);
    }

    for (const email of bildirimAlacaklar) {
      await sendNotification({
        alici: email, title, body, tip: 'gorev_yorum', route,
        gonderen: yorumYapan || null, gonderenAd: yorumYapanAd || null,
      });
    }
  }
});

// ============================================
// 9c. Yeni duyuru oluşturulunca → gruptaki herkese push bildirim
// Client zaten bildirimYazCoklu ile in-app bildirim yazıyor,
// bu trigger push notification ekler
// ============================================
export const onDuyuruCreated = onDocumentCreated({
  document: 'announcements/{docId}',
  region: 'europe-west1'
}, async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const { title, author, important, group } = data;

  console.log(`[DUYURU-PUSH] Yeni duyuru: "${title}" by ${author} (grup: ${group || 'genel'})`);

  const pushTitle = important ? '🔴 Önemli Duyuru' : '📢 Yeni Duyuru';
  const pushBody = `${author || 'Yönetici'}: ${title}`;

  try {
    // Gruptaki aktif personelleri bul
    let personelQuery;
    if (group) {
      personelQuery = adminDb.collection('personnel')
        .where('grupEtiketleri', 'array-contains', group)
        .where('aktif', '==', true);
    } else {
      // Grup belirtilmemişse herkese
      personelQuery = adminDb.collection('personnel')
        .where('aktif', '==', true);
    }

    const personelSnap = await personelQuery.get();
    let gonderilen = 0;

    for (const personelDoc of personelSnap.docs) {
      const email = personelDoc.data().email;
      if (!email) continue;

      // Push gönder (in-app bildirim zaten client tarafında yazılıyor)
      const sent = await sendPushToUser(email, pushTitle, pushBody, { route: '/duyurular' });
      if (sent) gonderilen++;
    }

    console.log(`[DUYURU-PUSH] ✅ ${gonderilen}/${personelSnap.size} kişiye push gönderildi`);
  } catch (error) {
    console.error('[DUYURU-PUSH] Hata:', error);
  }
});

// ============================================
// 10. SCHEDULED: Günlük görev hatırlatma (09:00)
// ============================================
export const dailyGorevHatirlatma = onSchedule({
  region: 'europe-west1',
  schedule: 'every day 09:00',
  timeZone: 'Europe/Istanbul'
}, async (event) => {
  console.log('[HATIRLATMA] Günlük görev hatırlatma başladı...');

  try {
    // Yarınki tarih (YYYY-MM-DD) - Türkiye saati
    const now = new Date();
    const trNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const yarin = new Date(trNow);
    yarin.setDate(yarin.getDate() + 1);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const yarinStr = fmt(yarin);
    const bugun = fmt(trNow);

    // Aktif görevleri çek (bekliyor + devam-ediyor)
    const gorevlerSnapshot = await adminDb.collection('gorevler')
      .where('durum', 'in', ['bekliyor', 'devam-ediyor'])
      .get();

    let yarinHatirlatma = 0;
    let gecikmisBildirim = 0;

    for (const gorevDoc of gorevlerSnapshot.docs) {
      const gorev = gorevDoc.data();
      const sonTarih = gorev.sonTarih;
      const atanan = gorev.atanan; // email

      if (!sonTarih) continue;

      // Bildirim alacak kişileri belirle
      const alicilar: string[] = [];
      if (gorev.ortakMi && Array.isArray(gorev.atananlar)) {
        // Ortak görev — tamamlamayan kişilere gönder
        const tamamlayanlar = gorev.tamamlayanlar || [];
        for (const email of gorev.atananlar) {
          if (!tamamlayanlar.includes(email)) alicilar.push(email);
        }
      } else if (atanan) {
        alicilar.push(atanan);
      }

      if (alicilar.length === 0) continue;

      const gorevRoute = `/gorevler?gorevId=${gorevDoc.id}`;

      // Yarın son tarihli görevler → hatırlatma
      if (sonTarih === yarinStr) {
        for (const email of alicilar) {
          await sendNotification({
            alici: email,
            title: '⏰ Görev Hatırlatma',
            body: `"${gorev.baslik}" görevinin son tarihi yarın!`,
            tip: 'gorev_atama',
            route: gorevRoute,
            gonderen: 'sistem',
            gonderenAd: 'Sistem',
          });
        }
        yarinHatirlatma++;
      }

      // Gecikmiş görevler → uyarı (sadece bugün gecikmeye başlayanlar)
      if (sonTarih === bugun) {
        for (const email of alicilar) {
          await sendNotification({
            alici: email,
            title: '⚠️ Son Gün!',
            body: `"${gorev.baslik}" görevinin son tarihi bugün!`,
            tip: 'gorev_atama',
            route: gorevRoute,
            gonderen: 'sistem',
            gonderenAd: 'Sistem',
          });
        }
        gecikmisBildirim++;
      }
    }

    console.log(`[HATIRLATMA] ✅ Tamamlandı: ${yarinHatirlatma} yarın, ${gecikmisBildirim} bugün son gün`);

    // Log kaydet
    await adminDb.collection('system').doc('gorevHatirlatma').set({
      lastRun: new Date().toISOString(),
      yarinHatirlatma,
      gecikmisBildirim,
      toplamAktifGorev: gorevlerSnapshot.size
    }, { merge: true });

  } catch (error) {
    console.error('[HATIRLATMA] Hata:', error);
    await logSystemError('gorevHatirlatma', error);
  }
});

// ============================================
// 11. SCHEDULED: Eski bildirimleri temizle (30 gün)
// ============================================
export const cleanOldNotifications = onSchedule({
  region: 'europe-west1',
  schedule: 'every 24 hours',
  timeZone: 'Europe/Istanbul',
}, async (event) => {
  console.log('[TEMIZLIK] Eski bildirim temizleme başladı...');

  try {
    const otuzGunOnce = new Date();
    otuzGunOnce.setDate(otuzGunOnce.getDate() - 30);

    let toplamSilinen = 0;

    // Firestore batch max 500, loop ile temizle
    while (true) {
      const snapshot = await adminDb.collection('bildirimler')
        .where('tarih', '<', otuzGunOnce)
        .limit(500)
        .get();

      if (snapshot.empty) break;

      const batch = adminDb.batch();
      snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
      toplamSilinen += snapshot.size;

      // 500'den az geldiyse bitmiştir
      if (snapshot.size < 500) break;
    }

    console.log(`[TEMIZLIK] ✅ ${toplamSilinen} eski bildirim silindi`);

    await adminDb.collection('system').doc('bildirimTemizlik').set({
      lastRun: new Date().toISOString(),
      silinen: toplamSilinen
    }, { merge: true });

  } catch (error) {
    console.error('[TEMIZLIK] Hata:', error);
    await logSystemError('bildirimTemizlik', error);
  }
});

// ============================================
// 12. RAPOR / BELGE YÜKLEME (Google Drive)
// ============================================
export const uploadToDrive = onCall({
  region: 'europe-west1',
  maxInstances: 10,
  enforceAppCheck: false,
  secrets: [driveClientId, driveClientSecret, driveRefreshToken],
}, async (request) => {
  // Auth kontrolü
  await verifyCallableAuth(request);

  const { base64Data, mimeType, fileName, folderKey } = request.data;

  if (!base64Data || !mimeType || !fileName || !folderKey) {
    throw new HttpsError('invalid-argument', 'base64Data, mimeType, fileName ve folderKey zorunludur');
  }

  // Max 10MB kontrol
  const sizeInBytes = Buffer.from(base64Data, 'base64').length;
  if (sizeInBytes > 10 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', 'Dosya boyutu 10MB\'ı aşamaz');
  }

  // İzin verilen MIME tipleri
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedMimes.includes(mimeType)) {
    throw new HttpsError('invalid-argument', `Desteklenmeyen dosya tipi: ${mimeType}`);
  }

  try {
    console.log(`[DRIVE-UPLOAD] ${fileName} yükleniyor... (${(sizeInBytes / 1024).toFixed(0)} KB)`);

    const result = await uploadFileToDrive({
      base64Data, mimeType, fileName, folderKey,
      clientId: driveClientId.value(),
      clientSecret: driveClientSecret.value(),
      refreshToken: driveRefreshToken.value(),
    });

    console.log(`[DRIVE-UPLOAD] ✅ Başarılı: ${result.fileId}`);

    return {
      success: true,
      fileId: result.fileId,
      webViewLink: result.webViewLink,
      thumbnailLink: result.thumbnailLink,
    };
  } catch (error) {
    console.error('[DRIVE-UPLOAD] Hata:', error);
    await logSystemError('driveUpload', error);
    throw new HttpsError('internal', 'Dosya yüklenemedi: ' + String(error));
  }
});