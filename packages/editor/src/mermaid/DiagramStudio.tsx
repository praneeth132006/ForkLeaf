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
} from "@mdnotion/diagrams";
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
  onClose?: () => void;
  /** Omit to follow the app's current theme. */
  theme?: "light" | "dark";
  /** Starts on the template gallery when the diagram is empty. */
  initialMode?: StudioMode;
}

/**
 * The full diagram editing surface.
 *
 * Three ways in, because people arrive with different knowledge:
 *  - a template gallery, for a blank diagram
 *  - a visual canvas, for people who know the shape but not the syntax
 *  - a source editor with autocomplete, hints and a cheatsheet, for everyone else
 *
 * All three write to the same mermaid source, and the preview is always live.
 */
export function DiagramStudio({
  code,
  onChange,
  onClose,
  theme,
  initialMode = "visual",
}: DiagramStudioProps) {
  const documentTheme = useDocumentTheme();
  const resolvedTheme = theme ?? documentTheme;
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [showTemplates, setShowTemplates] = useState(code.trim() === "");
  const [showCheatsheet, setShowCheatsheet] = useState(false);

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
      <div className="flex h-full max-h-[min(70vh,640px)] min-h-[420px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <TemplateGallery
          onPick={(template) => {
            onChange(template.code);
            setShowTemplates(false);
            setMode(template.kind === "flowchart" ? "visual" : "source");
          }}
          {...(code.trim() !== "" ? { onCancel: () => setShowTemplates(false) } : {})}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full max-h-[min(70vh,640px)] min-h-[420px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex rounded-md border border-[var(--color-border)] p-0.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "visual"}
            disabled={!visualAvailable}
            onClick={() => setMode("visual")}
            title={
              visualAvailable
                ? "Build the diagram by dragging shapes"
                : "The visual builder currently supports flowcharts only"
            }
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              mode === "visual"
                ? "bg-[var(--color-trail-teal)] text-[var(--color-paper)]"
                : "text-[var(--color-mist)] hover:text-[var(--color-ink)] disabled:opacity-40 disabled:hover:text-[var(--color-mist)]"
            }`}
          >
            Visual
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "source"}
            onClick={() => setMode("source")}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              mode === "source"
                ? "bg-[var(--color-trail-teal)] text-[var(--color-paper)]"
                : "text-[var(--color-mist)] hover:text-[var(--color-ink)]"
            }`}
          >
            Source
          </button>
        </div>

        {kind && (
          <span className="rounded bg-[var(--color-chalk)] px-2 py-0.5 font-mono text-[0.7rem] text-[var(--color-mist)]">
            {kind}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="rounded-md px-2 py-1 text-xs text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
          >
            Templates
          </button>
          {mode === "source" && (
            <button
              type="button"
              onClick={() => setShowCheatsheet((value) => !value)}
              aria-pressed={showCheatsheet}
              className={`rounded-md px-2 py-1 text-xs ${
                showCheatsheet
                  ? "bg-[var(--color-chalk)] text-[var(--color-ink)]"
                  : "text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
              }`}
            >
              Syntax help
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-[var(--color-signal-amber)] px-2.5 py-1 text-xs font-semibold text-[var(--color-basalt)] hover:opacity-90"
            >
              Done
            </button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-[240px] min-w-0 flex-1 flex-col border-b border-[var(--color-border)] lg:border-b-0 lg:border-r">
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
                <aside className="w-56 shrink-0 overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-paper)]">
                  <Cheatsheet kind={kind} onInsert={insertAtCursor} />
                </aside>
              )}
            </div>
          )}
        </div>

        {/* ── Live preview ──────────────────────────────────────────────── */}
        <div className="flex min-h-[240px] min-w-0 flex-1 flex-col bg-[var(--color-paper)]">
          <div className="flex flex-1 items-center justify-center overflow-auto p-4">
            {svg ? (
              <div
                className="mdn-diagram-preview max-w-full [&_svg]:h-auto [&_svg]:max-w-full"
                // Sanitised by the diagram renderer before it reaches here.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <p className="text-sm text-[var(--color-mist)]">
                {code.trim() ? "Rendering…" : "Your diagram will appear here."}
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              // Pinned to the bottom of the preview column: capped studio height
              // plus shrink-0 means the message is always on screen, which is
              // the whole point of showing it.
              className="shrink-0 border-t border-[var(--color-ember)]/30 bg-[var(--color-ember)]/5 px-3 py-2 text-xs"
            >
              <p className="font-medium text-[var(--color-ember)]">
                {error.line !== null && (
                  <span className="mr-1.5 rounded bg-[var(--color-ember)]/15 px-1.5 py-0.5 font-mono">
                    line {error.line}
                  </span>
                )}
                {error.message}
              </p>
              <p className="mt-1 text-[var(--color-mist)]">{error.hint}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
