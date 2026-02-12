/**
 * Cihaz Bağlama (Device Binding) Modülü
 * 
 * Her kullanıcı hesabı tek bir cihaza bağlanır.
 * - İlk girişte cihaz otomatik bağlanır
 * - Farklı cihazdan giriş engellenir
 * - Yönetici "Telefon Bağını Kopar" ile bağ sıfırlanır
 * 
 * Firestore alanları (personnel collection):
 *   deviceId       → Cihaz UUID
 *   deviceName     → "iPhone 15 Pro" veya "Tarayıcı"
 *   deviceBoundAt  → ISO tarih string
 */

import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";
import { doc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";

const DEVICE_STORAGE_KEY = "gmt_device_id";

/**
 * Benzersiz cihaz ID'si döndürür
 * - Native (iOS/Android): Capacitor Device.getId() → gerçek cihaz UUID
 * - Web: localStorage'da saklanan rastgele UUID
 */
export async function getDeviceId(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await Device.getId();
      return info.identifier || "";
    } catch {
      return getOrCreateWebDeviceId();
    }
  }
  return getOrCreateWebDeviceId();
}

function getOrCreateWebDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!deviceId) {
    deviceId = "web-" + crypto.randomUUID();
    localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Cihaz adını döndürür (kayıt için)
 */
export async function getDeviceName(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await Device.getInfo();
      return info.model || info.name || "Mobil Cihaz";
    } catch {
      return "Mobil Cihaz";
    }
  }
  return navigator.userAgent.includes("iPhone") ? "iPhone (Web)" : "Tarayıcı";
}

export interface DeviceCheckResult {
  status: "ok" | "bound" | "blocked" | "error";
  message: string;
  boundDeviceName?: string;
}

/**
 * Cihaz kontrolü yapar:
 * - Web'den giriş → her zaman "ok" (web serbest)
 * - Native: deviceId boş/null → bu cihazı bağla, "bound" döndür
 * - Native: deviceId eşleşiyor → "ok" döndür
 * - Native: deviceId farklı → "blocked" döndür
 */
export async function checkAndBindDevice(userEmail: string): Promise<DeviceCheckResult> {
  try {
    // Web'den girişlerde device binding kontrolü yapma
    if (!Capacitor.isNativePlatform()) {
      return { status: "ok", message: "Web girişi serbest." };
    }

    const currentDeviceId = await getDeviceId();
    
    // Personeli bul
    const q = query(collection(db, "personnel"), where("email", "==", userEmail));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { status: "error", message: "Personel kaydı bulunamadı." };
    }

    const personelDoc = snapshot.docs[0];
    const personelData = personelDoc.data();
    const storedDeviceId = personelData.deviceId || "";
    const storedDeviceName = personelData.deviceName || "";

    // 1. Henüz bağlı cihaz yok → bağla
    if (!storedDeviceId) {
      const deviceName = await getDeviceName();
      await updateDoc(doc(db, "personnel", personelDoc.id), {
        deviceId: currentDeviceId,
        deviceName: deviceName,
        deviceBoundAt: new Date().toISOString(),
      });
      return { status: "bound", message: "Cihaz başarıyla bağlandı." };
    }

    // 2. Aynı cihaz → OK
    if (storedDeviceId === currentDeviceId) {
      return { status: "ok", message: "Cihaz doğrulandı." };
    }

    // 3. Farklı cihaz → Engelle
    return {
      status: "blocked",
      message: `Bu hesap "${storedDeviceName}" cihazına bağlı. Farklı bir cihazdan giriş yapamazsınız.\n\nYöneticinizden "Telefon Bağını Kopar" işlemini talep edin.`,
      boundDeviceName: storedDeviceName,
    };
  } catch (error: unknown) {
    console.error("[DeviceBinding] Hata:", error);
    return { status: "error", message: "Cihaz kontrolü sırasında bir hata oluştu." };
  }
}
