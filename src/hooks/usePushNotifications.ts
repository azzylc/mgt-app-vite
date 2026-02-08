import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import * as Sentry from '@sentry/react';

/**
 * Push Notification Hook (Firebase Cloud Messaging)
 * - İzin ister
 * - FCM Token alır
 * - Token'ı Firestore'a kaydeder
 * - Bildirim gelince handler çalıştırır
 */
export function usePushNotifications(userEmail: string | null | undefined) {
  const registered = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!userEmail) return;
    if (registered.current) return;

    const setup = async () => {
      try {
        // Bildirim izni iste
        const permission = await FirebaseMessaging.requestPermissions();
        
        if (permission.receive !== 'granted') {
          console.warn('Push notification izni reddedildi');
          return;
        }

        // FCM Token al
        const { token } = await FirebaseMessaging.getToken();

        if (token) {
          // Token'ı Firestore'a kaydet
          await setDoc(
            doc(db, 'pushTokens', userEmail),
            {
              token: token,
              platform: Capacitor.getPlatform(),
              updatedAt: serverTimestamp(),
              email: userEmail,
            },
            { merge: true }
          );
        }

        // Uygulama açıkken bildirim geldi (foreground)
        // Artık alert göstermiyoruz - bildirim paneli real-time güncellenecek
        FirebaseMessaging.addListener('notificationReceived', (_event) => {
          // Bildirim paneli Firestore listener ile otomatik güncellenir
          // İsteğe bağlı: console.log('[FCM] Foreground bildirim:', _event.notification);
        });

        // Bildirime tıklandı
        FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
          const data = event.notification.data as Record<string, string> | undefined;
          if (data?.route) {
            window.location.hash = data.route;
          }
        });

        registered.current = true;
      } catch (err) {
        Sentry.captureException(err);
      }
    };

    setup();

    return () => {
      FirebaseMessaging.removeAllListeners();
      registered.current = false;
    };
  }, [userEmail]);
}
