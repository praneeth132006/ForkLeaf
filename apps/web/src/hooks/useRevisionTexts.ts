"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RepoRef } from "@forkleaf/types";
import { readNoteAtCommit } from "@/lib/gateway";
import { mapPool } from "@/lib/pool";

/** How many revisions to fetch at once when loading a whole history. */
const PREFETCH_CONCURRENCY = 4;

/** Shared empty map, so a cache miss does not hand out a fresh object each render. */
const EMPTY: Readonly<Record<string, string | null>> = Object.freeze({});

export interface RevisionTexts {
  /**
   * What has arrived so far, keyed by commit SHA. A `null` value means the
   * revision was asked for and could not be read — distinct from an absent
   * key, which means it has not arrived yet.
   */
  texts: Readonly<Record<string, string | null>>;
  /** True once a fetch for this SHA has settled, either way. */
  has: (sha: string) => boolean;
  /** Fetches these revisions now. Safe to call on every render. */
  request: (shas: readonly string[]) => void;
  /**
   * Fetches all of these revisions a few at a time.
   *
   * Separate from `request` because it is background work with a different
   * shape: a replay wants the whole history eventually and needs none of it
   * urgently, so it must not crowd out the revision the reader is looking at.
   */
  prefetch: (shas: readonly string[]) => void;
}

/**
 * A per-note cache of "the file as of commit X".
 *
 * Both history views need the same revisions — the diff pane fetches two at a
 * time, the replay wants all of them — and they are shown side by side under
 * one dialog. Keeping the cache here means switching between them re-uses
 * everything already fetched instead of paying for it twice, and it is the only
 * place that has to know a revision's text never changes once read.
 */
export function useRevisionTexts(repo: RepoRef, path: string): RevisionTexts {
  // Everything below is scoped to this string rather than to the `repo`
  // object, whose identity a caller may change on every render.
  const { owner, repo: name, branch, directory } = repo;
  const key = `${owner}/${name}@${branch}:${directory}:${path}`;

  /**
   * The cache, tagged with the note it belongs to.
   *
   * Tagged rather than cleared in an effect, because a commit SHA is not
   * unique to a note: one commit that touched two files appears in both their
   * histories, so a revision left over from the previously open note would be
   * served for the wrong file. Carrying the key inside the state makes a stale
   * cache unreadable by construction, with no render in between where the old
   * note's text is still on offer.
   */
  const [cache, setCache] = useState<{ key: string; texts: Record<string, string | null> }>(() => ({
    key,
    texts: {},
  }));
  const texts = cache.key === key ? cache.texts : EMPTY;

  // What has already been asked for. A ref rather than state because it must
  // be readable and writable synchronously: two calls in the same tick have to
  // see each other's marks, or the same revision is fetched twice.
  const claimed = useRef<{ key: string; shas: Set<string> }>({ key, shas: new Set() });

  // The key as of the last committed render, for rejecting results from a
  // fetch that was started for a note the reader has since navigated away from.
  const liveKey = useRef(key);
  const alive = useRef(true);

  useEffect(() => {
    liveKey.current = key;
  }, [key]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fetchOne = useCallback(
    async (sha: string): Promise<readonly [string, string | null]> => {
      try {
        return [
          sha,
          await readNoteAtCommit({ owner, repo: name, branch, directory }, path, sha),
        ] as const;
      } catch {
        // A failed revision is recorded as null rather than retried forever:
        // the panel shows it as unreadable and the rest of the history still
        // works. Closing and re-opening the dialog is the retry.
        return [sha, null] as const;
      }
    },
    [owner, name, branch, directory, path],
  );

  /** Files results into the cache, unless they are for a note left behind. */
  const absorb = useCallback(
    (entries: readonly (readonly [string, string | null])[]) => {
      if (!alive.current || entries.length === 0) return;
      if (liveKey.current !== key) return;

      setCache((current) =>
        current.key === key
          ? { key, texts: { ...current.texts, ...Object.fromEntries(entries) } }
          : { key, texts: Object.fromEntries(entries) },
      );
    },
    [key],
  );

  /** Marks the SHAs not yet asked for, and returns them. */
  const claim = useCallback(
    (shas: readonly string[]): string[] => {
      if (claimed.current.key !== key) claimed.current = { key, shas: new Set() };
      const missing = shas.filter((sha) => sha && !claimed.current.shas.has(sha));
      for (const sha of missing) claimed.current.shas.add(sha);
      return missing;
    },
    [key],
  );

  const request = useCallback(
    (shas: readonly string[]) => {
      const missing = claim(shas);
      if (missing.length === 0) return;
      void Promise.all(missing.map(fetchOne)).then(absorb);
    },
    [claim, fetchOne, absorb],
  );

  const prefetch = useCallback(
    (shas: readonly string[]) => {
      const missing = claim(shas);
      if (missing.length === 0) return;

      // Absorbed as each one lands rather than in one batch at the end, so a
      // long history fills the chart in progressively instead of sitting empty
      // and then appearing whole.
      void mapPool(missing, PREFETCH_CONCURRENCY, async (sha) => {
        absorb([await fetchOne(sha)]);
      });
    },
    [claim, fetchOne, absorb],
  );

  const has = useCallback((sha: string) => sha in texts, [texts]);

  return useMemo(() => ({ texts, has, request, prefetch }), [texts, has, request, prefetch]);
}
