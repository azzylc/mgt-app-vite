import { NextRequest, NextResponse } from 'next/server';
import { auth } from 'firebase-admin';
import { adminDb } from './firebase-admin';

/**
 * Verify admin/cron authentication
 * Checks Authorization header against CRON_SECRET
 */
export function verifyAdminAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const vercelEnv = process.env.VERCEL_ENV; // 'production', 'preview', 'development'

  // CRITICAL: In production/preview, CRON_SECRET must exist (fail-closed)
  if (!cronSecret) {
    if (vercelEnv === 'production' || vercelEnv === 'preview') {
      console.error('[AUTH] CRON_SECRET not set in production/preview - blocking request');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    // Dev mode: allow without secret
    console.warn('[AUTH] CRON_SECRET not set - dev mode, allowing request');
    return null;
  }

  // Check authorization header
  const expectedAuth = `Bearer ${cronSecret}`;
  if (authHeader !== expectedAuth) {
    console.warn('[AUTH] Unauthorized request blocked');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Auth successful
  return null;
}

/**
 * Verify user authentication with Firebase ID token
 * Returns user data if authenticated, error response if not
 */
export async function verifyUserAuth(
  req: NextRequest,
  requiredRoles?: string[]
): Promise<{ error: NextResponse | null; user: any | null; userData: any | null }> {
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[USER AUTH] No Bearer token provided');
    return {
      error: NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 }),
      user: null,
      userData: null
    };
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // Verify Firebase ID token
    const decodedToken = await auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    console.log(`[USER AUTH] Token verified for: ${email}`);

    // Get user data from Firestore
    const personnelSnapshot = await adminDb
      .collection('personnel')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (personnelSnapshot.empty) {
      console.warn('[USER AUTH] User not found in personnel collection');
      return {
        error: NextResponse.json({ error: 'User not found' }, { status: 404 }),
        user: null,
        userData: null
      };
    }

    const userData = personnelSnapshot.docs[0].data();
    const userRole = userData.kullaniciTuru || 'Personel';

    console.log(`[USER AUTH] User role: ${userRole}`);

    // Check required roles if specified
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(userRole)) {
        console.warn(`[USER AUTH] Insufficient permissions. Required: ${requiredRoles.join(', ')}, Has: ${userRole}`);
        return {
          error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
          user: null,
          userData: null
        };
      }
    }

    // Auth successful
    return {
      error: null,
      user: { uid, email, role: userRole },
      userData
    };
  } catch (error) {
    console.error('[USER AUTH] Token verification failed:', error);
    return {
      error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }),
      user: null,
      userData: null
    };
  }
}
