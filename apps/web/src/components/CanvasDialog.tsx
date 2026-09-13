"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  addNode,
  anchor,
  canvasTitle,
  colorOf,
  connect,
  edgePath,
  emptyCanvas,
  fitView,
  moveNodes,
  parseCanvas,
  placeNew,
  removeEdge,
  removeNodes,
  resizeNode,
  serializeCanvas,
  sideFacing,
  toWorld,
  updateNode,
  zoomAt,
  type Canvas,
  type CanvasNode,
  type NewNode,
  type View,
} from "@/lib/canvas";

/**
 * A canvas: cards, notes, links and groups placed freely, joined by arrows.
 *
 * Saved as JSON Canvas beside the notes a moment after every change, so it
 * opens in Obsidian and diffs as text. Drag the background to move around,
 * scroll to pan and pinch (or ⌘/Ctrl-scroll) to zoom; double-click empty space
 * for a card; drag a card to move it, its corner to resize it, and the dot on
 * its right edge onto another card to connect them.
 */

export interface CanvasNoteChoice {
  path: string;
  title: string;
  excerpt: string;
}

export interface CanvasDialogProps {
  path: string;
  onClose: () => void;
  /** The file's text, or null when it does not exist yet. */
  load: () => Promise<string | null>;
  save: (text: string) => Promise<void>;
  /** Notes that can be placed on the board. */
  notes: readonly CanvasNoteChoice[];
  onOpenNote: (path: string) => void;
}

type LoadState = { kind: "loading" } | { kind: "ready" } | { kind: "problem"; message: string };
type SaveState = "idle" | "saving" | "saved" | "error";

type Gesture =
  | { kind: "pan"; startX: number; startY: number; view: View }
  | { kind: "drag"; ids: ReadonlySet<string>; lastX: number; lastY: number }
  | { kind: "resize"; id: string; startX: number; startY: number; width: number; height: number }
  | { kind: "connect"; from: string };

const DEFAULT_VIEWPORT = { width: 900, height: 560 };
const TEXT_SIZE = { width: 240, height: 120 };
const FILE_SIZE = { width: 280, height: 150 };
const LINK_SIZE = { width: 260, height: 90 };
const GROUP_SIZE = { width: 520, height: 340 };
const PRESET_COLORS = ["1", "2", "3", "4", "5", "6"];

const toggled = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** An http(s) address from what was typed, or null. */
function readUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function CanvasDialog({ path, onClose, load, save, notes, onOpenNote }: CanvasDialogProps) {
  const [canvas, setCanvas] = useState<Canvas>(emptyCanvas);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [dropped, setDropped] = useState(0);
  const [view, setView] = useState<View>({ x: -450, y: -280, zoom: 1 });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; x: number; y: number } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [linkUrl, setLinkUrl] = useState("");

  const viewportRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  /**
   * The last press, to tell a double press from two single ones.
   *
   * Not the browser's dblclick: pressing a card captures the pointer on the
   * board so a drag can leave the card, and a captured press sends dblclick to
   * the board. Double-clicking a card to write in it made a new, empty card
   * underneath instead.
   */
  const lastPress = useRef<{ id: string; at: number } | null>(null);
  const isDoublePress = (id: string, at: number) => {
    const previous = lastPress.current;
    const double = previous !== null && previous.id === id && at - previous.at < 400;
    lastPress.current = double ? null : { id, at };
    return double;
  };
  /** True once somebody has changed the board; nothing is saved before that. */
  const changed = useRef(false);
  const latest = useRef({ canvas, save });
  useEffect(() => {
    latest.current = { canvas, save };
  });
  const loader = useRef(load);

  const viewportSize = useCallback(() => {
    const element = viewportRef.current;
    return element && element.clientWidth > 0
      ? { width: element.clientWidth, height: element.clientHeight }
      : DEFAULT_VIEWPORT;
  }, []);

  const change = useCallback((next: (current: Canvas) => Canvas) => {
    changed.current = true;
    setCanvas(next);
  }, []);

  // ── Loading ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let live = true;
    loader.current().then(
      (text) => {
        if (!live) return;
        const parsed = parseCanvas(text ?? "");
        if (parsed.problem) {
          setLoadState({ kind: "problem", message: parsed.problem });
          return;
        }
        setCanvas(parsed.canvas);
        setDropped(parsed.dropped);
        setView(fitView(parsed.canvas, viewportSize()));
        setLoadState({ kind: "ready" });
      },
      (error: unknown) => {
        if (!live) return;
        setLoadState({
          kind: "problem",
          message: error instanceof Error ? error.message : "This canvas could not be read.",
        });
      },
    );
    return () => {
      live = false;
    };
  }, [viewportSize]);

  // ── Saving, a moment after the last change ─────────────────────────────
  useEffect(() => {
    if (!changed.current || loadState.kind !== "ready") return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      latest.current.save(serializeCanvas(canvas)).then(
        () => setSaveState("saved"),
        () => setSaveState("error"),
      );
    }, 600);
    return () => window.clearTimeout(timer);
  }, [canvas, loadState.kind]);

  // Stable, so the dialog is not handed a new close handler on every render —
  // it moves focus when that changes, which pulled focus out of a card being
  // written the moment it appeared.
  const ready = useRef(false);
  useEffect(() => {
    ready.current = loadState.kind === "ready";
  }, [loadState.kind]);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const close = useCallback(() => {
    // Anything changed since the last save is written on the way out.
    if (changed.current && ready.current) {
      void latest.current.save(serializeCanvas(latest.current.canvas)).catch(() => undefined);
    }
    closeRef.current();
  }, []);

  // ── Scrolling pans; pinch or ⌘/Ctrl-scroll zooms ───────────────────────
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.ctrlKey || event.metaKey) {
        setView((current) => zoomAt(current, point, Math.exp(-event.deltaY * 0.01)));
      } else {
        setView((current) => ({
          ...current,
          x: current.x + event.deltaX / current.zoom,
          y: current.y + event.deltaY / current.zoom,
        }));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [loadState.kind]);

  // ── Delete and Escape ───────────────────────────────────────────────────
  const keys = useRef({ selected, selectedEdge, editing });
  useEffect(() => {
    keys.current = { selected, selectedEdge, editing };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const current = keys.current;
      if (current.editing) return;
      if (event.key === "Enter" && current.selected.size === 1) {
        const [id] = [...current.selected];
        const target = latest.current.canvas.nodes.find((each) => each.id === id);
        if (target && (target.type === "text" || target.type === "group")) {
          event.preventDefault();
          setEditing(target.id);
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (current.selected.size > 0) {
          event.preventDefault();
          const ids = current.selected;
          change((board) => removeNodes(board, ids));
          setSelected(new Set());
        } else if (current.selectedEdge) {
          event.preventDefault();
          const id = current.selectedEdge;
          change((board) => removeEdge(board, id));
          setSelectedEdge(null);
        }
      } else if (event.key === "Escape" && (current.selected.size > 0 || current.selectedEdge)) {
        // Clears the selection instead of closing the canvas.
        event.preventDefault();
        event.stopPropagation();
        setSelected(new Set());
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [change]);

  // ── Pointer gestures ────────────────────────────────────────────────────
  const screenPoint = (event: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const capture = (pointerId: number) => {
    try {
      viewportRef.current?.setPointerCapture?.(pointerId);
    } catch {
      // A synthetic pointer cannot be captured; the gesture still works.
    }
  };

  const onBackgroundPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button > 0) return;
    if ((event.target as HTMLElement).closest("[data-node-id], [data-edge-id]")) return;
    if (isDoublePress("background", event.timeStamp)) {
      event.preventDefault();
      const world = toWorld(view, screenPoint(event));
      addText({ x: world.x - TEXT_SIZE.width / 2, y: world.y - TEXT_SIZE.height / 2 });
      return;
    }
    setSelected(new Set());
    setSelectedEdge(null);
    setEditing(null);
    gesture.current = { kind: "pan", startX: event.clientX, startY: event.clientY, view };
    capture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    if (current.kind === "pan") {
      setView({
        ...current.view,
        x: current.view.x - (event.clientX - current.startX) / current.view.zoom,
        y: current.view.y - (event.clientY - current.startY) / current.view.zoom,
      });
    } else if (current.kind === "drag") {
      const dx = (event.clientX - current.lastX) / view.zoom;
      const dy = (event.clientY - current.lastY) / view.zoom;
      if (dx === 0 && dy === 0) return;
      current.lastX = event.clientX;
      current.lastY = event.clientY;
      const ids = current.ids;
      change((board) => moveNodes(board, ids, dx, dy));
    } else if (current.kind === "resize") {
      const { id, width, height, startX, startY } = current;
      change((board) =>
        resizeNode(
          board,
          id,
          width + (event.clientX - startX) / view.zoom,
          height + (event.clientY - startY) / view.zoom,
        ),
      );
    } else {
      setConnecting({ from: current.from, ...toWorld(view, screenPoint(event)) });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.kind !== "connect") return;
    const target = document
      .elementFromPoint?.(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-node-id]");
    const to = target?.dataset.nodeId;
    if (to && to !== current.from) change((board) => connect(board, current.from, to));
    setConnecting(null);
  };

  const onNodePointerDown = (event: React.PointerEvent<HTMLDivElement>, node: CanvasNode) => {
    if (event.button > 0 || editing === node.id) return;
    if ((event.target as HTMLElement).closest("button, a, textarea, input, [data-handle]")) return;
    event.stopPropagation();
    if (
      isDoublePress(node.id, event.timeStamp) &&
      (node.type === "text" || node.type === "group")
    ) {
      // The browser moves focus to what was pressed once this handler returns —
      // and what was pressed is the text the editor is about to replace, so the
      // new text box lost focus and closed the moment it opened.
      event.preventDefault();
      setSelected(new Set([node.id]));
      setSelectedEdge(null);
      setEditing(node.id);
      return;
    }
    const next = event.shiftKey
      ? toggled(selected, node.id)
      : selected.has(node.id)
        ? selected
        : new Set([node.id]);
    setSelected(next);
    setSelectedEdge(null);
    gesture.current = {
      kind: "drag",
      ids: new Set(next),
      lastX: event.clientX,
      lastY: event.clientY,
    };
    capture(event.pointerId);
  };

  const startResize = (event: React.PointerEvent, node: CanvasNode) => {
    event.stopPropagation();
    gesture.current = {
      kind: "resize",
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      width: node.width,
      height: node.height,
    };
    capture(event.pointerId);
  };

  const startConnect = (event: React.PointerEvent, node: CanvasNode) => {
    event.stopPropagation();
    gesture.current = { kind: "connect", from: node.id };
    setConnecting({ from: node.id, ...toWorld(view, screenPoint(event)) });
    capture(event.pointerId);
  };

  // ── Adding ──────────────────────────────────────────────────────────────
  const add = (node: NewNode, edit = false) => {
    const result = addNode(canvas, node);
    change(() => result.canvas);
    setSelected(new Set([result.id]));
    setSelectedEdge(null);
    if (edit) setEditing(result.id);
  };

  const addText = (at?: { x: number; y: number }) =>
    add(
      {
        type: "text",
        text: "",
        ...(at ?? placeNew(canvas, view, viewportSize(), TEXT_SIZE)),
        ...TEXT_SIZE,
      },
      true,
    );

  const addNote = (notePath: string) =>
    add({
      type: "file",
      file: notePath,
      ...placeNew(canvas, view, viewportSize(), FILE_SIZE),
      ...FILE_SIZE,
    });

  const url = readUrl(linkUrl);
  const addLink = () => {
    if (!url) return;
    add({ type: "link", url, ...placeNew(canvas, view, viewportSize(), LINK_SIZE), ...LINK_SIZE });
    setLinkUrl("");
  };

  const addGroup = () =>
    add({
      type: "group",
      label: "Group",
      ...placeNew(canvas, view, viewportSize(), GROUP_SIZE),
      ...GROUP_SIZE,
    });

  const zoomBy = (factor: number) => {
    const size = viewportSize();
    setView((current) => zoomAt(current, { x: size.width / 2, y: size.height / 2 }, factor));
  };

  const colorSelected = (color: string | null) => {
    const ids = selected;
    change((board) => ({
      ...board,
      nodes: board.nodes.map((node) => {
        if (!ids.has(node.id)) return node;
        const rest: Record<string, unknown> = { ...node };
        delete rest.color;
        return (color ? { ...rest, color } : rest) as CanvasNode;
      }),
    }));
  };

  const deleteSelected = () => {
    if (selected.size > 0) {
      const ids = selected;
      change((board) => removeNodes(board, ids));
      setSelected(new Set());
    } else if (selectedEdge) {
      const id = selectedEdge;
      change((board) => removeEdge(board, id));
      setSelectedEdge(null);
    }
  };

  const byId = new Map(canvas.nodes.map((node) => [node.id, node]));
  /** The one selected card or group that can be written in, for the Edit button. */
  const editable =
    selected.size === 1
      ? canvas.nodes.find(
          (node) => selected.has(node.id) && (node.type === "text" || node.type === "group"),
        )
      : undefined;
  const notesByPath = new Map(notes.map((note) => [note.path, note]));
  const ordered = [
    ...canvas.nodes.filter((node) => node.type === "group"),
    ...canvas.nodes.filter((node) => node.type !== "group"),
  ];
  const connectingFrom = connecting ? byId.get(connecting.from) : undefined;
  const placedNotes = new Set(
    canvas.nodes.flatMap((node) => (node.type === "file" ? [node.file] : [])),
  );

  const button =
    "rounded-lg border border-[var(--fl-border)] px-2.5 py-1 text-[12.5px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-50";

  return (
    <Dialog
      title={canvasTitle(path)}
      subtitle={`${path} · JSON Canvas — opens in Obsidian too`}
      onClose={close}
      wide
      steady
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 text-[13px]">
        {loadState.kind === "loading" && (
          <p role="status" className="text-[var(--fl-muted)]">
            Opening the canvas…
          </p>
        )}

        {loadState.kind === "problem" && (
          <div role="alert" className="leading-relaxed">
            <p className="text-[var(--fl-danger)]">{loadState.message}</p>
            <p className="mt-1 text-[var(--fl-muted)]">
              Nothing has been changed. Open the file in Source view to see what it holds.
            </p>
          </div>
        )}

        {loadState.kind === "ready" && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => addText()} className={button}>
                Add card
              </button>
              <select
                aria-label="Add a note"
                value=""
                onChange={(event) => {
                  if (event.target.value) addNote(event.target.value);
                }}
                className={`${button} max-w-44 bg-[var(--fl-surface)]`}
              >
                <option value="">Add a note…</option>
                {notes.map((note) => (
                  <option key={note.path} value={note.path}>
                    {placedNotes.has(note.path) ? `${note.title} (on the board)` : note.title}
                  </option>
                ))}
              </select>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  addLink();
                }}
                className="flex items-center gap-1"
              >
                <input
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="Paste a link…"
                  aria-label="Link to add"
                  className="w-36 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1 text-[12.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
                />
                <button type="submit" disabled={!url} className={button}>
                  Add link
                </button>
              </form>
              <button type="button" onClick={addGroup} className={button}>
                Add group
              </button>

              <span className="mx-1 h-5 w-px bg-[var(--fl-border)]" aria-hidden="true" />

              <div role="group" aria-label="Colour" className="flex items-center gap-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    disabled={selected.size === 0}
                    onClick={() => colorSelected(color)}
                    aria-label={`Colour ${color}`}
                    className="h-4 w-4 rounded-full border border-[var(--fl-border)] disabled:opacity-40"
                    style={{ background: colorOf(color) ?? undefined }}
                  />
                ))}
                <button
                  type="button"
                  disabled={selected.size === 0}
                  onClick={() => colorSelected(null)}
                  className={`${button} px-1.5 py-0.5 text-[11px]`}
                >
                  No colour
                </button>
              </div>
              <button
                type="button"
                disabled={!editable}
                onClick={() => editable && setEditing(editable.id)}
                className={button}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={selected.size === 0 && !selectedEdge}
                onClick={deleteSelected}
                className={button}
              >
                Delete
              </button>

              <div className="ml-auto flex items-center gap-1">
                <span className="mr-1 text-[11.5px] text-[var(--fl-muted)]" role="status">
                  {saveState === "saving"
                    ? "Saving…"
                    : saveState === "saved"
                      ? "Saved"
                      : saveState === "error"
                        ? "Could not save — changes are kept here"
                        : ""}
                </span>
                <button
                  type="button"
                  onClick={() => zoomBy(1 / 1.2)}
                  aria-label="Zoom out"
                  className={button}
                >
                  −
                </button>
                <span className="w-11 text-center text-[11.5px] text-[var(--fl-muted)]">
                  {Math.round(view.zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => zoomBy(1.2)}
                  aria-label="Zoom in"
                  className={button}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setView(fitView(canvas, viewportSize()))}
                  className={button}
                >
                  Fit
                </button>
              </div>
            </div>

            {dropped > 0 && (
              <p className="text-[12px] text-[var(--fl-muted)]">
                {dropped} item{dropped === 1 ? "" : "s"} in this file could not be read and will not
                be kept once the board is changed.
              </p>
            )}

            <div
              ref={viewportRef}
              data-testid="canvas-viewport"
              onPointerDown={onBackgroundPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                gesture.current = null;
                setConnecting(null);
              }}
              className="relative h-[62vh] min-h-[360px] touch-none select-none overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-bg)]"
              style={{
                backgroundImage: "radial-gradient(var(--fl-border) 1px, transparent 1px)",
                backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
                backgroundPosition: `${-view.x * view.zoom}px ${-view.y * view.zoom}px`,
              }}
            >
              {canvas.nodes.length === 0 && (
                <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[var(--fl-muted)]">
                  Double-click anywhere to add a card, or use the buttons above.
                </p>
              )}

              <div
                className="absolute left-0 top-0"
                style={{
                  transform: `scale(${view.zoom}) translate(${-view.x}px, ${-view.y}px)`,
                  transformOrigin: "0 0",
                }}
              >
                <svg
                  className="pointer-events-none absolute left-0 top-0 overflow-visible"
                  width="1"
                  height="1"
                  aria-hidden="true"
                >
                  <defs>
                    <marker
                      id="fl-canvas-arrow"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fl-muted)" />
                    </marker>
                  </defs>
                  {canvas.edges.map((edge) => {
                    const from = byId.get(edge.fromNode);
                    const to = byId.get(edge.toNode);
                    if (!from || !to) return null;
                    const d = edgePath(from, to, edge);
                    const stroke =
                      edge.id === selectedEdge
                        ? "var(--fl-accent)"
                        : (colorOf(edge.color) ?? "var(--fl-muted)");
                    const start = anchor(from, edge.fromSide ?? sideFacing(from, to));
                    const end = anchor(to, edge.toSide ?? sideFacing(to, from));
                    return (
                      <g key={edge.id}>
                        <path
                          d={d}
                          data-edge-id={edge.id}
                          stroke="transparent"
                          strokeWidth={14}
                          fill="none"
                          vectorEffect="non-scaling-stroke"
                          className="pointer-events-auto cursor-pointer"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelected(new Set());
                            setSelectedEdge(edge.id);
                          }}
                        />
                        <path
                          d={d}
                          stroke={stroke}
                          strokeWidth={2}
                          fill="none"
                          vectorEffect="non-scaling-stroke"
                          markerEnd={edge.toEnd === "none" ? undefined : "url(#fl-canvas-arrow)"}
                          markerStart={
                            edge.fromEnd === "arrow" ? "url(#fl-canvas-arrow)" : undefined
                          }
                        />
                        {edge.label && (
                          <text
                            x={(start.x + end.x) / 2}
                            y={(start.y + end.y) / 2 - 6}
                            textAnchor="middle"
                            fontSize={12}
                            fill="var(--fl-muted)"
                          >
                            {edge.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {connecting && connectingFrom && (
                    <line
                      x1={anchor(connectingFrom, "right").x}
                      y1={anchor(connectingFrom, "right").y}
                      x2={connecting.x}
                      y2={connecting.y}
                      stroke="var(--fl-accent)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>

                {ordered.map((node) => {
                  const isSelected = selected.has(node.id);
                  const color = colorOf(node.color);
                  const isGroup = node.type === "group";
                  const note = node.type === "file" ? notesByPath.get(node.file) : undefined;
                  const label =
                    node.type === "text"
                      ? node.text.split("\n")[0] || "Empty card"
                      : node.type === "file"
                        ? (note?.title ?? node.file)
                        : node.type === "link"
                          ? node.url
                          : (node.label ?? "Group");
                  return (
                    <div
                      key={node.id}
                      data-node-id={node.id}
                      aria-label={`${node.type === "file" ? "Note" : node.type === "link" ? "Link" : isGroup ? "Group" : "Card"}: ${label}`}
                      data-selected={isSelected || undefined}
                      role="group"
                      onPointerDown={(event) => onNodePointerDown(event, node)}
                      className={`absolute flex flex-col rounded-lg border text-[var(--fl-text)] ${
                        isGroup
                          ? "bg-transparent"
                          : "bg-[var(--fl-surface)] shadow-[var(--fl-shadow-sm,0_1px_2px_rgba(0,0,0,0.12))]"
                      } ${isSelected ? "ring-2 ring-[var(--fl-accent)]" : ""}`}
                      style={{
                        left: node.x,
                        top: node.y,
                        width: node.width,
                        height: node.height,
                        borderColor: color ?? "var(--fl-border)",
                        borderWidth: color ? 2 : 1,
                        ...(isGroup && color ? { background: `${color}14` } : {}),
                      }}
                    >
                      {node.type === "text" &&
                        (editing === node.id ? (
                          <textarea
                            autoFocus
                            value={node.text}
                            aria-label="Card text"
                            onChange={(event) =>
                              change((board) =>
                                updateNode(board, node.id, { text: event.target.value }),
                              )
                            }
                            onBlur={() => setEditing(null)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.stopPropagation();
                                setEditing(null);
                              }
                            }}
                            className="h-full w-full resize-none bg-transparent p-3 text-[14px] leading-snug outline-none"
                          />
                        ) : (
                          <p className="h-full overflow-hidden whitespace-pre-wrap p-3 text-[14px] leading-snug">
                            {node.text || (
                              <span className="text-[var(--fl-muted)]">Double-click to write</span>
                            )}
                          </p>
                        ))}

                      {node.type === "file" && (
                        <div className="flex h-full flex-col overflow-hidden p-3">
                          <p className="truncate text-[14px] font-semibold">{label}</p>
                          <p className="mt-1 line-clamp-4 flex-1 text-[12.5px] leading-snug text-[var(--fl-muted)]">
                            {note ? note.excerpt : `Not in this notebook: ${node.file}`}
                          </p>
                          {note && (
                            <button
                              type="button"
                              onClick={() => {
                                close();
                                onOpenNote(node.file);
                              }}
                              aria-label={`Open ${note.title}`}
                              className="self-start text-[12px] text-[var(--fl-accent)] underline underline-offset-2"
                            >
                              Open note
                            </button>
                          )}
                        </div>
                      )}

                      {node.type === "link" && (
                        <div className="flex h-full flex-col justify-center overflow-hidden p-3">
                          <p className="truncate text-[13.5px] font-semibold">{hostOf(node.url)}</p>
                          <a
                            href={node.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-[12px] text-[var(--fl-accent)] underline underline-offset-2"
                          >
                            {node.url}
                          </a>
                        </div>
                      )}

                      {isGroup &&
                        (editing === node.id ? (
                          <input
                            autoFocus
                            value={node.label ?? ""}
                            aria-label="Group name"
                            onChange={(event) =>
                              change((board) =>
                                updateNode(board, node.id, { label: event.target.value }),
                              )
                            }
                            onBlur={() => setEditing(null)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === "Escape") {
                                event.stopPropagation();
                                setEditing(null);
                              }
                            }}
                            className="m-2 w-48 rounded border border-[var(--fl-border)] bg-[var(--fl-surface)] px-1.5 py-0.5 text-[12px] outline-none"
                          />
                        ) : (
                          <p className="px-3 pt-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--fl-muted)]">
                            {node.label || "Group"}
                          </p>
                        ))}

                      {isSelected && (
                        <>
                          <span
                            data-handle="connect"
                            title="Drag onto another card to connect"
                            onPointerDown={(event) => startConnect(event, node)}
                            className="absolute right-[-14px] top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-crosshair items-center justify-center"
                          >
                            <span className="pointer-events-none h-3 w-3 rounded-full border-2 border-[var(--fl-surface)] bg-[var(--fl-accent)]" />
                          </span>
                          <span
                            data-handle="resize"
                            title="Drag to resize"
                            onPointerDown={(event) => startResize(event, node)}
                            className="absolute bottom-[-6px] right-[-6px] h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-[var(--fl-surface)] bg-[var(--fl-accent)]"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[11.5px] text-[var(--fl-muted)]">
              Drag the background to move · scroll to pan · pinch or ⌘/Ctrl-scroll to zoom ·
              double-click empty space for a card, or a card to write in it (or Enter, or Edit) ·
              drag a card&rsquo;s dot onto another to connect · Delete removes
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
