import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, Auth } from "firebase/auth";
import { initializeFirestore, memoryLocalCache, Firestore } from "firebase/firestore";
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
  var __firebase_app__: FirebaseApp | undefined;
  var __firebase_db__: Firestore | undefined;
  var __firebase_auth__: Auth | undefined;
}

export const app = globalThis.__firebase_app__ ?? 
  (globalThis.__firebase_app__ = getApps().length ? getApp() : initializeApp(firebaseConfig));

// MEMORY CACHE - IndexedDB persistence kapatıldı (iOS WebKit IndexedDB bug'ı çözümü)
// iOS arka planda IndexedDB bağlantısını koparıyordu, tüm Firestore sorguları çöküyordu
// Uygulama zaten her zaman online kullanılıyor, offline cache'e gerek yok
export const db = globalThis.__firebase_db__ ?? 
  (globalThis.__firebase_db__ = initializeFirestore(app, {
    localCache: memoryLocalCache()
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

// Cloud Functions (europe-west1)
import { getFunctions } from "firebase/functions";
export const functions = getFunctions(app, 'europe-west1');
