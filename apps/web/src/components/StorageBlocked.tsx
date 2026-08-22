"use client";

import { useEffect, useState } from "react";
import { openLocalDatabase } from "@forkleaf/store";
import { ForkLeafLogo } from "@/components/Brand";

/**
 * Shown when another tab is holding local storage open.
 *
 * IndexedDB allows exactly one version of a database at a time, so a second
 * tab can find itself locked out — briefly, while the first one lets go, or
 * indefinitely if that tab is asleep in a background window. The editor could
 * open anyway on an in-memory store, and for a while it did: it looked like a
 * working ForkLeaf, took everything you typed, and threw it away on reload.
 *
 * A dead end you can see is better than a working screen that lies, so this
 * takes over the page instead — and keeps trying, so closing the other tab is
 * all the user has to do.
 */
export function StorageBlocked() {
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        // Each attempt already takes a few seconds when it is blocked; the
        // pause is so a fast rejection does not become a spin.
        const { status } = await openLocalDatabase();
        if (cancelled) return;
        if (status === "ready") {
          window.location.reload();
          return;
        }
        setWaited((count) => count + 1);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[var(--fl-bg)] px-6 text-center">
      <ForkLeafLogo markClassName="h-8 w-8" textClassName="text-xl" />

      <div className="max-w-md">
        <h1 className="text-lg font-semibold text-[var(--fl-text)]">
          ForkLeaf is open in another tab
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--fl-muted)]">
          Your notes live in this browser&rsquo;s local storage, and only one tab can hold it at a
          time. Close the other ForkLeaf tabs and this one picks up on its own — no notes are lost.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="fl-btn fl-btn-primary" onClick={() => location.reload()}>
          Try again now
        </button>
      </div>

      <p className="text-xs text-[var(--fl-muted)]" aria-live="polite">
        {waited === 0 ? "Checking…" : `Still waiting for the other tab (${waited} attempts).`}
      </p>
    </div>
  );
}
