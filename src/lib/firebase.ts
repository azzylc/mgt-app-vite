import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// SINGLETON - HMR DUPLICATE ENGELLE
declare global {
  var __firebase_app__: any;
  var __firebase_db__: any;
  var __firebase_auth__: any;
}

export const app = globalThis.__firebase_app__ ?? 
  (globalThis.__firebase_app__ = getApps().length ? getApp() : initializeApp(firebaseConfig));

// OFFLINE PERSISTENCE - Veriler diske kaydedilir, internet olmadan da çalışır
export const db = globalThis.__firebase_db__ ?? 
  (globalThis.__firebase_db__ = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager(undefined)
    })
  }));

// AUTH - Capacitor iOS için initializeAuth + indexedDB
function getFirebaseAuth() {
  if (Capacitor.isNativePlatform()) {
    return initializeAuth(app, {
      persistence: indexedDBLocalPersistence
    });
  } else {
    return getAuth(app);
  }
}

export const auth = globalThis.__firebase_auth__ ?? 
  (globalThis.__firebase_auth__ = getFirebaseAuth());

