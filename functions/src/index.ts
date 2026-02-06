import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { incrementalSync, fullSync } from './lib/calendar-sync';
import { adminDb, adminAuth } from './lib/firestore-admin';
import { sendPasswordResetEmail } from './lib/email';

// Secret tanımları
const calendarId = defineSecret('GOOGLE_CALENDAR_ID');
const webhookToken = defineSecret('WEBHOOK_TOKEN');
const resendApiKey = defineSecret('RESEND_API_KEY');

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
// HELPER: Firebase ID Token doğrulama
// ============================================
async function verifyUserAuth(req: any, requiredRoles?: string[]): Promise<{ error: string | null; user: any | null }> {
  const authHeader = req.headers.authorization || req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Unauthorized - No token', user: null };
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const email = decodedToken.email;

    const personnelSnapshot = await adminDb
      .collection('personnel')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (personnelSnapshot.empty) {
      return { error: 'User not found', user: null };
    }

    const userData = personnelSnapshot.docs[0].data();
    const userRole = userData.kullaniciTuru || 'Personel';

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(userRole)) {
        return { error: `Insufficient permissions. Required: ${requiredRoles.join(', ')}`, user: null };
      }
    }

    return { error: null, user: { uid: decodedToken.uid, email, role: userRole } };
  } catch (error) {
    console.error('[AUTH] Token verification failed:', error);
    return { error: 'Invalid token', user: null };
  }
}

// ============================================
// 1. CALENDAR WEBHOOK
// ============================================
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
      const result = await incrementalSync(syncTokenDoc.data()?.lastSyncToken);

      if (result.success && result.syncToken) {
        await adminDb.collection('system').doc('sync').set({
          lastSyncToken: result.syncToken,
          lastSync: new Date().toISOString(),
          lastSyncResult: { success: true, updates: result.updateCount }
        }, { merge: true });
        res.json({ status: 'success', updates: result.updateCount }); return;
      } else if (result.error === 'SYNC_TOKEN_INVALID') {
        const fullResult = await fullSync();
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
    await adminDb.collection('system').doc('errors').set({
      lastError: new Date().toISOString(),
      type: 'webhook',
      message: String(error)
    }, { merge: true });
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
    const result = await fullSync();
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
    await adminDb.collection('system').doc('errors').set({
      lastError: new Date().toISOString(),
      type: 'fullSync',
      message: String(error)
    }, { merge: true });
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
    await adminDb.collection('system').doc('errors').set({
      lastError: new Date().toISOString(),
      type: 'webhookRenewal',
      message: String(error)
    }, { merge: true });
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
        await adminDb.collection('system').doc('errors').set({
          lastError: new Date().toISOString(),
          type: 'healthCheck',
          message: `No sync in ${Math.round(hoursSinceSync)} hours`
        }, { merge: true });
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
// 7. PERSONEL API (Yeni oluştur + Güncelle)
// ============================================
export const personelApi = onRequest({
  region: 'europe-west1',
  cors: true,
  secrets: [resendApiKey]
}, async (req, res) => {
  process.env.RESEND_API_KEY = resendApiKey.value();

  // ---- POST: Yeni Personel Oluştur ----
  if (req.method === 'POST') {
    const { error: authError, user } = await verifyUserAuth(req, ['Kurucu', 'Yönetici']);
    if (authError) { res.status(401).json({ error: authError }); return; }

    try {
      const {
        email, password, ad, soyad, sicilNo, telefon, kisaltma,
        calismaSaati, iseBaslama, kullaniciTuru, yoneticiId,
        grupEtiketleri, yetkiliGruplar, aktif, ayarlar, foto,
        firmalar, yonettigiFirmalar, dogumGunu
      } = req.body;

      console.log(`[POST personelApi] Yeni: ${ad} ${soyad} (${email}) - by ${user?.email}`);

      if (!email || !ad || !soyad || !sicilNo || !telefon) {
        res.status(400).json({ error: 'Zorunlu alanlar eksik: email, ad, soyad, sicilNo, telefon' });
        return;
      }

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
          res.status(400).json({ error: 'Bu email adresi zaten kayıtlı' });
          return;
        }
        throw authErr;
      }

      // 2. Firestore'a kaydet (Auth UID = Doc ID)
      const personelData: any = {
        email,
        ad,
        soyad,
        sicilNo,
        telefon,
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
          otoCikis: false,
          qrKamerali: false,
          konumSecim: false,
          qrCihazModu: false,
          girisHatirlatici: false,
          mazeretEkran: false,
          konumDisi: false,
        },
        createdAt: new Date().toISOString(),
        createdBy: user?.email || '',
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

      res.json({
        success: true,
        message: 'Personel başarıyla oluşturuldu',
        uid: userRecord.uid,
        email,
        password: finalPassword
      });

    } catch (error: any) {
      console.error('Personel oluşturma hatası:', error);
      res.status(500).json({ error: 'Personel oluşturulamadı', details: error.message });
    }
    return;
  }

  // ---- PUT: Personel Güncelle ----
  if (req.method === 'PUT') {
    const { error: authError, user } = await verifyUserAuth(req, ['Kurucu', 'Yönetici']);
    if (authError) { res.status(401).json({ error: authError }); return; }

    try {
      const { id, password, ...updateData } = req.body;

      console.log(`[PUT personelApi] Güncelle: ${id} - by ${user?.email}`);

      if (!id) {
        res.status(400).json({ error: 'Personel ID gerekli' });
        return;
      }

      // Şifre değişikliği
      if (password && password.length >= 6) {
        try {
          await adminAuth.updateUser(id, { password });
          console.log(`✅ Password updated: ${id}`);
        } catch (authErr: any) {
          console.error('Auth password update error:', authErr);
        }
      }

      // Email değişikliği
      if (updateData.email) {
        try {
          await adminAuth.updateUser(id, { email: updateData.email });
          console.log(`✅ Email updated: ${id} → ${updateData.email}`);
        } catch (authErr: any) {
          console.error('Auth email update error:', authErr);
          res.status(400).json({ error: 'Email güncellenemedi: ' + authErr.message });
          return;
        }
      }

      // İşten ayrılma tarihi → otomatik pasif yap
      if (updateData.istenAyrilma !== undefined) {
        updateData.aktif = !updateData.istenAyrilma || updateData.istenAyrilma === '';
      }

      // Aktiflik durumu → Auth disable/enable
      if (updateData.aktif !== undefined) {
        try {
          await adminAuth.updateUser(id, { disabled: !updateData.aktif });
          console.log(`✅ Status updated: ${id} → ${updateData.aktif ? 'Active' : 'Disabled'}`);
        } catch (authErr: any) {
          console.error('Auth status update error:', authErr);
        }
      }

      // Firestore güncelle
      await adminDb.collection('personnel').doc(id).update({
        ...updateData,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || ''
      });

      console.log(`✅ Personel updated: ${id}`);
      res.json({ success: true, message: 'Personel başarıyla güncellendi' });

    } catch (error: any) {
      console.error('Personel güncelleme hatası:', error);
      res.status(500).json({ error: 'Personel güncellenemedi', details: error.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

// ============================================
// 8. PERSONEL ACTIONS (Şifre sıfırla, Devre dışı, Telefon kopar)
// ============================================
export const personelActions = onRequest({
  region: 'europe-west1',
  cors: true,
  secrets: [resendApiKey]
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  process.env.RESEND_API_KEY = resendApiKey.value();

  // Auth kontrolü
  const { error: authError, user } = await verifyUserAuth(req, ['Kurucu', 'Yönetici']);
  if (authError) { res.status(401).json({ error: authError }); return; }

  try {
    const { action, personelId } = req.body;

    if (!action) {
      res.status(400).json({ error: 'Action gerekli' });
      return;
    }

    switch (action) {
      // =====================
      // 🔑 ŞİFRE SIFIRLA
      // =====================
      case 'reset-password': {
        if (!personelId) {
          res.status(400).json({ error: 'personelId gerekli' });
          return;
        }

        const personelDoc = await adminDb.collection('personnel').doc(personelId).get();
        if (!personelDoc.exists) {
          res.status(404).json({ error: 'Personel bulunamadı' });
          return;
        }

        const personelData = personelDoc.data()!;
        const authUid = personelData.authUid || personelId;
        const personelEmail = personelData.email;
        const personelName = `${personelData.ad} ${personelData.soyad}`;

        if (!personelEmail) {
          res.status(400).json({ error: 'Bu personelin email adresi yok' });
          return;
        }

        const newPassword = generatePassword(8);

        // Firebase Auth şifre güncelle
        await adminAuth.updateUser(authUid, { password: newPassword });

        // Log kaydet
        await adminDb.collection('personnel').doc(personelId).update({
          lastPasswordReset: new Date().toISOString(),
          passwordResetBy: user?.email || 'admin'
        });

        // Email gönder
        const emailSent = await sendPasswordResetEmail(personelEmail, personelName, newPassword);

        res.json({
          success: true,
          message: emailSent ? 'Şifre sıfırlandı ve email gönderildi' : 'Şifre sıfırlandı (email gönderilemedi)',
          newPassword,
          email: personelEmail,
          emailSent
        });
        return;
      }

      // =====================
      // 🚫 DEVRE DIŞI / AKTİF ET
      // =====================
      case 'toggle-status': {
        if (!personelId) {
          res.status(400).json({ error: 'personelId gerekli' });
          return;
        }

        const personelDoc = await adminDb.collection('personnel').doc(personelId).get();
        if (!personelDoc.exists) {
          res.status(404).json({ error: 'Personel bulunamadı' });
          return;
        }

        const personelData = personelDoc.data()!;
        const currentStatus = personelData.aktif;
        const newStatus = !currentStatus;
        const authUid = personelData.authUid || personelId;

        // Auth disable/enable
        try {
          await adminAuth.updateUser(authUid, { disabled: !newStatus });
        } catch (e) {
          console.error('Auth toggle error:', e);
        }

        // Firestore güncelle
        await adminDb.collection('personnel').doc(personelId).update({
          aktif: newStatus,
          statusChangedAt: new Date().toISOString(),
          statusChangedBy: user?.email || '',
          ...(newStatus === false && { istenAyrilma: new Date().toISOString().split('T')[0] })
        });

        res.json({
          success: true,
          message: newStatus ? 'Personel aktif edildi' : 'Personel devre dışı bırakıldı',
          newStatus
        });
        return;
      }

      // =====================
      // 📱 TELEFON BAĞINI KOPAR
      // =====================
      case 'unbind-device': {
        if (!personelId) {
          res.status(400).json({ error: 'personelId gerekli' });
          return;
        }

        const personelDoc = await adminDb.collection('personnel').doc(personelId).get();
        if (!personelDoc.exists) {
          res.status(404).json({ error: 'Personel bulunamadı' });
          return;
        }

        await adminDb.collection('personnel').doc(personelId).update({
          deviceId: null,
          deviceName: null,
          deviceBoundAt: null,
          deviceUnboundAt: new Date().toISOString(),
          deviceUnboundBy: user?.email || ''
        });

        res.json({
          success: true,
          message: 'Telefon bağı koparıldı. Personel yeni cihazla giriş yapabilir.'
        });
        return;
      }

      default:
        res.status(400).json({ error: `Bilinmeyen action: ${action}` });
    }

  } catch (error: any) {
    console.error('Personel action error:', error);
    res.status(500).json({ error: 'İşlem başarısız', details: error.message });
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