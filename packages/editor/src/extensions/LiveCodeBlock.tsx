"use client";

import { useCallback, useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  diffLines,
  extractCode,
  fenceFor,
  parseLiveCode,
  sameCode,
  serializeLiveCode,
  type LiveCodeSpec,
} from "../live-code";

/**
 * Live code, in the note: a piece of a repository that says when it changes.
 *
 * The block keeps a copy of the code as it was written about, and fetches the
 * current code each time the note is opened. When they differ, it says so
 * where the reader is looking — "changed since this note was written" — with
 * the change itself a click away, and one more click to bring the note's copy
 * up to date. Stored as a ```live-code fence whose body is that copy, so the
 * note reads correctly anywhere.
 */

export interface LiveCodeBridge {
  /** `owner/name` of this notebook's repository, for blocks that name none. */
  defaultRepo: string | null;
  /** The file's text, or null when it does not exist. Throws when it cannot be read. */
  read: (repo: string, path: string, ref: string | null) => Promise<string | null>;
  /** The file on github.com, at those lines. */
  webUrl: (repo: string, path: string, ref: string | null, from: number, to: number) => string;
}

export interface LiveCodeBlockOptions {
  bridge: () => LiveCodeBridge | undefined;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    liveCodeBlock: {
      insertLiveCode: () => ReturnType;
    };
  }
}

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "unavailable"; reason: string }
  | { kind: "fresh"; from: number; to: number }
  | { kind: "changed"; current: string; from: number; to: number }
  | { kind: "missing"; reason: string }
  | { kind: "error"; message: string };

function LiveCodeView({ node, updateAttributes, extension, editor, selected }: NodeViewProps) {
  const bridge = (extension.options as LiveCodeBlockOptions).bridge();
  const spec = parseLiveCode((node.attrs.source as string) ?? "");
  const editable = editor.isEditable;
  const repo = spec.repo ?? bridge?.defaultRepo ?? null;
  const [editing, setEditing] = useState(!spec.path);
  /** What the last check found, and which embed and check it was for. */
  const [result, setResult] = useState<{ key: string; status: Status } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [checks, setChecks] = useState(0);

  const write = useCallback(
    (next: LiveCodeSpec) => updateAttributes({ source: serializeLiveCode(next) }),
    [updateAttributes],
  );

  const unavailable = !bridge
    ? "Open this note in a notebook to check it."
    : !repo
      ? "Connect a GitHub repository, or name one with repo: owner/name, to check this code."
      : null;
  const key = JSON.stringify([repo, spec.path, spec.symbol, spec.lines, spec.ref, checks]);

  useEffect(() => {
    if (!spec.path || editing || unavailable || !bridge || !repo) return;
    let live = true;
    const settle = (status: Status) => {
      if (live) setResult({ key, status });
    };
    bridge.read(repo, spec.path, spec.ref).then(
      (text) => {
        if (text === null) {
          settle({ kind: "missing", reason: `${spec.path} is not in ${repo} any more.` });
          return;
        }
        const found = extractCode(text, spec);
        if (!found.found) {
          settle({ kind: "missing", reason: found.reason });
          return;
        }
        if (!spec.snapshot) {
          // The first look: the note keeps what the code is now.
          if (live && editable) write({ ...spec, snapshot: found.code });
          settle({ kind: "fresh", from: found.from, to: found.to });
        } else if (sameCode(spec.snapshot, found.code)) {
          settle({ kind: "fresh", from: found.from, to: found.to });
        } else {
          settle({ kind: "changed", current: found.code, from: found.from, to: found.to });
        }
      },
      (error: unknown) =>
        settle({
          kind: "error",
          message: error instanceof Error ? error.message : "The repository could not be read.",
        }),
    );
    return () => {
      live = false;
    };
    // Checked when what is embedded changes, or on Refresh — not on every
    // render, and not when only the copy is updated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, editing, unavailable]);

  const status: Status = !spec.path
    ? { kind: "idle" }
    : unavailable
      ? { kind: "unavailable", reason: unavailable }
      : result?.key === key
        ? result.status
        : { kind: "checking" };
  const setStatus = (next: Status) => setResult({ key, status: next });

  const shown = status.kind === "changed" && !spec.snapshot ? status.current : spec.snapshot;
  const range =
    status.kind === "fresh" || status.kind === "changed"
      ? { from: status.from, to: status.to }
      : null;
  const where = [
    spec.path || "No file chosen",
    spec.symbol ?? (spec.lines ? `lines ${spec.lines.from}–${spec.lines.to}` : null),
    spec.repo,
    spec.ref,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <NodeViewWrapper
      className="fl-live-code-node my-4"
      data-type="live-code"
      contentEditable={false}
    >
      <div
        className={`overflow-hidden rounded-xl border bg-[var(--fl-surface)] ${
          selected ? "border-[var(--fl-accent)]" : "border-[var(--fl-border)]"
        }`}
      >
        <div
          className="flex flex-wrap items-center gap-2 border-b border-[var(--fl-border)] px-3 py-1.5 text-[11px] text-[var(--fl-muted)]"
          data-drag-handle
        >
          <span className="font-medium uppercase tracking-[0.08em]">Live code</span>
          <span className="min-w-0 truncate font-mono normal-case" title={where}>
            {where}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {range && repo && bridge && spec.path && (
              <a
                href={bridge.webUrl(repo, spec.path, spec.ref, range.from, range.to)}
                target="_blank"
                rel="noreferrer"
                className="rounded px-1.5 py-0.5 hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              >
                Open on GitHub
              </a>
            )}
            {spec.path && !editing && (
              <button
                type="button"
                onClick={() => setChecks((count) => count + 1)}
                className="rounded px-1.5 py-0.5 hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              >
                Refresh
              </button>
            )}
            {editable && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded px-1.5 py-0.5 hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              >
                Edit
              </button>
            )}
          </span>
        </div>

        {editing ? (
          <LiveCodeForm
            spec={spec}
            defaultRepo={bridge?.defaultRepo ?? null}
            onCancel={spec.path ? () => setEditing(false) : null}
            onSave={(next) => {
              const sameTarget =
                next.repo === spec.repo &&
                next.path === spec.path &&
                next.symbol === spec.symbol &&
                next.ref === spec.ref &&
                next.lines?.from === spec.lines?.from &&
                next.lines?.to === spec.lines?.to;
              write({ ...next, snapshot: sameTarget ? spec.snapshot : "" });
              setShowDiff(false);
              setEditing(false);
            }}
          />
        ) : (
          <>
            <StatusLine
              status={status}
              editable={editable}
              showDiff={showDiff}
              onToggleDiff={() => setShowDiff((value) => !value)}
              onUpdate={() => {
                if (status.kind !== "changed") return;
                write({ ...spec, snapshot: status.current });
                setShowDiff(false);
                setStatus({ kind: "fresh", from: status.from, to: status.to });
              }}
              onRetry={() => setChecks((count) => count + 1)}
            />
            {status.kind === "changed" && showDiff ? (
              <pre
                className="m-0 max-h-[28rem] overflow-auto bg-[var(--fl-elevated)] p-3 font-mono text-[12.5px] leading-[1.6]"
                data-testid="live-code-diff"
              >
                {diffLines(spec.snapshot, status.current).map((line, index) => (
                  <div
                    key={index}
                    className={
                      line.kind === "added"
                        ? "bg-[color-mix(in_srgb,var(--fl-accent)_14%,transparent)] text-[var(--fl-text)]"
                        : line.kind === "removed"
                          ? "bg-[color-mix(in_srgb,var(--fl-danger)_14%,transparent)] text-[var(--fl-muted)] line-through"
                          : "text-[var(--fl-text)]"
                    }
                  >
                    <span aria-hidden="true" className="mr-2 select-none text-[var(--fl-muted)]">
                      {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
                    </span>
                    {line.text || " "}
                  </div>
                ))}
              </pre>
            ) : shown ? (
              <pre
                className="m-0 max-h-[28rem] overflow-auto bg-[var(--fl-elevated)] p-3 font-mono text-[12.5px] leading-[1.6] text-[var(--fl-text)]"
                data-testid="live-code-snapshot"
              >
                <code>{shown}</code>
              </pre>
            ) : null}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function StatusLine({
  status,
  editable,
  showDiff,
  onToggleDiff,
  onUpdate,
  onRetry,
}: {
  status: Status;
  editable: boolean;
  showDiff: boolean;
  onToggleDiff: () => void;
  onUpdate: () => void;
  onRetry: () => void;
}) {
  const base = "flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]";
  switch (status.kind) {
    case "idle":
      return null;
    case "checking":
      return (
        <p role="status" className={`${base} text-[var(--fl-muted)]`}>
          Checking the repository…
        </p>
      );
    case "unavailable":
      return <p className={`${base} text-[var(--fl-muted)]`}>{status.reason}</p>;
    case "fresh":
      return (
        <p className={`${base} text-[var(--fl-muted)]`} data-testid="live-code-status">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--fl-accent)]" />
          Matches the repository · lines {status.from}–{status.to}
        </p>
      );
    case "changed":
      return (
        <div
          className={`${base} border-b border-[var(--fl-border)] bg-[color-mix(in_srgb,var(--fl-warn)_12%,transparent)]`}
          data-testid="live-code-status"
        >
          <span className="font-medium text-[var(--fl-text)]">
            The code has changed since this note was written.
          </span>
          <span className="ml-auto flex gap-1.5">
            <button
              type="button"
              onClick={onToggleDiff}
              className="rounded-lg border border-[var(--fl-border)] px-2 py-0.5 text-[12px] font-medium text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
            >
              {showDiff ? "Hide changes" : "Show what changed"}
            </button>
            {editable && (
              <button
                type="button"
                onClick={onUpdate}
                className="rounded-lg border border-[var(--fl-border)] px-2 py-0.5 text-[12px] font-medium text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
              >
                Update the note
              </button>
            )}
          </span>
        </div>
      );
    case "missing":
      return (
        <p className={`${base} text-[var(--fl-danger)]`} data-testid="live-code-status">
          {status.reason} The copy below is what the note was written about.
        </p>
      );
    case "error":
      return (
        <p className={`${base} text-[var(--fl-danger)]`}>
          {status.message}
          <button type="button" onClick={onRetry} className="underline underline-offset-2">
            Try again
          </button>
        </p>
      );
  }
}

function LiveCodeForm({
  spec,
  defaultRepo,
  onSave,
  onCancel,
}: {
  spec: LiveCodeSpec;
  defaultRepo: string | null;
  onSave: (spec: LiveCodeSpec) => void;
  onCancel: (() => void) | null;
}) {
  const [repo, setRepo] = useState(spec.repo ?? "");
  const [path, setPath] = useState(spec.path);
  const [mode, setMode] = useState<"symbol" | "lines">(
    spec.lines && !spec.symbol ? "lines" : "symbol",
  );
  const [symbol, setSymbol] = useState(spec.symbol ?? "");
  const [from, setFrom] = useState(spec.lines ? String(spec.lines.from) : "");
  const [to, setTo] = useState(spec.lines ? String(spec.lines.to) : "");
  const [ref, setRef] = useState(spec.ref ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    const parsed = parseLiveCode(
      [
        repo.trim() ? `repo: ${repo.trim()}` : "",
        `path: ${path.trim()}`,
        mode === "symbol" && symbol.trim() ? `symbol: ${symbol.trim()}` : "",
        mode === "lines" && from.trim() ? `lines: ${from.trim()}-${(to || from).trim()}` : "",
        ref.trim() ? `ref: ${ref.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    if (repo.trim() && !parsed.repo) return setProblem("Name the repository as owner/name.");
    if (!parsed.path) return setProblem("Which file? Give its path in the repository.");
    if (mode === "lines" && !parsed.lines)
      return setProblem("Give the lines as two numbers, first to last.");
    setProblem(null);
    onSave({ ...parsed, snapshot: spec.snapshot });
  };

  const field = "fl-input w-full text-[13px]";
  return (
    <form
      className="grid gap-2.5 p-3 text-[12.5px]"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-[var(--fl-muted)]">Repository</span>
          <input
            value={repo}
            onChange={(event) => setRepo(event.target.value)}
            placeholder={defaultRepo ?? "owner/name"}
            className={field}
            aria-label="Repository"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[var(--fl-muted)]">File</span>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="src/lib/auth.ts"
            className={field}
            aria-label="File"
            autoFocus
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2.5">
        <fieldset className="flex gap-3">
          <legend className="sr-only">What to show</legend>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === "symbol"} onChange={() => setMode("symbol")} />A
            function or class
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === "lines"} onChange={() => setMode("lines")} />
            Lines
          </label>
        </fieldset>
        {mode === "symbol" ? (
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            placeholder="login (empty for the whole file)"
            className={`${field} min-w-0 flex-1`}
            aria-label="Function or class name"
          />
        ) : (
          <span className="flex items-center gap-1.5">
            <input
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              inputMode="numeric"
              className={`${field} w-20`}
              aria-label="First line"
            />
            to
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              inputMode="numeric"
              className={`${field} w-20`}
              aria-label="Last line"
            />
          </span>
        )}
        <input
          value={ref}
          onChange={(event) => setRef(event.target.value)}
          placeholder="branch (default)"
          className={`${field} w-36`}
          aria-label="Branch"
        />
      </div>
      {problem && (
        <p role="alert" className="text-[var(--fl-danger)]">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="fl-btn fl-btn-primary !px-3 !py-1.5 !text-[12.5px]">
          Embed
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="fl-btn fl-btn-ghost !px-3 !py-1.5 !text-[12.5px]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export const LiveCodeBlock = Node.create<LiveCodeBlockOptions>({
  name: "liveCodeBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { bridge: () => undefined };
  },

  addAttributes() {
    return {
      source: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-source") ?? "",
        renderHTML: (attributes) => ({ "data-source": attributes.source as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="live-code"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "live-code" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LiveCodeView);
  },

  addCommands() {
    return {
      insertLiveCode:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { source: "" } }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: { source?: string } }) {
          const source = node.attrs.source ?? "";
          const fence = fenceFor(source);
          state.write(`${fence}live-code\n`);
          if (source) {
            state.text(source, false);
            state.ensureNewLine();
          }
          state.write(fence);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const code of Array.from(
              element.querySelectorAll<HTMLElement>("pre > code.language-live-code"),
            )) {
              const replacement = element.ownerDocument.createElement("div");
              replacement.setAttribute("data-type", "live-code");
              replacement.setAttribute("data-source", (code.textContent ?? "").replace(/\n$/, ""));
              code.parentElement?.replaceWith(replacement);
            }
          },
        },
      },
    };
  },
});

interface SerializerState {
  write(text: string): void;
  text(text: string, escape?: boolean): void;
  ensureNewLine(): void;
  closeBlock(node: unknown): void;
}
