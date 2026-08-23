"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  addNode,
  nextNodeId,
  removeEdge,
  removeNode,
  removeMany,
  moveNodes,
  duplicateNodes,
  tidyLayout,
  updateNode,
  updateEdge,
  graphToMermaid,
  mermaidToGraph,
  joinMembers,
  SHAPE_LABELS,
  SHAPES_FOR_KIND,
  EDGE_LABELS,
  EDGE_STYLES_FOR_KIND,
  DEFAULT_EDGE_STYLE,
  splitMembers,
  type EdgeStyle,
  type Graph,
  type GraphNode,
  type NodeShape,
} from "@forkleaf/diagrams";
import { DraftInput } from "./DraftInput";
import { resolveDrop } from "./drag";

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
/**
 * Extra room kept below the content when fitting.
 *
 * The keyboard-hint strip floats over the bottom of the canvas, so a fit that
 * treats the full height as usable parks the last row of boxes underneath it —
 * the node is on screen and still unreadable.
 */
const HINT_STRIP = 48;

/** The shape a plain new node takes in each dialect. */
function defaultShapeFor(kind: Graph["kind"]): NodeShape {
  switch (kind) {
    case "state":
      return "state";
    case "class":
      return "class";
    case "er":
      return "entity";
    case "mindmap":
      return "mind-round";
    default:
      return "rect";
  }
}

/**
 * Node footprint, the way mermaid computes it: the text plus a fixed padding.
 *
 * The canvas used to draw every box at a flat 150×56 whatever was written in
 * it. Mermaid does not — it sizes a flowchart node to its label — so a
 * two-letter "Start / End" was a wide pill on the canvas and a near-circle in
 * the note, and the shape you picked and the shape you got looked like two
 * different shapes. Matching mermaid's own metric is what makes the canvas a
 * preview of the diagram rather than a promise about it.
 */
const LABEL_CHAR_WIDTH = 9;
const LABEL_PADDING = 30;
const MIN_NODE_WIDTH = 64;
const MAX_NODE_WIDTH = 300;

function textWidth(label: string | undefined): number {
  return (label ?? "").length * LABEL_CHAR_WIDTH;
}

function labelWidth(label: string | undefined): number {
  return textWidth(label) + LABEL_PADDING;
}

/** Height of one member line inside a class or entity box. */
const MEMBER_HEIGHT = 17;
/** Height of the name bar above the members. */
const MEMBER_HEADER = 30;

/**
 * Node footprints.
 *
 * A state diagram's `[*]` markers and choice diamonds are landmarks rather than
 * boxes with words in them; drawing them at the size of a process step makes a
 * state chart read like a flowchart with four blank boxes in it.
 */
function sizeOf(node: { shape: NodeShape; label?: string }): { width: number; height: number } {
  switch (node.shape) {
    case "start":
    case "end":
      return { width: 40, height: 40 };
    case "choice":
      return { width: 64, height: 64 };
    case "fork":
      return { width: 130, height: 14 };
    case "circle": {
      // A connector is round in the note, so it is round here too.
      const size = clamp(labelWidth(node.label), NODE_HEIGHT, 160);
      return { width: size, height: size };
    }
    case "diamond": {
      // A rhombus only offers its full width along the centre line, and the
      // canvas was drawing decisions at the same 150×56 as everything else:
      // a flat sliver with its question cut off halfway through. Both
      // dimensions grow with the text, so the words stay inside the shape.
      const text = textWidth(node.label);
      return {
        width: clamp(text * 1.4 + 36, 112, 320),
        height: clamp(72 + text * 0.22, 72, 160),
      };
    }
    case "hexagon":
    case "parallelogram": {
      // Slanted sides eat into the usable width the same way, if less of it.
      const text = textWidth(node.label);
      return { width: clamp(text + LABEL_PADDING + 28, 96, MAX_NODE_WIDTH), height: NODE_HEIGHT };
    }
    case "mind-circle":
    case "mind-bang":
      return { width: 96, height: 96 };
    case "mind-round":
    case "mind-square":
    case "mind-cloud":
    case "mind-hexagon":
      return { width: 132, height: 48 };
    case "class":
    case "entity": {
      // A class or entity box is as tall as what is in it. Drawing every one at
      // a fixed height meant a class with six fields either overflowed its box
      // or had its fields hidden, and hiding them removes the only reason the
      // diagram was drawn.
      const { name, members } = splitMembers(node.label ?? "");
      const widest = Math.max(name.length, ...members.map((line) => line.length), 10);
      return {
        width: Math.min(300, Math.max(NODE_WIDTH, widest * 7.4 + 28)),
        height: MEMBER_HEADER + Math.max(members.length, 0) * MEMBER_HEIGHT + 8,
      };
    }
    default:
      return {
        width: clamp(labelWidth(node.label), MIN_NODE_WIDTH, MAX_NODE_WIDTH),
        height: NODE_HEIGHT,
      };
  }
}

/** True for the box shapes whose label is a name followed by a list. */
function hasMembers(shape: NodeShape): boolean {
  return shape === "class" || shape === "entity";
}

/**
 * The nearest place a new box fits without landing on one already there.
 *
 * Spirals outward from `centre` in grid steps and takes the first position
 * whose footprint — plus a gutter, so boxes are never touching — is clear.
 * Falls back to the centre if the canvas is somehow packed solid, which is
 * still better than refusing to add the node.
 */
function freeSpotNear(
  centre: Point,
  size: { width: number; height: number },
  nodes: GraphNode[],
): Point {
  const GUTTER = 24;
  const STEP = NODE_WIDTH / 2 + GUTTER;

  const clear = (x: number, y: number) =>
    nodes.every((node) => {
      const other = sizeOf(node);
      return (
        Math.abs(x - (node.x + other.width / 2)) > (size.width + other.width) / 2 + GUTTER ||
        Math.abs(y - (node.y + other.height / 2)) > (size.height + other.height) / 2 + GUTTER
      );
    });

  if (clear(centre.x, centre.y)) return centre;

  // Rings of candidate positions, closest first.
  for (let ring = 1; ring <= 8; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        // Only the edge of each ring; the inside was covered by earlier ones.
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;

        const x = centre.x + dx * STEP;
        const y = centre.y + dy * (NODE_HEIGHT + GUTTER);
        if (clear(x, y)) return { x, y };
      }
    }
  }

  return centre;
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
  | { kind: "pan"; originX: number; originY: number; panX: number; panY: number }
  /** Rubber-band selection. `from` is where the press landed, in world space. */
  | { kind: "marquee"; from: Point; to: Point; additive: boolean };

/**
 * Undo and redo for the canvas.
 *
 * The graph is owned by the parent, which holds mermaid source and reparses it
 * on every change — so the object identity is new every render and cannot be
 * compared. History is therefore kept as serialised snapshots, which is also
 * exactly what has to be handed back to `onChange` to undo.
 *
 * Edits made in the *source* pane reset the history rather than joining it. A
 * stack of canvas states interleaved with half-typed source would let undo
 * restore a document that was never on screen, and losing the ability to undo
 * is a much smaller harm than undoing into something the user never had.
 */
function useGraphHistory(graph: Graph, onChange: (next: Graph) => void) {
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  /** The source we last saw, whether we produced it or the other pane did. */
  const current = useRef<string>(graphToMermaid(graph));
  /** Set while applying our own change, so the sync below ignores the echo. */
  const applying = useRef(false);
  const [, tick] = useState(0);

  const code = graphToMermaid(graph);

  useEffect(() => {
    if (code === current.current) return;

    if (applying.current) {
      applying.current = false;
    } else {
      past.current = [];
      future.current = [];
      tick((n) => n + 1);
    }
    current.current = code;
  }, [code]);

  /** Records the state being left behind, then applies the new one. */
  const commit = useCallback(
    (next: Graph) => {
      past.current = [...past.current.slice(-99), current.current];
      future.current = [];
      current.current = graphToMermaid(next);
      applying.current = true;
      onChange(next);
      tick((n) => n + 1);
    },
    [onChange],
  );

  const step = useCallback(
    (from: React.RefObject<string[]>, to: React.RefObject<string[]>) => {
      const target = from.current[from.current.length - 1];
      if (target === undefined) return;

      from.current = from.current.slice(0, -1);
      to.current = [...to.current, current.current];

      const restored = mermaidToGraph(target);
      if (!restored) return;

      current.current = target;
      applying.current = true;
      onChange(restored);
      tick((n) => n + 1);
    },
    [onChange],
  );

  return {
    commit,
    undo: useCallback(() => step(past, future), [step]),
    redo: useCallback(() => step(future, past), [step]),
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

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
  /**
   * Everything currently selected, by id — nodes and edges together.
   *
   * A set rather than one id because a diagram is edited in groups: three boxes
   * moved together, a branch deleted, half a flowchart nudged left to make
   * room. With a single selection each of those is one careful drag per box,
   * which is why the canvas felt like a form and not like a drawing tool.
   */
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [editingLabel, setEditingLabel] = useState<string | null>(null);

  const history = useGraphHistory(graph, onChange);
  const { commit } = history;

  /**
   * Whether the space bar is down, which turns a drag into a pan.
   *
   * A ref rather than state: it is read inside a pointer handler and changing
   * it must not re-render the canvas, which would be a full repaint every time
   * somebody rests a thumb on the space bar.
   */
  const spaceHeld = useRef(false);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.isContentEditable) return;
      spaceHeld.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceHeld.current = false;
    };
    const blur = () => {
      spaceHeld.current = false;
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    // Tabbing away mid-hold would otherwise leave the canvas stuck in pan mode.
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  /** The single selected thing, when there is exactly one. */
  const only = selection.size === 1 ? [...selection][0]! : null;

  const selectOne = useCallback((id: string | null) => {
    setSelection(id === null ? new Set() : new Set([id]));
  }, []);

  /** Shift-click adds to or removes from the selection, as everywhere else. */
  const toggleSelected = useCallback((id: string, additive: boolean) => {
    setSelection((current) => {
      if (!additive) return current.has(id) && current.size === 1 ? current : new Set([id]);

      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
      } else if (drag.kind === "marquee") {
        setDrag({ ...drag, to: toWorld(event) });
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

      // Commit happens here, once, rather than on every frame — and from the
      // release point rather than from `drag.preview`.
      //
      // `preview` and `moved` are only ever written inside the animation
      // frame, and the frame this very handler just cancelled is usually the
      // one that would have written them. A drag completed inside a single
      // frame — a quick flick, a fast mouse, a synthetic event with no
      // intermediate moves — therefore ended with `moved` still false and the
      // node snapped back to where it started, having visibly followed the
      // cursor the whole way. The marquee branch below already worked this
      // out; the two branches that move things did not.
      if (drag.kind === "move") {
        const origin = graph.nodes.find((node) => node.id === drag.nodeId);
        const to = origin
          ? resolveDrop({
              world: toWorld(event),
              grab: { x: drag.grabX, y: drag.grabY },
              origin,
              freeform: event.altKey,
              snap,
            })
          : null;

        if (origin && to) {
          // The whole selection moves with the node being dragged.
          const together = [...selection].filter((id) =>
            graph.nodes.some((node) => node.id === id),
          );

          commit(
            together.length > 1 && together.includes(drag.nodeId)
              ? moveNodes(graph, together, to.x - origin.x, to.y - origin.y)
              : updateNode(graph, drag.nodeId, { x: to.x, y: to.y }),
          );
        }
      } else if (drag.kind === "connect") {
        const world = toWorld(event);
        const target = nodeAt(graph, world);

        if (target && target.id !== drag.fromId) {
          commit(addEdge(graph, drag.fromId, target.id, DEFAULT_EDGE_STYLE[graph.kind]));
        } else if (!target) {
          // Dropping an arrow on empty space creates the node it was reaching
          // for. Otherwise every new step is add-then-drag-then-connect, and
          // the arrow you already drew is thrown away.
          const shape = defaultShapeFor(graph.kind);
          const size = sizeOf({ shape, label: SHAPE_LABELS[shape] });
          const id = nextNodeId(graph);
          const placed = addNode(graph, {
            id,
            label: SHAPE_LABELS[shape],
            shape,
            x: snap(world.x - size.width / 2),
            y: snap(world.y - size.height / 2),
          });

          commit(addEdge(placed, drag.fromId, id, DEFAULT_EDGE_STYLE[graph.kind]));
          selectOne(id);
          setEditingLabel(id);
        }
      }

      if (drag.kind === "marquee") {
        // The release point, not the last move we happened to see. A drag fast
        // enough to outrun the pointermove stream — or one delivered without
        // intermediate moves at all — would otherwise select against a band
        // that stopped updating somewhere in the middle.
        const to = toWorld(event);

        // Everything the band touches, rather than only what it wholly
        // encloses: on a canvas of 150px-wide boxes, "fully contained" means
        // dragging a band larger than the thing you are trying to select.
        const box = {
          left: Math.min(drag.from.x, to.x),
          right: Math.max(drag.from.x, to.x),
          top: Math.min(drag.from.y, to.y),
          bottom: Math.max(drag.from.y, to.y),
        };

        const caught = graph.nodes
          .filter((node) => {
            const size = sizeOf(node);
            return (
              node.x < box.right &&
              node.x + size.width > box.left &&
              node.y < box.bottom &&
              node.y + size.height > box.top
            );
          })
          .map((node) => node.id);

        setSelection((previous) => {
          const next = drag.additive ? new Set(previous) : new Set<string>();
          for (const id of caught) next.add(id);
          return next;
        });
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
    // `selection` and `commit` are read inside `onUp`; without them here a
    // drag begun before a selection change committed against the stale set.
  }, [drag, graph, onChange, toWorld, zoom, selection, commit]);

  // ── Zoom ────────────────────────────────────────────────────────────────
  // Anchored at the cursor, so the point under the pointer stays put — the
  // thing that makes zooming feel like a map rather than a slider.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      touched.current = true;

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
    // The reserve is spent at the bottom: centring the taller block leaves the
    // content sitting above the hint strip rather than behind it.
    const contentHeight = maxY - minY + FIT_PADDING * 2 + HINT_STRIP;
    // Never magnified past life size. Fitting a two-box diagram to the pane
    // zoomed it to 250%, which turned two small boxes into two slabs wider
    // than the canvas — "fit" should mean everything is visible, not that the
    // content is stretched to fill the space it happens to have.
    const next = clamp(
      Math.min(viewport.width / contentWidth, viewport.height / contentHeight, 1),
      MIN_ZOOM,
      MAX_ZOOM,
    );

    setZoom(next);
    setPan({
      x: minX - FIT_PADDING + (contentWidth - viewport.width / next) / 2,
      y: minY - FIT_PADDING + (contentHeight - viewport.height / next) / 2,
    });
  }, [graph.nodes, viewport]);

  /**
   * Whether the reader has taken control of the view by panning or zooming.
   *
   * Once they have, the canvas must never move on its own again — nothing is
   * more disorienting than a view that re-centres itself while being used.
   */
  const touched = useRef(false);
  const markTouched = useCallback(() => {
    touched.current = true;
  }, []);

  /**
   * Frame the diagram until the reader takes over.
   *
   * This used to fire exactly once, against whatever the pane happened to
   * measure at that instant — which, while a dialog is still settling, is not
   * the size it ends up. A canvas framed for a 700px pane and then resized to
   * 292px left every node outside the viewBox: an empty grid, with the diagram
   * parked somewhere off-screen and nothing on screen to say so.
   *
   * Re-framing on each new viewport size fixes that, and keying on the size
   * means a pane that is not changing shape does not re-frame under a reader
   * who is placing boxes.
   */
  const framedFor = useRef("");
  useEffect(() => {
    if (touched.current || graph.nodes.length === 0) return;
    if (viewport.width <= 1 || viewport.height <= 1) return;

    const signature = `${Math.round(viewport.width)}x${Math.round(viewport.height)}`;
    if (framedFor.current === signature) return;

    framedFor.current = signature;
    fit();
  }, [graph.nodes.length, viewport.width, viewport.height, fit]);

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
      const size = sizeOf({ shape, label: isMarker(shape) ? "" : SHAPE_LABELS[shape] });
      const spot =
        centre ??
        // Added from the palette rather than by double-clicking a spot, so the
        // canvas has to choose one. It used to cascade by 24px per node, which
        // on a 150×56 box means the second one lands almost exactly on the
        // first: clicking two shapes in a row looked like it had added one.
        freeSpotNear(
          { x: view.x + view.width / 2, y: view.y + view.height / 2 },
          size,
          graph.nodes,
        );
      const x = spot.x - size.width / 2;
      const y = spot.y - size.height / 2;

      commit(
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

      selectOne(id);
      if (!isMarker(shape)) setEditingLabel(id);
      return id;
    },
    [graph, onChange, view],
  );

  /** Adds a node already wired to the current selection, for keyboard flow. */
  const createConnectedNode = useCallback(() => {
    const source = graph.nodes.find((n) => n.id === only);
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

    commit(addEdge(placed, source.id, id, DEFAULT_EDGE_STYLE[graph.kind]));
    selectOne(id);
    setEditingLabel(id);
  }, [graph, commit, only, selectOne]);

  /**
   * Straightens the diagram into layers that follow its own arrows.
   *
   * The re-frame is deferred to the effect below rather than done here: the
   * layout has not been applied yet at this point, so fitting now frames where
   * the diagram *was* — which is how tidying left everything neatly arranged
   * just off the bottom of the canvas.
   */
  const refitWanted = useRef(false);

  const tidy = useCallback(() => {
    refitWanted.current = true;
    commit(tidyLayout(graph));
  }, [graph, commit]);

  useEffect(() => {
    if (!refitWanted.current) return;
    refitWanted.current = false;
    fit();
  }, [graph.nodes, fit]);

  const duplicateSelection = useCallback(() => {
    const nodes = [...selection].filter((id) => graph.nodes.some((node) => node.id === id));
    if (nodes.length === 0) return;

    const next = duplicateNodes(graph, nodes);
    commit(next);
    // Select the copies, so the next drag moves what was just made rather than
    // the originals sitting underneath them.
    setSelection(new Set(next.nodes.slice(graph.nodes.length).map((node) => node.id)));
  }, [graph, commit, selection]);

  const deleteSelection = useCallback(() => {
    if (selection.size === 0) return;
    commit(removeMany(graph, [...selection]));
    setSelection(new Set());
  }, [graph, commit, selection]);

  /**
   * Undo and redo, re-framing only when the step left nothing on screen.
   *
   * A step can restore positions the current view was never framed for: undo
   * a "Tidy up" and the boxes go back where they were, which — after the
   * tidy's own re-frame followed them across the canvas — is off the edge of
   * it. What you saw was an empty grid and no clue the diagram still existed.
   * Moving the view on *every* undo would be worse, so it moves only when
   * there is otherwise nothing to look at.
   */
  const ensureVisible = useRef(false);

  const undo = useCallback(() => {
    ensureVisible.current = true;
    history.undo();
  }, [history]);

  const redo = useCallback(() => {
    ensureVisible.current = true;
    history.redo();
  }, [history]);

  useEffect(() => {
    if (!ensureVisible.current) return;
    ensureVisible.current = false;
    if (graph.nodes.length === 0) return;

    const onScreen = graph.nodes.some((node) => {
      const { width, height } = sizeOf(node);
      return (
        node.x < view.x + view.width &&
        node.x + width > view.x &&
        node.y < view.y + view.height &&
        node.y + height > view.y
      );
    });

    if (!onScreen) fit();
  }, [graph.nodes, view, fit]);

  // ── Keyboard ────────────────────────────────────────────────────────────
  // Declared after the actions it calls, so the dependency array is not
  // evaluated before those consts exist.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const accel = event.metaKey || event.ctrlKey;

      if (accel && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (accel && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (accel && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelection();
        return;
      }

      if (accel && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelection(new Set(graph.nodes.map((node) => node.id)));
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && !editingLabel) {
        if (selection.size === 0) return;
        event.preventDefault();
        deleteSelection();
        return;
      }

      // Nudging is what makes a diagram line up. A bare arrow moves by the
      // grid; shift moves by ten of them, for crossing real distance.
      if (event.key.startsWith("Arrow") && selection.size > 0 && !editingLabel) {
        const nodes = [...selection].filter((id) => graph.nodes.some((node) => node.id === id));
        if (nodes.length === 0) return;

        event.preventDefault();
        const step = event.shiftKey ? GRID * 10 : GRID;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        commit(moveNodes(graph, nodes, dx, dy));
        return;
      }

      // Enter renames, Tab continues the chain: the two things you do over and
      // over while sketching, neither of which should need the mouse.
      if (event.key === "Enter" && only && !editingLabel) {
        const node = graph.nodes.find((n) => n.id === only);
        if (node && !isMarker(node.shape)) {
          event.preventDefault();
          setEditingLabel(only);
        }
        return;
      }

      if (event.key === "Tab" && only && !editingLabel) {
        if (graph.nodes.some((n) => n.id === only)) {
          event.preventDefault();
          createConnectedNode();
        }
        return;
      }

      if (event.key === "Escape") {
        setSelection(new Set());
        return;
      }

      if (event.key === "0" && accel) {
        event.preventDefault();
        fit();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    only,
    selection,
    editingLabel,
    graph,
    commit,
    undo,
    redo,
    fit,
    createConnectedNode,
    duplicateSelection,
    deleteSelection,
  ]);

  const selectedNode = graph.nodes.find((n) => n.id === only) ?? null;
  const selectedEdge = graph.edges.find((e) => e.id === only) ?? null;

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
          <div className="flex items-center rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)]">
            <ZoomButton label="Undo (⌘Z)" onClick={undo} disabled={!history.canUndo}>
              <UndoGlyph />
            </ZoomButton>
            <ZoomButton
              label="Redo (⌘⇧Z)"
              onClick={redo}
              disabled={!history.canRedo}
              className="border-l border-[var(--fl-border)]"
            >
              <UndoGlyph flipped />
            </ZoomButton>
          </div>

          <button
            type="button"
            onClick={tidy}
            disabled={graph.nodes.length === 0}
            title="Lay the diagram out in layers that follow its own arrows"
            className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2.5 py-1 text-[12.5px] text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)] disabled:opacity-40 disabled:hover:border-[var(--fl-border)] disabled:hover:text-[var(--fl-text)]"
          >
            Tidy up
          </button>

          {/* Mermaid lays out ER diagrams and mindmaps itself and ignores a
              direction, so offering one here would be a control that does
              nothing. */}
          {(graph.kind === "flowchart" || graph.kind === "state" || graph.kind === "class") && (
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
          )}

          <div className="flex items-center rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)]">
            <ZoomButton
              label="Zoom out"
              onClick={() => {
                markTouched();
                setZoom((z) => clamp(z / 1.2, MIN_ZOOM, MAX_ZOOM));
              }}
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
              onClick={() => {
                markTouched();
                setZoom((z) => clamp(z * 1.2, MIN_ZOOM, MAX_ZOOM));
              }}
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
            // Middle-click pans from anywhere; otherwise this only fires on
            // the empty canvas, because nodes and edges stop the event.
            if (event.target !== event.currentTarget && event.button !== 1) return;

            markTouched();

            setEditingLabel(null);

            // Space held, middle button, or the space bar down: pan. Anything
            // else on empty canvas draws a selection band, which is what every
            // other canvas tool does and what makes selecting six boxes one
            // gesture instead of six.
            if (event.button === 1 || spaceHeld.current) {
              setDrag({
                kind: "pan",
                originX: event.clientX,
                originY: event.clientY,
                panX: pan.x,
                panY: pan.y,
              });
              return;
            }

            const from = toWorld(event);
            if (!event.shiftKey) setSelection(new Set());
            setDrag({ kind: "marquee", from, to: from, additive: event.shiftKey });
          }}
        >
          <defs>
            {/* One set in the resting colour and one in the selection colour.
                SVG markers cannot inherit the stroke of the line they sit on in
                any browser we can rely on, so the alternative is a marker whose
                arrowhead stays grey on a selected edge. */}
            {EDGE_MARKERS.map((marker) => (
              <React.Fragment key={marker.id}>
                {renderMarker(marker, false)}
                {renderMarker(marker, true)}
              </React.Fragment>
            ))}
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
            const isSelected = selection.has(edge.id);
            const decor = edgeDecor(edge.style, edge.dashed);

            return (
              <g
                key={edge.id}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  toggleSelected(edge.id, event.shiftKey);
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
                  strokeWidth={decor.width}
                  strokeDasharray={decor.dash}
                  markerStart={markerUrl(decor.start, isSelected)}
                  markerEnd={markerUrl(decor.end, isSelected)}
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

                {/* Multiplicity sits at the end it describes, which is the only
                    place it means anything: "1" in the middle of the line
                    could belong to either side. */}
                {edge.fromCardinality && (
                  <text
                    x={start.x + (end.x - start.x) * 0.16}
                    y={start.y + (end.y - start.y) * 0.16 - 5}
                    textAnchor="middle"
                    className="fill-[var(--fl-muted)] text-[10.5px]"
                    style={{ paintOrder: "stroke", stroke: "var(--fl-bg)", strokeWidth: 4 }}
                  >
                    {edge.fromCardinality}
                  </text>
                )}
                {edge.toCardinality && (
                  <text
                    x={start.x + (end.x - start.x) * 0.84}
                    y={start.y + (end.y - start.y) * 0.84 - 5}
                    textAnchor="middle"
                    className="fill-[var(--fl-muted)] text-[10.5px]"
                    style={{ paintOrder: "stroke", stroke: "var(--fl-bg)", strokeWidth: 4 }}
                  >
                    {edge.toCardinality}
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
              selected={selection.has(node.id)}
              dragging={drag.kind === "move" && drag.nodeId === node.id}
              onPointerDown={(event) => {
                event.stopPropagation();
                markTouched();
                const world = toWorld(event);
                toggleSelected(node.id, event.shiftKey);
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

          {drag.kind === "marquee" && (
            <rect
              x={Math.min(drag.from.x, drag.to.x)}
              y={Math.min(drag.from.y, drag.to.y)}
              width={Math.abs(drag.to.x - drag.from.x)}
              height={Math.abs(drag.to.y - drag.from.y)}
              fill="var(--fl-accent)"
              fillOpacity={0.08}
              stroke="var(--fl-accent)"
              strokeWidth={1 / zoom}
              pointerEvents="none"
            />
          )}
        </svg>

        {/* Label editing uses a real input overlaid on the node, so typing
            behaves normally instead of through a fake SVG caret. Positioned in
            screen space, which is why it is outside the SVG. */}
        {editingLabel &&
          (() => {
            const node = laidOut.find((n) => n.id === editingLabel);
            if (!node) return null;

            return (
              <DraftInput
                autoFocus
                // Selected on open, so double-clicking a box and typing
                // replaces its name. Without this the caret landed at one end
                // and "Process" became "ProcessBuild step".
                onFocus={(event) => event.currentTarget.select()}
                value={node.label}
                onValueChange={(next) => onChange(updateNode(graph, node.id, { label: next }))}
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
          <span>Drag empty space to select many</span>
          <span>Space to pan</span>
          <span>Tab to continue</span>
          <span>⌘D duplicate</span>
          <span>Arrows nudge</span>
          <span>{freeform ? "Snapping off" : "Alt to disable snapping"}</span>
        </div>
      </div>

      {/* ── Inspector for the current selection ─────────────────────────── */}
      {(selectedNode || selectedEdge) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[12.5px]">
          {selectedNode && (
            <>
              <DraftInput
                value={
                  hasMembers(selectedNode.shape)
                    ? splitMembers(selectedNode.label).name
                    : selectedNode.label
                }
                onValueChange={(next) =>
                  onChange(
                    updateNode(graph, selectedNode.id, {
                      label: hasMembers(selectedNode.shape)
                        ? joinMembers(next, splitMembers(selectedNode.label).members)
                        : next,
                    }),
                  )
                }
                aria-label={hasMembers(selectedNode.shape) ? "Name" : "Node label"}
                className="w-40 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
              />

              {/* Fields and methods, one per line — the same shape as the
                  mermaid block, so what is typed here is what is written. */}
              {hasMembers(selectedNode.shape) && (
                <DraftInput
                  value={splitMembers(selectedNode.label).members.join("; ")}
                  placeholder={
                    graph.kind === "er" ? "string name; int age" : "+string id; +save() void"
                  }
                  onValueChange={(next) =>
                    onChange(
                      updateNode(graph, selectedNode.id, {
                        label: joinMembers(
                          splitMembers(selectedNode.label).name,
                          next
                            .split(";")
                            .map((member) => member.trim())
                            .filter((member) => member !== ""),
                        ),
                      }),
                    )
                  }
                  aria-label={graph.kind === "er" ? "Attributes" : "Members"}
                  className="w-64 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 font-mono text-[11.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
                />
              )}
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
                  commit(removeNode(graph, selectedNode.id));
                  setSelection(new Set());
                }}
                className="ml-auto rounded-lg px-2 py-1 text-[var(--fl-danger)] transition-colors hover:bg-[var(--fl-elevated)]"
              >
                Delete node
              </button>
            </>
          )}

          {selectedEdge && (
            <>
              <DraftInput
                value={selectedEdge.label ?? ""}
                placeholder="Arrow label"
                onValueChange={(next) =>
                  onChange({
                    ...graph,
                    edges: graph.edges.map((e) =>
                      e.id === selectedEdge.id ? { ...e, label: next } : e,
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
                {EDGE_STYLES_FOR_KIND[graph.kind].map((style) => (
                  <option key={style} value={style}>
                    {EDGE_LABELS[style]}
                  </option>
                ))}
              </select>
              {/* The whole reason to draw a class or ER diagram rather than
                  list the types is to say how many of each there are. */}
              {(graph.kind === "class" || graph.kind === "er") && (
                <>
                  <DraftInput
                    value={selectedEdge.fromCardinality ?? ""}
                    placeholder="1"
                    onValueChange={(next) =>
                      onChange(updateEdge(graph, selectedEdge.id, { fromCardinality: next }))
                    }
                    aria-label="Multiplicity at the source"
                    className="w-14 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-center text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
                  />
                  <span className="text-[var(--fl-muted)]">→</span>
                  <DraftInput
                    value={selectedEdge.toCardinality ?? ""}
                    placeholder="*"
                    onValueChange={(next) =>
                      onChange(updateEdge(graph, selectedEdge.id, { toCardinality: next }))
                    }
                    aria-label="Multiplicity at the target"
                    className="w-14 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-center text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
                  />
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  commit(removeEdge(graph, selectedEdge.id));
                  setSelection(new Set());
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

// ─── Edge decoration ────────────────────────────────────────────────────────

/**
 * The ends and dashes each relationship is drawn with.
 *
 * A flowchart arrow, an inheritance triangle and a crow's foot are not one
 * shape in three colours — they are what the diagram *says*, and drawing an ER
 * "many" as a plain arrowhead loses the only information the relationship
 * carries. Each dialect's vocabulary gets its own ends.
 */
interface EdgeDecor {
  /** Marker at the source end, or null. */
  start: string | null;
  /** Marker at the target end, or null. */
  end: string | null;
  dash: string | undefined;
  width: number;
}

function edgeDecor(style: EdgeStyle, dashed?: boolean): EdgeDecor {
  const base = { start: null, end: null, dash: undefined, width: 1.8 } as EdgeDecor;

  switch (style) {
    case "open":
      return base;
    case "dotted":
      return { ...base, end: "arrow", dash: "5 4" };
    case "thick":
      return { ...base, end: "arrow", width: 3 };

    // Class relationships. Composition and aggregation put their diamond at
    // the owning end, which is the source.
    case "inherit":
      return { ...base, end: "triangle" };
    case "compose":
      return { ...base, start: "diamond-filled" };
    case "aggregate":
      return { ...base, start: "diamond-open" };
    case "depend":
      return { ...base, end: "arrow", dash: "4 4" };
    case "associate":
      return { ...base, end: "arrow" };

    // Entity relationships, drawn as crow's-foot notation: a bar is "one", a
    // foot is "many", at whichever end it applies to.
    case "one-one":
      return { ...base, start: "bar", end: "bar", ...(dashed ? { dash: "5 4" } : {}) };
    case "one-many":
      return { ...base, start: "bar", end: "crow", ...(dashed ? { dash: "5 4" } : {}) };
    case "many-one":
      return { ...base, start: "crow", end: "bar", ...(dashed ? { dash: "5 4" } : {}) };
    case "many-many":
      return { ...base, start: "crow", end: "crow", ...(dashed ? { dash: "5 4" } : {}) };

    // A mindmap branch is a line. Mermaid draws no arrowheads on one, and an
    // arrow would suggest a direction the diagram does not mean.
    case "branch":
      return base;

    case "arrow":
    default:
      return { ...base, end: "arrow" };
  }
}

interface MarkerSpec {
  id: string;
  /** SVG path, drawn in a 0 0 12 12 viewBox pointing right. */
  path: string;
  /** Where the line should stop, along the marker's x axis. */
  refX: number;
  filled: boolean;
  size: number;
}

const EDGE_MARKERS: MarkerSpec[] = [
  { id: "arrow", path: "M 0 1 L 11 6 L 0 11 z", refX: 10, filled: true, size: 7 },
  { id: "triangle", path: "M 0 0 L 12 6 L 0 12 z", refX: 11, filled: false, size: 9 },
  { id: "diamond-filled", path: "M 0 6 L 6 1 L 12 6 L 6 11 z", refX: 1, filled: true, size: 9 },
  { id: "diamond-open", path: "M 0 6 L 6 1 L 12 6 L 6 11 z", refX: 1, filled: false, size: 9 },
  // Two bars: mermaid's "exactly one".
  { id: "bar", path: "M 4 1 L 4 11 M 8 1 L 8 11", refX: 9, filled: false, size: 9 },
  // The crow's foot: three lines fanning back from the entity.
  { id: "crow", path: "M 12 6 L 2 1 M 12 6 L 2 6 M 12 6 L 2 11", refX: 11, filled: false, size: 9 },
];

function renderMarker(spec: MarkerSpec, active: boolean) {
  const colour = active ? "var(--fl-accent)" : "var(--fl-border-strong)";

  return (
    <marker
      id={active ? `fl-${spec.id}-active` : `fl-${spec.id}`}
      viewBox="0 0 12 12"
      refX={spec.refX}
      refY="6"
      markerWidth={spec.size}
      markerHeight={spec.size}
      orient="auto-start-reverse"
    >
      <path
        d={spec.path}
        fill={spec.filled ? colour : "var(--fl-bg)"}
        stroke={colour}
        strokeWidth={1.4}
      />
    </marker>
  );
}

function markerUrl(id: string | null, active: boolean): string | undefined {
  if (!id) return undefined;
  return active ? `url(#fl-${id}-active)` : `url(#fl-${id})`;
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
  const boxed = hasMembers(node.shape);
  const { name, members } = splitMembers(node.label);

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className={dragging ? "cursor-grabbing" : "cursor-move"}
      opacity={dragging ? 0.85 : 1}
    >
      {renderShape(node.shape, stroke, strokeWidth, "var(--fl-surface)", node.label)}

      {/* A class or entity is a name and a list, so it is laid out as one
          rather than having its whole label crushed onto a single line. */}
      {boxed && (
        <g className="pointer-events-none select-none">
          <text
            x={width / 2}
            y={16}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-[var(--fl-text)] text-[13px] font-semibold"
          >
            {truncate(name, 26)}
          </text>
          {members.map((member, index) => (
            <text
              key={`${member}-${index}`}
              x={10}
              y={MEMBER_HEADER + index * MEMBER_HEIGHT + 4}
              dominantBaseline="central"
              className="fill-[var(--fl-muted)] font-mono text-[11px]"
            >
              {truncate(member, 34)}
            </text>
          ))}
        </g>
      )}

      {/* Markers are drawn, not labelled. A choice diamond is small, so its
          label sits underneath rather than being squeezed inside. */}
      {!marker && !boxed && (
        <text
          x={width / 2}
          y={node.shape === "choice" ? height + 14 : height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="pointer-events-none select-none fill-[var(--fl-text)] text-[13px]"
        >
          {truncate(node.label, fittingChars(node.shape, width))}
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
function renderShape(
  shape: NodeShape,
  stroke: string,
  strokeWidth: number,
  fill: string,
  label = "",
) {
  const { width: w, height: h } = sizeOf({ shape, label });
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
    // A class or entity is a titled box: the rule under the name is what makes
    // it read as a type with fields rather than as a paragraph in a rectangle.
    case "class":
    case "entity": {
      const { members } = splitMembers(label);
      return (
        <g>
          <rect width={w} height={h} rx={4} {...common} />
          {members.length > 0 && (
            <line
              x1={0}
              y1={MEMBER_HEADER - 8}
              x2={w}
              y2={MEMBER_HEADER - 8}
              stroke={stroke}
              strokeWidth={1}
            />
          )}
        </g>
      );
    }

    // Mindmap branches. Mermaid draws its own shapes from the delimiters, so
    // these are the canvas showing which delimiter a node will be written with.
    case "mind-round":
      return <rect width={w} height={h} rx={h / 2} {...common} />;
    case "mind-square":
      return <rect width={w} height={h} rx={3} {...common} />;
    case "mind-hexagon":
      return (
        <polygon
          points={`18,0 ${w - 18},0 ${w},${h / 2} ${w - 18},${h} 18,${h} 0,${h / 2}`}
          {...common}
        />
      );
    case "mind-circle":
      return <circle cx={w / 2} cy={h / 2} r={w / 2 - 2} {...common} />;
    case "mind-bang":
      return <polygon points={burstPoints(w, h, 12)} {...common} />;
    case "mind-cloud":
      return <path d={cloudPath(w, h)} {...common} />;

    case "rect":
    default:
      return <rect width={w} height={h} rx={3} {...common} />;
  }
}

/** A star-ish outline for mermaid's `))burst((` shape. */
function burstPoints(w: number, h: number, spikes: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) / 2 - 1;
  const inner = outer * 0.78;

  return Array.from({ length: spikes * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI * index) / spikes - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

/** Four overlapping arcs, for mermaid's `)cloud(` shape. */
function cloudPath(w: number, h: number): string {
  const r = h / 2;
  return [
    `M ${r},${h}`,
    `A ${r},${r} 0 0 1 ${r},0`,
    `L ${w - r},0`,
    `A ${r},${r} 0 0 1 ${w - r},${h}`,
    "Z",
  ].join(" ");
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
      ) : shape === "class" || shape === "entity" ? (
        <g {...common}>
          <rect x="1" y="1" width="18" height="12" rx="1.5" />
          <path d="M1 5.5h18" />
        </g>
      ) : shape === "mind-circle" ? (
        <circle cx="10" cy="7" r="6" {...common} />
      ) : shape === "mind-round" ? (
        <rect x="1" y="2" width="18" height="10" rx="5" {...common} />
      ) : shape === "mind-hexagon" ? (
        <polygon points="5,1 15,1 19,7 15,13 5,13 1,7" {...common} />
      ) : shape === "mind-bang" ? (
        <polygon
          points="10,1 12,5 16,3.5 15,8 19,9 15,10.5 16,13 12,11.5 10,13.5 8,11.5 4,13 5,10.5 1,9 5,8 4,3.5 8,5"
          {...common}
        />
      ) : shape === "mind-cloud" ? (
        <path d="M6 12a5 5 0 0 1 0-10h8a5 5 0 0 1 0 10z" {...common} />
      ) : (
        <rect x="1" y="1" width="18" height="12" rx="1.5" {...common} />
      )}
    </svg>
  );
}

function ZoomButton({
  label,
  onClick,
  disabled = false,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-[26px] w-8 items-center justify-center text-[13px] text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)] disabled:opacity-35 disabled:hover:text-[var(--fl-muted)] ${className}`}
    >
      {children}
    </button>
  );
}

function UndoGlyph({ flipped = false }: { flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={flipped ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M3 7h7a3.5 3.5 0 0 1 0 7H6.5" />
      <path d="M5.75 4.25 3 7l2.75 2.75" />
    </svg>
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

/**
 * How many characters fit inside a box of this width.
 *
 * This was a flat 18 for every shape, from when every box was the same 150px
 * wide. Now that a box is as wide as its label, a fixed limit truncates text
 * that has room to spare — and still overflows the shapes that have less
 * usable width than their bounding box.
 */
function fittingChars(shape: NodeShape, width: number): number {
  // A choice diamond is labelled underneath, so its own width is not the limit.
  if (shape === "choice") return 14;

  // A rhombus only offers its full width along the centre line.
  const usable = shape === "diamond" ? width * 0.72 : width - LABEL_PADDING;
  return Math.max(3, Math.floor(usable / LABEL_CHAR_WIDTH));
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
