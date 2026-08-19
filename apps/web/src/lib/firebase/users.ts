"use client";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { SessionUser } from "@forkleaf/types";
import { ensureFirebaseUser, firestore } from "./client";

/**
 * The user record ForkLeaf keeps in Firestore, at `users/{firebaseUid}`.
 *
 * Deliberately thin. Notes never come near this — they live in the user's own
 * GitHub repository, which is the entire premise of the product. This document
 * exists so an account screen can show who you are signed in as, and so the
 * project can count how many people are using it. There is no plan field and no
 * entitlement: ForkLeaf has no tiers.
 */
export interface UserProfile {
  /** GitHub numeric id, when the user has connected GitHub. */
  githubId: number | null;
  githubLogin: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: unknown;
  lastSeenAt: unknown;
}

/**
 * Creates or refreshes the caller's own user document.
 *
 * Writes with `merge: true` so a sign-in refreshes the identity fields without
 * clearing anything else already on the document. `createdAt` is stamped only
 * when the document does not yet exist, which costs one read per session and is
 * the reason this is not a blind `setDoc`.
 */
export async function upsertUserProfile(githubUser: SessionUser | null): Promise<void> {
  const db = firestore();
  const firebaseUser = await ensureFirebaseUser();
  if (!db || !firebaseUser) return;

  const ref = doc(db, "users", firebaseUser.uid);

  const profile: Omit<UserProfile, "createdAt"> = {
    githubId: githubUser?.id ?? null,
    githubLogin: githubUser?.login ?? null,
    displayName: githubUser?.name ?? githubUser?.login ?? null,
    avatarUrl: githubUser?.avatarUrl ?? null,
    lastSeenAt: serverTimestamp(),
  };

  try {
    const existing = await getDoc(ref);
    await setDoc(ref, existing.exists() ? profile : { ...profile, createdAt: serverTimestamp() }, {
      merge: true,
    });
  } catch (error) {
    // A missing Firestore database or a rule rejection must not break sign-in.
    console.warn("[ForkLeaf] Could not write user profile:", error);
  }
}
