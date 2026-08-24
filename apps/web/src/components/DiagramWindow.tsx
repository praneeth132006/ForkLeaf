"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
    <div className="flex h-screen flex-col bg-[var(--fl-bg)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--fl-border)] px-4 py-2.5">
        <ForkLeafLogo markClassName="h-5 w-5" textClassName="text-sm" />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13.5px] font-semibold text-[var(--fl-text)]">{title}</h1>
          <SaveState status={status} savedAt={savedAt} dirty={dirty} />
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="fl-btn fl-btn-ghost text-[13px]"
          title="Diagrams are drawn in the theme's own palette, so this redraws them too"
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>

        <button
          type="button"
          onClick={() => window.close()}
          className="fl-btn fl-btn-ghost text-[13px]"
        >
          Close
        </button>
      </header>

      {status === "detached" && (
        <p className="shrink-0 border-b border-[var(--fl-warning-border,var(--fl-border))] bg-[var(--fl-surface)] px-4 py-2 text-[12.5px] text-[var(--fl-muted)]">
          The note tab is not answering, so edits are being kept in this browser instead of saved
          into the note. Reopen the note and this window will reconnect on its own.
        </p>
      )}

      {/* The studio fills the window — which is the entire reason to be here.
          It is mounted only once the source is known: it reads that source on
          its first render to decide between a canvas and the "what are you
          drawing?" picker, so mounting it a paint early asks someone who
          clicked an existing diagram what they would like to draw. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {ready ? (
          <DiagramStudio code={code} onChange={setCode} />
        ) : (
          <p
            className="flex flex-1 items-center justify-center text-sm text-[var(--fl-muted)]"
            aria-busy="true"
          >
            Opening diagram…
          </p>
        )}
      </div>
    </div>
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
