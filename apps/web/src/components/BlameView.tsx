"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildBlame,
  ageRatio,
  type BlameBlock,
  type BlameRevision,
} from "@forkleaf/markdown-engine";
import type { RepoRef } from "@forkleaf/types";
import type { NoteCommitDto, CommitFileDto } from "@/lib/gateway";
import { readCommitFiles } from "@/lib/gateway";
import type { RevisionTexts } from "@/hooks/useRevisionTexts";
import { relativeTime, relativeAge } from "@/lib/relative-time";

export interface BlameViewProps {
  /** The note's commits, newest first — the order the history API returns. */
  commits: readonly NoteCommitDto[];
  /** Shared revision cache, so this costs nothing the replay has not paid. */
  revisions: RevisionTexts;
  /** Where the note lives, for looking up what else a commit touched. */
  repo: RepoRef;
  /** The note's path, so a commit's other files can exclude it. */
  path: string;
}

/**
 * When each paragraph was written, and what you were doing at the time.
 *
 * `git blame`, for prose. Re-reading your own notes months later, the question
 * is rarely "what changed?" — it is "when did I learn this, and do I still
 * believe it?". A paragraph untouched since March sitting next to one added
 * last week looks identical on the page, and that difference is most of what
 * you want to know.
 *
 * The dates live in a gutter that is always on screen rather than behind a
 * hover, because a feature you have to discover by accident is one nobody
 * uses. Hovering or focusing a paragraph fills in the rest: the commit, its
 * message, and the other files it touched — which is what turns "2 March" into
 * "during the AD engagement".
 */
export function BlameView({ commits, revisions, repo, path }: BlameViewProps) {
  const [active, setActive] = useState<string | null>(null);
  const { texts, has, prefetch } = revisions;

  const shas = useMemo(() => commits.map((commit) => commit.sha), [commits]);

  useEffect(() => {
    prefetch(shas);
  }, [shas, prefetch]);

  const input = useMemo<BlameRevision[]>(
    () =>
      commits.map((commit) => ({
        sha: commit.sha,
        date: commit.date,
        text: has(commit.sha) ? (texts[commit.sha] ?? null) : null,
        message: commit.byForkLeaf && !commit.message ? "Autosaved" : commit.message,
        authorName: commit.authorName,
        authorLogin: commit.authorLogin,
      })),
    [commits, texts, has],
  );

  const blame = useMemo(() => buildBlame(input), [input]);

  const loadedCount = shas.filter((sha) => sha in texts).length;
  const loading = loadedCount < shas.length;

  // The age scale is relative to this page, not to the calendar: a note
  // written across one afternoon and one written across four years should each
  // use the whole range, because in both the question is which parts are old.
  const [oldest, newest] = useMemo(() => {
    const dates = blame.lines.map((line) => line.date);
    if (dates.length === 0) return ["", ""] as const;
    const sorted = [...dates].sort();
    return [sorted[0]!, sorted[sorted.length - 1]!] as const;
  }, [blame.lines]);

  const activeBlock = useMemo(
    () => blame.blocks.find((block) => key(block) === active) ?? null,
    [blame.blocks, active],
  );

  // Nothing has arrived yet — the first frame of a note whose history is still
  // loading. Distinct from a note with no attributable content.
  if (loadedCount === 0 && commits.length > 0) {
    return (
      <p aria-busy="true" className="py-10 text-center text-[13.5px] text-[var(--fl-muted)]">
        Reading {commits.length} {commits.length === 1 ? "revision" : "revisions"}…
      </p>
    );
  }

  if (blame.empty) {
    return (
      <p className="py-10 text-center text-[13.5px] leading-relaxed text-[var(--fl-muted)]">
        Nothing to attribute.
        <br />
        This note is empty in its most recent commit.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* ── What you are looking at, and how to read it ─────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[var(--fl-elevated)] px-3 py-2 text-[12px]">
        <span className="text-[var(--fl-text)]">
          {blame.commits.length} {blame.commits.length === 1 ? "commit" : "commits"} still visible
          on this page
        </span>
        <span className="text-[var(--fl-muted)]">
          oldest {relativeTime(oldest)} · newest {relativeTime(newest)}
        </span>

        <span
          className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--fl-muted)]"
          title="Paragraphs are shaded by when they last changed"
        >
          <span>older</span>
          <span
            aria-hidden="true"
            className="h-1.5 w-16 rounded-full"
            style={{
              background:
                "linear-gradient(to right, color-mix(in srgb, var(--fl-accent) 18%, transparent), var(--fl-accent))",
            }}
          />
          <span>newer</span>
        </span>

        {loading && (
          <span className="text-[11px] text-[var(--fl-muted)]">
            reading {loadedCount}/{shas.length}
          </span>
        )}
      </div>

      {/* ── The commit behind whatever is under the cursor ───────────────── */}
      <CommitCard block={activeBlock} repo={repo} notePath={path} />

      {/* ── The note, with its dates in the margin ──────────────────────── */}
      <div
        className="min-h-[200px] max-h-[46vh] overflow-y-auto rounded-xl border border-[var(--fl-border)] p-2"
        onMouseLeave={() => setActive(null)}
      >
        {blame.blocks.map((block) => (
          <BlockRow
            key={key(block)}
            block={block}
            oldest={oldest}
            newest={newest}
            active={key(block) === active}
            onActivate={() => setActive(key(block))}
          />
        ))}
      </div>

      {loading && (
        <p className="text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
          Still reading older revisions. Attribution will move earlier as they arrive.
        </p>
      )}
    </div>
  );
}

/** Stable within one render of one blame, which is all a React key needs. */
function key(block: BlameBlock): string {
  return `${block.start}-${block.end}`;
}

/**
 * One paragraph, with its age in the margin.
 *
 * A button rather than a div with a mouse handler: this is the control that
 * reveals a paragraph's history, and a keyboard user has as much right to it
 * as a mouse user. Focus activates it exactly as hover does.
 */
function BlockRow({
  block,
  oldest,
  newest,
  active,
  onActivate,
}: {
  block: BlameBlock;
  oldest: string;
  newest: string;
  active: boolean;
  onActivate: () => void;
}) {
  const ratio = ageRatio(block.newest.date, oldest, newest);
  // Floored well above zero: the oldest paragraph on the page should read as
  // old, not as absent.
  const strength = Math.round((0.18 + ratio * 0.82) * 100);

  return (
    <button
      type="button"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onActivate}
      aria-pressed={active}
      aria-label={`Lines ${block.start} to ${block.end}, last changed ${relativeTime(
        block.newest.date,
      )}${block.newest.atOrBefore ? " or earlier" : ""}`}
      className={`flex w-full gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
        active ? "bg-[var(--fl-accent-soft)]" : "hover:bg-[var(--fl-elevated)]"
      }`}
    >
      <span className="flex shrink-0 items-stretch gap-2">
        <span
          aria-hidden="true"
          className="w-[3px] shrink-0 rounded-full bg-[var(--fl-accent)]"
          style={{ opacity: strength / 100 }}
        />
        {/* Narrower on a phone, where a fixed gutter this wide leaves the
            prose in a column two words across. */}
        <span className="w-[3.5rem] shrink-0 pt-0.5 text-[10.5px] leading-tight text-[var(--fl-muted)] sm:w-[5.5rem]">
          <span className="block">
            {block.newest.atOrBefore && (
              <span
                title="Or earlier — older than the history ForkLeaf can read"
                aria-label="at or before"
              >
                ≤{" "}
              </span>
            )}
            <span data-blame-date>{shortDate(block.newest.date)}</span>
          </span>
          {/* The SHA is a detail — the card names it too — so it is the first
              thing to go when there is no room for both it and the date. */}
          <span className="mt-0.5 hidden font-mono text-[10px] opacity-70 sm:block">
            {block.newest.sha.slice(0, 7)}
          </span>
        </span>
      </span>

      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[var(--fl-text)]">
        {block.text}
      </span>

      {/* A paragraph assembled over several sittings is a different kind of
          thing from one written in a single pass, and only the count says so. */}
      {block.commitCount > 1 && (
        <span
          title={`${block.commitCount} commits went into this paragraph`}
          className="shrink-0 self-start rounded bg-[var(--fl-border)] px-1.5 py-0.5 text-[10px] text-[var(--fl-muted)]"
        >
          {block.commitCount}×
        </span>
      )}
    </button>
  );
}

/**
 * The commit behind the paragraph under the cursor.
 *
 * Fixed above the document rather than floating beside it: a popover next to a
 * paragraph has to dodge the edges of a dialog, and it covers the very text
 * you are reading to decide whether you still believe it.
 */
function CommitCard({
  block,
  repo,
  notePath,
}: {
  block: BlameBlock | null;
  repo: RepoRef;
  notePath: string;
}) {
  const sha = block?.newest.sha ?? null;

  /**
   * The lookup, tagged with the commit it was for.
   *
   * Tagged rather than cleared when the cursor moves, because clearing means
   * writing state from inside the effect — a render spent undoing the last
   * one. Reading it back through the current SHA gives the same "nothing yet"
   * for a commit not looked up, with no extra render and no window in which
   * the previous commit's files sit under the new commit's name.
   */
  const [result, setResult] = useState<{
    sha: string;
    files: CommitFileDto[];
    truncated: boolean;
    failed: boolean;
  } | null>(null);

  const found = result && result.sha === sha ? result : null;

  useEffect(() => {
    if (!sha) return;

    let cancelled = false;

    void readCommitFiles(repo, notePath, sha)
      .then((next) => {
        if (!cancelled) setResult({ sha, ...next, failed: false });
      })
      .catch(() => {
        // Not worth an alarm: the date and the message are already on screen,
        // and this is the garnish on top of them.
        if (!cancelled) setResult({ sha, files: [], truncated: false, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [sha, repo, notePath]);

  const others = useMemo(
    () => (found?.files ?? []).filter((file) => file.path !== notePath),
    [found, notePath],
  );

  if (!block) {
    return (
      <p className="flex min-h-[6.5rem] items-center rounded-lg border border-dashed border-[var(--fl-border)] px-3 py-2.5 text-[12.5px] text-[var(--fl-muted)]">
        Point at a paragraph to see when it was written, and what else you changed that day.
      </p>
    );
  }

  const line = block.newest;
  // Null once it would only repeat the date already printed beside it.
  const age = relativeAge(line.date);

  return (
    <div className="min-h-[6.5rem] rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13px] font-medium text-[var(--fl-text)]">
          {line.message || "(no message)"}
        </span>
        <a
          href={`https://github.com/${repo.owner}/${repo.repo}/commit/${line.sha}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] text-[var(--fl-muted)] underline decoration-[var(--fl-border-strong)] underline-offset-[3px] transition-colors hover:text-[var(--fl-text)]"
        >
          {line.sha.slice(0, 7)}
        </a>
      </div>

      <p className="mt-1 text-[11.5px] text-[var(--fl-muted)]">
        {line.authorName}
        {line.authorLogin ? ` (@${line.authorLogin})` : ""} ·{" "}
        <time dateTime={line.date} title={new Date(line.date).toLocaleString()}>
          {line.atOrBefore ? "at or before " : ""}
          {new Date(line.date).toLocaleDateString()}
          {age && ` (${age})`}
        </time>
        {block.commitCount > 1 && ` · first written ${relativeTime(block.oldest.date)}`}
      </p>

      {line.atOrBefore && (
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--fl-muted)]">
          This text was already here in the oldest revision ForkLeaf can read, so it may be older
          than the commit named.
        </p>
      )}

      {/* The part that turns a date into a memory. */}
      <div className="mt-2 border-t border-[var(--fl-border)] pt-2 text-[11.5px]">
        {found?.failed ? (
          <span className="text-[var(--fl-muted)]">
            Could not read what else this commit touched.
          </span>
        ) : found === null ? (
          <span aria-busy="true" className="text-[var(--fl-muted)]">
            Looking up what else changed…
          </span>
        ) : others.length === 0 ? (
          <span className="text-[var(--fl-muted)]">This commit touched only this note.</span>
        ) : (
          <>
            <span className="text-[var(--fl-muted)]">Committed alongside</span>
            <ul className="mt-1 flex flex-wrap gap-1">
              {others.map((file) => (
                <li
                  key={file.path}
                  title={`${file.path} (${file.status})`}
                  className="max-w-full truncate rounded bg-[var(--fl-surface)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--fl-text)]"
                >
                  {file.path}
                </li>
              ))}
              {found.truncated && (
                <li className="px-1.5 py-0.5 text-[10.5px] text-[var(--fl-muted)]">and more…</li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * "2 Mar", or "2 Mar 24" once a year has passed.
 *
 * The year is the whole point for an old note — "2 Mar" on a page written
 * across three years says nothing — but repeating it on every line of a note
 * written this year is noise in a gutter that has to stay narrow.
 */
function shortDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";

  const short = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return date.getFullYear() === now.getFullYear()
    ? short
    : `${short} ${String(date.getFullYear()).slice(-2)}`;
}
