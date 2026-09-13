"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  addNode,
  anchor,
  colorOf,
  connect,
  edgePath,
  fitView,
  moveNodes,
  placeNew,
  removeEdge,
  removeNodes,
  resizeNode,
  sideFacing,
  toWorld,
  updateNode,
  zoomAt,
  type Canvas,
  type CanvasNode,
  type NewNode,
  type View,
} from "@forkleaf/markdown-engine";

/**
 * A canvas board: cards, notes, links and groups placed freely, joined by arrows.
 *
 * The same board is drawn inside a note, where it was inserted, and for a
 * `.canvas` file opened on its own. It holds the board while it is being
 * changed and reports every change; where that change is kept is up to
 * whoever put the board there.
 *
 * Keys only act while the board has focus. Inside a note, a board that
 * listened on the whole window took Backspace away from the paragraph being
 * typed below it.
 */

export interface CanvasNoteChoice {
  path: string;
  title: string;
  excerpt: string;
}

export interface CanvasBoardProps {
  /** The board as it starts. Later changes come from inside. */
  initial: Canvas;
  onChange: (canvas: Canvas) => void;
  /** Notes that can be placed on the board. */
  notes?: readonly CanvasNoteChoice[];
  onOpenNote?: (path: string) => void;
  /** Classes for the drawing area, which set its height. */
  viewportClassName?: string;
  /**
   * What scrolling over the board does. A board on its own pans; a board in a
   * note leaves plain scrolling to the page, so it cannot trap the reader, and
   * pans with Shift.
   */
  wheel?: "pan" | "page";
  /** Shown at the right of the tool row: a save state, a size toggle. */
  status?: ReactNode;
  readOnly?: boolean;
}

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
export function readUrl(input: string): string | null {
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

export function CanvasBoard({
  initial,
  onChange,
  notes = [],
  onOpenNote,
  viewportClassName = "h-[62vh] min-h-[360px]",
  wheel = "pan",
  status,
  readOnly = false,
}: CanvasBoardProps) {
  const [canvas, setCanvas] = useState<Canvas>(initial);
  const [view, setView] = useState<View>(() => fitView(initial, DEFAULT_VIEWPORT));
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; x: number; y: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
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
  /** True once somebody has changed the board; nothing is reported before that. */
  const changed = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const latest = useRef(canvas);
  useEffect(() => {
    latest.current = canvas;
  });

  const viewportSize = useCallback(() => {
    const element = viewportRef.current;
    return element && element.clientWidth > 0
      ? { width: element.clientWidth, height: element.clientHeight }
      : DEFAULT_VIEWPORT;
  }, []);

  // Fit once the real size of the drawing area is known.
  useEffect(() => {
    setView(fitView(latest.current, viewportSize()));
  }, [viewportSize]);

  useEffect(() => {
    if (changed.current) onChangeRef.current(canvas);
  }, [canvas]);

  const change = useCallback(
    (next: (current: Canvas) => Canvas) => {
      if (readOnly) return;
      changed.current = true;
      setCanvas(next);
    },
    [readOnly],
  );

  const focusBoard = () => rootRef.current?.focus({ preventScroll: true });

  // ── Scrolling pans; pinch or ⌘/Ctrl-scroll zooms ───────────────────────
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const zooming = event.ctrlKey || event.metaKey;
      if (wheel === "page" && !zooming && !event.shiftKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (zooming) {
        setView((current) => zoomAt(current, point, Math.exp(-event.deltaY * 0.01)));
      } else {
        // Shift turns a vertical wheel into a horizontal one in most browsers.
        const dx = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
        const dy = event.shiftKey && wheel === "page" ? 0 : event.deltaY;
        setView((current) => ({
          ...current,
          x: current.x + dx / current.zoom,
          y: current.y + dy / current.zoom,
        }));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [wheel]);

  // ── Delete, Enter and Escape, while the board has focus ────────────────
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (editing || readOnly) return;
    if (event.key === "Enter" && selected.size === 1) {
      const [id] = [...selected];
      const node = canvas.nodes.find((each) => each.id === id);
      if (node && (node.type === "text" || node.type === "group")) {
        event.preventDefault();
        setEditing(node.id);
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selected.size > 0) {
        event.preventDefault();
        event.stopPropagation();
        const ids = selected;
        change((board) => removeNodes(board, ids));
        setSelected(new Set());
      } else if (selectedEdge) {
        event.preventDefault();
        event.stopPropagation();
        const id = selectedEdge;
        change((board) => removeEdge(board, id));
        setSelectedEdge(null);
      }
    } else if (event.key === "Escape" && (selected.size > 0 || selectedEdge)) {
      // Clears the selection instead of closing whatever the board is in.
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      setSelected(new Set());
      setSelectedEdge(null);
    }
  };

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
    focusBoard();
    if (!readOnly && isDoublePress("background", event.timeStamp)) {
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
    focusBoard();
    if (
      !readOnly &&
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
    if (readOnly) return;
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
    if (readOnly) return;
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
    <div
      ref={rootRef}
      tabIndex={-1}
      data-canvas-board
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col gap-2 text-[13px] outline-none"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {!readOnly && (
          <>
            <button type="button" onClick={() => addText()} className={button}>
              Add card
            </button>
            {notes.length > 0 && (
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
            )}
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
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          {status}
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
          <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in" className={button}>
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
        className={`relative touch-none select-none overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-bg)] ${viewportClassName}`}
        style={{
          backgroundImage: "radial-gradient(var(--fl-border) 1px, transparent 1px)",
          backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
          backgroundPosition: `${-view.x * view.zoom}px ${-view.y * view.zoom}px`,
        }}
      >
        {canvas.nodes.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[var(--fl-muted)]">
            {readOnly
              ? "An empty canvas."
              : "Double-click anywhere to add a card, or use the buttons above."}
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
                      focusBoard();
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
                    markerStart={edge.fromEnd === "arrow" ? "url(#fl-canvas-arrow)" : undefined}
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
                  ? (note?.title ?? node.file.split("/").pop()?.replace(/\.md$/i, "") ?? node.file)
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
                        change((board) => updateNode(board, node.id, { text: event.target.value }))
                      }
                      onBlur={() => setEditing(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          event.nativeEvent.stopImmediatePropagation();
                          setEditing(null);
                          focusBoard();
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
                      {note
                        ? note.excerpt
                        : notes.length > 0
                          ? `Not in this notebook: ${node.file}`
                          : node.file}
                    </p>
                    {onOpenNote && (note || notes.length === 0) && (
                      <button
                        type="button"
                        onClick={() => onOpenNote(node.file)}
                        aria-label={`Open ${label}`}
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
                        change((board) => updateNode(board, node.id, { label: event.target.value }))
                      }
                      onBlur={() => setEditing(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "Escape") {
                          event.stopPropagation();
                          event.nativeEvent.stopImmediatePropagation();
                          setEditing(null);
                          focusBoard();
                        }
                      }}
                      className="m-2 w-48 rounded border border-[var(--fl-border)] bg-[var(--fl-surface)] px-1.5 py-0.5 text-[12px] outline-none"
                    />
                  ) : (
                    <p className="px-3 pt-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--fl-muted)]">
                      {node.label || "Group"}
                    </p>
                  ))}

                {isSelected && !readOnly && (
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
      {!readOnly && (
        <p className="text-[11.5px] text-[var(--fl-muted)]">
          Drag the background to move · {wheel === "pan" ? "scroll to pan" : "Shift-scroll to pan"}{" "}
          · pinch or ⌘/Ctrl-scroll to zoom · double-click empty space for a card, or a card to write
          in it · drag a card&rsquo;s dot onto another to connect · Delete removes
        </p>
      )}
    </div>
  );
}
