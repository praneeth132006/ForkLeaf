"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth, type User } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig, isFirebaseConfigured } from "./config";

/**
 * Lazy, browser-only Firebase handles.
 *
 * Everything here returns `null` rather than throwing when Firebase is not
 * configured, and nothing is initialised at module scope: the Firebase SDK is
 * large and touches `window`, so importing it eagerly would both break SSR and
 * put ~100kB on the critical path of an editor that may never use it.
 */

let appInstance: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined" || !isFirebaseConfigured()) return null;
  if (appInstance) return appInstance;

  // Next's fast refresh re-runs this module; re-initialising would throw.
  appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return appInstance;
}

export function firebaseAuth(): Auth | null {
  const app = firebaseApp();
  return app ? getAuth(app) : null;
}

export function firestore(): Firestore | null {
  const app = firebaseApp();
  return app ? getFirestore(app) : null;
}

/**
 * Ensures there is a Firebase identity to write billing and profile documents
 * against, without ever asking the user to sign in twice.
 *
 * ForkLeaf's real sign-in is the server-side GitHub OAuth flow — that is what
 * grants repository access, and its token never reaches the browser. Firebase
 * only needs *an* authenticated principal so Firestore rules can scope a
 * document to one person, so an anonymous account is enough. The GitHub
 * identity is then attached to that document as data.
 *
 * Returns `null` when Firebase is unconfigured or anonymous auth is disabled in
 * the console; callers treat that as "no analytics or billing today".
 */
export async function ensureFirebaseUser(): Promise<User | null> {
  const auth = firebaseAuth();
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;

  try {
    const credential = await signInAnonymously(auth);
    return credential.user;
  } catch (error) {
    console.warn("[ForkLeaf] Firebase anonymous sign-in unavailable:", error);
    return null;
  }
}
