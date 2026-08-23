"use client";

import { useEffect, useState } from "react";
import { ForkLeafLogo } from "@/components/Brand";

/** How long a boot may take before the screen stops claiming progress. */
const STALL_AFTER_MS = 12_000;

/**
 * The screen shown while ForkLeaf starts — and, if it does not, the screen
 * that admits it.
 *
 * A spinner is a promise that something is happening. When the thing it is
 * waiting on never arrives, that promise becomes a lie, and the user is left
 * looking at a logo with no error, no console message and nothing to click.
 * Every individual cause has been given a bound elsewhere; this is the
 * backstop for the ones that have not been thought of yet — a chunk that
 * fails to load, an extension that blocks a request, a promise nobody found.
 *
 * After twelve seconds it stops pretending and offers a way out.
 */
export function BootScreen({ message = "Starting ForkLeaf…" }: { message?: string }) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), STALL_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!stalled) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--fl-bg)]">
        <ForkLeafLogo markClassName="h-8 w-8" textClassName="text-xl" />
        <p className="text-sm text-[var(--fl-muted)]" aria-busy="true">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-[var(--fl-bg)] px-6 text-center">
      <ForkLeafLogo markClassName="h-8 w-8" textClassName="text-xl" />

      <div className="max-w-md">
        <h1 className="text-lg font-semibold text-[var(--fl-text)]">
          ForkLeaf did not finish starting
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--fl-muted)]">
          This is nearly always another ForkLeaf tab holding this browser&rsquo;s local storage, or
          an extension blocking part of the page. Close any other ForkLeaf tabs, then reload.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className="fl-btn fl-btn-primary" onClick={() => location.reload()}>
          Reload
        </button>
        <button type="button" className="fl-btn fl-btn-ghost" onClick={resetLocalData}>
          Reset local data and reload
        </button>
      </div>

      <p className="max-w-md text-xs leading-relaxed text-[var(--fl-muted)]">
        Resetting deletes the copy of your notes held in this browser. Anything already pushed to a
        connected repository is safe and comes back; notes only ever written on this device do not.
      </p>
    </div>
  );
}

/**
 * The escape hatch, for a database that cannot be opened or read at all.
 *
 * Deliberately blunt about what it costs, and deliberately not automatic: it
 * is the right answer for a corrupt store and the wrong one for anything else,
 * and only the person whose notes they are can tell the difference.
 */
function resetLocalData(): void {
  const confirmed = window.confirm(
    "Delete ForkLeaf's local data in this browser and reload?\n\n" +
      "Notes pushed to a connected repository will come back. Notes only ever written on this device will not.",
  );
  if (!confirmed) return;

  const request = indexedDB.deleteDatabase("forkleaf");
  // Reload either way: a delete that cannot finish is itself a reason to
  // start the page over.
  request.onsuccess = () => location.reload();
  request.onerror = () => location.reload();
  request.onblocked = () => location.reload();
}
