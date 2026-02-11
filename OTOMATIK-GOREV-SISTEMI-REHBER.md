# Otomatik Görev Sistemi — Detaylı Rehber
> Son güncelleme: 11 Şubat 2026

---

## 1. SİSTEM NE YAPIYOR?

Düğünü geçmiş gelinlerin takvimde doldurulması gereken alanları var. Kimse takip etmezse unutuluyor. Bu sistem:

- **Alanlar boşsa** → ilgili personele otomatik görev oluşturuyor
- **Alan doldurulunca** → görevi otomatik siliyor
- **Gelin takvimden silinirse** → o geline ait tüm otomatik görevler otomatik temizleniyor

Kimsenin butona basmasına gerek yok. Sistem kendi kendine çalışıyor.

---

## 2. 4 GÖREV TÜRÜ

| # | Görev Türü | Kontrol Edilen Alan | Kime Atanır | Öncelik |
|---|---|---|---|---|
| 1 | `yorumIstesinMi` | Yorum istensin mi (boş/dolu) | Makyajcı + Türbancı | Yüksek |
| 2 | `paylasimIzni` | Paylaşım izni var mı (false/true) | Makyajcı + Türbancı | Yüksek |
| 3 | `yorumIstendiMi` | Yorum istendi mi (false/true) | Makyajcı + Türbancı | Yüksek |
| 4 | `odemeTakip` | Ödeme tamamlandı mı (takvimde "--" var mı) | Yöneticiler (Kurucu/Yönetici) | Acil |

> ⚠️ **REF Gelinler:** İsimde "Ref" geçen gelinler referanstır, ücret alınmaz. Bu gelinler için `odemeTakip` görevi **oluşturulmaz** ve DikkatPanel'de "işlenmemiş ücret" olarak **gösterilmez**.

---

## 3. VERİ NEREDEN GELİYOR?

### Takvim → Firestore akışı:

```
Google Calendar etkinliği:
  Başlık: "Melike Durak ✅ K--"
  Açıklama: "yorum istensin mi:✔️ / paylaşım izni var mı: / ..."

        ↓ (calendarWebhook, günde ~73 kez)

calendar-sync.ts → parsePersonel() → parseDescription()
  - Başlıktaki "--" → odemeTamamlandi: true
  - Başlıktaki "✅" sonrası kısaltmalar → makyaj: "Kübra", turban: "Kübra"
  - Açıklamadaki "✔️" → yorumIstesinMi: "Evet", paylasimIzni: true, vs.
  - Düğün saati + 5 saat → kontrolZamani (ISO string)

        ↓ (Firestore'a yazılır)

Firestore: gelinler/{eventId}
  {
    isim: "Melike Durak",
    tarih: "2026-01-01",
    saat: "12:00",
    makyaj: "Kübra",
    turban: "Kübra",
    odemeTamamlandi: true,    ← "--" varsa true
    kontrolZamani: "2026-01-01T22:00:00.000Z",  ← düğün+5saat
    yorumIstesinMi: "Evet",   ← ✔️ varsa "Evet"
    paylasimIzni: true,       ← ✔️ varsa true
    yorumIstendiMi: false,    ← ✔️ varsa true
    ...
  }
```

### kontrolZamani nedir?

Düğün başlangıç saati + 5 saat. Örnek:
- Düğün 12:00'de başlıyor → kontrolZamani = 17:00
- 4 saat düğün süresi + 1 saat bekleme = 5 saat

Sistem bu zamana kadar görev oluşturmaz. Kontrol zamanı geçtikten sonra "alan boş mu?" diye bakar.

---

## 4. 4 MEKANİZMA (birbirini yedekliyor)

### A) onGelinUpdated — Firestore Trigger (görev SİLME, anlık)

**Ne zaman çalışır:** Firestore'daki gelin dokümanı her değiştiğinde.
**Ne yapar:**
1. before (eski) ve after (yeni) değerleri karşılaştırır
2. İlgili 4 alandan hiçbiri değişmediyse → anında çıkar (0 okuma, 0 yazma)
3. Bir alan boştan doluya geçtiyse → o türün görevini siler

**Örnek:** Takvimde "yorum istensin mi:✔️" eklendi → webhook Firestore'u güncelledi → trigger çalıştı → `yorumIstesinMi` boş→dolu → görev silindi. Saniyeler içinde.

**Dosya:** `functions/src/index.ts` → `onGelinUpdated`

---

### B) onGelinDeleted — Firestore Trigger (gelin silinince görevleri TEMİZLE, anlık)

**Ne zaman çalışır:** Firestore'daki gelin dokümanı silindiğinde (Google Calendar'dan gelin silinir → webhook tetiklenir → Firestore'dan gelin silinir → bu trigger çalışır).
**Ne yapar:**
1. Silinen gelinin `gelinId`'sini alır
2. `gorevler` collection'ında `gelinId == silinendId && otomatikMi == true` olan tüm görevleri bulur
3. Batch delete ile hepsini tek seferde siler

**Örnek:** Google Calendar'dan "Sümeyye Ref" etkinliğini sildin → webhook gelini Firestore'dan sildi → trigger çalıştı → Sümeyye'ye ait 5 otomatik görev otomatik silindi. Saniyeler içinde.

**Neden gerekli:** Bu olmadan gelin silinse bile görevleri "yetim" olarak kalıyordu. Kimse sahiplenmediği için görev listesinde süresiz duruyordu.

**Dosya:** `functions/src/index.ts` → `onGelinDeleted`

---

### C) hourlyGorevReconcile — Saatlik Scheduled Job (görev OLUŞTURMA + temizlik)

**Ne zaman çalışır:** Her saat başı otomatik.
**Ne yapar:**
1. `settings/gorevAyarlari` dokümanından aktif türleri okur
2. `kontrolZamani <= şu an` olan tüm gelinleri çeker
3. Her gelin için, her aktif tür için:
   - **REF gelin + odemeTakip** → atla (ücret alınmaz)
   - Alan boş + görev yok → görev OLUŞTUR
   - Alan dolu + görev var → görev SİL
4. Composite key kullanır (`gelinId_gorevTuru_email`) → mükerrer görev imkansız

**Neden saatte 1:** Düğün bitti ama takvimde değişiklik olmadı → trigger tetiklenmez. Bu job "düğün biten ama alan boş kalan" gelinleri yakalar.

**Dosya:** `functions/src/index.ts` → `hourlyGorevReconcile` + `gorevReconcile()`

---

### D) "Senkronize Et" Butonu — Manuel Panik Butonu

**Ne zaman kullanılır:** Bir şey ters giderse. Sistem bozulursa. İlk kurulumda.
**Ne yapar:**
1. Görev Ayarları sayfasını aç
2. Başlangıç tarihlerini kontrol et
3. "Senkronize Et"e bas
4. Tüm otomatik görevleri silip, baştan doğru olanları oluşturur

**Dosya:** `src/pages/Gorevler.tsx` → `handleTumunuSenkronizeEt()`

---

## 5. GÖREV ID YAPISI (Composite Key)

Görev ID'si rastgele değil, hesaplanmış:

```
Format: {gelinId}_{gorevTuru}_{emailSanitized}

Örnek: abc123_odemeTakip_aziz_gmail_com
```

**Neden:** 
- Aynı görev 2 kez oluşturulamaz (setDoc üzerine yazar)
- Silmek için sorgu gerekmez (ID zaten biliniyor)
- 10 kere çalıştır, sonuç değişmez (idempotent)

---

## 6. GÖREV AYARLARI

**Firestore:** `settings/gorevAyarlari`

```json
{
  "yorumIstesinMi": { "aktif": true, "baslangicTarihi": "2026-01-01" },
  "paylasimIzni": { "aktif": true, "baslangicTarihi": "2026-01-01" },
  "yorumIstendiMi": { "aktif": true, "baslangicTarihi": "2026-01-01" },
  "odemeTakip": { "aktif": true, "baslangicTarihi": "2026-01-01" }
}
```

- **aktif:** Bu tür için görev oluşturulsun mu?
- **baslangicTarihi:** Bu tarihten önceki gelinleri ATLA. 2025'teki gelinlere görev oluşturma.

**Değiştirmek için:** Görevler sayfası → sağ üst "Görev Ayarları" → tarihleri/toggle'ları değiştir

---

## 7. "YAPTIM" BUTONU

Her otomatik görevde yeşil "✅ Yaptım" butonu var.

**Ne yapar:**
1. İlgili gelini Firestore'dan çeker
2. Alanın gerçekten dolu olup olmadığını kontrol eder
3. Doluysa → görevi siler
4. Boşsa → "Alan hala boş, takvimden doldurun!" uyarısı verir

**Not:** Yaptım butonu görev dokümanını direkt silmez, önce kontrol eder. Yanlış silme olmaz.

---

## 8. BİR ŞEY BOZULURSA NE YAPILIR?

### Problem: Görevler oluşmuyor

1. **Firebase Console** → Functions → `hourlyGorevReconcile` loglarına bak
2. **Görev Ayarları** kontrol et → aktif mi? başlangıç tarihi doğru mu?
3. **Firestore** → `settings/gorevAyarlari` dokümanı var mı?
4. **Son çare:** Görev Ayarları → "Senkronize Et" bas

### Problem: Görevler silinmiyor (alan dolduruluyor ama görev duruyor)

1. **Firebase Console** → Functions → `onGelinUpdated` loglarına bak
2. Takvimde değişiklik yapıldıktan sonra webhook geldi mi? → `system/webhookLog` kontrol et
3. **fullSync tetikle:** `curl https://fullsyncendpoint-avoaxmv2za-ew.a.run.app`
4. **Son çare:** Görev Ayarları → "Senkronize Et" bas

### Problem: Gelin silindi ama otomatik görevleri hala duruyor

1. **Firebase Console** → Functions → `onGelinDeleted` loglarına bak
2. Trigger doğru çalışıyorsa logda "otomatik görevler temizleniyor" yazmalı
3. **Yetim görev temizliği (manuel):**
```bash
cat << 'EOF' > ~/Desktop/mgt-app-vite/functions/cleanup.js
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
(async () => {
  const snap = await db.collection('gorevler').where('otomatikMi','==',true).get();
  let silinen = 0;
  for (const doc of snap.docs) {
    const gid = doc.data().gelinId;
    if (!gid) continue;
    const gelin = await db.collection('gelinler').doc(gid).get();
    if (!gelin.exists) { await doc.ref.delete(); silinen++; }
  }
  console.log('Silinen yetim gorev:', silinen);
  process.exit(0);
})();
EOF
cd ~/Desktop/mgt-app-vite/functions && node cleanup.js
rm cleanup.js
```
4. **Son çare:** Görev Ayarları → "Senkronize Et" bas

### Problem: Yanlış görevler oluşmuş (ödeme alınmış ama "ödeme alınmadı" diyor)

1. Takvimde "--" var mı kontrol et (çift tire olmalı)
2. **fullSync tetikle:** Firestore'daki `odemeTamamlandi` alanını günceller
3. fullSync sonrası trigger görevleri otomatik siler

### Problem: REF geline ödeme görevi oluşmuş

1. İsimde "Ref" doğru yazılmış mı? (boşluklu: "Sümeyye Ref - İncirli Köşk")
2. `hourlyGorevReconcile` deploy edilmiş mi? (`isRefGelin()` kontrolü 11 Şubat 2026'da eklendi)
3. **Manuel temizlik:** Mevcut REF görevlerini silmek için:
```bash
cat << 'EOF' > ~/Desktop/mgt-app-vite/functions/cleanup-ref.js
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
(async () => {
  const snap = await db.collection('gorevler')
    .where('otomatikMi', '==', true)
    .where('gorevTuru', '==', 'odemeTakip').get();
  let silinen = 0;
  for (const doc of snap.docs) {
    const isim = (doc.data().gelinBilgi?.isim || '').toLowerCase();
    if (isim.includes(' ref ') || isim.includes(' ref-') || isim.endsWith(' ref')) {
      await doc.ref.delete(); silinen++;
    }
  }
  console.log('Silinen REF gorev:', silinen);
  process.exit(0);
})();
EOF
cd ~/Desktop/mgt-app-vite/functions && node cleanup-ref.js && rm cleanup-ref.js
```

### Problem: Hiçbir şey çalışmıyor

1. Firebase Console → Functions → 11 fonksiyon var mı?
2. Yoksa deploy et: `cd functions && npm run build && npx firebase-tools deploy --only functions`
3. fullSync tetikle: `curl https://fullsyncendpoint-avoaxmv2za-ew.a.run.app`
4. Senkronize Et bas

---

## 9. DEPLOY KOMUTLARI

```bash
# Functions deploy (backend)
cd ~/Desktop/mgt-app-vite/functions
npm run build
npx firebase-tools deploy --only functions

# fullSync tetikle (tüm gelinleri güncelle)
curl https://fullsyncendpoint-avoaxmv2za-ew.a.run.app

# Frontend deploy
cd ~/Desktop/mgt-app-vite
npm run build
git add . && git commit -m "açıklama" && git push

# Logları kontrol et
npx firebase-tools functions:log --only onGelinUpdated
npx firebase-tools functions:log --only onGelinDeleted
npx firebase-tools functions:log --only hourlyGorevReconcile
```

---

## 10. DOSYA HARİTASI

```
functions/src/
  index.ts
    ├── hourlyGorevReconcile  → Saatlik görev oluşturma/silme (scheduled)
    ├── onGelinUpdated         → Alan değişince görev silme (trigger)
    ├── onGelinDeleted         → Gelin silinince otomatik görevleri toplu silme (trigger)
    ├── gorevReconcile()       → Shared mantık (reconcile helper)
    ├── gorevId()              → Composite key oluşturma helper
    ├── alanBosMu()            → Alan boş mu kontrol helper
    ├── isRefGelin()           → REF gelin tespiti (ücret alınmaz, odemeTakip atlanır)
    ├── sanitizeEmail()        → Email'i ID'de kullanılabilir yapma
    ├── calendarWebhook        → Google Calendar → Firestore sync
    └── fullSyncEndpoint       → Tüm gelinleri baştan sync

  lib/calendar-sync.ts
    ├── eventToGelin()         → Calendar event → Firestore doküman (kontrolZamani dahil)
    ├── parsePersonel()        → Başlıktan makyajcı/türbancı/ödeme parse
    ├── parseDescription()     → Açıklamadan tüm alanları parse
    ├── incrementalSync()      → Sadece değişen eventler (webhook kullanır)
    └── fullSync()             → 2025-2030 tüm eventler (merge:true)

src/pages/
  Gorevler.tsx
    ├── Görev Ayarları paneli  → 4 tür toggle + başlangıç tarihi
    ├── handleTumunuSenkronizeEt() → Manuel panik butonu
    ├── handleYaptim()         → Yaptım butonu (alan kontrol + silme)
    ├── compositeGorevId()     → Frontend composite key helper
    └── 3 tab: Görevlerim / Otomatik Görevler / Ekip Görevleri
```

---

## 11. MALİYET

| İşlem | Günlük Tahmin | Firestore Okuma | Firestore Yazma |
|---|---|---|---|
| Webhook sync | ~73 istek | ~73 | ~73 |
| hourlyGorevReconcile (24x) | 24 çalışma | ~50-100 | ~5-10 |
| onGelinUpdated trigger | ~73 tetikleme | ~0 (early return) | ~5 (silme) |
| onGelinDeleted trigger | ~1-2 tetikleme | ~1-2 (görev sorgu) | ~1-5 (batch silme) |
| fullSync (ayda 1-2) | 2563 gelin | 0 | 2563 |
| **Günlük toplam** | | **~200** | **~90** |
| **Ücretsiz limit** | | **50.000** | **20.000** |

Limitin %1'ini bile kullanmıyor. Rahat.

---

## 12. ÖNEMLİ NOTLAR

- **"--" çift tire olmalı.** Tek tire ödeme olarak sayılmaz.
- **fullSync merge:true kullanıyor.** Yani `gorevKontrolYapildi` gibi ekstra alanları ezmez.
- **Trigger early return yapıyor.** fullSync 2563 gelini güncellese bile, ilgili alan değişmediyse 0 okuma ile çıkar.
- **Composite key mükerrer koruma sağlıyor.** Aynı gelin+tür+kişi için 2. görev oluşturulamaz.
- **Başlangıç tarihi önemli.** Bu tarihten önceki gelinlere görev oluşturulmaz. 2025 gelinlerine görev düşmemesi için tarihi doğru ayarla.
- **Gelin silme akışı:** Google Calendar'dan sil → webhook tetiklenir → Firestore'dan gelin silinir → `onGelinDeleted` trigger o geline ait tüm otomatik görevleri batch delete ile temizler. Elle müdahale gerekmez.
- **Yetim görev riski:** `onGelinDeleted` trigger'ı 11 Şubat 2026'da eklendi. Bu tarihten önce silinen gelinlerin yetim görevleri varsa, yukarıdaki cleanup script ile temizlenebilir.
- **REF gelinler ücret muafı.** İsimde " Ref " geçen gelinler referanstır. `odemeTakip` görevi oluşturulmaz, DikkatPanel'de işlenmemiş ücret olarak gösterilmez. Tespit fonksiyonu: `isRefGelin()` (backend) ve `islenmemisUcretler` filtresinde (frontend). 3 firma için de geçerli.
