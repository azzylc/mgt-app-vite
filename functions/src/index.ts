import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { incrementalSync, fullSync } from './lib/calendar-sync';
import { adminDb } from './lib/firestore-admin';

// Secret tanımları
const calendarId = defineSecret('GOOGLE_CALENDAR_ID');
const webhookToken = defineSecret('WEBHOOK_TOKEN');

// 1. CALENDAR WEBHOOK
export const calendarWebhook = onRequest({ region: 'europe-west1', cors: true, secrets: [calendarId, webhookToken] }, async (req, res) => {
  try {
    process.env.GOOGLE_CALENDAR_ID = calendarId.value();
    const channelId = req.headers['x-goog-channel-id'] as string;
    const resourceId = req.headers['x-goog-resource-id'] as string;
    const resourceState = req.headers['x-goog-resource-state'] as string;
    // const channelToken = req.headers['x-goog-channel-token'] as string;
    const messageNumber = req.headers['x-goog-message-number'] as string;

    console.log('Webhook received:', { channelId, resourceId, resourceState, messageNumber });

    // Log successful webhook receipt
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
        // Full sync needed
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

// 2. FULL SYNC
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

// 3. SETUP WATCH (manuel)
export const setupWatch = onRequest({ region: 'europe-west1', cors: true, secrets: [calendarId, webhookToken] }, async (req, res) => {
  try {
    const result = await createWebhookChannel(calendarId.value(), webhookToken.value());
    res.json(result);
  } catch (error) { 
    console.error('Setup watch error:', error); 
    res.status(500).json({ error: 'Setup watch failed', details: String(error) }); 
  }
});

// 4. HEALTH CHECK
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

// 5. SCHEDULED: Webhook yenileme (her gün kontrol, 2 gün kala yenile)
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

// 6. SCHEDULED: Günlük sağlık kontrolü
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
      
      // 48 saatten fazla sync yoksa uyarı
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

// Helper: Webhook channel oluştur
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
