"use client";

import { initializeAnalytics, isSupported, logEvent, type Analytics } from "firebase/analytics";
import { publicUrl } from "@/lib/analytics-privacy";
import { firebaseApp } from "./client";
import { postHogCapture } from "@/lib/posthog";

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

    // No automatic page view: it would send the full address, notes and all,
    // before anything could reduce it. The app sends its own, reduced.
    analyticsInstance = initializeAnalytics(app, {
      config: {
        send_page_view: false,
        page_location: publicUrl(window.location.href),
        page_referrer: publicUrl(document.referrer),
      },
    });
    return analyticsInstance;
  })();

  return initPromise;
}

/** Event names ForkLeaf reports, kept in one place so they cannot drift. */
export type ForkLeafEvent =
  | "page_view"
  | "note_created"
  | "note_exported"
  | "note_print_opened"
  | "repo_connected"
  | "github_sign_in_started"
  | "sync_completed"
  | "diagram_inserted"
  | "checkout_started";

/**
 * Records an event. Fire-and-forget: analytics must never delay or fail a user
 * action, so this swallows its own errors.
 */
export function track(event: ForkLeafEvent, params?: Record<string, unknown>): void {
  // Both sinks from the one call. A second analytics system with its own call
  // sites would drift from this one within a month, and half the events would
  // end up in only one of them.
  // Every event carries the address it happened at unless told otherwise;
  // this is the reduced one, so no note name goes with it.
  const reduced = {
    ...params,
    page_location: publicUrl(typeof window === "undefined" ? undefined : window.location.href),
    page_referrer: publicUrl(typeof document === "undefined" ? undefined : document.referrer),
  };
  postHogCapture(event, reduced);

  void analytics()
    .then((instance) => {
      // Widened to `string`: `logEvent` is overloaded per reserved event name
      // (`page_view` has its own signature), and TypeScript cannot resolve an
      // overload against a union of names.
      if (instance) logEvent(instance, event as string, reduced);
    })
    .catch(() => {
      /* Analytics is best-effort by design. */
    });
}
