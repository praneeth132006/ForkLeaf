"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  detectKind,
  graphToMermaid,
  mermaidToGraph,
  renderDiagram,
  LIGHT_THEME,
  DARK_THEME,
  type DiagramError,
  type Graph,
} from "@forkleaf/diagrams";
import { SourceEditor } from "../SourceEditor";
import { useDocumentTheme } from "../useDocumentTheme";
import { mermaidCompletions, mermaidLinter } from "../codemirror/mermaid-language";
import { autocompletion } from "@codemirror/autocomplete";
import { TemplateGallery } from "./TemplateGallery";
import { Cheatsheet } from "./Cheatsheet";
import { VisualBuilder } from "./VisualBuilder";

export type StudioMode = "visual" | "source";

export interface DiagramStudioProps {
  code: string;
  onChange: (code: string) => void;
  /** Omit to follow the app's current theme. */
  theme?: "light" | "dark";
  /** Starts on the template gallery when the diagram is empty. */
  initialMode?: StudioMode;
}

/**
 * The diagram editing surface. Callers render it inside a modal.
 *
 * Three ways in, because people arrive with different knowledge:
 *  - a template gallery, for a blank diagram
 *  - a visual canvas, for people who know the shape but not the syntax
 *  - a source editor with autocomplete, hints and a cheatsheet, for everyone else
 *
 * All three write to the same Mermaid source, and the preview is always live.
 */
export function DiagramStudio({
  code,
  onChange,
  theme,
  initialMode = "visual",
}: DiagramStudioProps) {
  const documentTheme = useDocumentTheme();
  const resolvedTheme = theme ?? documentTheme;
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [showTemplates, setShowTemplates] = useState(code.trim() === "");
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  // Collapsing the preview hands the whole width to the canvas, which is what
  // you want once the diagram is big enough to be worth drawing carefully.
  const [showPreview, setShowPreview] = useState(true);

  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<DiagramError | null>(null);

  const kind = useMemo(() => detectKind(code), [code]);

  // The visual builder can only handle flowcharts. For anything else the tab is
  // disabled rather than hidden, so it is clear the feature exists.
  const graph = useMemo(() => mermaidToGraph(code), [code]);
  const visualAvailable = graph !== null;

  useEffect(() => {
    if (!visualAvailable && mode === "visual" && code.trim() !== "") setMode("source");
  }, [visualAvailable, mode, code]);

  // ── Live preview ────────────────────────────────────────────────────────
  // Debounced so mermaid is not re-invoked on every keystroke, and the last
  // good SVG stays on screen while the source is temporarily invalid.
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      const result = await renderDiagram(code, resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME);
      if (cancelled) return;

      setError(result.error);
      if (result.svg) setSvg(result.svg);
      // Deliberately keep the previous SVG when rendering fails.
      if (!result.svg && code.trim() === "") setSvg(null);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, resolvedTheme]);

  // ── Source editor wiring ────────────────────────────────────────────────
  // The linter and completions read through refs so the CodeMirror extensions
  // stay referentially stable and the editor is never torn down mid-typing.
  const errorRef = useRef(error);
  errorRef.current = error;
  const kindRef = useRef(kind);
  kindRef.current = kind;

  const cmExtensions = useMemo(
    () => [
      autocompletion({ override: [mermaidCompletions(() => kindRef.current)] }),
      mermaidLinter(() => errorRef.current),
    ],
    [],
  );

  const insertAtCursor = useCallback(
    (snippet: string) => {
      // Appended on its own line: reliable, and avoids reaching into
      // CodeMirror's selection state from outside the component.
      onChange(
        code.endsWith("\n") || code === "" ? `${code}${snippet}\n` : `${code}\n${snippet}\n`,
      );
    },
    [code, onChange],
  );

  const handleGraphChange = useCallback(
    (next: Graph) => onChange(graphToMermaid(next)),
    [onChange],
  );

  if (showTemplates) {
    return (
      <TemplateGallery
        onPick={(template) => {
          onChange(template.code);
          setShowTemplates(false);
          setMode(template.kind === "flowchart" ? "visual" : "source");
        }}
        {...(code.trim() !== "" ? { onCancel: () => setShowTemplates(false) } : {})}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-4 py-2.5">
        <div
          className="flex rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] p-0.5"
          role="tablist"
          aria-label="Diagram editing mode"
        >
          <StudioTab
            active={mode === "visual"}
            disabled={!visualAvailable}
            onClick={() => setMode("visual")}
            title={
              visualAvailable
                ? "Drag boxes and arrows on a canvas"
                : "The visual builder currently supports flowcharts only"
            }
          >
            Visual
          </StudioTab>
          <StudioTab
            active={mode === "source"}
            onClick={() => setMode("source")}
            title="Edit the Mermaid source directly"
          >
            Source
          </StudioTab>
        </div>

        {kind && (
          <span className="rounded-md bg-[var(--fl-elevated)] px-2 py-1 font-mono text-[11px] text-[var(--fl-muted)]">
            {kind}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            Change type
          </button>
          <button
            type="button"
            onClick={() => setShowPreview((value) => !value)}
            aria-pressed={showPreview}
            title={showPreview ? "Hide the live preview" : "Show the live preview"}
            className={`rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
              showPreview
                ? "bg-[var(--fl-elevated)] text-[var(--fl-text)]"
                : "text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
            }`}
          >
            Preview
          </button>
          {mode === "source" && (
            <button
              type="button"
              onClick={() => setShowCheatsheet((value) => !value)}
              aria-pressed={showCheatsheet}
              className={`rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                showCheatsheet
                  ? "bg-[var(--fl-elevated)] text-[var(--fl-text)]"
                  : "text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              }`}
            >
              Syntax help
            </button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={`flex min-h-[280px] min-w-0 flex-1 flex-col ${
            showPreview ? "border-b border-[var(--fl-border)] lg:border-b-0 lg:border-r" : ""
          }`}
        >
          {mode === "visual" && graph ? (
            <VisualBuilder graph={graph} onChange={handleGraphChange} />
          ) : (
            <div className="flex min-h-0 flex-1">
              <div className="min-w-0 flex-1 overflow-hidden">
                <SourceEditor
                  value={code}
                  onChange={onChange}
                  language="plain"
                  showLineNumbers
                  extensions={cmExtensions}
                  ariaLabel="Mermaid diagram source"
                  className="h-full w-full"
                />
              </div>

              {showCheatsheet && (
                <aside className="w-60 shrink-0 overflow-hidden border-l border-[var(--fl-border)] bg-[var(--fl-surface)]">
                  <Cheatsheet kind={kind} onInsert={insertAtCursor} />
                </aside>
              )}
            </div>
          )}
        </div>

        {/* ── Live preview ──────────────────────────────────────────────── */}
        {showPreview && (
          <div className="flex min-h-[220px] min-w-0 flex-col bg-[var(--fl-surface)] lg:w-[38%] lg:min-w-[300px] lg:max-w-[520px]">
            <div className="flex flex-1 items-center justify-center overflow-auto p-5">
              {svg ? (
                <div
                  className="fl-diagram-preview max-w-full [&_svg]:h-auto [&_svg]:max-w-full"
                  // Sanitised by the diagram renderer before it reaches here.
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <p className="text-sm text-[var(--fl-muted)]">
                  {code.trim() ? "Rendering…" : "Your diagram will appear here."}
                </p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                // Pinned to the bottom of the preview column so the message is
                // always on screen, which is the whole point of showing it.
                className="shrink-0 border-t border-[var(--fl-danger)]/30 bg-[var(--fl-danger)]/5 px-4 py-2.5 text-xs"
              >
                <p className="font-medium text-[var(--fl-danger)]">
                  {error.line !== null && (
                    <span className="mr-1.5 rounded bg-[var(--fl-danger)]/15 px-1.5 py-0.5 font-mono">
                      line {error.line}
                    </span>
                  )}
                  {error.message}
                </p>
                <p className="mt-1 text-[var(--fl-muted)]">{error.hint}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StudioTab({
  active,
  disabled = false,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`rounded-[6px] px-3 py-1 text-[13px] font-medium transition-colors ${
        active
          ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
          : "text-[var(--fl-muted)] hover:text-[var(--fl-text)] disabled:opacity-40 disabled:hover:text-[var(--fl-muted)]"
      }`}
    >
      {children}
    </button>
  );
}
