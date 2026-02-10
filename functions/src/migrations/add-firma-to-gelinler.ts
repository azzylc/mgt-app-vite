/**
 * Migration: Mevcut gelinlere firma: "GYS" field'ı ekle
 * 
 * Kullanım:
 *   cd ~/Desktop/mgt-app-vite/functions
 *   npx ts-node src/migrations/add-firma-to-gelinler.ts
 * 
 * NOT: Bu script sadece 1 kere çalıştırılmalı!
 */

import * as admin from 'firebase-admin';

// Firebase Admin SDK başlat
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateGelinler() {
  console.log('🚀 Migration başlıyor: gelinler → firma: "GYS"');

  const snapshot = await db.collection('gelinler').get();
  console.log(`📊 Toplam ${snapshot.size} gelin kaydı bulundu.`);

  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Zaten firma field'ı varsa atla
    if (data.firma) {
      skipped++;
      continue;
    }

    batch.update(doc.ref, { firma: 'GYS' });
    updated++;
    batchCount++;

    // Firestore batch limit: 500
    if (batchCount >= 500) {
      await batch.commit();
      console.log(`  ✅ ${updated} kayıt güncellendi...`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log('');
  console.log('✅ Migration tamamlandı!');
  console.log(`   Güncellenen: ${updated}`);
  console.log(`   Atlanan (zaten firma var): ${skipped}`);
  console.log(`   Toplam: ${snapshot.size}`);

  // system/sync → system/sync_GYS taşı
  console.log('');
  console.log('📋 Sync token taşınıyor: system/sync → system/sync_GYS');
  const syncDoc = await db.collection('system').doc('sync').get();
  if (syncDoc.exists) {
    await db.collection('system').doc('sync_GYS').set({
      ...syncDoc.data(),
      firma: 'GYS'
    }, { merge: true });
    console.log('   ✅ sync_GYS oluşturuldu.');
  } else {
    console.log('   ⚠️ system/sync bulunamadı, atlanıyor.');
  }

  process.exit(0);
}

migrateGelinler().catch((err) => {
  console.error('❌ Migration hatası:', err);
  process.exit(1);
});
