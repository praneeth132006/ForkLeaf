"use client";

import { useEffect, useMemo, useState } from "react";
import { Preview } from "@forkleaf/editor";
import { repoTargetUrl, type RepoTarget } from "@forkleaf/markdown-engine";
import { readRepoFile } from "@/lib/gateway";
import { imageTypeFor } from "@/lib/media";
import { Dialog } from "./Dialog";

/**
 * Reading the file a `[[repo:…]]` link names, without leaving the note.
 *
 * Linking a file used to be half a feature. The picker wrote a precise,
 * revision-pinned link and the Freshness panel could tell you the file had
 * changed — but clicking the link did nothing useful: the target resolves to no
 * note, so the editor offered to *create* one called `repo:scripts/scan.sh`.
 * The one thing a link to a file has to do, open the file, was the one thing it
 * could not do.
 *
 * So the file is fetched and shown here, at the revision the link pinned rather
 * than at whatever the branch has moved on to — otherwise a link that reports
 * itself stale would still show today's file, and there would be no way to see
 * what the note was actually written about. Markdown renders; everything else
 * is shown as source, highlighted by the same pipeline the preview uses.
 */

export interface RepoFileDialogProps {
  target: RepoTarget;
  /** The workspace's repository, for a link that names no repository of its own. */
  repo: { owner: string; repo: string; branch: string };
  onClose: () => void;
}

/**
 * Where the source view stops.
 *
 * A minified bundle or a checked-in dataset is megabytes of one line, and
 * highlighting it locks the tab. Past this the head of the file is shown and
 * the rest is left to github.com, which is built for it.
 */
const MAX_SHOWN = 120_000;

/** Fence language for a path, so the source view is highlighted like the app's. */
function languageOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";

  const known: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    toml: "toml",
    css: "css",
    scss: "scss",
    html: "html",
    sql: "sql",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    php: "php",
  };

  // Files with no extension that are still text worth reading — a Dockerfile,
  // a Makefile — are shown unhighlighted rather than not shown.
  return known[extension] ?? "";
}

export function RepoFileDialog({ target, repo, onClose }: RepoFileDialogProps) {
  const owner = target.owner ?? repo.owner;
  const name = target.repo ?? repo.repo;
  const ref = target.ref ?? repo.branch;

  /**
   * What was read, tagged with what it was read for.
   *
   * Tagged rather than reset on the way in, which makes "still reading" a
   * derived value instead of a second piece of state: the answer on screen
   * belongs to this file exactly when the tag matches, and a synchronous
   * `setLoading(true)` at the top of the effect would be a cascading render
   * for something already implied.
   */
  const [read, setRead] = useState<{
    key: string;
    file: { content: string; sha: string } | null;
    error: string | null;
  }>({ key: "", file: null, error: null });

  const isImage = imageTypeFor(target.path) !== null;
  const isMarkdown = /\.(md|markdown|mdx)$/i.test(target.path);
  const githubUrl = repoTargetUrl(target, repo);
  const key = `${owner}/${name}@${ref}:${target.path}`;

  const loading = !isImage && read.key !== key;
  const file = read.key === key ? read.file : null;
  const error = read.key === key ? read.error : null;

  useEffect(() => {
    // Images are served as bytes by the raw route; fetching them through the
    // contents API would only decode them as broken UTF-8.
    if (isImage) return;

    let cancelled = false;

    void (async () => {
      try {
        const found = await readRepoFile({ owner, repo: name, ref, path: target.path });
        if (cancelled) return;

        setRead({
          key,
          file: found,
          error: found
            ? null
            : target.ref
              ? `${target.path} is not in ${owner}/${name} at ${target.ref}.`
              : `${target.path} is not in ${owner}/${name}.`,
        });
      } catch (caught) {
        if (cancelled) return;
        setRead({
          key,
          file: null,
          error: caught instanceof Error ? caught.message : "That file could not be read.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, owner, name, ref, target.path, target.ref, isImage]);

  const truncated = (file?.content.length ?? 0) > MAX_SHOWN;

  const markdown = useMemo(() => {
    if (!file) return "";
    const body = truncated ? file.content.slice(0, MAX_SHOWN) : file.content;

    if (isMarkdown) return body;

    // A fence, so the same renderer that highlights code in a note highlights
    // this. The fence is closed with a longer run than anything the file can
    // contain, or a file that itself contains ``` would end the block early
    // and the rest would render as prose.
    const fence = "`".repeat(Math.max(3, longestBacktickRun(body) + 1));
    return `${fence}${languageOf(target.path)}\n${body}\n${fence}`;
  }, [file, isMarkdown, target.path, truncated]);

  const rawUrl = `/api/gh/raw?${new URLSearchParams({
    owner,
    repo: name,
    branch: ref,
    path: target.path,
  }).toString()}`;

  return (
    <Dialog
      wide
      title={target.path}
      subtitle={`${owner}/${name} · ${target.ref ? `pinned to ${target.ref}` : ref}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {loading && <p className="text-[13px] text-[var(--fl-muted)]">Reading the file…</p>}

        {error && (
          <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
            {error}
          </p>
        )}

        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rawUrl}
            alt={target.path}
            className="max-h-[60vh] w-auto rounded-lg border border-[var(--fl-border)]"
          />
        )}

        {file && (
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
            <Preview markdown={markdown} />
          </div>
        )}

        {truncated && (
          <p className="text-[12px] text-[var(--fl-muted)]">
            Shown to the first {MAX_SHOWN.toLocaleString()} characters. The rest is on github.com.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11.5px] leading-snug text-[var(--fl-muted)]">
            {target.ref
              ? "The revision this note was written against, not whatever the branch holds now."
              : "This link is not pinned to a revision, so this is the file as it stands today."}
          </p>

          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="fl-btn shrink-0 whitespace-nowrap"
          >
            Open on GitHub
          </a>
        </div>
      </div>
    </Dialog>
  );
}

/** The longest run of backticks in the text, so a fence can outrun it. */
function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return longest;
}
