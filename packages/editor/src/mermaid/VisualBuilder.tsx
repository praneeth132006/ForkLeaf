"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  addEdge,
  addNode,
  nextNodeId,
  removeEdge,
  removeNode,
  updateNode,
  SHAPE_LABELS,
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
const GRID = 10;

type DragState =
  | { kind: "none" }
  | { kind: "move"; nodeId: string; offsetX: number; offsetY: number; moved: boolean }
  | { kind: "connect"; fromId: string; x: number; y: number };

/**
 * Drag-and-drop diagram builder.
 *
 * Draw boxes, drag them around, pull an arrow from one to another — the mermaid
 * source is generated from the result. This is the mode for people who know
 * what the diagram should look like but not what mermaid calls it.
 *
 * The graph is owned by the parent so the source editor and this canvas stay in
 * sync: edit either one and the other follows.
 */
export function VisualBuilder({ graph, onChange }: VisualBuilderProps) {
  const canvasRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState>({ kind: "none" });
  const [selected, setSelected] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);

  /** Converts a pointer event into canvas coordinates, accounting for scroll. */
  const toCanvasPoint = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  // Pointer move/up are bound to the window so a fast drag that leaves the
  // canvas still tracks, and releasing outside still ends the drag.
  useEffect(() => {
    if (drag.kind === "none") return;

    const handleMove = (event: PointerEvent) => {
      const point = toCanvasPoint(event);

      if (drag.kind === "move") {
        onChange(
          updateNode(graph, drag.nodeId, {
            x: snap(point.x - drag.offsetX),
            y: snap(point.y - drag.offsetY),
          }),
        );
        // Distinguish a drag from a click so a plain click can still select.
        if (!drag.moved) setDrag({ ...drag, moved: true });
      } else if (drag.kind === "connect") {
        setDrag({ ...drag, x: point.x, y: point.y });
      }
    };

    const handleUp = (event: PointerEvent) => {
      if (drag.kind === "connect") {
        const target = nodeAt(graph, toCanvasPoint(event));
        if (target && target.id !== drag.fromId) {
          onChange(addEdge(graph, drag.fromId, target.id));
        }
      }
      setDrag({ kind: "none" });
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, graph, onChange, toCanvasPoint]);

  // Delete/backspace removes the selection, unless a label is being typed.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!selected || editingLabel) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      event.preventDefault();
      onChange(
        graph.nodes.some((n) => n.id === selected)
          ? removeNode(graph, selected)
          : removeEdge(graph, selected),
      );
      setSelected(null);
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected, editingLabel, graph, onChange]);

  const handleAddNode = (shape: NodeShape) => {
    const id = nextNodeId(graph);
    // Place new nodes in a readable cascade rather than stacking them.
    const offset = graph.nodes.length % 6;
    onChange(
      addNode(graph, {
        id,
        label: SHAPE_LABELS[shape],
        shape,
        x: 60 + offset * 30,
        y: 60 + offset * 40,
      }),
    );
    setSelected(id);
    setEditingLabel(id);
  };

  const selectedNode = graph.nodes.find((n) => n.id === selected) ?? null;
  const selectedEdge = graph.edges.find((e) => e.id === selected) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--fl-border)] px-3 py-2">
        <span className="mr-1 text-xs font-medium text-[var(--fl-muted)]">Add:</span>

        {(Object.keys(SHAPE_LABELS) as NodeShape[]).map((shape) => (
          <button
            key={shape}
            type="button"
            onClick={() => handleAddNode(shape)}
            title={`Add a ${SHAPE_LABELS[shape].toLowerCase()} node`}
            className="rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1 text-xs hover:border-[var(--fl-accent)]"
          >
            {SHAPE_LABELS[shape]}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--fl-muted)]">
            Layout
            <select
              value={graph.direction}
              onChange={(event) =>
                onChange({ ...graph, direction: event.target.value as Graph["direction"] })
              }
              className="rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-1.5 py-1 text-xs text-[var(--fl-text)]"
            >
              <option value="TD">Top to bottom</option>
              <option value="LR">Left to right</option>
              <option value="BT">Bottom to top</option>
              <option value="RL">Right to left</option>
            </select>
          </label>
        </div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-auto bg-[var(--fl-bg)]">
        <svg
          ref={canvasRef}
          className="h-full min-h-[400px] w-full min-w-[640px] touch-none"
          onPointerDown={(event) => {
            // Clicking empty canvas clears the selection.
            if (event.target === event.currentTarget) {
              setSelected(null);
              setEditingLabel(null);
            }
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
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fl-accent)" />
            </marker>
            <pattern id="fl-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--fl-border)" opacity="0.5" />
            </pattern>
          </defs>

          <rect width="100%" height="100%" fill="url(#fl-grid)" />

          {/* Edges are drawn first so nodes sit on top of them. */}
          {graph.edges.map((edge) => {
            const from = graph.nodes.find((n) => n.id === edge.from);
            const to = graph.nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;

            const start = anchorPoint(from, to);
            const end = anchorPoint(to, from);
            const isSelected = selected === edge.id;

            return (
              <g
                key={edge.id}
                onPointerDown={() => setSelected(edge.id)}
                className="cursor-pointer"
              >
                {/* A wide transparent stroke makes the thin line easy to click. */}
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="transparent"
                  strokeWidth={14}
                />
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={isSelected ? "var(--fl-accent)" : "var(--fl-border-strong)"}
                  strokeWidth={edge.style === "thick" ? 3 : 1.8}
                  strokeDasharray={edge.style === "dotted" ? "5 4" : undefined}
                  markerEnd={edge.style === "open" ? undefined : "url(#fl-arrow)"}
                />
                {edge.label && (
                  <text
                    x={(start.x + end.x) / 2}
                    y={(start.y + end.y) / 2 - 6}
                    textAnchor="middle"
                    className="fill-[var(--fl-text)] text-[11px]"
                    style={{ paintOrder: "stroke", stroke: "var(--fl-bg)", strokeWidth: 4 }}
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* The rubber-band line shown while dragging a new connection. */}
          {drag.kind === "connect" &&
            (() => {
              const from = graph.nodes.find((n) => n.id === drag.fromId);
              if (!from) return null;
              return (
                <line
                  x1={from.x + NODE_WIDTH / 2}
                  y1={from.y + NODE_HEIGHT / 2}
                  x2={drag.x}
                  y2={drag.y}
                  stroke="var(--fl-accent)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  pointerEvents="none"
                />
              );
            })()}

          {graph.nodes.map((node) => (
            <NodeShapeView
              key={node.id}
              node={node}
              selected={selected === node.id}
              onPointerDown={(event) => {
                const point = toCanvasPoint(event);
                setSelected(node.id);
                setDrag({
                  kind: "move",
                  nodeId: node.id,
                  offsetX: point.x - node.x,
                  offsetY: point.y - node.y,
                  moved: false,
                });
              }}
              onStartConnect={(event) => {
                event.stopPropagation();
                const point = toCanvasPoint(event);
                setDrag({ kind: "connect", fromId: node.id, x: point.x, y: point.y });
              }}
              onDoubleClick={() => setEditingLabel(node.id)}
            />
          ))}
        </svg>

        {/* Label editing uses a real input overlaid on the node, so the user
            gets normal text-editing behaviour instead of a fake SVG caret. */}
        {editingLabel &&
          (() => {
            const node = graph.nodes.find((n) => n.id === editingLabel);
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
                }}
                aria-label="Node label"
                className="absolute rounded border-2 border-[var(--fl-accent)] bg-[var(--fl-surface)] px-1 text-center text-sm text-[var(--fl-text)] outline-none"
                style={{
                  left: node.x + 8,
                  top: node.y + NODE_HEIGHT / 2 - 14,
                  width: NODE_WIDTH - 16,
                }}
              />
            );
          })()}

        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="max-w-xs text-center text-sm text-[var(--fl-muted)]">
              Add a shape from the toolbar, then drag from a node's right edge to connect it to
              another.
            </p>
          </div>
        )}
      </div>

      {/* ── Inspector for the current selection ─────────────────────────── */}
      {(selectedNode || selectedEdge) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--fl-border)] px-3 py-2 text-xs">
          {selectedNode && (
            <>
              <input
                value={selectedNode.label}
                onChange={(event) =>
                  onChange(updateNode(graph, selectedNode.id, { label: event.target.value }))
                }
                aria-label="Node label"
                className="w-40 rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1 text-[var(--fl-text)]"
              />
              <select
                value={selectedNode.shape}
                onChange={(event) =>
                  onChange(
                    updateNode(graph, selectedNode.id, { shape: event.target.value as NodeShape }),
                  )
                }
                aria-label="Node shape"
                className="rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1 text-[var(--fl-text)]"
              >
                {(Object.keys(SHAPE_LABELS) as NodeShape[]).map((shape) => (
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
                className="ml-auto rounded-md px-2 py-1 text-[var(--fl-danger)] hover:bg-[var(--fl-elevated)]"
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
                className="w-40 rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1 text-[var(--fl-text)]"
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
                className="rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1 text-[var(--fl-text)]"
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
                className="ml-auto rounded-md px-2 py-1 text-[var(--fl-danger)] hover:bg-[var(--fl-elevated)]"
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
  onPointerDown: (event: React.PointerEvent) => void;
  onStartConnect: (event: React.PointerEvent) => void;
  onDoubleClick: () => void;
}

function NodeShapeView({
  node,
  selected,
  onPointerDown,
  onStartConnect,
  onDoubleClick,
}: NodeShapeViewProps) {
  const stroke = selected ? "var(--fl-accent)" : "var(--fl-border-strong)";
  const strokeWidth = selected ? 2.5 : 1.5;
  const fill = "var(--fl-surface)";

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="cursor-move"
    >
      {renderShape(node.shape, stroke, strokeWidth, fill)}

      <text
        x={NODE_WIDTH / 2}
        y={NODE_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="pointer-events-none select-none fill-[var(--fl-text)] text-[13px]"
      >
        {truncate(node.label, 18)}
      </text>

      {/* Connection handle on the right edge. */}
      <circle
        cx={NODE_WIDTH}
        cy={NODE_HEIGHT / 2}
        r={6}
        fill="var(--fl-accent)"
        stroke="var(--fl-bg)"
        strokeWidth={2}
        className="cursor-crosshair"
        onPointerDown={onStartConnect}
      >
        <title>Drag to connect to another node</title>
      </circle>
    </g>
  );
}

/** Draws each mermaid shape as its SVG equivalent, so the canvas matches the output. */
function renderShape(shape: NodeShape, stroke: string, strokeWidth: number, fill: string) {
  const w = NODE_WIDTH;
  const h = NODE_HEIGHT;
  const common = { stroke, strokeWidth, fill };

  switch (shape) {
    case "round":
      return <rect width={w} height={h} rx={10} {...common} />;
    case "stadium":
      return <rect width={w} height={h} rx={h / 2} {...common} />;
    case "circle":
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
    case "diamond":
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
    case "rect":
    default:
      return <rect width={w} height={h} rx={3} {...common} />;
  }
}

// ─── Geometry ───────────────────────────────────────────────────────────────

/** Where an edge should meet a node: on the border, pointing at the other node. */
function anchorPoint(node: GraphNode, toward: GraphNode): { x: number; y: number } {
  const cx = node.x + NODE_WIDTH / 2;
  const cy = node.y + NODE_HEIGHT / 2;
  const tx = toward.x + NODE_WIDTH / 2;
  const ty = toward.y + NODE_HEIGHT / 2;

  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  // Scale the direction vector until it hits the box edge, whichever axis
  // it crosses first.
  const scaleX = dx === 0 ? Infinity : NODE_WIDTH / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : NODE_HEIGHT / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return { x: cx + dx * scale, y: cy + dy * scale };
}

function nodeAt(graph: Graph, point: { x: number; y: number }): GraphNode | null {
  // Reverse order so the topmost node wins when two overlap.
  for (let i = graph.nodes.length - 1; i >= 0; i -= 1) {
    const node = graph.nodes[i]!;
    if (
      point.x >= node.x &&
      point.x <= node.x + NODE_WIDTH &&
      point.y >= node.y &&
      point.y <= node.y + NODE_HEIGHT
    ) {
      return node;
    }
  }
  return null;
}

function snap(value: number): number {
  return Math.max(0, Math.round(value / GRID) * GRID);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
