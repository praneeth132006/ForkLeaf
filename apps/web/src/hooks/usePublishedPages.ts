"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RepoRef, Workspace } from "@forkleaf/types";
import { listPublishedPages, type PublishedPage } from "@/lib/gateway";
import { publishTargetOf } from "@/lib/publish-target";

/**
 * Which of this repository's notes are published as public pages.
 *
 * Publishing had no memory. The address came back from the commit, was shown
 * once, and lived in the dialog's own state — so closing it was the end of any
 * record that the note was public. Reopening the dialog offered to publish, as
 * though it never had been: there was no way to find the link again, and the
 * Unpublish button behind that screen could not be reached at all.
 *
 * Nothing new is stored to fix that. What is published is exactly what is in
 * `docs/` in the user's own repository, so this asks, and one listing answers
 * it for every note at once. It is also the only answer that stays true when
 * somebody deletes a page on GitHub directly — a flag written down here would
 * go on claiming the note was live.
 */

export interface PublishedState {
  /** Every page published from this repository, by slug. */
  pages: Map<string, PublishedPage>;
  /** The Pages site itself, or null when it has never been switched on. */
  site: { url: string; status: string | null; isPublic: boolean } | null;
  /** Set when the listing could not be read. Never blocks publishing. */
  error: string | null;
  /** Re-reads the listing — after publishing or unpublishing. */
  refresh: () => Promise<void>;
}

const EMPTY: Map<string, PublishedPage> = new Map();

/**
 * One answer, and the workspace it is an answer about.
 *
 * Kept together so a reply for the repository you have just switched away
 * from can be recognised as such and ignored, rather than being shown against
 * the one you switched to.
 */
interface Listing {
  workspaceId: string;
  pages: Map<string, PublishedPage>;
  site: PublishedState["site"];
  error: string | null;
}

export function usePublishedPages(workspace: Workspace | null): PublishedState {
  const [listing, setListing] = useState<Listing | null>(null);

  const connected = workspace && !workspace.isLocal ? workspace : null;
  const id = connected?.id ?? null;
  // The repository pages are published *into*, which is the workspace's own
  // unless it has been split. Listing from the notes repository when pages go
  // elsewhere reported every published note as unpublished.
  const repo = connected ? publishTargetOf(connected) : null;

  useEffect(() => {
    // A local workspace has no repository to publish from, so there is nothing
    // to ask and nothing to record.
    if (!repo || !id) return;

    let cancelled = false;

    const load = async () => {
      const result = await fetchListing(id, repo);
      if (!cancelled) setListing(result);
    };

    void load();
    return () => {
      cancelled = true;
    };
    // `repo` is rebuilt from the workspace on every render, so the workspace
    // id is what actually says whether this needs running again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * Re-reads the listing, and resolves once it has.
   *
   * Awaited by the callers that just changed it, so the row they acted on is
   * still showing "Unpublishing…" when the answer lands rather than flicking
   * back to a list that has not caught up yet.
   */
  const refresh = useCallback(async () => {
    if (!repo || !id) return;
    setListing(await fetchListing(id, repo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Last workspace's answer is not this workspace's answer.
  const current = listing && listing.workspaceId === id ? listing : null;

  return useMemo(
    () => ({
      pages: current?.pages ?? EMPTY,
      site: current?.site ?? null,
      error: current?.error ?? null,
      refresh,
    }),
    [current, refresh],
  );
}

/** Reads the listing, turning a failure into a `Listing` rather than a throw. */
async function fetchListing(workspaceId: string, repo: RepoRef): Promise<Listing> {
  try {
    const result = await listPublishedPages(repo);

    return {
      workspaceId,
      pages: new Map(result.pages.map((page) => [page.slug, page] as const)),
      site: result.site,
      error: null,
    };
  } catch (problem) {
    // A listing that cannot be read is not a reason to break the editor: the
    // state is merely unknown, and publishing still works.
    return {
      workspaceId,
      pages: EMPTY,
      site: null,
      error: problem instanceof Error ? problem.message : "Could not read your published pages.",
    };
  }
}
