"use client";

import { getAnalytics, isSupported, logEvent, type Analytics } from "firebase/analytics";
import { firebaseApp } from "./client";

/**
 * Firebase Analytics, wrapped so that call sites never have to care whether it
 * is available.
 *
 * `isSupported()` matters more than it looks: Analytics needs IndexedDB and
 * cookies, so it is genuinely unavailable in private browsing on some
 * platforms, in embedded webviews, and behind several ad blockers. Calling
 * `getAnalytics()` unguarded throws in all of those, which would take the page
 * down over a metrics call.
 */

let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;

async function analytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;

  // Memoised so a burst of events at page load performs one support check.
  initPromise ??= (async () => {
    const app = firebaseApp();
    if (!app) return null;
    if (!(await isSupported())) return null;

    analyticsInstance = getAnalytics(app);
    return analyticsInstance;
  })();

  return initPromise;
}

/** Event names ForkLeaf reports, kept in one place so they cannot drift. */
export type ForkLeafEvent =
  | "page_view"
  | "note_created"
  | "note_exported"
  | "repo_connected"
  | "github_sign_in_started"
  | "sync_completed"
  | "diagram_inserted"
  | "upgrade_viewed"
  | "checkout_started";

/**
 * Records an event. Fire-and-forget: analytics must never delay or fail a user
 * action, so this swallows its own errors.
 */
export function track(event: ForkLeafEvent, params?: Record<string, unknown>): void {
  void analytics()
    .then((instance) => {
      // Widened to `string`: `logEvent` is overloaded per reserved event name
      // (`page_view` has its own signature), and TypeScript cannot resolve an
      // overload against a union of names.
      if (instance) logEvent(instance, event as string, params);
    })
    .catch(() => {
      /* Analytics is best-effort by design. */
    });
}
