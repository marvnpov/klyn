export {
  app,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
  signInWithEmailPassword,
  signInWithGooglePopup,
  signOutFirebase,
  signUpWithEmailPassword,
  testConnection,
} from './services/firebase';
export type { FirestoreErrorInfo } from './services/firebase';
