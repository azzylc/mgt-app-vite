/**
 * Firebase Auth REST API Service with authStore integration
 */

import { setToken, clearToken } from './authStore';
import * as Sentry from '@sentry/react';

const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;
const BASE_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';

interface FirebaseAuthResponse {
  idToken: string;
  email: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
  registered?: boolean;
}

interface FirebaseAuthError {
  error: {
    code: number;
    message: string;
    errors: Array<{
      message: string;
      domain: string;
      reason: string;
    }>;
  };
}

/**
 * Email ve şifre ile Firebase'e login ol (REST API)
 */
export async function signInWithEmailPasswordREST(
  email: string,
  password: string
): Promise<FirebaseAuthResponse> {
  const url = `${BASE_URL}:signInWithPassword?key=${FIREBASE_API_KEY}`;
  
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });

    if (!response.ok) {
      const errorData: FirebaseAuthError = await response.json();
      throw new Error(errorData.error.message || 'Login failed');
    }

    const data: FirebaseAuthResponse = await response.json();
    
    
    // 🔥 authStore ile yaz (verification dahil!)
    await setToken(data.idToken);
    
    return data;
  } catch (error: any) {
    Sentry.captureException(error);
    throw error;
  }
}

/**
 * Kullanıcı bilgilerini getir
 */
export async function getUserInfo(idToken: string) {
  const url = `${BASE_URL}:lookup?key=${FIREBASE_API_KEY}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idToken,
    }),
  });

  if (!response.ok) {
    throw new Error('Get user info failed');
  }

  const data = await response.json();
  return data.users[0];
}

/**
 * Logout
 */
export async function signOutREST() {
  await clearToken();
}

/**
 * Refresh token ile yeni ID token al
 */
export async function refreshIdToken(refreshToken: string): Promise<string> {
  const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  const data = await response.json();
  
  await setToken(data.id_token);
  
  return data.id_token;
}
