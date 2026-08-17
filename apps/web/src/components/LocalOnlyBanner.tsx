"use client";

import React, { useEffect, useState } from "react";

const DISMISS_KEY = "forkleaf-local-banner-dismissed";

export interface LocalOnlyBannerProps {
  githubAvailable: boolean;
  onSignIn: () => void;
  onLearnMore: () => void;
}

/**
 * The one thing a new user has to be told.
 *
 * Notes written before signing in live in this browser's IndexedDB and nowhere
 * else — clearing site data destroys them. That is a reasonable default (the
 * editor works with no account at all) but it is only reasonable if it is
 * stated. It used to be a grey sentence at the very bottom of a collapsible
 * sidebar, which nobody read.
 *
 * Dismissible, and the dismissal sticks: nagging someone who has decided to
 * stay local is just noise.
 */
export function LocalOnlyBanner({ githubAvailable, onSignIn, onLearnMore }: LocalOnlyBannerProps) {
  // Starts hidden and is revealed on mount, so the server-rendered markup does
  // not disagree with localStorage on the client.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      // Private browsing with storage disabled — show it.
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* Nothing to do: the banner is gone for this session either way. */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--fl-border)] bg-[var(--fl-elevated)] px-4 py-2.5 text-[13px]">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--fl-warn)]/20 text-[var(--fl-warn)]">
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M8 4.5v4M8 11.2h.01" />
        </svg>
      </span>

      <p className="min-w-0 flex-1 text-[var(--fl-text)]">
        <strong className="font-semibold">These notes are only on this device.</strong>{" "}
        <span className="text-[var(--fl-muted)]">
          {githubAvailable
            ? "Sign in with GitHub to back them up to a private repository and sync across machines."
            : "GitHub sign-in is not configured on this deployment, so nothing will be backed up."}
        </span>
      </p>

      <div className="flex shrink-0 items-center gap-1.5">
        {githubAvailable && (
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-lg bg-[var(--fl-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)]"
          >
            Connect GitHub
          </button>
        )}
        <button
          type="button"
          onClick={onLearnMore}
          className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
        >
          How it works
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="rounded-lg p-1.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-bg)] hover:text-[var(--fl-text)]"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
