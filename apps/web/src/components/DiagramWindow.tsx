"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { detectKind, mermaidToGraph } from "@forkleaf/diagrams";
import { DiagramStudio, useDiagramPopoutSession, type DiagramLinkStatus } from "@forkleaf/editor";
import { ForkLeafLogo } from "@/components/Brand";
import { useTheme } from "@/hooks/useTheme";

/**
 * One diagram, one window.
 *
 * The note tab remains the owner of the text — this window has no repository
 * access and never writes a file. It posts each edit back to the note, which
 * applies it to the `mermaid` block and saves it on its own schedule. So
 * "autosave" here is not a second save path with its own failure modes; it is
 * the note's save path, driven from another window.
 *
 * The header therefore has one job beyond identification: say, truthfully and
 * continuously, whether what you are drawing is reaching the note. A diagram
 * editor that quietly stops saving is worse than one that never saved.
 */
export function DiagramWindow() {
  const params = useSearchParams();
  const sessionId = params.get("s");

  const { code, setCode, title, status, savedAt, dirty, reason, ready } =
    useDiagramPopoutSession(sessionId);

  const [theme, , toggleTheme] = useTheme();

  // The window is about one thing, so it may as well say which one.
  useEffect(() => {
    document.title = `${title} — ForkLeaf`;
  }, [title]);

  // Closing with unsent work is the one thing worth interrupting for. Nothing
  // is prompted while the link is healthy, because then there is nothing to
  // lose — the note already has it.
  useEffect(() => {
    if (!dirty || status !== "detached") return;

    const confirmLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", confirmLeave);
    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [dirty, status]);

  if (!sessionId) {
    return (
      <Message
        heading="No diagram to edit"
        body="This window is opened from a diagram inside a note — there is nothing for it to show on its own."
      />
    );
  }

  if (status === "finished") {
    return (
      <Message
        heading={reason === "brought-back" ? "Editing moved back to the note" : "The note closed"}
        body={
          reason === "brought-back"
            ? "This diagram is being edited in the note tab again. Everything you drew here is in it."
            : "The note that owns this diagram is no longer open, so there is nowhere to save to. Your last edit was saved into the note before it closed."
        }
        code={code}
      />
    );
  }

  return (
    // The same layered shell the editor uses: floating surfaces on the page
    // colour, a title bar of their own, and a status strip underneath. A
    // window that reads like the app it came out of does not feel like a
    // second application you have been thrown into.
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--fl-bg)] font-sans text-[var(--fl-text)]">
      <div className="shrink-0 px-2 pt-2">
        <header className="fl-panel flex h-[52px] items-center gap-3 px-3">
          <ForkLeafLogo markClassName="h-5 w-5" textClassName="text-sm" />

          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--fl-border)]" />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[13.5px] font-semibold leading-tight text-[var(--fl-text)]">
              {title}
            </h1>
            <SaveState status={status} savedAt={savedAt} dirty={dirty} />
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            title="Diagrams are drawn in the theme's own palette, so this redraws them too"
            className="shrink-0 rounded-lg border border-[var(--fl-border)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)]"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>

          <button
            type="button"
            onClick={() => window.close()}
            className="shrink-0 rounded-lg border border-[var(--fl-border)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)]"
          >
            Close
          </button>
        </header>
      </div>

      {status === "detached" && (
        <div className="shrink-0 px-2 pt-2">
          <p className="fl-panel border-[var(--fl-danger)]/40 px-3 py-2 text-[12.5px] text-[var(--fl-muted)]">
            <span className="font-medium text-[var(--fl-danger)]">Not saving to the note.</span> The
            note tab is not answering, so edits are being kept in this browser. Reopen the note and
            this window will reconnect on its own.
          </p>
        </div>
      )}

      {/* The studio fills the window — which is the entire reason to be here.
          It is mounted only once the source is known: it reads that source on
          its first render to decide between a canvas and the "what are you
          drawing?" picker, so mounting it a paint early asks someone who
          clicked an existing diagram what they would like to draw.

          The canvas gets roughly two thirds of the width to start with, and
          the divider is still there to move: the reason to open a diagram in
          a window is the canvas, so it should not have to be uncovered first.
          A dialog splits nearer the middle because its source pane is narrow
          enough to wrap without the help. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {ready ? (
          <DiagramStudio code={code} onChange={setCode} chrome="layered" initialSplit={32} />
        ) : (
          <p
            className="flex flex-1 items-center justify-center text-sm text-[var(--fl-muted)]"
            aria-busy="true"
          >
            Opening diagram…
          </p>
        )}
      </div>

      <StatusBar code={code} status={status} />
    </div>
  );
}

/**
 * The strip along the bottom, matching the editor's.
 *
 * It answers the two questions the chrome above deliberately does not repeat:
 * what this diagram actually is, and where its text ends up. Facts, not
 * controls — the same job the editor's status bar does for a note.
 */
function StatusBar({ code, status }: { code: string; status: DiagramLinkStatus }) {
  const facts = useMemo(() => {
    const kind = detectKind(code);
    const lines = code.trim() === "" ? 0 : code.trim().split("\n").length;
    // Null for diagram types the graph model does not cover, and for a
    // flowchart mid-keystroke. Counts are then simply left off rather than
    // reported as zero.
    const graph = mermaidToGraph(code);

    return [
      kind ?? "diagram",
      graph ? `${graph.nodes.length} ${graph.nodes.length === 1 ? "node" : "nodes"}` : null,
      graph ? `${graph.edges.length} ${graph.edges.length === 1 ? "arrow" : "arrows"}` : null,
      `${lines} ${lines === 1 ? "line" : "lines"}`,
    ].filter((fact): fact is string => fact !== null);
  }, [code]);

  return (
    <footer className="flex shrink-0 items-center gap-3 px-4 py-1.5 text-[11px] text-[var(--fl-muted)]">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            status === "linked" ? "bg-[var(--fl-accent)]" : "bg-[var(--fl-border-strong)]"
          }`}
        />
        {status === "linked" ? "Saving into the note" : "Not saving into the note"}
      </span>

      <span className="ml-auto truncate font-mono">{facts.join("  ·  ")}</span>
      <span className="hidden sm:inline">Mermaid</span>
    </footer>
  );
}

/**
 * The save indicator.
 *
 * Three honest states rather than a permanent "Saved": connecting, saving,
 * saved-with-a-time. The timestamp is what makes it checkable — "Saved" alone
 * is indistinguishable from "Saved, forty minutes ago, before the note closed".
 */
function SaveState({
  status,
  savedAt,
  dirty,
}: {
  status: DiagramLinkStatus;
  savedAt: number | null;
  dirty: boolean;
}) {
  // Re-rendered on a timer so "just now" becomes "2m ago" without an edit.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (status === "connecting") {
    return <p className="truncate text-[11.5px] text-[var(--fl-muted)]">Connecting to the note…</p>;
  }

  if (status === "detached") {
    return (
      <p className="truncate text-[11.5px] text-[var(--fl-danger)]">
        Not saving to the note — kept in this browser
      </p>
    );
  }

  if (dirty) {
    return <p className="truncate text-[11.5px] text-[var(--fl-muted)]">Saving to the note…</p>;
  }

  return (
    <p className="truncate text-[11.5px] text-[var(--fl-muted)]">
      Saved to the note{savedAt ? ` · ${ago(savedAt)}` : ""}
    </p>
  );
}

function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 45) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  return `${Math.round(minutes / 60)}h ago`;
}

/**
 * The end of a session.
 *
 * The source is offered for copying rather than only described: this screen
 * appears when there is no longer anywhere to save to, and the one thing
 * someone in that position wants is their text.
 */
function Message({ heading, body, code }: { heading: string; body: string; code?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-[var(--fl-bg)] px-6 text-center">
      <ForkLeafLogo markClassName="h-7 w-7" textClassName="text-lg" />

      <div className="max-w-md">
        <h1 className="text-lg font-semibold text-[var(--fl-text)]">{heading}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--fl-muted)]">{body}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {code?.trim() && (
          <button
            type="button"
            className="fl-btn fl-btn-ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
              } catch {
                // Denied clipboard permission; the button simply does nothing
                // rather than claiming a copy that did not happen.
              }
            }}
          >
            {copied ? "Copied" : "Copy diagram source"}
          </button>
        )}

        <button type="button" className="fl-btn fl-btn-primary" onClick={() => window.close()}>
          Close window
        </button>
      </div>
    </div>
  );
}
