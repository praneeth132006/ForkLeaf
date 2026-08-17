/**
 * Firebase project configuration, read from the environment.
 *
 * These values are public by design — a Firebase web config is shipped to every
 * browser that loads the app, and the `apiKey` is an identifier rather than a
 * secret. What actually protects the data is Firestore security rules (see
 * `firestore.rules`) plus App Check, never the config being hidden.
 *
 * They live in env vars anyway so that dev, preview and production can point at
 * different Firebase projects without a code change.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
} as const;

/**
 * True when there is enough configuration to talk to Firebase at all.
 *
 * Every Firebase call site checks this first and degrades to a no-op. ForkLeaf
 * has to keep working with zero configuration — the whole point of the app is
 * that notes are local-first — so a missing Firebase project must never be an
 * error, just an absence of analytics and billing.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}
