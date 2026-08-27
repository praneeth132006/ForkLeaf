"use client";

import posthog from "posthog-js";

/**
 * PostHog, wrapped so call sites never have to care whether it is configured.
 *
 * Sits behind the same `track()` the app already calls, rather than beside it:
 * a second analytics system with its own call sites would drift from the first
 * within a month, and half the events would end up in only one of them.
 *
 * Everything here is a no-op without `NEXT_PUBLIC_POSTHOG_KEY`. That is the
 * normal state for a fork, a local checkout, or a preview deployment, and none
 * of those should log warnings or break because nobody set up analytics.
 */

/** PostHog's own default, correct for most projects. */
const DEFAULT_HOST = "https://us.i.posthog.com";

let started = false;

/**
 * Starts PostHog once, with the collection this app has no business doing
 * turned off.
 *
 * The defaults are built for marketing sites. This one is a text editor that
 * holds people's private notes, and three of those defaults would quietly
 * exfiltrate them:
 *
 *   - `autocapture` records clicks and the text of what was clicked, which
 *     here is the contents of somebody's notes.
 *   - session recording replays the screen, which is worse.
 *   - `capture_pageview` would double-count, because this app already reports
 *     its own page views on route change.
 *
 * A product whose entire pitch is that your notes are yours cannot ship an
 * analytics default that reads them.
 */
export function startPostHog(): void {
  if (started || typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  started = true;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    // Masks anything that does get captured by a future default we did not
    // anticipate. Belt and braces, deliberately.
    mask_all_text: true,
    mask_all_element_attributes: true,
    persistence: "localStorage+cookie",
  });
}

/** True when events will actually go somewhere. */
export function postHogReady(): boolean {
  return started;
}

/** Sends one event, if PostHog is configured. */
export function postHogCapture(event: string, properties?: Record<string, unknown>): void {
  if (!started) return;
  posthog.capture(event, properties);
}

/**
 * Ties events to a GitHub login after sign-in.
 *
 * Only the login, which is already public on github.com. No email, no
 * repository names, nothing about what is in the notes.
 */
export function postHogIdentify(login: string): void {
  if (!started || !login) return;
  posthog.identify(login);
}

/** Forgets the person on sign-out, so the next session is not attributed to them. */
export function postHogReset(): void {
  if (!started) return;
  posthog.reset();
}
