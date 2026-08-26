"use client";

import { useCallback, useState } from "react";
import type { Workspace } from "@forkleaf/types";
import { unpublishNote } from "@/lib/gateway";
import type { PublishedState } from "@/hooks/usePublishedPages";

/**
 * Every note this repository is serving as a public page.
 *
 * The one question publishing never answered: which of my notes are public?
 * The address came back once, in a dialog, and closing it was the end of the
 * record — so the only way to find out later was to browse the repository on
 * GitHub and read the `docs/` folder yourself.
 *
 * The list is not a list of things ForkLeaf remembers publishing. It is the
 * contents of that folder, read back, which is the only version of the answer
 * that stays true when a page is deleted from GitHub directly.
 */

export function PublishedPages({
  workspace,
  state,
  confirm,
}: {
  workspace: Workspace;
  state: PublishedState;
  /**
   * Asks before taking a page down.
   *
   * Unpublishing is a commit that deletes a file somebody else may have a link
   * to, so it goes through the same confirmation every other destructive
   * action in the app does rather than happening on one stray click.
   */
  confirm: (request: { title: string; body: string; onConfirm: () => Promise<void> }) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = useCallback(async (slug: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(slug);
    window.setTimeout(() => setCopied((current) => (current === slug ? null : current)), 1600);
  }, []);

  const unpublish = useCallback(
    (slug: string) => {
      confirm({
        title: "Unpublish page",
        body: `“${slug}” will stop being a public page, and any link to it will stop working. The note itself is untouched, and the deletion is a commit, so it stays recoverable from your git history.`,
        onConfirm: async () => {
          setBusy(slug);
          setError(null);

          try {
            await unpublishNote(workspace.repo, slug);
            await state.refresh();
          } catch (problem) {
            setError(
              problem instanceof Error ? problem.message : "That page could not be unpublished.",
            );
          } finally {
            setBusy(null);
          }
        },
      });
    },
    [workspace.repo, state, confirm],
  );

  // Nothing published and nothing to say. A repository with no public pages
  // does not need a section explaining that it has none.
  if (state.pages.size === 0) return null;

  const pages = [...state.pages.values()].sort((a, b) => a.slug.localeCompare(b.slug));

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
        Published pages
      </h2>

      <div className="overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)]">
        <p className="border-b border-[var(--fl-border)] px-4 py-2.5 text-[12.5px] text-[var(--fl-muted)]">
          {state.site
            ? `Served by GitHub Pages from docs/ in ${workspace.repo.owner}/${workspace.repo.repo}. Anyone with a link can read these.`
            : /* The files are committed and the site is off, which is a real
                 state with a real fix, and not the same as "not published". */
              `These pages are committed to docs/ in ${workspace.repo.owner}/${workspace.repo.repo}, but GitHub Pages is switched off for this repository, so they have no public address yet.`}
        </p>

        <ul>
          {pages.map((page) => (
            <li
              key={page.slug}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--fl-border)] px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-[var(--fl-text)]">
                  {page.slug}
                </span>
                {page.url ? (
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block truncate font-mono text-[11.5px] text-[var(--fl-accent)] underline underline-offset-2"
                  >
                    {page.url}
                  </a>
                ) : (
                  <span className="block truncate font-mono text-[11.5px] text-[var(--fl-muted)]">
                    {page.path}
                  </span>
                )}
              </span>

              {page.url && (
                <button
                  type="button"
                  onClick={() => void copy(page.slug, page.url!)}
                  className="fl-btn fl-btn-ghost !py-1.5 !text-[12.5px]"
                >
                  {copied === page.slug ? "Copied" : "Copy link"}
                </button>
              )}

              <button
                type="button"
                onClick={() => unpublish(page.slug)}
                disabled={busy === page.slug}
                className="fl-btn fl-btn-ghost !py-1.5 !text-[12.5px] !text-[var(--fl-danger)] disabled:opacity-50"
              >
                {busy === page.slug ? "Unpublishing…" : "Unpublish"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-[var(--fl-danger)]">
          {error}
        </p>
      )}
    </section>
  );
}
