"use client";

import type { Dismissals } from "@/lib/notebook-freshness";

/**
 * The stale notes somebody has already looked at and decided are fine.
 *
 * Kept on this device rather than in the repository, and deliberately. "I have
 * read this and it is still true" is a fact about a person's attention, not
 * about the notebook — committing it would put a file in everybody's history
 * every time anyone glanced at a list.
 *
 * Keyed per workspace, because a note path means nothing across two of them.
 */
const key = (workspaceId: string) => `forkleaf:freshness-dismissed:${workspaceId}`;

export function readDismissals(workspaceId: string): Dismissals {
  try {
    const raw = window.localStorage.getItem(key(workspaceId));
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    // Anything that is not a path-to-timestamp pair came from a different
    // version of this, or from somebody editing storage by hand.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === "string",
      ),
    ) as Dismissals;
  } catch {
    // Storage can be blocked outright, and the list still works without it.
    return {};
  }
}

export function writeDismissals(workspaceId: string, dismissals: Dismissals): void {
  try {
    window.localStorage.setItem(key(workspaceId), JSON.stringify(dismissals));
  } catch {
    // Not worth surfacing: the dismissal holds for this session either way.
  }
}
