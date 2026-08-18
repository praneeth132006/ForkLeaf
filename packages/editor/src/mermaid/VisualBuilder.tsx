"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  addNode,
  nextNodeId,
  removeEdge,
  removeNode,
  updateNode,
  SHAPE_LABELS,
  SHAPES_FOR_KIND,
  EDGE_LABELS,
  type EdgeStyle,
  type Graph,
  type GraphNode,
  type NodeShape,
} from "@forkleaf/diagrams";

export interface VisualBuilderProps {
  graph: Graph;
  onChange: (graph: Graph) => void;
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 56;
const GRID = 8;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
/** Padding left around the content when fitting the view to the graph. */
const FIT_PADDING = 80;

/** The shape a plain new node takes in each dialect. */
function defaultShapeFor(kind: Graph["kind"]): NodeShape {
  return kind === "state" ? "state" : "rect";
}

/**
 * Node footprints.
 *
 * A state diagram's `[*]` markers and choice diamonds are landmarks rather than
 * boxes with words in them; drawing them at the size of a process step makes a
 * state chart read like a flowchart with four blank boxes in it.
 */
function sizeOf(node: { shape: NodeShape }): { width: number; height: number } {
  switch (node.shape) {
    case "start":
    case "end":
      return { width: 40, height: 40 };
    case "choice":
      return { width: 64, height: 64 };
    case "fork":
      return { width: 130, height: 14 };
    default:
      return { width: NODE_WIDTH, height: NODE_HEIGHT };
  }
}

/** Pseudo-states have no text of their own — mermaid draws them as marks. */
function isMarker(shape: NodeShape): boolean {
  return shape === "start" || shape === "end" || shape === "fork";
}

interface Point {
  x: number;
  y: number;
}

type Drag =
  | { kind: "none" }
  /** Moving a node. `preview` is committed to the graph only on release. */
  | { kind: "move"; nodeId: string; grabX: number; grabY: number; preview: Point; moved: boolean }
  | { kind: "connect"; fromId: string; cursor: Point }
  | { kind: "pan"; originX: number; originY: number; panX: number; panY: number };

/**
 * Drag-and-drop diagram builder.
 *
 * Two things made the previous version feel bad, and both are fixed here:
 *
 *  1. Every pointermove called `onChange`, which regenerated the whole Mermaid
 *     source, reparsed it and re-rendered the preview — a full round trip per
 *     frame. Node position now lives in local state while dragging and is
 *     committed to the graph once, on release.
 *  2. The canvas was a fixed-size box you scrolled. It is now a viewBox with
 *     pan and zoom, so the drawing area is as large as the diagram needs.
 *
 * The graph is still owned by the parent so the source editor and this canvas
 * stay in sync: edit either one and the other follows.
 */
export function VisualBuilder({ graph, onChange }: VisualBuilderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>({ kind: "none" });
  const [selected, setSelected] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 1000, height: 700 });
  /** Alt disables grid snapping for the duration of a drag. */
  const [freeform, setFreeform] = useState(false);

  // The visible world rectangle. Everything else is derived from it.
  const view = useMemo(
    () => ({
      x: pan.x,
      y: pan.y,
      width: viewport.width / zoom,
      height: viewport.height / zoom,
    }),
    [pan, zoom, viewport],
  );

  // Track the host's pixel size so the viewBox keeps a 1:1 aspect with it and
  // nothing is stretched.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ width, height });
    });

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  /** Screen pixels → world coordinates. */
  const toWorld = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (event.clientX - rect.left) / zoom + pan.x,
        y: (event.clientY - rect.top) / zoom + pan.y,
      };
    },
    [zoom, pan],
  );

  // ── Pointer handling ────────────────────────────────────────────────────
  // Bound to the window so a fast drag that leaves the canvas still tracks,
  // and releasing outside still ends the drag. Position updates are coalesced
  // into an animation frame: a trackpad can emit pointermove far faster than
  // the browser paints, and re-rendering per event is wasted work that shows
  // up as lag.
  const frame = useRef<number | null>(null);
  const pending = useRef<PointerEvent | null>(null);

  useEffect(() => {
    if (drag.kind === "none") return;

    const apply = () => {
      frame.current = null;
      const event = pending.current;
      if (!event) return;

      if (drag.kind === "move") {
        const world = toWorld(event);
        const next = { x: world.x - drag.grabX, y: world.y - drag.grabY };
        setDrag({
          ...drag,
          preview: event.altKey ? next : { x: snap(next.x), y: snap(next.y) },
          moved: true,
        });
      } else if (drag.kind === "connect") {
        setDrag({ ...drag, cursor: toWorld(event) });
      } else if (drag.kind === "pan") {
        setPan({
          x: drag.panX - (event.clientX - drag.originX) / zoom,
          y: drag.panY - (event.clientY - drag.originY) / zoom,
        });
      }
    };

    const onMove = (event: PointerEvent) => {
      setFreeform(event.altKey);
      pending.current = event;
      frame.current ??= requestAnimationFrame(apply);
    };

    const onUp = (event: PointerEvent) => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      pending.current = null;

      // Commit happens here, once, rather than on every frame.
      if (drag.kind === "move" && drag.moved) {
        onChange(updateNode(graph, drag.nodeId, { x: drag.preview.x, y: drag.preview.y }));
      } else if (drag.kind === "connect") {
        const world = toWorld(event);
        const target = nodeAt(graph, world);

        if (target && target.id !== drag.fromId) {
          onChange(addEdge(graph, drag.fromId, target.id));
        } else if (!target) {
          // Dropping an arrow on empty space creates the node it was reaching
          // for. Otherwise every new step is add-then-drag-then-connect, and
          // the arrow you already drew is thrown away.
          const shape = defaultShapeFor(graph.kind);
          const size = sizeOf({ shape });
          const id = nextNodeId(graph);
          const placed = addNode(graph, {
            id,
            label: SHAPE_LABELS[shape],
            shape,
            x: snap(world.x - size.width / 2),
            y: snap(world.y - size.height / 2),
          });

          onChange(addEdge(placed, drag.fromId, id));
          setSelected(id);
          setEditingLabel(id);
        }
      }

      setDrag({ kind: "none" });
      setFreeform(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [drag, graph, onChange, toWorld, zoom]);

  // ── Zoom ────────────────────────────────────────────────────────────────
  // Anchored at the cursor, so the point under the pointer stays put — the
  // thing that makes zooming feel like a map rather than a slider.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      // Plain scroll pans vertically; ctrl/cmd (or a pinch, which browsers
      // report as ctrl+wheel) zooms. Matches every canvas app.
      if (!event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setPan((current) => ({
          x: current.x + event.deltaX / zoom,
          y: current.y + event.deltaY / zoom,
        }));
        return;
      }

      event.preventDefault();
      const rect = host.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;

      setZoom((current) => {
        const next = clamp(current * Math.exp(-event.deltaY / 320), MIN_ZOOM, MAX_ZOOM);
        setPan((currentPan) => ({
          x: currentPan.x + offsetX / current - offsetX / next,
          y: currentPan.y + offsetY / current - offsetY / next,
        }));
        return next;
      });
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [zoom]);

  /** Centres the view on the graph at a zoom that fits it. */
  const fit = useCallback(() => {
    if (graph.nodes.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const minX = Math.min(...graph.nodes.map((n) => n.x));
    const minY = Math.min(...graph.nodes.map((n) => n.y));
    const maxX = Math.max(...graph.nodes.map((n) => n.x + sizeOf(n).width));
    const maxY = Math.max(...graph.nodes.map((n) => n.y + sizeOf(n).height));

    const contentWidth = maxX - minX + FIT_PADDING * 2;
    const contentHeight = maxY - minY + FIT_PADDING * 2;
    const next = clamp(
      Math.min(viewport.width / contentWidth, viewport.height / contentHeight),
      MIN_ZOOM,
      MAX_ZOOM,
    );

    setZoom(next);
    setPan({
      x: minX - FIT_PADDING + (contentWidth - viewport.width / next) / 2,
      y: minY - FIT_PADDING + (contentHeight - viewport.height / next) / 2,
    });
  }, [graph.nodes, viewport]);

  // Frame the diagram the first time one exists, so opening the visual tab on
  // a template does not drop you in an empty corner of the canvas.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || graph.nodes.length === 0 || viewport.width <= 1) return;
    framed.current = true;
    fit();
  }, [graph.nodes.length, viewport.width, fit]);

  // ── Actions ─────────────────────────────────────────────────────────────

  /**
   * Creates a node and puts it straight into rename mode.
   *
   * `centre` is where the node should sit, in world coordinates; without one it
   * lands in the middle of what is currently on screen rather than at a fixed
   * origin that may be scrolled far out of view.
   */
  const createNode = useCallback(
    (shape: NodeShape, centre?: Point): string => {
      const id = nextNodeId(graph);
      const size = sizeOf({ shape });
      const offset = centre ? 0 : (graph.nodes.length % 6) * 24;
      const x = (centre?.x ?? view.x + view.width / 2 + offset) - size.width / 2;
      const y = (centre?.y ?? view.y + view.height / 2 + offset * 0.8) - size.height / 2;

      onChange(
        addNode(graph, {
          id,
          // Markers have no text; a named default would just have to be
          // deleted before the diagram read correctly.
          label: isMarker(shape) ? "" : SHAPE_LABELS[shape],
          shape,
          x: snap(x),
          y: snap(y),
        }),
      );

      setSelected(id);
      if (!isMarker(shape)) setEditingLabel(id);
      return id;
    },
    [graph, onChange, view],
  );

  /** Adds a node already wired to the current selection, for keyboard flow. */
  const createConnectedNode = useCallback(() => {
    const source = graph.nodes.find((n) => n.id === selected);
    if (!source) return;

    const shape: NodeShape = defaultShapeFor(graph.kind);
    const size = sizeOf(source);
    const id = nextNodeId(graph);
    const horizontal = graph.direction === "LR" || graph.direction === "RL";

    const placed = addNode(graph, {
      id,
      label: SHAPE_LABELS[shape],
      shape,
      x: snap(source.x + (horizontal ? size.width + 90 : 0)),
      y: snap(source.y + (horizontal ? 0 : size.height + 80)),
    });

    onChange(addEdge(placed, source.id, id));
    setSelected(id);
    setEditingLabel(id);
  }, [graph, onChange, selected]);

  // ── Keyboard ────────────────────────────────────────────────────────────
  // Declared after the actions it calls, so the dependency array is not
  // evaluated before those consts exist.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selected && !editingLabel) {
        event.preventDefault();
        onChange(
          graph.nodes.some((n) => n.id === selected)
            ? removeNode(graph, selected)
            : removeEdge(graph, selected),
        );
        setSelected(null);
        return;
      }

      // Enter renames, Tab continues the chain: the two things you do over and
      // over while sketching, neither of which should need the mouse.
      if (event.key === "Enter" && selected && !editingLabel) {
        const node = graph.nodes.find((n) => n.id === selected);
        if (node && !isMarker(node.shape)) {
          event.preventDefault();
          setEditingLabel(selected);
        }
        return;
      }

      if (event.key === "Tab" && selected && !editingLabel) {
        if (graph.nodes.some((n) => n.id === selected)) {
          event.preventDefault();
          createConnectedNode();
        }
        return;
      }

      if (event.key === "Escape") {
        setSelected(null);
        return;
      }

      if (event.key === "0" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        fit();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, editingLabel, graph, onChange, fit, createConnectedNode]);

  const selectedNode = graph.nodes.find((n) => n.id === selected) ?? null;
  const selectedEdge = graph.edges.find((e) => e.id === selected) ?? null;

  /** A node's position, using the in-flight drag preview when it has one. */
  const positionOf = (node: GraphNode): Point =>
    drag.kind === "move" && drag.nodeId === node.id ? drag.preview : { x: node.x, y: node.y };

  const laidOut: GraphNode[] = graph.nodes.map((node) => ({ ...node, ...positionOf(node) }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2">
        <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--fl-muted)]">
          Add
        </span>

        {SHAPES_FOR_KIND[graph.kind].map((shape) => (
          <button
            key={shape}
            type="button"
            onClick={() => createNode(shape)}
            title={`Add a ${SHAPE_LABELS[shape].toLowerCase()} node`}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] py-1 pl-1.5 pr-2.5 text-[12.5px] text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
          >
            <ShapeIcon shape={shape} />
            {SHAPE_LABELS[shape]}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--fl-muted)]">
            Layout
            <select
              value={graph.direction}
              onChange={(event) =>
                onChange({ ...graph, direction: event.target.value as Graph["direction"] })
              }
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[12.5px] text-[var(--fl-text)]"
            >
              <option value="TD">Top to bottom</option>
              <option value="LR">Left to right</option>
              {/* Mermaid's state renderer only lays out downwards or
                  rightwards; offering the other two would silently do nothing. */}
              {graph.kind === "flowchart" && <option value="BT">Bottom to top</option>}
              {graph.kind === "flowchart" && <option value="RL">Right to left</option>}
            </select>
          </label>

          <div className="flex items-center rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)]">
            <ZoomButton
              label="Zoom out"
              onClick={() => setZoom((z) => clamp(z / 1.2, MIN_ZOOM, MAX_ZOOM))}
            >
              −
            </ZoomButton>
            <button
              type="button"
              onClick={fit}
              title="Fit the diagram to the canvas (⌘0)"
              className="w-14 border-x border-[var(--fl-border)] py-1 text-center font-mono text-[11.5px] text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <ZoomButton
              label="Zoom in"
              onClick={() => setZoom((z) => clamp(z * 1.2, MIN_ZOOM, MAX_ZOOM))}
            >
              +
            </ZoomButton>
          </div>
        </div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div
        ref={hostRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-[var(--fl-bg)] ${
          drag.kind === "pan" ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <svg
          className="h-full w-full touch-none select-none"
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          onDoubleClick={(event) => {
            // Empty space only — double-clicking a node renames it.
            if (event.target !== event.currentTarget) return;
            createNode(defaultShapeFor(graph.kind), toWorld(event));
          }}
          onPointerDown={(event) => {
            // Empty canvas: clear the selection and start panning. Middle-click
            // pans from anywhere.
            if (event.target !== event.currentTarget && event.button !== 1) return;

            setSelected(null);
            setEditingLabel(null);
            setDrag({
              kind: "pan",
              originX: event.clientX,
              originY: event.clientY,
              panX: pan.x,
              panY: pan.y,
            });
          }}
        >
          <defs>
            <marker
              id="fl-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fl-border-strong)" />
            </marker>
            <marker
              id="fl-arrow-active"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fl-accent)" />
            </marker>
            {/* Anchored in world space so the grid scrolls with the diagram
                rather than sliding under it. */}
            <pattern id="fl-grid" width={GRID * 3} height={GRID * 3} patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--fl-border-strong)" opacity="0.45" />
            </pattern>
          </defs>

          <rect
            x={view.x}
            y={view.y}
            width={view.width}
            height={view.height}
            fill="url(#fl-grid)"
            pointerEvents="none"
          />

          {/* Edges first, so nodes sit on top of them. */}
          {graph.edges.map((edge) => {
            const from = laidOut.find((n) => n.id === edge.from);
            const to = laidOut.find((n) => n.id === edge.to);
            if (!from || !to) return null;

            const start = anchorPoint(from, to);
            const end = anchorPoint(to, from);
            const isSelected = selected === edge.id;

            return (
              <g
                key={edge.id}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setSelected(edge.id);
                }}
                className="cursor-pointer"
              >
                {/* A wide transparent stroke makes the thin line easy to hit. */}
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="transparent"
                  strokeWidth={18}
                />
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={isSelected ? "var(--fl-accent)" : "var(--fl-border-strong)"}
                  strokeWidth={edge.style === "thick" ? 3 : 1.8}
                  strokeDasharray={edge.style === "dotted" ? "5 4" : undefined}
                  markerEnd={
                    edge.style === "open"
                      ? undefined
                      : isSelected
                        ? "url(#fl-arrow-active)"
                        : "url(#fl-arrow)"
                  }
                />
                {edge.label && (
                  <text
                    x={(start.x + end.x) / 2}
                    y={(start.y + end.y) / 2 - 6}
                    textAnchor="middle"
                    className="fill-[var(--fl-text)] text-[11px]"
                    style={{ paintOrder: "stroke", stroke: "var(--fl-bg)", strokeWidth: 5 }}
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* The rubber band shown while pulling a new connection. */}
          {drag.kind === "connect" &&
            (() => {
              const from = laidOut.find((n) => n.id === drag.fromId);
              if (!from) return null;

              const target = nodeAt(graph, drag.cursor);
              return (
                <>
                  <line
                    x1={from.x + sizeOf(from).width / 2}
                    y1={from.y + sizeOf(from).height / 2}
                    x2={drag.cursor.x}
                    y2={drag.cursor.y}
                    stroke="var(--fl-accent)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    pointerEvents="none"
                  />
                  {/* Highlight the node the arrow would land on. */}
                  {target && target.id !== drag.fromId && (
                    <rect
                      x={target.x - 4}
                      y={target.y - 4}
                      width={sizeOf(target).width + 8}
                      height={sizeOf(target).height + 8}
                      rx={12}
                      fill="none"
                      stroke="var(--fl-accent)"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      pointerEvents="none"
                    />
                  )}
                </>
              );
            })()}

          {laidOut.map((node) => (
            <NodeShapeView
              key={node.id}
              node={node}
              selected={selected === node.id}
              dragging={drag.kind === "move" && drag.nodeId === node.id}
              onPointerDown={(event) => {
                event.stopPropagation();
                const world = toWorld(event);
                setSelected(node.id);
                setDrag({
                  kind: "move",
                  nodeId: node.id,
                  grabX: world.x - node.x,
                  grabY: world.y - node.y,
                  preview: { x: node.x, y: node.y },
                  moved: false,
                });
              }}
              onStartConnect={(event) => {
                event.stopPropagation();
                setDrag({ kind: "connect", fromId: node.id, cursor: toWorld(event) });
              }}
              onDoubleClick={() => {
                if (!isMarker(node.shape)) setEditingLabel(node.id);
              }}
            />
          ))}
        </svg>

        {/* Label editing uses a real input overlaid on the node, so typing
            behaves normally instead of through a fake SVG caret. Positioned in
            screen space, which is why it is outside the SVG. */}
        {editingLabel &&
          (() => {
            const node = laidOut.find((n) => n.id === editingLabel);
            if (!node) return null;

            return (
              <input
                autoFocus
                value={node.label}
                onChange={(event) =>
                  onChange(updateNode(graph, node.id, { label: event.target.value }))
                }
                onBlur={() => setEditingLabel(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") setEditingLabel(null);
                  event.stopPropagation();
                }}
                aria-label="Node label"
                className="absolute rounded-md border-2 border-[var(--fl-accent)] bg-[var(--fl-surface)] px-1 text-center text-[var(--fl-text)] outline-none"
                style={{
                  left: (node.x - view.x) * zoom + 8 * zoom,
                  top: (node.y - view.y) * zoom + (sizeOf(node).height / 2 - 14) * zoom,
                  width: (sizeOf(node).width - 16) * zoom,
                  height: 28 * zoom,
                  fontSize: 13 * zoom,
                }}
              />
            );
          })()}

        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <p className="text-[14px] font-medium text-[var(--fl-text)]">Empty canvas</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--fl-muted)]">
                Double-click anywhere to add your first box, or pick a shape from the toolbar. Drag
                from a box&rsquo;s edge handle onto empty space to add the next one already
                connected.
              </p>
            </div>
          </div>
        )}

        {/* Interaction hints. Fades out while dragging so it never sits under
            the thing being moved. */}
        <div
          className={`pointer-events-none absolute bottom-2 left-2 hidden gap-3 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)]/90 px-2.5 py-1.5 text-[11px] text-[var(--fl-muted)] backdrop-blur transition-opacity sm:flex ${
            drag.kind === "none" ? "opacity-100" : "opacity-0"
          }`}
        >
          <span>Double-click empty space to add</span>
          <span>Drag a handle onto empty space to add and connect</span>
          <span>Tab to continue</span>
          <span>⌘ + scroll to zoom</span>
          <span>{freeform ? "Snapping off" : "Alt to disable snapping"}</span>
        </div>
      </div>

      {/* ── Inspector for the current selection ─────────────────────────── */}
      {(selectedNode || selectedEdge) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[12.5px]">
          {selectedNode && (
            <>
              <input
                value={selectedNode.label}
                onChange={(event) =>
                  onChange(updateNode(graph, selectedNode.id, { label: event.target.value }))
                }
                aria-label="Node label"
                className="w-48 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
              />
              <select
                value={selectedNode.shape}
                onChange={(event) =>
                  onChange(
                    updateNode(graph, selectedNode.id, { shape: event.target.value as NodeShape }),
                  )
                }
                aria-label="Node shape"
                className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[var(--fl-text)]"
              >
                {SHAPES_FOR_KIND[graph.kind].map((shape) => (
                  <option key={shape} value={shape}>
                    {SHAPE_LABELS[shape]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  onChange(removeNode(graph, selectedNode.id));
                  setSelected(null);
                }}
                className="ml-auto rounded-lg px-2 py-1 text-[var(--fl-danger)] transition-colors hover:bg-[var(--fl-elevated)]"
              >
                Delete node
              </button>
            </>
          )}

          {selectedEdge && (
            <>
              <input
                value={selectedEdge.label ?? ""}
                placeholder="Arrow label"
                onChange={(event) =>
                  onChange({
                    ...graph,
                    edges: graph.edges.map((e) =>
                      e.id === selectedEdge.id ? { ...e, label: event.target.value } : e,
                    ),
                  })
                }
                aria-label="Arrow label"
                className="w-48 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
              />
              <select
                value={selectedEdge.style}
                onChange={(event) =>
                  onChange({
                    ...graph,
                    edges: graph.edges.map((e) =>
                      e.id === selectedEdge.id
                        ? { ...e, style: event.target.value as EdgeStyle }
                        : e,
                    ),
                  })
                }
                aria-label="Arrow style"
                className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[var(--fl-text)]"
              >
                {(Object.keys(EDGE_LABELS) as EdgeStyle[]).map((style) => (
                  <option key={style} value={style}>
                    {EDGE_LABELS[style]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  onChange(removeEdge(graph, selectedEdge.id));
                  setSelected(null);
                }}
                className="ml-auto rounded-lg px-2 py-1 text-[var(--fl-danger)] transition-colors hover:bg-[var(--fl-elevated)]"
              >
                Delete arrow
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Node rendering ─────────────────────────────────────────────────────────

interface NodeShapeViewProps {
  node: GraphNode;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onStartConnect: (event: React.PointerEvent) => void;
  onDoubleClick: () => void;
}

function NodeShapeView({
  node,
  selected,
  dragging,
  onPointerDown,
  onStartConnect,
  onDoubleClick,
}: NodeShapeViewProps) {
  const stroke = selected ? "var(--fl-accent)" : "var(--fl-border-strong)";
  const strokeWidth = selected ? 2.5 : 1.5;
  const { width, height } = sizeOf(node);
  const marker = isMarker(node.shape);

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className={dragging ? "cursor-grabbing" : "cursor-move"}
      opacity={dragging ? 0.85 : 1}
    >
      {renderShape(node.shape, stroke, strokeWidth, "var(--fl-surface)")}

      {/* Markers are drawn, not labelled. A choice diamond is small, so its
          label sits underneath rather than being squeezed inside. */}
      {!marker && (
        <text
          x={width / 2}
          y={node.shape === "choice" ? height + 14 : height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="pointer-events-none select-none fill-[var(--fl-text)] text-[13px]"
        >
          {truncate(node.label, node.shape === "choice" ? 14 : 18)}
        </text>
      )}

      {/* Connection handles on all four edges rather than only the right one:
          with a single handle, an arrow that should go upward has to be dragged
          around the box. Each has a generous invisible hit area. */}
      {(
        [
          { x: width, y: height / 2 },
          { x: 0, y: height / 2 },
          { x: width / 2, y: 0 },
          { x: width / 2, y: height },
        ] as const
      ).map((handle) => (
        <g
          key={`${handle.x}-${handle.y}`}
          onPointerDown={onStartConnect}
          className="cursor-crosshair"
        >
          <circle cx={handle.x} cy={handle.y} r={13} fill="transparent" />
          <circle
            cx={handle.x}
            cy={handle.y}
            r={5.5}
            fill="var(--fl-accent)"
            stroke="var(--fl-bg)"
            strokeWidth={2}
            opacity={selected ? 1 : 0.55}
          >
            <title>Drag onto another node to connect</title>
          </circle>
        </g>
      ))}
    </g>
  );
}

/** Draws each mermaid shape as its SVG equivalent, so the canvas matches the output. */
function renderShape(shape: NodeShape, stroke: string, strokeWidth: number, fill: string) {
  const { width: w, height: h } = sizeOf({ shape });
  const common = { stroke, strokeWidth, fill };

  switch (shape) {
    case "round":
    case "state":
      return <rect width={w} height={h} rx={10} {...common} />;
    case "stadium":
      return <rect width={w} height={h} rx={h / 2} {...common} />;
    case "circle":
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
    case "diamond":
    case "choice":
      return <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...common} />;
    case "hexagon":
      return (
        <polygon
          points={`20,0 ${w - 20},0 ${w},${h / 2} ${w - 20},${h} 20,${h} 0,${h / 2}`}
          {...common}
        />
      );
    case "parallelogram":
      return <polygon points={`20,0 ${w},0 ${w - 20},${h} 0,${h}`} {...common} />;
    case "cylinder":
      return (
        <g>
          <path
            d={`M 0,10 A ${w / 2},10 0 0 1 ${w},10 L ${w},${h - 10} A ${w / 2},10 0 0 1 0,${h - 10} Z`}
            {...common}
          />
          <path
            d={`M 0,10 A ${w / 2},10 0 0 0 ${w},10`}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </g>
      );
    // The state-diagram markers, drawn the way mermaid draws them: a filled
    // disc to start, a ringed disc to finish, a solid bar to fork or join.
    case "start":
      return (
        <circle
          cx={w / 2}
          cy={h / 2}
          r={w / 2 - 4}
          fill="var(--fl-accent)"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case "end":
      return (
        <g>
          <circle
            cx={w / 2}
            cy={h / 2}
            r={w / 2 - 2}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <circle cx={w / 2} cy={h / 2} r={w / 2 - 8} fill="var(--fl-accent)" />
        </g>
      );
    case "fork":
      return (
        <rect
          width={w}
          height={h}
          rx={3}
          fill="var(--fl-border-strong)"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case "rect":
    default:
      return <rect width={w} height={h} rx={3} {...common} />;
  }
}

/** A tiny silhouette of each shape, for the Add buttons. */
function ShapeIcon({ shape }: { shape: NodeShape }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
  } as const;

  return (
    <svg viewBox="0 0 20 14" aria-hidden="true" className="h-3.5 w-5 shrink-0 opacity-70">
      {shape === "start" ? (
        <circle cx="10" cy="7" r="4.5" fill="currentColor" />
      ) : shape === "end" ? (
        <g>
          <circle cx="10" cy="7" r="5.5" {...common} />
          <circle cx="10" cy="7" r="2.75" fill="currentColor" />
        </g>
      ) : shape === "fork" ? (
        <rect x="2" y="6" width="16" height="2.5" fill="currentColor" />
      ) : shape === "state" ? (
        <rect x="1" y="1" width="18" height="12" rx="4" {...common} />
      ) : shape === "choice" ? (
        <polygon points="10,1 17,7 10,13 3,7" {...common} />
      ) : shape === "diamond" ? (
        <polygon points="10,1 19,7 10,13 1,7" {...common} />
      ) : shape === "circle" ? (
        <ellipse cx="10" cy="7" rx="9" ry="6" {...common} />
      ) : shape === "stadium" ? (
        <rect x="1" y="1" width="18" height="12" rx="6" {...common} />
      ) : shape === "round" ? (
        <rect x="1" y="1" width="18" height="12" rx="4" {...common} />
      ) : shape === "hexagon" ? (
        <polygon points="5,1 15,1 19,7 15,13 5,13 1,7" {...common} />
      ) : shape === "parallelogram" ? (
        <polygon points="4,1 19,1 16,13 1,13" {...common} />
      ) : shape === "cylinder" ? (
        <g {...common}>
          <path d="M1 3.5A9 2.5 0 0 1 19 3.5V10.5A9 2.5 0 0 1 1 10.5Z" />
          <path d="M1 3.5A9 2.5 0 0 0 19 3.5" />
        </g>
      ) : (
        <rect x="1" y="1" width="18" height="12" rx="1.5" {...common} />
      )}
    </svg>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-7 py-1 text-center text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
    >
      {children}
    </button>
  );
}

// ─── Geometry ───────────────────────────────────────────────────────────────

/** Where an edge should meet a node: on the border, pointing at the other node. */
function anchorPoint(node: GraphNode, toward: GraphNode): Point {
  const size = sizeOf(node);
  const towardSize = sizeOf(toward);
  const cx = node.x + size.width / 2;
  const cy = node.y + size.height / 2;
  const tx = toward.x + towardSize.width / 2;
  const ty = toward.y + towardSize.height / 2;

  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  // Scale the direction vector until it hits the box edge, whichever axis it
  // crosses first.
  const scaleX = dx === 0 ? Infinity : size.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : size.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return { x: cx + dx * scale, y: cy + dy * scale };
}

function nodeAt(graph: Graph, point: Point): GraphNode | null {
  // Reverse order so the topmost node wins when two overlap.
  for (let i = graph.nodes.length - 1; i >= 0; i -= 1) {
    const node = graph.nodes[i]!;
    const size = sizeOf(node);
    if (
      point.x >= node.x &&
      point.x <= node.x + size.width &&
      point.y >= node.y &&
      point.y <= node.y + size.height
    ) {
      return node;
    }
  }
  return null;
}

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
