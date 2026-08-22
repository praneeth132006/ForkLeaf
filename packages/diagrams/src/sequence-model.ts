/**
 * The model behind the sequence-diagram canvas.
 *
 * A sequence diagram is not a graph of boxes and arrows, however much it looks
 * like one. Its two axes mean different things: who is involved runs across,
 * and *when* runs down. Reordering two messages changes what the diagram says;
 * moving two boxes in a flowchart does not. Forcing it into the node-and-edge
 * model would have meant either losing the ordering or inventing a hidden
 * "sequence number" on every edge, so it gets its own shape: a list of
 * participants, and a list of messages in the order they happen.
 *
 * Pure data and pure functions: no React, no DOM, fully unit-testable.
 */

export interface SequenceParticipant {
  id: string;
  label: string;
  /** Drawn as a stick figure rather than a box — mermaid's `actor`. */
  actor: boolean;
}

/**
 * How a message is drawn, which is also what it means.
 *
 * A dotted line is a reply, a cross is a message that fails or ends the
 * lifeline, and an open arrowhead is asynchronous. Collapsing them into one
 * arrow would throw away the distinction the notation exists to make.
 */
export type MessageArrow =
  "solid" | "reply" | "line" | "dotted-line" | "cross" | "cross-reply" | "async" | "async-reply";

export interface SequenceMessage {
  id: string;
  from: string;
  to: string;
  label: string;
  arrow: MessageArrow;
}

export interface SequenceDiagram {
  participants: SequenceParticipant[];
  /** In the order they happen. The order *is* the diagram. */
  messages: SequenceMessage[];
  /** Mermaid's `autonumber`, which numbers the messages down the page. */
  autonumber: boolean;
}

export const EMPTY_SEQUENCE: SequenceDiagram = {
  participants: [],
  messages: [],
  autonumber: false,
};

/** Mermaid's arrow syntax for each kind of message. */
const ARROW_SYNTAX: Record<MessageArrow, string> = {
  solid: "->>",
  reply: "-->>",
  line: "->",
  "dotted-line": "-->",
  cross: "-x",
  "cross-reply": "--x",
  async: "-)",
  "async-reply": "--)",
};

/**
 * Longest and most specific first.
 *
 * Every dotted arrow starts with the solid one's syntax, so testing `-)` before
 * `--)` reads `App--)User` as a participant called `App-` sending an async
 * message. Order is the whole defence.
 */
const ARROW_BY_SPECIFICITY: MessageArrow[] = [
  "reply",
  "dotted-line",
  "cross-reply",
  "async-reply",
  "solid",
  "line",
  "cross",
  "async",
];

export const ARROW_LABELS: Record<MessageArrow, string> = {
  solid: "Call",
  reply: "Reply",
  line: "Line",
  "dotted-line": "Dotted line",
  cross: "Fails / ends",
  "cross-reply": "Fails (dotted)",
  async: "Async",
  "async-reply": "Async reply",
};

/**
 * Blocks this model has no representation for.
 *
 * A diagram using any of them is left to the source editor rather than being
 * opened on a canvas that would quietly drop it on the first edit. Refusing to
 * draw something is recoverable; deleting somebody's `alt` branches is not.
 */
const UNSUPPORTED = /^(loop|alt|else|opt|par|and|critical|option|break|rect|box|end)\b/i;

// ─── Serialisation ──────────────────────────────────────────────────────────

export function sequenceToMermaid(diagram: SequenceDiagram): string {
  const lines: string[] = ["sequenceDiagram"];
  if (diagram.autonumber) lines.push("    autonumber");

  for (const participant of diagram.participants) {
    const keyword = participant.actor ? "actor" : "participant";
    const id = escapeId(participant.id);
    lines.push(
      participant.label && participant.label !== participant.id
        ? `    ${keyword} ${id} as ${participant.label}`
        : `    ${keyword} ${id}`,
    );
  }

  for (const message of diagram.messages) {
    const arrow = ARROW_SYNTAX[message.arrow];
    lines.push(
      `    ${escapeId(message.from)}${arrow}${escapeId(message.to)}: ${message.label || "…"}`,
    );
  }

  return lines.join("\n");
}

function escapeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_") || "p";
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Reads mermaid back into a sequence diagram, or null when it cannot.
 *
 * Null means "this is not a sequence diagram, or it uses a block the canvas
 * would destroy" — the studio turns that into the source editor rather than an
 * empty canvas.
 */
export function mermaidToSequence(code: string): SequenceDiagram | null {
  const lines = code.split("\n");
  const header = lines
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("%%"));
  if (!header || !/^sequenceDiagram\b/i.test(header)) return null;

  const diagram: SequenceDiagram = { participants: [], messages: [], autonumber: false };
  const byId = new Map<string, SequenceParticipant>();

  /** Records a participant the first time it is mentioned, in that order. */
  const ensure = (id: string, label?: string, actor?: boolean): string => {
    const existing = byId.get(id);
    if (existing) {
      if (label !== undefined) existing.label = label;
      if (actor !== undefined) existing.actor = actor;
      return id;
    }

    const participant: SequenceParticipant = { id, label: label ?? id, actor: actor ?? false };
    byId.set(id, participant);
    diagram.participants.push(participant);
    return id;
  };

  for (const raw of lines.slice(lines.indexOf(header) + 1)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;

    if (/^autonumber\b/i.test(line)) {
      diagram.autonumber = true;
      continue;
    }

    // Anything with a body the canvas cannot draw sends the whole diagram to
    // the source editor, rather than being silently dropped on the first edit.
    if (UNSUPPORTED.test(line)) return null;
    if (/^(note|activate|deactivate|link|links|create|destroy)\b/i.test(line)) return null;

    const declaration = /^(participant|actor)\s+([A-Za-z0-9_-]+)(?:\s+as\s+(.+))?$/i.exec(line);
    if (declaration) {
      ensure(declaration[2]!, declaration[3]?.trim(), declaration[1]!.toLowerCase() === "actor");
      continue;
    }

    const message = parseMessage(line);
    if (message) {
      ensure(message.from);
      ensure(message.to);
      diagram.messages.push({
        id: `m${diagram.messages.length}`,
        from: message.from,
        to: message.to,
        label: message.label,
        arrow: message.arrow,
      });
      continue;
    }

    // An unrecognised line in a diagram this simple is more likely to be
    // something meaningful than noise, so the canvas steps aside.
    return null;
  }

  return diagram;
}

function parseMessage(
  line: string,
): { from: string; to: string; label: string; arrow: MessageArrow } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;

  const head = line.slice(0, colon);
  const label = line.slice(colon + 1).trim();

  for (const arrow of ARROW_BY_SPECIFICITY) {
    const syntax = ARROW_SYNTAX[arrow];
    const index = head.indexOf(syntax);
    if (index <= 0) continue;

    const from = head.slice(0, index).trim();
    const to = head.slice(index + syntax.length).trim();
    if (!isParticipantId(from) || !isParticipantId(to)) continue;

    return { from, to, label: label === "…" ? "" : label, arrow };
  }

  return null;
}

/**
 * A participant id, which may contain hyphens but cannot end in one.
 *
 * The trailing hyphen is the guard: without it, splitting `App--)User` on the
 * wrong arrow produced `App-`, which looked like a perfectly good id and
 * created a fourth participant nobody had written.
 */
function isParticipantId(text: string): boolean {
  return /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?$/.test(text);
}

// ─── Editing operations ─────────────────────────────────────────────────────

/** An id not already used by a participant. */
export function nextParticipantId(diagram: SequenceDiagram, prefix = "p"): string {
  const taken = new Set(diagram.participants.map((participant) => participant.id));
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${prefix}${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

export function addParticipant(
  diagram: SequenceDiagram,
  participant: Omit<SequenceParticipant, "id"> & { id?: string },
): SequenceDiagram {
  const id = participant.id ?? nextParticipantId(diagram);
  return { ...diagram, participants: [...diagram.participants, { ...participant, id }] };
}

export function updateParticipant(
  diagram: SequenceDiagram,
  id: string,
  patch: Partial<SequenceParticipant>,
): SequenceDiagram {
  return {
    ...diagram,
    participants: diagram.participants.map((participant) =>
      participant.id === id ? { ...participant, ...patch } : participant,
    ),
  };
}

/** Removes a participant, and every message that involved it. */
export function removeParticipant(diagram: SequenceDiagram, id: string): SequenceDiagram {
  return {
    participants: diagram.participants.filter((participant) => participant.id !== id),
    messages: diagram.messages.filter((message) => message.from !== id && message.to !== id),
    autonumber: diagram.autonumber,
  };
}

/** Moves a participant to a new column index, shifting the others along. */
export function moveParticipant(
  diagram: SequenceDiagram,
  id: string,
  toIndex: number,
): SequenceDiagram {
  const from = diagram.participants.findIndex((participant) => participant.id === id);
  if (from < 0) return diagram;

  const participants = [...diagram.participants];
  const [moved] = participants.splice(from, 1);
  if (!moved) return diagram;

  participants.splice(clampIndex(toIndex, participants.length), 0, moved);
  return { ...diagram, participants };
}

export function addMessage(
  diagram: SequenceDiagram,
  message: Omit<SequenceMessage, "id"> & { id?: string },
  /** Where in the order it goes. Appended when absent. */
  atIndex?: number,
): SequenceDiagram {
  const id = message.id ?? `m${diagram.messages.length}-${Date.now().toString(36)}`;
  const messages = [...diagram.messages];
  messages.splice(atIndex ?? messages.length, 0, { ...message, id });
  return { ...diagram, messages };
}

export function updateMessage(
  diagram: SequenceDiagram,
  id: string,
  patch: Partial<SequenceMessage>,
): SequenceDiagram {
  return {
    ...diagram,
    messages: diagram.messages.map((message) =>
      message.id === id ? { ...message, ...patch } : message,
    ),
  };
}

export function removeMessage(diagram: SequenceDiagram, id: string): SequenceDiagram {
  return { ...diagram, messages: diagram.messages.filter((message) => message.id !== id) };
}

/** Moves a message up or down the order, which is what the diagram says. */
export function moveMessage(
  diagram: SequenceDiagram,
  id: string,
  toIndex: number,
): SequenceDiagram {
  const from = diagram.messages.findIndex((message) => message.id === id);
  if (from < 0) return diagram;

  const messages = [...diagram.messages];
  const [moved] = messages.splice(from, 1);
  if (!moved) return diagram;

  messages.splice(clampIndex(toIndex, messages.length), 0, moved);
  return { ...diagram, messages };
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length);
}
