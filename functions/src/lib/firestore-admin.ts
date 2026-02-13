import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminMessaging = admin.messaging();
export default admin;
