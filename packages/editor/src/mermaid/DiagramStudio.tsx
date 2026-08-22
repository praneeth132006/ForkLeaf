"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  blankDiagram,
  detectKind,
  graphToMermaid,
  isDrawable,
  mermaidToGraph,
  mermaidToSequence,
  sequenceToMermaid,
  renderDiagram,
  LIGHT_THEME,
  DARK_THEME,
  type DiagramError,
  type Graph,
  type SequenceDiagram,
} from "@forkleaf/diagrams";
import { SourceEditor } from "../SourceEditor";
import { useDocumentTheme } from "../useDocumentTheme";
import { mermaidCompletions, mermaidLinter } from "../codemirror/mermaid-language";
import { autocompletion } from "@codemirror/autocomplete";
import { TemplateGallery } from "./TemplateGallery";
import { DiagramTypePicker } from "./DiagramTypePicker";
import { Cheatsheet } from "./Cheatsheet";
import { VisualBuilder } from "./VisualBuilder";
import { SequenceCanvas } from "./SequenceCanvas";

/** What the right-hand pane is showing. */
export type StudioView = "canvas" | "preview";

export interface DiagramStudioProps {
  code: string;
  onChange: (code: string) => void;
  /** Omit to follow the app's current theme. */
  theme?: "light" | "dark";
  /** Which pane the right-hand side opens on. */
  initialView?: StudioView;
}

/** Where the divider sits, as a percentage of the studio's width. */
const DEFAULT_SPLIT = 46;
const MIN_SPLIT = 22;
const MAX_SPLIT = 78;

/**
 * The diagram editing surface. Callers render it inside a modal.
 *
 * Source on the left, the diagram on the right, both live at once. They are
 * two views of one Mermaid string, not two modes you switch between: type a
 * node and it appears on the canvas, drag a box and the source updates under
 * your cursor. Making them exclusive — which is how this started — meant
 * anyone who wanted to see their syntax take shape had to keep flipping tabs,
 * and anyone on the canvas could not see what it was writing for them.
 *
 * The right pane is the editable canvas for the diagram types the graph model
 * covers, and the rendered preview otherwise; for flowcharts and state
 * diagrams you can flip between the two, since a canvas mid-edit is not the
 * same thing as seeing what Mermaid will actually draw.
 *
 * A blank diagram opens on the template gallery instead, because the hardest
 * part of Mermaid is the first line.
 */
export function DiagramStudio({
  code,
  onChange,
  theme,
  initialView = "canvas",
}: DiagramStudioProps) {
  const documentTheme = useDocumentTheme();
  const resolvedTheme = theme ?? documentTheme;

  const [view, setView] = useState<StudioView>(initialView);
  // The gallery of worked examples, reached from the type picker or from
  // "Change type" once there is a diagram.
  const [showTemplates, setShowTemplates] = useState(false);
  /**
   * True while the "what are you drawing?" step is on screen.
   *
   * An empty diagram starts here rather than on a canvas, because a canvas has
   * to be a canvas *of something*: the palette, the arrow vocabulary and the
   * syntax written underneath all differ per diagram type, and guessing
   * "flowchart" meant anybody drawing a sequence or an ERD started by deleting
   * the wrong thing.
   */
  const [choosingType, setChoosingType] = useState(code.trim() === "");
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  // Either pane can be given the whole width — a diagram big enough to be worth
  // drawing carefully wants the room, and so does a long source file.
  const [showSource, setShowSource] = useState(true);
  const [showDiagram, setShowDiagram] = useState(true);

  const [split, setSplit] = useState(DEFAULT_SPLIT);
  const [dragging, setDragging] = useState(false);

  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<DiagramError | null>(null);

  const kind = useMemo(() => detectKind(code), [code]);

  // The canvas edits flowcharts and state diagrams. For anything else the pane
  // falls back to the live preview and says so, rather than offering a tab that
  // does nothing.
  //
  // An empty diagram is read as an empty flowchart so the canvas is usable
  // from the very first click: the alternative was a blank pane that stayed
  // blank until you had typed the word `flowchart` into the source yourself,
  // which is exactly the knowledge the canvas exists to not require.
  const graph = useMemo(() => mermaidToGraph(code.trim() === "" ? "flowchart TD" : code), [code]);

  /**
   * The sequence diagram, when the source is one the canvas can hold.
   *
   * Null for anything using a `loop`, `alt` or `note` block, which this model
   * has no representation for — the studio falls back to the source editor
   * rather than opening a canvas that would drop them on the first edit.
   */
  const sequence = useMemo(
    () => (kind === "sequence" ? mermaidToSequence(code) : null),
    [kind, code],
  );

  const canvasAvailable =
    kind === "sequence" ? sequence !== null : graph !== null && isDrawable(kind ?? "flowchart");
  const effectiveView: StudioView = canvasAvailable ? view : "preview";

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

  const handleSequenceChange = useCallback(
    (next: SequenceDiagram) => onChange(sequenceToMermaid(next)),
    [onChange],
  );

  // ── Divider ─────────────────────────────────────────────────────────────
  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) return;

    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const ratio = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, ratio)));
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  if (showTemplates) {
    return (
      <TemplateGallery
        onPick={(template) => {
          onChange(template.code);
          setShowTemplates(false);
          setChoosingType(false);
          setView(isDrawable(template.kind) ? "canvas" : "preview");
        }}
        onCancel={() => {
          setShowTemplates(false);
          // With nothing drawn yet, "back" means back to the type question,
          // not out of a step that has produced nothing.
          if (code.trim() === "") setChoosingType(true);
        }}
      />
    );
  }

  if (choosingType) {
    return (
      <DiagramTypePicker
        onPick={(chosen) => {
          onChange(blankDiagram(chosen));
          setChoosingType(false);
          setView(isDrawable(chosen) ? "canvas" : "preview");
        }}
        onBrowseTemplates={() => {
          setChoosingType(false);
          setShowTemplates(true);
        }}
        {...(code.trim() !== "" ? { onCancel: () => setChoosingType(false) } : {})}
      />
    );
  }

  // Collapsing one pane hands the other the full width; the divider only makes
  // sense while both are on screen.
  const bothPanes = showSource && showDiagram;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-4 py-2.5">
        <div
          className="flex rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] p-0.5"
          role="group"
          aria-label="Studio panes"
        >
          <PaneToggle
            active={showSource}
            // Never let both panes be hidden — an empty studio is not a state
            // anyone asked for.
            onClick={() => (showDiagram ? setShowSource((value) => !value) : undefined)}
            title="Show or hide the Mermaid source"
          >
            Source
          </PaneToggle>
          <PaneToggle
            active={showDiagram}
            onClick={() => (showSource ? setShowDiagram((value) => !value) : undefined)}
            title="Show or hide the diagram"
          >
            Diagram
          </PaneToggle>
        </div>

        {kind && (
          <span className="rounded-md bg-[var(--fl-elevated)] px-2 py-1 font-mono text-[11px] text-[var(--fl-muted)]">
            {kind}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setChoosingType(true)}
            title="Draw a sequence chart, ERD, class diagram, mindmap and more"
            className="rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            Change type
          </button>
          {showSource && (
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
        {showSource && (
          <div
            className={`flex min-h-[220px] min-w-0 flex-col border-b border-[var(--fl-border)] lg:border-b-0 ${
              bothPanes ? "lg:w-[var(--fl-split)] lg:flex-none" : "flex-1"
            }`}
            // Carried as a custom property rather than an inline width: the
            // panes stack on a narrow screen, where a percentage width would
            // squeeze the source into a column instead of stacking it.
            style={{ "--fl-split": `${split}%` } as React.CSSProperties}
          >
            <PaneHeading>Mermaid source</PaneHeading>
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
          </div>
        )}

        {bothPanes && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            tabIndex={0}
            onPointerDown={startDrag}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setSplit((value) => Math.max(MIN_SPLIT, value - 4));
              if (event.key === "ArrowRight") setSplit((value) => Math.min(MAX_SPLIT, value + 4));
            }}
            // A 1px rule is a dexterity test, so the hit area is 9px with the
            // visible line drawn inside it.
            className="group relative hidden w-[9px] shrink-0 cursor-col-resize focus:outline-none lg:block"
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
                dragging
                  ? "bg-[var(--fl-accent)]"
                  : "bg-[var(--fl-border)] group-hover:bg-[var(--fl-accent)] group-focus:bg-[var(--fl-accent)]"
              }`}
            />
          </div>
        )}

        {showDiagram && (
          <div className="flex min-h-[240px] min-w-0 flex-1 flex-col bg-[var(--fl-surface)]">
            <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-2.5">
              <PaneHeading bare>
                {effectiveView === "canvas" ? "Canvas — drag to edit" : "Preview"}
              </PaneHeading>

              {canvasAvailable && (
                <div
                  className="ml-auto flex rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] p-0.5"
                  role="tablist"
                  aria-label="Diagram view"
                >
                  <PaneToggle
                    active={effectiveView === "canvas"}
                    onClick={() => setView("canvas")}
                    title="Drag boxes and arrows on a canvas"
                  >
                    Canvas
                  </PaneToggle>
                  <PaneToggle
                    active={effectiveView === "preview"}
                    onClick={() => setView("preview")}
                    title="See exactly what Mermaid renders"
                  >
                    Preview
                  </PaneToggle>
                </div>
              )}
            </div>

            {effectiveView === "canvas" && sequence ? (
              <SequenceCanvas diagram={sequence} onChange={handleSequenceChange} />
            ) : effectiveView === "canvas" && graph && kind !== "sequence" ? (
              <VisualBuilder graph={graph} onChange={handleGraphChange} />
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-5">
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
            )}

            {!canvasAvailable && (
              <p className="shrink-0 border-t border-[var(--fl-border)] px-4 py-2 text-[12px] leading-relaxed text-[var(--fl-muted)]">
                {kind ? `${kind} diagrams` : "This diagram type"} are quicker to write than to drag,
                so they are edited as source on the left, with autocomplete and inline errors.
                Flowcharts, sequence, class, state, ER diagrams and mindmaps can be drawn directly
                on a canvas.
              </p>
            )}

            {error && (
              <div
                role="alert"
                // Pinned to the bottom of the pane so the message is always on
                // screen, which is the whole point of showing it.
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

/** The small caption above each pane, so neither column is an unlabelled slab. */
function PaneHeading({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  return (
    <p
      className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)] ${
        bare ? "" : "px-4 pb-1 pt-2.5"
      }`}
    >
      {children}
    </p>
  );
}

function PaneToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={`rounded-[6px] px-3 py-1 text-[13px] font-medium transition-colors ${
        active
          ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
          : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
      }`}
    >
      {children}
    </button>
  );
}
