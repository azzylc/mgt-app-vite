import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Push Notification Hook
 * - İzin ister
 * - Token alır
 * - Token'ı Firestore'a kaydeder (personnel/{email}/pushTokens)
 * - Bildirim gelince alert gösterir (foreground)
 */
export function usePushNotifications(userEmail: string | null | undefined) {
  const registered = useRef(false);

  useEffect(() => {
    // Sadece native platformda çalışır (iOS/Android)
    if (!Capacitor.isNativePlatform()) return;
    if (!userEmail) return;
    if (registered.current) return;

    const setup = async () => {
      try {
        // Bildirim izni iste
        const permission = await PushNotifications.requestPermissions();
        
        if (permission.receive !== 'granted') {
          console.error('Push notification izni reddedildi');
          return;
        }

        // Push notification'a kayıt ol
        await PushNotifications.register();

        // Token geldiğinde Firestore'a kaydet
        PushNotifications.addListener('registration', async (token) => {
          try {
            await setDoc(
              doc(db, 'pushTokens', userEmail),
              {
                token: token.value,
                platform: Capacitor.getPlatform(),
                updatedAt: serverTimestamp(),
                email: userEmail,
              },
              { merge: true }
            );
          } catch (err) {
            console.error('Token kaydetme hatası:', err);
          }
        });

        // Kayıt hatası
        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration hatası:', error);
        });

        // Uygulama açıkken bildirim geldi (foreground)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          // Foreground'da basit alert göster
          if (notification.title || notification.body) {
            alert(`${notification.title || ''}\n${notification.body || ''}`);
          }
        });

        // Bildirime tıklandı
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          // İleride: bildirime göre sayfaya yönlendir
          const data = action.notification.data;
          if (data?.route) {
            window.location.hash = data.route;
          }
        });

        registered.current = true;
      } catch (err) {
        console.error('Push notification setup hatası:', err);
      }
    };

    setup();

    return () => {
      PushNotifications.removeAllListeners();
      registered.current = false;
    };
  }, [userEmail]);
}
