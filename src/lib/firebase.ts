import { initializeApp, getApps, getApp, setLogLevel } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

console.log("🔥 Firebase Config Check:", {
  projectId: firebaseConfig.projectId,
  apiKey: firebaseConfig.apiKey?.substring(0, 10) + "..."
});

// 🔥 DEBUG LOGS AÇ
setLogLevel("debug");

// 🔥 SINGLETON - HMR DUPLICATE ENGELLE
declare global {
  var __firebase_app__: any;
  var __firebase_db__: any;
  var __firebase_auth__: any;
}

export const app = globalThis.__firebase_app__ ?? 
  (globalThis.__firebase_app__ = getApps().length ? getApp() : initializeApp(firebaseConfig));

// 🔥 MEMORY CACHE - INDEXEDDB BYPASS
export const db = globalThis.__firebase_db__ ?? 
  (globalThis.__firebase_db__ = initializeFirestore(app, {
    localCache: memoryLocalCache()  // Disk yok, sadece RAM!
  }));

// 🔥 AUTH - Capacitor iOS için initializeAuth + indexedDB
function getFirebaseAuth() {
  if (Capacitor.isNativePlatform()) {
    // iOS/Android: initializeAuth ile indexedDB persistence
    return initializeAuth(app, {
      persistence: indexedDBLocalPersistence
    });
  } else {
    // Web: normal getAuth
    const a = getAuth(app);
    return a;
  }
}

export const auth = globalThis.__firebase_auth__ ?? 
  (globalThis.__firebase_auth__ = getFirebaseAuth());