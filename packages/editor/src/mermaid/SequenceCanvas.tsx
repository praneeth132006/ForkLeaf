"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMessage,
  addParticipant,
  moveMessage,
  moveParticipant,
  nextParticipantId,
  removeMessage,
  removeParticipant,
  updateMessage,
  updateParticipant,
  ARROW_LABELS,
  type MessageArrow,
  type SequenceDiagram,
} from "@forkleaf/diagrams";
import { DraftInput } from "./DraftInput";

export interface SequenceCanvasProps {
  diagram: SequenceDiagram;
  onChange: (next: SequenceDiagram) => void;
}

/**
 * The sequence-diagram canvas.
 *
 * A sequence diagram has two axes that mean different things — who is involved
 * runs across, when runs down — so it gets a canvas that works the same way,
 * rather than being forced onto the free-floating one the other diagram types
 * share. Participants are columns you drag left and right; messages are rows
 * you drag up and down, and dragging a row is what changes the order things
 * happen in, which is the only thing a sequence diagram is really saying.
 *
 * Drawing a message is the same gesture as anywhere else: press on one lifeline
 * and release on another.
 */

/** Column width. Wide enough for a service name without truncation. */
const COLUMN = 168;
/** Vertical distance between messages. */
const ROW = 54;
/** Height of the participant heads at the top. */
const HEAD = 62;
/** Space above the first message. */
const TOP_GAP = 26;
const SIDE_GAP = 40;

type Drag =
  | { kind: "none" }
  /** Drawing a new message from a lifeline. */
  | { kind: "message"; from: string; row: number; cursor: { x: number; y: number } }
  /** Moving a participant to another column. */
  | { kind: "participant"; id: string; toIndex: number }
  /** Moving a message up or down the order. */
  | { kind: "reorder"; id: string; toIndex: number };

export function SequenceCanvas({ diagram, onChange }: SequenceCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>({ kind: "none" });
  const [selected, setSelected] = useState<string | null>(null);

  const { participants, messages } = diagram;

  const width = SIDE_GAP * 2 + Math.max(participants.length, 1) * COLUMN;
  const height = HEAD + TOP_GAP + Math.max(messages.length + 1, 2) * ROW;

  /** The x centre of a participant's lifeline. */
  const columnX = useCallback(
    (id: string) => {
      const index = participants.findIndex((participant) => participant.id === id);
      return SIDE_GAP + (index < 0 ? 0 : index) * COLUMN + COLUMN / 2;
    },
    [participants],
  );

  const rowY = useCallback((index: number) => HEAD + TOP_GAP + (index + 1) * ROW, []);

  /** Screen pixels → diagram coordinates. */
  const toLocal = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = hostRef.current?.getBoundingClientRect();
    const scroll = hostRef.current;
    if (!rect || !scroll) return { x: 0, y: 0 };
    return {
      x: event.clientX - rect.left + scroll.scrollLeft,
      y: event.clientY - rect.top + scroll.scrollTop,
    };
  }, []);

  /** Which participant column a point falls in, if any. */
  const participantAt = useCallback(
    (x: number): string | null => {
      const index = Math.floor((x - SIDE_GAP) / COLUMN);
      return participants[index]?.id ?? null;
    },
    [participants],
  );

  // ── Dragging ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (drag.kind === "none") return;

    const onMove = (event: PointerEvent) => {
      const point = toLocal(event);

      if (drag.kind === "message") {
        setDrag({ ...drag, cursor: point });
      } else if (drag.kind === "participant") {
        const index = Math.round((point.x - SIDE_GAP - COLUMN / 2) / COLUMN);
        setDrag({ ...drag, toIndex: Math.min(Math.max(index, 0), participants.length - 1) });
      } else if (drag.kind === "reorder") {
        const index = Math.round((point.y - HEAD - TOP_GAP) / ROW) - 1;
        setDrag({ ...drag, toIndex: Math.min(Math.max(index, 0), messages.length - 1) });
      }
    };

    const onUp = (event: PointerEvent) => {
      // Committed once, on release, rather than on every frame: each commit
      // regenerates the mermaid source and re-renders the preview.
      if (drag.kind === "message") {
        const target = participantAt(toLocal(event).x);
        if (target) {
          onChange(addMessage(diagram, { from: drag.from, to: target, label: "", arrow: "solid" }));
        }
      } else if (drag.kind === "participant") {
        onChange(moveParticipant(diagram, drag.id, drag.toIndex));
      } else if (drag.kind === "reorder") {
        onChange(moveMessage(diagram, drag.id, drag.toIndex));
      }

      setDrag({ kind: "none" });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, diagram, onChange, toLocal, participantAt, participants.length, messages.length]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const addColumn = useCallback(
    (actor: boolean) => {
      const id = nextParticipantId(diagram);
      onChange(addParticipant(diagram, { id, label: actor ? "User" : "Service", actor }));
      setSelected(id);
    },
    [diagram, onChange],
  );

  const addRow = useCallback(() => {
    const from = participants[0];
    const to = participants[1] ?? participants[0];
    if (!from || !to) return;

    const next = addMessage(diagram, { from: from.id, to: to.id, label: "", arrow: "solid" });
    onChange(next);
    setSelected(next.messages[next.messages.length - 1]?.id ?? null);
  }, [diagram, onChange, participants]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable) {
        return;
      }
      if ((event.key !== "Delete" && event.key !== "Backspace") || !selected) return;

      event.preventDefault();
      onChange(
        messages.some((message) => message.id === selected)
          ? removeMessage(diagram, selected)
          : removeParticipant(diagram, selected),
      );
      setSelected(null);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, diagram, messages, onChange]);

  const selectedMessage = useMemo(
    () => messages.find((message) => message.id === selected) ?? null,
    [messages, selected],
  );
  const selectedParticipant = useMemo(
    () => participants.find((participant) => participant.id === selected) ?? null,
    [participants, selected],
  );

  /** The order messages are drawn in, with an in-flight reorder applied. */
  const ordered = useMemo(() => {
    if (drag.kind !== "reorder") return messages;
    const from = messages.findIndex((message) => message.id === drag.id);
    if (from < 0) return messages;

    const next = [...messages];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(drag.toIndex, 0, moved);
    return next;
  }, [messages, drag]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2">
        <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--fl-muted)]">
          Add
        </span>

        <ToolButton onClick={() => addColumn(true)} title="Add a person to the diagram">
          <ActorGlyph />
          Person
        </ToolButton>
        <ToolButton onClick={() => addColumn(false)} title="Add a service or component">
          <BoxGlyph />
          Service
        </ToolButton>
        <ToolButton
          onClick={addRow}
          title="Add a message. Or drag from one lifeline onto another."
          disabled={participants.length === 0}
        >
          <ArrowGlyph />
          Message
        </ToolButton>

        <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-[var(--fl-muted)]">
          <input
            type="checkbox"
            checked={diagram.autonumber}
            onChange={(event) => onChange({ ...diagram, autonumber: event.target.checked })}
            className="accent-[var(--fl-accent)]"
          />
          Number the steps
        </label>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div ref={hostRef} className="min-h-0 flex-1 overflow-auto bg-[var(--fl-bg)]">
        {participants.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-8 text-center">
            <p className="text-[14px] font-medium text-[var(--fl-text)]">Empty canvas</p>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
              Add the people and services involved, then drag from one lifeline onto another to send
              a message between them.
            </p>
          </div>
        ) : (
          <svg width={width} height={height} className="select-none">
            {/* Lifelines first, so everything else sits on top of them. */}
            {participants.map((participant) => {
              const x = columnX(participant.id);
              const isSelected = selected === participant.id;
              const shifting = drag.kind === "participant" && drag.id === participant.id;

              return (
                <g key={participant.id} opacity={shifting ? 0.5 : 1}>
                  <line
                    x1={x}
                    y1={HEAD}
                    x2={x}
                    y2={height - 12}
                    stroke="var(--fl-border-strong)"
                    strokeWidth={1.2}
                    strokeDasharray="4 5"
                  />

                  {/* A wide invisible band, so a message can be started by
                      pressing anywhere down the lifeline rather than on a
                      one-pixel dashed rule. */}
                  <rect
                    x={x - COLUMN / 2 + 8}
                    y={HEAD}
                    width={COLUMN - 16}
                    height={height - HEAD - 12}
                    fill="transparent"
                    className="cursor-crosshair"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      const point = toLocal(event);
                      setDrag({ kind: "message", from: participant.id, row: 0, cursor: point });
                    }}
                  />

                  <ParticipantHead
                    participant={participant}
                    x={x}
                    selected={isSelected}
                    onSelect={() => setSelected(participant.id)}
                    onDragStart={() =>
                      setDrag({
                        kind: "participant",
                        id: participant.id,
                        toIndex: participants.indexOf(participant),
                      })
                    }
                  />
                </g>
              );
            })}

            {/* Messages, in order down the page. */}
            {ordered.map((message, index) => {
              const y = rowY(index);
              const fromX = columnX(message.from);
              const toX = columnX(message.to);
              const isSelected = selected === message.id;
              const self = message.from === message.to;

              return (
                <g
                  key={message.id}
                  className="cursor-pointer"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelected(message.id);
                    setDrag({ kind: "reorder", id: message.id, toIndex: index });
                  }}
                >
                  {/* A generous transparent band makes the row easy to grab. */}
                  <rect
                    x={0}
                    y={y - ROW / 2}
                    width={width}
                    height={ROW}
                    fill={isSelected ? "var(--fl-accent-soft)" : "transparent"}
                  />

                  {diagram.autonumber && (
                    <text
                      x={14}
                      y={y}
                      dominantBaseline="central"
                      className="fill-[var(--fl-muted)] font-mono text-[11px]"
                    >
                      {index + 1}
                    </text>
                  )}

                  {self ? (
                    // A message to itself loops out and back, the way mermaid
                    // draws it — a straight line would be invisible.
                    <path
                      d={`M ${fromX} ${y - 12} L ${fromX + 46} ${y - 12} L ${fromX + 46} ${y + 12} L ${fromX + 4} ${y + 12}`}
                      fill="none"
                      stroke={isSelected ? "var(--fl-accent)" : "var(--fl-border-strong)"}
                      strokeWidth={1.8}
                      strokeDasharray={dashFor(message.arrow)}
                      markerEnd={isSelected ? "url(#seq-head-active)" : "url(#seq-head)"}
                    />
                  ) : (
                    <line
                      x1={fromX}
                      y1={y}
                      x2={toX}
                      y2={y}
                      stroke={isSelected ? "var(--fl-accent)" : "var(--fl-border-strong)"}
                      strokeWidth={1.8}
                      strokeDasharray={dashFor(message.arrow)}
                      markerEnd={isSelected ? "url(#seq-head-active)" : "url(#seq-head)"}
                    />
                  )}

                  <text
                    x={self ? fromX + 54 : (fromX + toX) / 2}
                    y={y - 9}
                    textAnchor={self ? "start" : "middle"}
                    className={`text-[12px] ${
                      message.label ? "fill-[var(--fl-text)]" : "fill-[var(--fl-muted)] italic"
                    }`}
                    style={{ paintOrder: "stroke", stroke: "var(--fl-bg)", strokeWidth: 5 }}
                  >
                    {message.label || "unnamed"}
                  </text>
                </g>
              );
            })}

            {/* The rubber band while a message is being drawn. */}
            {drag.kind === "message" && (
              <line
                x1={columnX(drag.from)}
                y1={drag.cursor.y}
                x2={drag.cursor.x}
                y2={drag.cursor.y}
                stroke="var(--fl-accent)"
                strokeWidth={1.8}
                strokeDasharray="4 4"
                markerEnd="url(#seq-head-active)"
              />
            )}

            <defs>
              <marker
                id="seq-head"
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
                id="seq-head-active"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fl-accent)" />
              </marker>
            </defs>
          </svg>
        )}
      </div>

      {/* ── Hints ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 border-t border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-1.5 text-[11.5px] text-[var(--fl-muted)]">
        <span>Drag a lifeline onto another to send a message</span>
        <span>Drag a message up or down to reorder it</span>
        <span>Drag a heading sideways to move the column</span>
      </div>

      {/* ── Inspector ───────────────────────────────────────────────────── */}
      {(selectedMessage || selectedParticipant) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[12.5px]">
          {selectedParticipant && (
            <>
              <DraftInput
                value={selectedParticipant.label}
                onValueChange={(next) =>
                  onChange(updateParticipant(diagram, selectedParticipant.id, { label: next }))
                }
                aria-label="Participant name"
                className="w-48 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
              />
              <label className="flex items-center gap-1.5 text-[var(--fl-muted)]">
                <input
                  type="checkbox"
                  checked={selectedParticipant.actor}
                  onChange={(event) =>
                    onChange(
                      updateParticipant(diagram, selectedParticipant.id, {
                        actor: event.target.checked,
                      }),
                    )
                  }
                  className="accent-[var(--fl-accent)]"
                />
                A person, not a service
              </label>
              <button
                type="button"
                onClick={() => {
                  onChange(removeParticipant(diagram, selectedParticipant.id));
                  setSelected(null);
                }}
                className="ml-auto rounded-lg px-2 py-1 text-[var(--fl-danger)] transition-colors hover:bg-[var(--fl-elevated)]"
              >
                Delete participant
              </button>
            </>
          )}

          {selectedMessage && (
            <>
              <DraftInput
                value={selectedMessage.label}
                placeholder="What is being sent"
                onValueChange={(next) =>
                  onChange(updateMessage(diagram, selectedMessage.id, { label: next }))
                }
                aria-label="Message"
                className="w-56 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
              />
              <select
                value={selectedMessage.arrow}
                onChange={(event) =>
                  onChange(
                    updateMessage(diagram, selectedMessage.id, {
                      arrow: event.target.value as MessageArrow,
                    }),
                  )
                }
                aria-label="Arrow style"
                className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[var(--fl-text)]"
              >
                {(Object.keys(ARROW_LABELS) as MessageArrow[]).map((arrow) => (
                  <option key={arrow} value={arrow}>
                    {ARROW_LABELS[arrow]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  onChange(removeMessage(diagram, selectedMessage.id));
                  setSelected(null);
                }}
                className="ml-auto rounded-lg px-2 py-1 text-[var(--fl-danger)] transition-colors hover:bg-[var(--fl-elevated)]"
              >
                Delete message
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function ParticipantHead({
  participant,
  x,
  selected,
  onSelect,
  onDragStart,
}: {
  participant: { id: string; label: string; actor: boolean };
  x: number;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
}) {
  const stroke = selected ? "var(--fl-accent)" : "var(--fl-border-strong)";
  const boxWidth = COLUMN - 40;

  return (
    <g
      className="cursor-move"
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect();
        onDragStart();
      }}
    >
      {participant.actor ? (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <circle cx={x} cy={16} r={7} />
          <path d={`M ${x} 23 v 13 M ${x - 9} 28 h 18 M ${x} 36 l -7 8 M ${x} 36 l 7 8`} />
        </g>
      ) : (
        <rect
          x={x - boxWidth / 2}
          y={8}
          width={boxWidth}
          height={34}
          rx={4}
          fill="var(--fl-surface)"
          stroke={stroke}
          strokeWidth={selected ? 2.2 : 1.5}
        />
      )}

      <text
        x={x}
        y={participant.actor ? 56 : 25}
        textAnchor="middle"
        dominantBaseline="central"
        className="pointer-events-none fill-[var(--fl-text)] text-[12.5px] font-medium"
      >
        {truncate(participant.label, 16)}
      </text>
    </g>
  );
}

function ToolButton({
  onClick,
  title,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] py-1 pl-1.5 pr-2.5 text-[12.5px] text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)] disabled:opacity-40 disabled:hover:border-[var(--fl-border)] disabled:hover:text-[var(--fl-text)]"
    >
      {children}
    </button>
  );
}

/** Mermaid draws replies and async messages dotted; the canvas should agree. */
function dashFor(arrow: MessageArrow): string | undefined {
  return arrow === "reply" ||
    arrow === "dotted-line" ||
    arrow === "cross-reply" ||
    arrow === "async-reply"
    ? "5 4"
    : undefined;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ActorGlyph() {
  return (
    <svg
      viewBox="0 0 20 14"
      aria-hidden="true"
      className="h-3.5 w-5 shrink-0 opacity-70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <circle cx="10" cy="3.5" r="2.5" />
      <path d="M10 6v4M6.5 7.5h7M10 10l-3 3.5M10 10l3 3.5" />
    </svg>
  );
}

function BoxGlyph() {
  return (
    <svg
      viewBox="0 0 20 14"
      aria-hidden="true"
      className="h-3.5 w-5 shrink-0 opacity-70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <rect x="3" y="1" width="14" height="8" rx="1.5" />
      <path d="M10 9v4" strokeDasharray="2 2" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg
      viewBox="0 0 20 14"
      aria-hidden="true"
      className="h-3.5 w-5 shrink-0 opacity-70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M2 7h14M12 3.5 16 7l-4 3.5" />
    </svg>
  );
}
