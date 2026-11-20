import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseAppletConfig from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
};

export const FIRESTORE_DATABASE_ID =
  firebaseAppletConfig.firestoreDatabaseId ||
  'ai-studio-onyxflow-86efe309-feaa-4069-b3cc-1f669f1ef350';

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

export const app: FirebaseApp | null = isFirebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : null;

function initFirestoreSafely(): Firestore | null {
  if (!app) return null;
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      FIRESTORE_DATABASE_ID,
    );
  } catch {
    try {
      return getFirestore(app, FIRESTORE_DATABASE_ID);
    } catch {
      return null;
    }
  }
}

export const db: Firestore | null = initFirestoreSafely();

export const auth: Auth | null = app ? getAuth(app) : null;

export const googleProvider: GoogleAuthProvider | null = auth
  ? (() => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return provider;
    })()
  : null;

let persistencePromise: Promise<void> | null = null;

export async function ensureAuthPersistence(): Promise<void> {
  if (!auth) return;
  if (persistencePromise) return persistencePromise;

  persistencePromise = (async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      return;
    } catch {
      // Fallback for sandboxed iframes with partitioned/blocked localStorage
    }
    try {
      await setPersistence(auth, browserSessionPersistence);
      return;
    } catch {
      // Fallback for strict private contexts
    }
    try {
      await setPersistence(auth, inMemoryPersistence);
    } catch {
      // Proceed with default Firebase SDK persistence
    }
  })();

  return persistencePromise;
}

if (auth) {
  void ensureAuthPersistence();
}

export function isFirestoreOfflineError(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code).toLowerCase()
      : '';
  if (code === 'unavailable' || code === 'failed-precondition') return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('client is offline') ||
    lower.includes('failed to get document because the client is offline') ||
    lower.includes('code=unavailable')
  );
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) ?? [],
    },
    operationType,
    path,
  };
}

export function logFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): FirestoreErrorInfo | null {
  if (isFirestoreOfflineError(error)) {
    return null;
  }
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.warn('Firestore Sync Warning: ', JSON.stringify(errInfo));
  return errInfo;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  if (!db) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      return false;
    }
    return true;
  }
}

export async function signInWithGooglePopup(): Promise<User> {
  if (!auth || !googleProvider) {
    throw new Error('Firebase Authentication is not configured.');
  }
  await ensureAuthPersistence();
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<User> {
  if (!auth) {
    throw new Error('Firebase Authentication is not configured.');
  }
  await ensureAuthPersistence();
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  displayName?: string,
): Promise<User> {
  if (!auth) {
    throw new Error('Firebase Authentication is not configured.');
  }
  await ensureAuthPersistence();
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName?.trim()) {
    try {
      await updateProfile(result.user, { displayName: displayName.trim() });
    } catch {
      // Non-fatal: displayName will still be stored in Firestore/local profile
    }
  }
  return result.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  if (!auth) {
    throw new Error('Password reset requires cloud authentication to be enabled.');
  }
  const clean = email.trim();
  if (!clean || !clean.includes('@')) {
    const err = new Error('Please enter a valid email address.') as Error & { code?: string };
    err.code = 'auth/invalid-email';
    throw err;
  }
  await sendPasswordResetEmail(auth, clean);
}

export async function signOutFirebase(): Promise<void> {
  if (!auth) return;
  try {
    await firebaseSignOut(auth);
  } catch {
    // Ignore sign-out errors in restricted contexts
  }
}

export function extractFirebaseErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code: unknown }).code);
  }
  const msg = err instanceof Error ? err.message : '';
  const match = msg.match(/auth\/[a-z0-9-]+/i);
  return match ? match[0].toLowerCase() : '';
}

export function formatFirebaseAuthError(
  err: unknown,
  context: 'google' | 'email' | 'reset',
): string {
  const code = extractFirebaseErrorCode(err);
  const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';

  if (code === 'auth/unauthorized-domain') {
    return `Domain "${host}" is not authorized in Firebase Console -> Authentication -> Settings -> Authorized domains.`;
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup was closed before completing.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup blocked by your browser. Allow popups for KLYN or sign in with Email/Password below.';
  }
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
    return context === 'google'
      ? 'Google Sign-In is not enabled in Firebase Authentication yet.'
      : 'Email/Password sign-in is not enabled in Firebase Authentication yet.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Switch to Log In above.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return context === 'reset'
      ? 'If an account exists for that email, a reset link has been sent.'
      : 'Incorrect email or password, or account does not exist yet.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error contacting authentication server. Check your connection and try again.';
  }

  if (context === 'reset') {
    return 'Unable to send password reset email right now. Check your address and try again.';
  }
  return context === 'google'
    ? 'Unable to sign in with Google right now. Try Email/Password below.'
    : 'Authentication failed. Check your details or try Continue with Google.';
}
