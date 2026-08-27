"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  assessDecay,
  freshnessOf,
  pinRepoLink,
  repoTargetLabel,
  repoTargetUrl,
  repoTargetsIn,
  wikilinkTargets,
  type LinkFreshness,
  type RepoTarget,
} from "@forkleaf/markdown-engine";

/**
 * Whether this note is still true.
 *
 * Two questions that turn out to be one. A note links files it describes, and
 * those files move; a note makes datable claims, and time passes. Answering
 * either alone would mean two panels saying similar things about the same
 * page, so they answer together: the files are the hard evidence, the claims
 * are the inference, and the verdict says which of the two it is leaning on.
 */

export interface NoteFreshnessProps {
  content: string;
  /** ISO timestamp of the last local edit; null for a note never opened here. */
  updatedAt: string | null;
  /**
   * The repository, when there is one.
   *
   * Null for a local workspace. Only the linked-file half needs GitHub —
   * whether a note's claims have aged is a question about the note, and
   * withholding the answer from local notebooks would be gating the feature on
   * an implementation detail of the other half.
   */
  repo: { owner: string; repo: string; branch: string } | null;
  /** Rewrites the note when a link is re-pinned. Absent makes the list read-only. */
  onChange?: (content: string) => void;
  /**
   * Opens a linked file for reading, without leaving the note.
   *
   * Absent falls back to github.com in a new tab, which is what this list did
   * before there was anywhere in the app to read a file.
   */
  onOpenFile?: (target: RepoTarget) => void;
}

interface Checked {
  target: RepoTarget;
  freshness: LinkFreshness;
  headRef: string | null;
}

const FRESHNESS_LABEL: Record<LinkFreshness, string> = {
  current: "unchanged since you linked it",
  changed: "changed since you linked it",
  unverified: "never pinned",
  missing: "no longer in the repository",
  unknown: "could not be checked",
};

/**
 * Whether this note has anything to say about its own freshness.
 *
 * Exported so the panel can decide whether to draw the section heading at all.
 * The component returning null on its own left a bare "Freshness" title with
 * empty space under it on most notes — worse than the permanent all-clear it
 * was trying to avoid.
 *
 * Deliberately synchronous, and answered from the targets rather than from the
 * checked results: waiting for GitHub would mean the section appearing a
 * moment after the panel, which reads as the layout glitching.
 */
export function hasFreshnessToReport(
  content: string,
  updatedAt: string | null,
  hasRepo: boolean,
): boolean {
  if (hasRepo && repoTargetsIn(wikilinkTargets(content)).length > 0) return true;
  return assessDecay(content, { updatedAt }).verdict !== "fresh";
}

export function NoteFreshness({
  content,
  updatedAt,
  repo,
  onChange,
  onOpenFile,
}: NoteFreshnessProps) {
  const targets = useMemo(() => repoTargetsIn(wikilinkTargets(content)), [content]);

  const [checked, setChecked] = useState<Checked[]>([]);
  const [checking, setChecking] = useState(false);

  /**
   * The key that decides when the files are worth re-reading.
   *
   * Derived from the targets rather than from the note: retyping a paragraph
   * does not change which files it links, and re-asking GitHub on every
   * keystroke would be a request per character.
   */
  const key = useMemo(
    () => targets.map((t) => `${t.owner ?? ""}/${t.repo ?? ""}/${t.path}@${t.ref ?? ""}`).join(" "),
    [targets],
  );

  useEffect(() => {
    let cancelled = false;

    // Everything inside the async body, including the empty case: writing
    // state straight from the effect sets it during render, which cascades.
    void (async () => {
      if (!repo || targets.length === 0) {
        if (!cancelled) setChecked([]);
        return;
      }

      if (!cancelled) setChecking(true);

      const results = await Promise.all(
        targets.map(async (target): Promise<Checked> => {
          try {
            const params = new URLSearchParams({
              owner: target.owner ?? repo.owner,
              repo: target.repo ?? repo.repo,
              branch: repo.branch,
              path: target.path,
            });

            const response = await fetch(`/api/gh/file-head?${params.toString()}`);
            const body = await response.json().catch(() => null);

            if (!response.ok) return { target, freshness: "unknown", headRef: null };

            return {
              target,
              headRef: body?.sha ?? null,
              freshness: freshnessOf(target, body?.sha ?? null, { exists: body?.exists }),
            };
          } catch {
            // A file we could not ask about is not a file we can call stale.
            return { target, freshness: "unknown", headRef: null };
          }
        }),
      );

      if (cancelled) return;
      setChecked(results);
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
    // `targets` is rebuilt on every render; `key` is what actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, repo?.owner, repo?.repo, repo?.branch]);

  const changedFiles = useMemo(
    () =>
      checked.filter((entry) => entry.freshness === "changed").map((entry) => entry.target.path),
    [checked],
  );

  const decay = useMemo(
    () => assessDecay(content, { updatedAt, changedFiles }),
    [content, updatedAt, changedFiles],
  );

  const pin = useCallback(
    (entry: Checked) => {
      if (!onChange || !entry.headRef) return;
      onChange(pinRepoLink(content, entry.target, entry.headRef));
    },
    [content, onChange],
  );

  // Matches `hasFreshnessToReport` exactly, so the section heading and its
  // contents can never disagree about whether there is anything here.
  if (!hasFreshnessToReport(content, updatedAt, repo !== null)) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <Verdict verdict={decay.verdict} />
        {checking && <span className="text-[11px] text-[var(--fl-muted)]">checking files…</span>}
      </div>

      {decay.reasons.map((reason) => (
        <p key={reason} className="text-[12px] leading-snug text-[var(--fl-muted)]">
          {reason}
        </p>
      ))}

      {checked.length > 0 && (
        <ul className="space-y-1.5">
          {checked.map((entry) => (
            <li key={`${entry.target.path}${entry.target.owner ?? ""}`} className="text-[12px]">
              <div className="flex items-baseline justify-between gap-2">
                {/* Still an anchor when it opens in-app: ⌘-click, middle-click
                    and "copy link address" all have to keep working, and only
                    a real href gives them to you. */}
                <a
                  href={repoTargetUrl(entry.target, repo ?? { owner: "", repo: "", branch: "" })}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    if (!onOpenFile) return;
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    onOpenFile(entry.target);
                  }}
                  className="truncate font-mono text-[11.5px] text-[var(--fl-text)] underline-offset-2 hover:underline"
                  title={onOpenFile ? `Read ${entry.target.path}` : entry.target.path}
                >
                  {repoTargetLabel(entry.target)}
                </a>

                {onChange &&
                  (entry.freshness === "changed" || entry.freshness === "unverified") && (
                    <button
                      type="button"
                      onClick={() => pin(entry)}
                      disabled={!entry.headRef}
                      className="shrink-0 text-[11px] text-[var(--fl-muted)] underline-offset-2 hover:text-[var(--fl-text)] hover:underline disabled:opacity-40"
                      title="Record that you have re-read this file, so the warning clears"
                    >
                      {entry.freshness === "changed" ? "Re-read it" : "Pin it"}
                    </button>
                  )}
              </div>
              <span className={`text-[11px] ${toneFor(entry.freshness)}`}>
                {FRESHNESS_LABEL[entry.freshness]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toneFor(freshness: LinkFreshness): string {
  if (freshness === "changed" || freshness === "missing") return "text-[#f87171]";
  if (freshness === "current") return "text-[#4ade80]";
  return "text-[var(--fl-muted)]";
}

function Verdict({ verdict }: { verdict: ReturnType<typeof assessDecay>["verdict"] }) {
  const label =
    verdict === "likely-stale"
      ? "Likely out of date"
      : verdict === "worth-checking"
        ? "Worth re-reading"
        : verdict === "unknown"
          ? "Never checked here"
          : "Nothing here expires";

  const tone =
    verdict === "likely-stale"
      ? "text-[#f87171]"
      : verdict === "worth-checking"
        ? "text-[#fbbf24]"
        : "text-[var(--fl-muted)]";

  return <span className={`text-[12.5px] font-medium ${tone}`}>{label}</span>;
}
