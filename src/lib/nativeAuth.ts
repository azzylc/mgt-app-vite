import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { signInWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Native iOS/Android auth
 * Preferences kullanmıyoruz - Firebase SDK hallediyor!
 */
export async function nativeSignIn(email: string, password: string) {
  try {
    
    // 1. Native iOS/Android Login (Keychain'e yazar)
    const result = await FirebaseAuthentication.signInWithEmailAndPassword({
      email,
      password,
    });


    // 2. Web SDK Bridge (Firestore erişimi için ŞART)
    const credential = EmailAuthProvider.credential(email, password);
    const webResult = await signInWithCredential(auth, credential);


    // Firebase onAuthStateChanged otomatik tetiklenecek!
    return webResult;
    
  } catch (error: any) {
    console.error('❌ [NATIVE] Auth failed:', error);
    throw error;
  }
}

/**
 * Native logout
 */
export async function nativeSignOut(): Promise<void> {
  try {
    await FirebaseAuthentication.signOut();
    await auth.signOut();
  } catch (error) {
    console.error('❌ [NATIVE] Logout failed:', error);
    throw error;
  }
}