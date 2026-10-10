"use client";

import { useEffect, useState } from "react";
import type { ActivityEntry } from "@/lib/live-activity";

/**
 * A repository's conversations as they happen, from the live stream.
 *
 * Connected only while the tab is visible — a hidden tab has nobody to show
 * anything to, and every open stream is a little work on the server — and
 * resumed from the last thing it heard when the tab comes back, so nothing is
 * missed in between. "off" means this server has no webhooks (or this reader
 * cannot use them); the conversation hooks then keep asking on a timer, as
 * they always have.
 */

export type LiveStatus = "off" | "connecting" | "live";

/** How many recent entries are kept for the hooks that read them. */
const KEEP = 50;

export interface LiveActivity {
  status: LiveStatus;
  /** What has happened since this page opened, oldest first. */
  entries: ActivityEntry[];
}

export function useLiveActivity(target: { owner: string; repo: string } | null): LiveActivity {
  const owner = target?.owner ?? "";
  const repo = target?.repo ?? "";
  const key = target ? `${owner}/${repo}` : null;

  const [state, setState] = useState<{ key: string | null } & LiveActivity>({
    key: null,
    status: "off",
    entries: [],
  });

  useEffect(() => {
    if (key === null || typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let lastVersion: number | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped || source || document.visibilityState === "hidden") return;
      const params = new URLSearchParams({ owner, repo });
      if (lastVersion !== null) params.set("since", String(lastVersion));
      const opened = new EventSource(`/api/gh/live?${params.toString()}`);
      source = opened;
      setState((previous) => ({
        key,
        status: "connecting",
        entries: previous.key === key ? previous.entries : [],
      }));

      opened.addEventListener("ready", (event) => {
        try {
          lastVersion = (JSON.parse((event as MessageEvent<string>).data) as { version: number })
            .version;
        } catch {
          // A ready without a version still means connected.
        }
        setState((previous) => ({ ...previous, key, status: "live" }));
      });

      opened.addEventListener("activity", (event) => {
        let entry: ActivityEntry;
        try {
          entry = JSON.parse((event as MessageEvent<string>).data) as ActivityEntry;
        } catch {
          return;
        }
        lastVersion = entry.v;
        setState((previous) => ({
          key,
          status: "live",
          entries: [...(previous.key === key ? previous.entries : []), entry].slice(-KEEP),
        }));
      });

      opened.onerror = () => {
        // EventSource retries a dropped connection on its own. CLOSED means it
        // will not: the server said 204 (no webhooks here) or refused us.
        if (opened.readyState === EventSource.CLOSED) {
          stopped = true;
          source = null;
          setState((previous) => ({ ...previous, key, status: "off" }));
        } else {
          setState((previous) => ({ ...previous, key, status: "connecting" }));
        }
      };
    };

    const disconnect = () => {
      source?.close();
      source = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") disconnect();
      else connect();
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, owner, repo]);

  return state.key === key
    ? { status: state.status, entries: state.entries }
    : { status: "off", entries: [] };
}

/** The newest entry matching `test`, by version; 0 when there is none. */
export function latestVersion(
  entries: readonly ActivityEntry[],
  test: (entry: ActivityEntry) => boolean = () => true,
): number {
  let latest = 0;
  for (const entry of entries) if (entry.v > latest && test(entry)) latest = entry.v;
  return latest;
}
