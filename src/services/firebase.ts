import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
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
import provisionedConfig from '../../firebase-applet-config.json';

interface ResolvedFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId?: string;
}

function resolveFirebaseConfig(): ResolvedFirebaseConfig | null {
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const envAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  const envStorageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim();
  const envMessagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const envAppId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();
  const envDatabaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID?.trim();

  if (envApiKey && envProjectId && envAppId) {
    return {
      apiKey: envApiKey,
      authDomain: envAuthDomain || `${envProjectId}.firebaseapp.com`,
      projectId: envProjectId,
      storageBucket: envStorageBucket || `${envProjectId}.firebasestorage.app`,
      messagingSenderId: envMessagingSenderId || '',
      appId: envAppId,
      firestoreDatabaseId:
        envDatabaseId || provisionedConfig?.firestoreDatabaseId || undefined,
    };
  }

  if (provisionedConfig?.apiKey && provisionedConfig?.projectId && provisionedConfig?.appId) {
    return {
      apiKey: provisionedConfig.apiKey,
      authDomain: provisionedConfig.authDomain,
      projectId: provisionedConfig.projectId,
      storageBucket: provisionedConfig.storageBucket,
      messagingSenderId: provisionedConfig.messagingSenderId,
      appId: provisionedConfig.appId,
      firestoreDatabaseId: provisionedConfig.firestoreDatabaseId || undefined,
    };
  }

  return null;
}

const resolvedConfig = resolveFirebaseConfig();

export const isFirebaseConfigured = Boolean(resolvedConfig);

export const app: FirebaseApp | null = resolvedConfig
  ? getApps()[0] ?? initializeApp(resolvedConfig)
  : null;

function initFirestoreSafely(): Firestore | null {
  if (!app || !resolvedConfig) return null;
  const databaseId = resolvedConfig.firestoreDatabaseId || undefined;
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      databaseId,
    );
  } catch {
    try {
      return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
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
  context: 'google' | 'email',
): string {
  const code = extractFirebaseErrorCode(err);
  const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';

  if (code === 'auth/unauthorized-domain') {
    return `Domain "${host}" is not authorized in Firebase Console → Authentication → Settings → Authorized domains. Use Email/Password below or add this host.`;
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup was closed before completing.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup blocked by your browser. Allow popups for klyn or sign in with Email/Password below.';
  }
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
    return context === 'google'
      ? 'Google Sign-In is not enabled in Firebase Authentication yet. Enable it in Firebase Console or use Email/Password below.'
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
    return 'Incorrect email or password, or account does not exist yet. Switch to Sign Up to create one.';
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

  return context === 'google'
    ? 'Unable to sign in with Google right now. You can also sign in with Email/Password below.'
    : 'Authentication failed. Check your details or try Continue with Google.';
}
