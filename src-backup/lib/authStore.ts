/**
 * Auth Store - Single Source of Truth
 * 
 * Preferences'a sadece 1 kere gider, sonra memory'den okur
 * Bu "web vs native storage" yarışını tamamen çözer
 */

import { Preferences } from '@capacitor/preferences';

// 🔥 TEK GERÇEK KAYNAK - Memory cache
let cachedToken: string | null | undefined = undefined; // undefined = henüz yüklenmedi

/**
 * Uygulama açılınca 1 kere çağrılır
 * Preferences'tan token'ı yükler ve memory'ye cache'ler
 */
export async function hydrateAuthOnce(): Promise<string | null> {
  // Zaten yüklendiyse tekrar yükleme
  if (cachedToken !== undefined) {
    console.log('🔥 [AUTH] Already hydrated, token:', cachedToken ? 'EXISTS' : 'NULL');
    return cachedToken;
  }
  
  console.log('🔥 [AUTH] Hydrating from Preferences...');
  
  try {
    const { value } = await Preferences.get({ key: 'firebase_id_token' });
    
    // Token validation
    cachedToken = (value && value.length > 20) ? value : null;
    
    console.log('✅ [AUTH] Hydrated, token:', cachedToken ? `EXISTS (${cachedToken.length} chars)` : 'NULL');
    return cachedToken;
  } catch (error) {
    console.error('❌ [AUTH] Hydration failed:', error);
    cachedToken = null;
    return null;
  }
}

/**
 * Memory'den token'ı al (INSTANT - Bridge'e gitme!)
 */
export function getCachedToken(): string | null | undefined {
  return cachedToken;
}

/**
 * Token'ı yaz (hem memory hem Preferences)
 */
export async function setToken(token: string): Promise<void> {
  console.log('🔥 [AUTH] Setting token:', token.substring(0, 20) + '...');
  
  // Memory'ye yaz (instant)
  cachedToken = token;
  
  // Preferences'a yaz
  await Preferences.set({ key: 'firebase_id_token', value: token });
  
  // 🚨 KRİTİK: Yazdıktan sonra geri oku - gerçekten yazıldı mı?
  const check = await Preferences.get({ key: 'firebase_id_token' });
  
  if (!check.value || check.value.length < 20) {
    console.error('❌ [AUTH] TOKEN WRITE FAILED! Written:', token.length, 'Read:', check.value?.length || 0);
    cachedToken = null;
    throw new Error('TOKEN_WRITE_FAILED - Storage mismatch!');
  }
  
  console.log('✅ [AUTH] Token verified, written successfully');
}

/**
 * Token'ı temizle
 */
export async function clearToken(): Promise<void> {
  console.log('🔥 [AUTH] Clearing token');
  cachedToken = null;
  await Preferences.remove({ key: 'firebase_id_token' });
  console.log('✅ [AUTH] Token cleared');
}

/**
 * Authenticated mi kontrol (Memory'den - INSTANT!)
 */
export function isAuthenticatedSync(): boolean {
  const result = cachedToken !== null && cachedToken !== undefined;
  console.log('🔥 [AUTH] isAuthenticatedSync:', result);
  return result;
}

/**
 * Async auth check (ilk sefer için)
 */
export async function isAuthenticatedAsync(): Promise<boolean> {
  if (cachedToken !== undefined) {
    return cachedToken !== null;
  }
  
  const token = await hydrateAuthOnce();
  return token !== null;
}
