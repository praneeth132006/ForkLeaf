"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LinkGraph } from "@forkleaf/markdown-engine";
import { Dialog } from "@/components/Dialog";
import { graphFrom, layoutGraph } from "@/lib/graph-layout";

/**
 * Every note as a dot, and every `[[link]]` between two notes as a line.
 *
 * Drawn from the link graph the backlinks panel already keeps, so opening it
 * reads nothing new. It starts on the neighbourhood of the note you are in,
 * because a picture of two thousand dots answers no question; the whole
 * notebook is one press away.
 */

export interface GraphDialogProps {
  onClose: () => void;
  graph: LinkGraph;
  titleFor: (path: string) => string;
  /** False while the notebook is still being read. */
  ready: boolean;
  currentPath: string | null;
  onOpenNote: (path: string) => void;
}

type View = { x: number; y: number; scale: number };

const WIDTH = 1000;
const HEIGHT = 640;

export function GraphDialog({
  onClose,
  graph,
  titleFor,
  ready,
  currentPath,
  onOpenNote,
}: GraphDialogProps) {
  const [scope, setScope] = useState<"near" | "all">(currentPath ? "near" : "all");
  const [orphans, setOrphans] = useState(false);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  /** Where somebody has panned and zoomed to; null means "fit everything". */
  const [moved, setMoved] = useState<View | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { nodes, edges } = useMemo(
    () =>
      graphFrom(graph, titleFor, {
        includeOrphans: orphans,
        focus: scope === "near" ? currentPath : null,
        depth: 2,
      }),
    [graph, titleFor, orphans, scope, currentPath],
  );

  const placed = useMemo(
    () => layoutGraph(nodes, edges, { width: WIDTH, height: HEIGHT }),
    [nodes, edges],
  );
  const byId = useMemo(() => new Map(placed.map((node) => [node.id, node])), [placed]);

  /**
   * The view that frames every note.
   *
   * Without it, two linked notes were two specks in a canvas sized for two
   * thousand, labelled in type too small to read. Capped so a single pair is
   * not blown up to fill the dialog either.
   */
  const fitted = useMemo<View>(() => {
    if (placed.length === 0) return { x: 0, y: 0, scale: 1 };
    const xs = placed.map((node) => node.x);
    const ys = placed.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = Math.min(
      2.5,
      Math.max(0.3, Math.min(WIDTH / (maxX - minX + 240), HEIGHT / (maxY - minY + 180))),
    );
    return {
      scale,
      x: WIDTH / 2 - ((minX + maxX) / 2) * scale,
      y: HEIGHT / 2 - ((minY + maxY) / 2) * scale,
    };
  }, [placed]);

  const view = moved ?? fitted;
  const fittedRef = useRef(fitted);
  useEffect(() => {
    fittedRef.current = fitted;
  }, [fitted]);

  const setView = useCallback(
    (next: (current: View) => View) => setMoved((current) => next(current ?? fittedRef.current)),
    [],
  );

  const needle = query.trim().toLowerCase();
  const matches = (title: string, id: string) =>
    needle !== "" && (title.toLowerCase().includes(needle) || id.toLowerCase().includes(needle));

  const neighbours = useMemo(() => {
    if (!hover) return null;
    const set = new Set([hover]);
    for (const edge of edges) {
      if (edge.source === hover) set.add(edge.target);
      if (edge.target === hover) set.add(edge.source);
    }
    return set;
  }, [hover, edges]);

  // Wheel zoom needs a non-passive listener to stop the page scrolling too.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
      const py = ((event.clientY - rect.top) / rect.height) * HEIGHT;
      setView((current) => {
        const scale = Math.min(6, Math.max(0.3, current.scale * (event.deltaY < 0 ? 1.15 : 0.87)));
        const ratio = scale / current.scale;
        return { scale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [ready, setView]);

  const showLabel = (id: string, degree: number, title: string) =>
    placed.length <= 40 ||
    degree >= 3 ||
    id === currentPath ||
    id === hover ||
    matches(title, id) ||
    (neighbours?.has(id) ?? false);

  return (
    <Dialog
      title="Graph of your notes"
      subtitle="Each dot is a note, each line a [[link]] between two of them"
      onClose={onClose}
      wide
      steady
    >
      <div className="flex min-h-0 flex-col gap-2 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Which notes"
            className="flex rounded-lg border border-[var(--fl-border)] p-0.5"
          >
            {(
              [
                ["near", "Near this note"],
                ["all", "Whole notebook"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                disabled={value === "near" && !currentPath}
                onClick={() => {
                  setScope(value);
                  setMoved(null);
                }}
                className={`rounded-[6px] px-2.5 py-1 text-[12px] font-medium disabled:opacity-40 ${
                  scope === value
                    ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                    : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--fl-muted)]">
            <input
              type="checkbox"
              checked={orphans}
              onChange={(event) => setOrphans(event.target.checked)}
              className="accent-[var(--fl-accent)]"
            />
            Notes with no links
          </label>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a note"
            aria-label="Find a note in the graph"
            className="ml-auto w-44 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1 text-[12.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
          />
          <button
            type="button"
            onClick={() => setMoved(null)}
            className="rounded-lg border border-[var(--fl-border)] px-2 py-1 text-[12px] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
          >
            Reset view
          </button>
        </div>

        <p className="text-[11.5px] text-[var(--fl-muted)]">
          {ready
            ? `${placed.length} note${placed.length === 1 ? "" : "s"} · ${edges.length} link${
                edges.length === 1 ? "" : "s"
              } — scroll to zoom, drag to move, click a note to open it`
            : "Reading your notes…"}
        </p>

        {ready && placed.length === 0 && (
          <p className="text-[var(--fl-muted)]">
            No links between notes yet. Write <code>[[the name of another note]]</code> in a note,
            and the two appear here joined by a line.
          </p>
        )}

        {ready && placed.length > 0 && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`Graph of ${placed.length} notes`}
            className="h-[min(64vh,640px)] w-full cursor-grab touch-none select-none rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] active:cursor-grabbing"
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, y: event.clientY, moved: false };
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              const svg = svgRef.current;
              if (!start || !svg) return;
              const rect = svg.getBoundingClientRect();
              const ddx = ((event.clientX - start.x) / rect.width) * WIDTH;
              const ddy = ((event.clientY - start.y) / rect.height) * HEIGHT;
              if (Math.abs(ddx) + Math.abs(ddy) < 2) return;
              start.x = event.clientX;
              start.y = event.clientY;
              start.moved = true;
              setView((current) => ({ ...current, x: current.x + ddx, y: current.y + ddy }));
            }}
            onPointerUp={() => {
              window.setTimeout(() => (drag.current = null), 0);
            }}
            onPointerLeave={() => (drag.current = null)}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
              {edges.map((edge) => {
                const a = byId.get(edge.source);
                const b = byId.get(edge.target);
                if (!a || !b) return null;
                const lit = neighbours
                  ? neighbours.has(edge.source) && neighbours.has(edge.target)
                  : false;
                return (
                  <line
                    key={`${edge.source}\n${edge.target}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={lit ? "var(--fl-accent)" : "var(--fl-border)"}
                    strokeWidth={(lit ? 1.6 : 1) / view.scale}
                    opacity={neighbours && !lit ? 0.35 : 1}
                  />
                );
              })}
              {placed.map((node) => {
                const current = node.id === currentPath;
                const found = matches(node.title, node.id);
                const dim = neighbours ? !neighbours.has(node.id) : needle !== "" && !found;
                const radius = 4 + Math.sqrt(node.degree) * 2.4;
                return (
                  <g
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={node.title}
                    transform={`translate(${node.x} ${node.y})`}
                    opacity={dim ? 0.3 : 1}
                    className="cursor-pointer outline-none"
                    onPointerEnter={() => setHover(node.id)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(node.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => {
                      if (drag.current?.moved) return;
                      onOpenNote(node.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenNote(node.id);
                      }
                    }}
                  >
                    <circle
                      r={radius / Math.sqrt(view.scale)}
                      fill={current || found ? "var(--fl-accent)" : "var(--fl-muted)"}
                      stroke={node.id === hover ? "var(--fl-text)" : "var(--fl-surface)"}
                      strokeWidth={1.5 / view.scale}
                    />
                    {showLabel(node.id, node.degree, node.title) && (
                      <text
                        y={(radius + 11) / Math.sqrt(view.scale)}
                        textAnchor="middle"
                        fontSize={13 / Math.sqrt(view.scale)}
                        fill="var(--fl-text)"
                        className="pointer-events-none"
                      >
                        {node.title.length > 32 ? `${node.title.slice(0, 31)}…` : node.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </Dialog>
  );
}
