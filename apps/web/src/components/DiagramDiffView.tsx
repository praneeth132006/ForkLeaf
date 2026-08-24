"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DARK_SVG_THEME,
  LIGHT_SVG_THEME,
  diffDiagrams,
  diffToSvg,
  graphToSvg,
  mermaidToGraph,
  summarizeDiff,
  tidyLayout,
  type DiagramDiff,
  type Graph,
} from "@forkleaf/diagrams";
import { ForkLeafLogo } from "@/components/Brand";
import { useTheme } from "@/hooks/useTheme";

/**
 * Reviewing the diagrams in a pull request.
 *
 * The problem this exists for: a mermaid diff in a code review is unreadable.
 * `- B --> C` next to `+ B --> D` tells a reviewer that a character moved, not
 * whether the architecture changed, and reformatting a diagram produces a diff
 * the size of the diagram. So diagram changes get waved through, and the
 * architecture document drifts from the architecture.
 *
 * Here the two revisions are parsed and compared as graphs, then drawn as one
 * picture: what arrived, what left, what only moved. And it is a link, so the
 * entry point is the pull request somebody was already reading rather than a
 * signup page — no account needed for a public repository.
 */

interface DiagramEntry {
  beforeIndex: number | null;
  afterIndex: number | null;
  before: string | null;
  after: string | null;
  status: "added" | "removed" | "edited";
  summary: string;
}

interface FileEntry {
  path: string;
  previousPath: string | null;
  status: string;
  diagrams: DiagramEntry[];
}

interface Payload {
  pull: {
    number: number;
    title: string;
    url: string;
    state: string;
    merged: boolean;
    author: string | null;
    base: string;
    head: string;
  };
  repo: { owner: string; repo: string };
  truncated: boolean;
  markdownFiles: number;
  files: FileEntry[];
  signedIn: boolean;
}

type Load =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; data: Payload }
  | { state: "error"; message: string };

/**
 * Accepts the three ways somebody will arrive here.
 *
 * `?pr=owner/repo/12` is what a posted link looks like, because it survives
 * being pasted into a comment as one legible string. The separate parameters
 * and a plain GitHub URL both work too — refusing a pasted pull-request URL
 * would be a pointless piece of pedantry on a page whose entire job is to be
 * reachable from one.
 */
export function parseTarget(params: URLSearchParams): {
  owner: string;
  repo: string;
  number: number;
} | null {
  const combined = params.get("pr")?.trim() ?? "";

  const fromUrl = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i.exec(combined);
  const fromSlug = /^([\w.-]+)\/([\w.-]+)[/#]?(\d+)$/.exec(combined);
  const match = fromUrl ?? fromSlug;

  if (match) {
    return { owner: match[1]!, repo: match[2]!, number: Number(match[3]) };
  }

  const owner = params.get("owner")?.trim();
  const repo = params.get("repo")?.trim();
  const number = Number(params.get("number") ?? combined);

  if (owner && repo && Number.isInteger(number) && number > 0) {
    return { owner, repo, number };
  }

  return null;
}

export function DiagramDiffView() {
  const params = useSearchParams();
  const [theme, , toggleTheme] = useTheme();

  const target = useMemo(() => parseTarget(new URLSearchParams(params.toString())), [params]);

  /** One string per request, so a change of target is a value to compare. */
  const targetKey = target ? `${target.owner}/${target.repo}/${target.number}` : "";

  const [load, setLoad] = useState<Load>(() =>
    targetKey ? { state: "loading" } : { state: "idle" },
  );

  /**
   * Resets to "loading" when the request being viewed changes.
   *
   * Adjusted during render rather than in an effect. Setting state
   * synchronously inside an effect body renders once with the previous pull
   * request's results still on screen and then again with the reset — which is
   * both a wasted pass and, for the fraction of a second in between, a page
   * showing one request's diagrams under another one's title.
   */
  const [shown, setShown] = useState(targetKey);
  if (shown !== targetKey) {
    setShown(targetKey);
    setLoad(targetKey ? { state: "loading" } : { state: "idle" });
  }

  useEffect(() => {
    if (!target) return;

    let cancelled = false;

    const query = new URLSearchParams({
      owner: target.owner,
      repo: target.repo,
      number: String(target.number),
    });

    fetch(`/api/gh/pr-diagrams?${query}`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(body?.error?.message ?? "That pull request could not be read.");
        }
        setLoad({ state: "ready", data: body as Payload });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoad({
          state: "error",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    document.title =
      load.state === "ready"
        ? `Diagrams in #${load.data.pull.number} — ForkLeaf`
        : "Diagram review — ForkLeaf";
  }, [load]);

  return (
    <div className="min-h-screen bg-[var(--fl-bg)] font-sans text-[var(--fl-text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--fl-border)] bg-[var(--fl-bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <ForkLeafLogo markClassName="h-5 w-5" textClassName="text-sm" />
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--fl-border)]" />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[13.5px] font-semibold leading-tight">
              {load.state === "ready" ? load.data.pull.title : "Diagram review"}
            </h1>
            <p className="truncate text-[11.5px] text-[var(--fl-muted)]">
              {load.state === "ready"
                ? `${load.data.repo.owner}/${load.data.repo.repo} #${load.data.pull.number} · ${load.data.pull.base} ← ${load.data.pull.head}`
                : "Diagrams changed in a pull request"}
            </p>
          </div>

          {load.state === "ready" && (
            <a
              href={load.data.pull.url}
              target="_blank"
              rel="noreferrer noopener"
              className="hidden shrink-0 rounded-lg border border-[var(--fl-border)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)] sm:inline-block"
            >
              On GitHub
            </a>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="shrink-0 rounded-lg border border-[var(--fl-border)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)]"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {!target && <Landing />}
        {load.state === "loading" && (
          <p className="py-16 text-center text-sm text-[var(--fl-muted)]" aria-busy="true">
            Reading the pull request…
          </p>
        )}
        {load.state === "error" && <Problem message={load.message} />}
        {load.state === "ready" && <Result data={load.data} theme={theme} />}
      </main>
    </div>
  );
}

function Result({ data, theme }: { data: Payload; theme: "light" | "dark" }) {
  const changed = data.files.reduce((total, file) => total + file.diagrams.length, 0);

  if (changed === 0) {
    return (
      <div className="fl-panel px-5 py-8 text-center">
        <h2 className="text-base font-semibold">No diagram changed</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--fl-muted)]">
          {data.markdownFiles === 0
            ? "This pull request does not touch any markdown."
            : `${data.markdownFiles} markdown ${data.markdownFiles === 1 ? "file was" : "files were"} changed, but every diagram in them is the same as before — reordering and reformatting included.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-[12.5px] text-[var(--fl-muted)]">
        {changed} {changed === 1 ? "diagram" : "diagrams"} changed across {data.files.length}{" "}
        {data.files.length === 1 ? "file" : "files"}.
        {data.truncated && " Only the first 40 markdown files were read."}
      </p>

      {data.files.map((file) => (
        <section key={file.path} className="space-y-3">
          <h2 className="flex flex-wrap items-baseline gap-2 font-mono text-[13px]">
            <span className="truncate font-semibold">{file.path}</span>
            {file.previousPath && (
              <span className="text-[11.5px] font-normal text-[var(--fl-muted)]">
                renamed from {file.previousPath}
              </span>
            )}
          </h2>

          {file.diagrams.map((diagram, index) => (
            <DiagramCard key={`${file.path}-${index}`} entry={diagram} theme={theme} />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * One diagram, before and after.
 *
 * The overlay is the default view because it is the one that does the reading
 * for you: both revisions in the same coordinate space, so the difference is
 * where your eye already is. Side by side is a click away for the cases the
 * overlay cannot serve — a diagram that was rewritten rather than edited, or a
 * type the graph model has no overlay for.
 */
function DiagramCard({ entry, theme }: { entry: DiagramEntry; theme: "light" | "dark" }) {
  const [view, setView] = useState<"overlay" | "sides">("overlay");

  const diff: DiagramDiff | null = useMemo(
    () =>
      entry.before !== null && entry.after !== null
        ? diffDiagrams(entry.before, entry.after)
        : null,
    [entry.before, entry.after],
  );

  const svgTheme = theme === "dark" ? DARK_SVG_THEME : LIGHT_SVG_THEME;

  const overlay = useMemo(() => {
    if (!diff || diff.shape !== "graph") return null;
    return diffToSvg(diff, { theme: svgTheme, title: "Diagram changes" });
  }, [diff, svgTheme]);

  const canOverlay = overlay !== null;
  const showing = canOverlay && view === "overlay" ? "overlay" : "sides";

  return (
    <article className="fl-panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--fl-border)] px-4 py-2.5">
        <StatusPill status={entry.status} />
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--fl-muted)]">
          {diff ? summarizeDiff(diff) : entry.summary}
        </p>

        {canOverlay && (
          <div className="flex shrink-0 rounded-lg border border-[var(--fl-border)] p-0.5 text-[11.5px]">
            {(["overlay", "sides"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                aria-pressed={showing === option}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  showing === option
                    ? "bg-[var(--fl-surface-raised)] text-[var(--fl-text)]"
                    : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                }`}
              >
                {option === "overlay" ? "Overlay" : "Side by side"}
              </button>
            ))}
          </div>
        )}
      </header>

      {showing === "overlay" ? (
        <div className="p-4">
          <Picture svg={overlay!} label="Both revisions, overlaid" />
          <Legend />
        </div>
      ) : (
        <div className="grid gap-px bg-[var(--fl-border)] sm:grid-cols-2">
          <Side title="Before" code={entry.before} theme={svgTheme} />
          <Side title="After" code={entry.after} theme={svgTheme} />
        </div>
      )}

      {diff && <Changes diff={diff} />}
    </article>
  );
}

function Side({
  title,
  code,
  theme,
}: {
  title: string;
  code: string | null;
  theme: typeof LIGHT_SVG_THEME;
}) {
  const svg = useMemo(() => {
    if (code === null) return null;
    const graph = mermaidToGraph(code);
    if (!graph) return null;

    const arranged: Graph = /%%\s*forkleaf:layout\s/.test(code) ? graph : tidyLayout(graph);
    return graphToSvg(arranged, { theme, title });
  }, [code, theme, title]);

  return (
    <div className="bg-[var(--fl-surface)] p-4">
      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        {title}
      </h3>

      {code === null ? (
        <p className="py-8 text-center text-[12.5px] text-[var(--fl-muted)]">
          Did not exist {title === "Before" ? "before" : "after"}
        </p>
      ) : svg ? (
        <Picture svg={svg} label={title} />
      ) : (
        // A diagram type the graph model has no drawing for. The source is
        // still the truth, and showing it beats showing nothing.
        <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--fl-bg)] p-3 font-mono text-[11.5px] leading-relaxed">
          {code}
        </pre>
      )}
    </div>
  );
}

/**
 * The rendered SVG.
 *
 * Injected as markup because that is what an SVG is, and it is safe to do:
 * every string inside it came out of our own renderer, which XML-escapes each
 * label rather than interpolating it. Nothing from the repository reaches the
 * DOM unescaped.
 */
function Picture({ svg, label }: { svg: string; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="[&>svg]:h-auto [&>svg]:max-h-[70vh] [&>svg]:w-full overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function Legend() {
  const items = [
    ["Added", "var(--fl-ok, #15803D)"],
    ["Removed", "var(--fl-danger, #B91C1C)"],
    ["Changed", "#B45309"],
    ["Moved", "var(--fl-muted)"],
  ] as const;

  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--fl-muted)]">
      {items.map(([label, color]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: color }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** The change list, for what a picture cannot say precisely. */
function Changes({ diff }: { diff: DiagramDiff }) {
  const lines = useMemo(() => describe(diff), [diff]);
  if (lines.length === 0) return null;

  return (
    <details className="border-t border-[var(--fl-border)] px-4 py-2.5">
      <summary className="cursor-pointer text-[12.5px] font-medium text-[var(--fl-muted)]">
        {lines.length} {lines.length === 1 ? "change" : "changes"} in detail
      </summary>
      <ul className="mt-2 space-y-1 text-[12.5px] text-[var(--fl-muted)]">
        {lines.map((line, index) => (
          <li key={index} className="font-mono">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Every change, in a sentence each. */
function describe(diff: DiagramDiff): string[] {
  if (diff.shape === "opaque") return [diff.reason];

  const lines: string[] = [];
  const fields = (changes: { field: string; before: string; after: string }[]) =>
    changes.map((change) => `${change.field}: ${change.before} → ${change.after}`).join(", ");

  if (diff.shape === "graph") {
    for (const node of diff.nodes) {
      const label = node.after?.label || node.before?.label || node.id;
      if (node.status === "added") lines.push(`+ node ${label}`);
      if (node.status === "removed") lines.push(`− node ${label}`);
      if (node.status === "changed") lines.push(`~ node ${label} (${fields(node.changes)})`);
    }
    for (const edge of diff.edges) {
      const arrow = `${edge.fromLabel} → ${edge.toLabel}`;
      if (edge.status === "added") lines.push(`+ arrow ${arrow}`);
      if (edge.status === "removed") lines.push(`− arrow ${arrow}`);
      if (edge.status === "changed") lines.push(`~ arrow ${arrow} (${fields(edge.changes)})`);
    }
    return lines;
  }

  for (const participant of diff.participants) {
    const label = participant.after?.label || participant.before?.label || participant.id;
    if (participant.status === "added") lines.push(`+ participant ${label}`);
    if (participant.status === "removed") lines.push(`− participant ${label}`);
    if (participant.status === "changed") lines.push(`~ participant ${label}`);
  }
  for (const message of diff.messages) {
    const label = `${message.fromLabel} → ${message.toLabel}: ${
      message.after?.label ?? message.before?.label ?? ""
    }`;
    if (message.status === "added") lines.push(`+ ${label}`);
    if (message.status === "removed") lines.push(`− ${label}`);
    if (message.status === "changed") lines.push(`~ ${label} (${fields(message.changes)})`);
  }

  return lines;
}

function StatusPill({ status }: { status: DiagramEntry["status"] }) {
  const styles: Record<DiagramEntry["status"], string> = {
    added: "border-[var(--fl-ok,#15803D)] text-[var(--fl-ok,#15803D)]",
    removed: "border-[var(--fl-danger)] text-[var(--fl-danger)]",
    edited: "border-[var(--fl-border-strong)] text-[var(--fl-muted)]",
  };

  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${styles[status]}`}
    >
      {status === "added" ? "New" : status === "removed" ? "Removed" : "Edited"}
    </span>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <div className="fl-panel px-5 py-8 text-center">
      <h2 className="text-base font-semibold">That pull request could not be read</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--fl-muted)]">
        {message}
      </p>
      <p className="mx-auto mt-3 max-w-md text-[12.5px] text-[var(--fl-muted)]">
        Private repositories need you to be signed in with an account that can see them.
      </p>
    </div>
  );
}

/** What the page says when it is opened without a pull request. */
function Landing() {
  const [value, setValue] = useState("");

  return (
    <div className="fl-panel mx-auto max-w-xl px-6 py-10 text-center">
      <h2 className="text-lg font-semibold">See what a pull request did to your diagrams</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--fl-muted)]">
        Paste a pull request. Every Mermaid diagram in every changed markdown file is compared as a
        graph — so a renamed box reads as a rename, and a reformatted diagram reads as no change at
        all.
      </p>

      <form
        className="mt-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const target = parseTarget(new URLSearchParams({ pr: value }));
          if (!target) return;
          window.location.search = new URLSearchParams({
            pr: `${target.owner}/${target.repo}/${target.number}`,
          }).toString();
        }}
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://github.com/owner/repo/pull/12"
          aria-label="Pull request URL"
          className="min-w-0 flex-1 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--fl-border-strong)]"
        />
        <button type="submit" className="fl-btn fl-btn-primary shrink-0">
          Show the diagrams
        </button>
      </form>
    </div>
  );
}
