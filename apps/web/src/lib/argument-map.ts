import {
  emptyCanvas,
  newId,
  type Canvas,
  type CanvasEdge,
  type CanvasNode,
} from "@forkleaf/markdown-engine";
import { plainText } from "@/lib/mind";

/**
 * Map the argument: an essay note as a tree of claim, reasons, evidence and
 * objections, drawn as a canvas right in the note.
 *
 * The claim is what the note sets out to show. The reasons are what it offers
 * for it — its sections, or sentences that give a reason ("because", "first",
 * "moreover"). Evidence is anything that points outside the writer's own
 * opinion: a link, a citation, a figure, a quotation. Objections are the
 * sentences that push back ("however", "critics argue").
 *
 * A reason with no evidence under it is drawn in red, because that is the
 * part of the argument a reader will poke at first. Nothing is judged true or
 * false; the map only shows the shape of the case being made.
 */

export type ArgumentRole = "claim" | "reason" | "evidence" | "objection";

export interface ArgumentPoint {
  role: ArgumentRole;
  text: string;
  /** 1-based line in the note. */
  line: number;
  /** For evidence: the reason it backs, by index into `reasons`; -1 for the claim. */
  backs?: number;
}

export interface ArgumentShape {
  claim: ArgumentPoint;
  reasons: ArgumentPoint[];
  evidence: ArgumentPoint[];
  objections: ArgumentPoint[];
}

export interface ArgumentStats {
  reasons: number;
  /** Reasons with no evidence under them. */
  weak: number;
  evidence: number;
  objections: number;
}

const OBJECTION_HEADING =
  /\b(objections?|counter[- ]?arguments?|criticisms?|critiques?|against|risks?|limitations?|concerns?|downsides?|caveats?|rebuttals?)\b/i;
const OBJECTION =
  /^(however|but|although|though|yet|nevertheless|nonetheless|on the other hand|critics|some argue|opponents|skeptics|sceptics|one objection|a counter)\b|\b(critics (?:say|argue|claim)|others argue|it could be argued|the counter-?argument)\b/i;
const REASON =
  /^(because|since|first(?:ly)?|second(?:ly)?|third(?:ly)?|finally|also|moreover|furthermore|in addition|additionally|another reason|the main reason|this is because)\b|\b(because|the reason is|which means)\b/i;
const EVIDENCE =
  /\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\]|\[\^[^\]]+\]|\(\s*[\p{Lu}][\p{L}-]+(?: et al\.?)?,? \d{4}\s*\)|\b\d+(?:[.,]\d+)?\s?%|\b(?:19|20)\d{2}\b|\b\d{2,}\b|\b(according to|a study|studies|research|survey|data|found that|showed that|reported|measured|experiment|evidence)\b|https?:\/\//iu;
const EXPLICIT = /^(claim|thesis|reason|evidence|objection|rebuttal|counter-?argument)\s*:\s*/i;

const MAX_TEXT = 180;

function tidy(text: string): string {
  const plain = plainText(text).replace(/\s+/g, " ").trim();
  return plain.length > MAX_TEXT ? `${plain.slice(0, MAX_TEXT - 1).trimEnd()}…` : plain;
}

interface Line {
  text: string;
  line: number;
}

/** The note's prose, a line at a time, with front matter, code and tables left out. */
function proseLines(content: string): { title: string | null; lines: Line[] } {
  const raw = content.split("\n");
  let start = 0;
  let title: string | null = null;

  if (raw[0]?.trim() === "---") {
    const end = raw.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
    if (end > 0) {
      const match = raw
        .slice(1, end)
        .map((line) => /^title:\s*["']?(.+?)["']?\s*$/.exec(line))
        .find(Boolean);
      if (match?.[1]) title = match[1];
      start = end + 1;
    }
  }

  const lines: Line[] = [];
  let fence = false;
  for (let index = start; index < raw.length; index += 1) {
    const line = raw[index]!;
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    // A table row, a flashcard, or the `/command` being typed to make this map.
    if (fence || /^\s*\|/.test(line) || line.includes("::") || /^\s*\/\S*\s*$/.test(line)) {
      continue;
    }
    lines.push({ text: line, line: index + 1 });
  }
  return { title, lines };
}

/** Splits prose into sentences, keeping links and citations whole. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[\p{Lu}"“\[(])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** Reads the shape of the argument out of a note. */
export function readArgument(content: string, fallbackTitle = "This note"): ArgumentShape {
  const { title, lines } = proseLines(content);
  const reasons: ArgumentPoint[] = [];
  const evidence: ArgumentPoint[] = [];
  const objections: ArgumentPoint[] = [];

  let claim: ArgumentPoint | null = null;
  let section: "reason" | "objection" | null = null;
  let currentReason = -1;
  let h1: Line | null = null;
  let firstParagraph: Line | null = null;

  for (const entry of lines) {
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(entry.text);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!.trim();
      if (level === 1) {
        h1 ??= { text, line: entry.line };
        continue;
      }
      if (OBJECTION_HEADING.test(text)) {
        section = "objection";
        currentReason = -1;
        continue;
      }
      // A section is a reason, named by its heading.
      section = "reason";
      reasons.push({ role: "reason", text: tidy(text), line: entry.line });
      currentReason = reasons.length - 1;
      continue;
    }

    const body = entry.text
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
      .trim();
    if (!body) continue;
    const quoted = /^\s*>/.test(entry.text);

    for (const sentence of sentences(body)) {
      const explicit = EXPLICIT.exec(sentence);
      const text = explicit ? sentence.slice(explicit[0].length) : sentence;
      const label = explicit?.[1]?.toLowerCase();

      if (label === "claim" || label === "thesis") {
        claim = { role: "claim", text: tidy(text), line: entry.line };
        continue;
      }
      if (label === "objection" || label?.startsWith("counter")) {
        objections.push({ role: "objection", text: tidy(text), line: entry.line });
        continue;
      }
      if (label === "rebuttal") {
        // A reply to the last objection is a reason in its own right.
        reasons.push({ role: "reason", text: tidy(text), line: entry.line });
        currentReason = reasons.length - 1;
        continue;
      }
      if (label === "reason") {
        reasons.push({ role: "reason", text: tidy(text), line: entry.line });
        currentReason = reasons.length - 1;
        continue;
      }
      if (label === "evidence" || quoted || EVIDENCE.test(sentence)) {
        if (section === "objection") {
          objections.push({ role: "objection", text: tidy(text), line: entry.line });
        } else {
          evidence.push({
            role: "evidence",
            text: tidy(text),
            line: entry.line,
            backs: currentReason,
          });
        }
        continue;
      }
      if (section === "objection" || OBJECTION.test(sentence)) {
        objections.push({ role: "objection", text: tidy(text), line: entry.line });
        continue;
      }
      if (section === null && REASON.test(sentence)) {
        reasons.push({ role: "reason", text: tidy(text), line: entry.line });
        currentReason = reasons.length - 1;
        continue;
      }
      if (section === null && !firstParagraph) {
        firstParagraph = { text: sentence, line: entry.line };
      }
    }
  }

  claim ??= h1
    ? { role: "claim", text: tidy(h1.text), line: h1.line }
    : firstParagraph
      ? { role: "claim", text: tidy(firstParagraph.text), line: firstParagraph.line }
      : { role: "claim", text: tidy(title ?? fallbackTitle), line: 1 };

  return { claim, reasons, evidence, objections };
}

export function argumentStats(shape: ArgumentShape): ArgumentStats {
  const backed = new Set(shape.evidence.map((point) => point.backs));
  return {
    reasons: shape.reasons.length,
    weak: shape.reasons.filter((_reason, index) => !backed.has(index)).length,
    evidence: shape.evidence.length,
    objections: shape.objections.length,
  };
}

/** JSON Canvas's preset colours: 1 red, 2 orange, 4 green, 5 cyan, 6 purple. */
const COLOR = { claim: "6", supported: "4", weak: "1", evidence: "5", objection: "2" } as const;
const WIDTH = 300;
const GAP = 40;

function height(text: string): number {
  return Math.min(220, 70 + Math.ceil(text.length / 34) * 22);
}

/**
 * Lays the argument out as a canvas. Card text is plain — a canvas card shows
 * its text as written — with the role on the first line.
 */
/** Lays the argument out as a canvas: claim on top, reasons below with their evidence, objections to the side. */
export function argumentCanvas(shape: ArgumentShape): Canvas {
  const canvas = emptyCanvas();
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const freshId = () => newId({ ...canvas, nodes, edges });

  const add = (text: string, x: number, y: number, color: string): string => {
    const id = freshId();
    nodes.push({
      id,
      type: "text",
      text,
      x: Math.round(x),
      y: Math.round(y),
      width: WIDTH,
      height: height(text),
      color,
    } as CanvasNode);
    return id;
  };
  const link = (
    from: string,
    to: string,
    label: string,
    sides: { from: "top" | "right"; to: "bottom" | "left" } = { from: "top", to: "bottom" },
    color?: string,
  ) => {
    edges.push({
      id: freshId(),
      fromNode: from,
      fromSide: sides.from,
      toNode: to,
      toSide: sides.to,
      toEnd: "arrow",
      label,
      ...(color ? { color } : {}),
    } as CanvasEdge);
  };

  const backed = new Set(shape.evidence.map((point) => point.backs));
  const columns = Math.max(1, shape.reasons.length);
  const rowWidth = columns * WIDTH + (columns - 1) * GAP;
  const left = -rowWidth / 2;

  const claimText = `Claim\n\n${shape.claim.text}`;
  const claimId = add(claimText, -WIDTH / 2, 0, COLOR.claim);
  const reasonTop = height(claimText) + 120;

  const reasonIds = shape.reasons.map((reason, index) => {
    const weak = !backed.has(index);
    const text = weak
      ? `Reason\n\n${reason.text}\n\n(No evidence yet)`
      : `Reason\n\n${reason.text}`;
    const id = add(
      text,
      left + index * (WIDTH + GAP),
      reasonTop,
      weak ? COLOR.weak : COLOR.supported,
    );
    link(id, claimId, "supports", undefined, weak ? COLOR.weak : undefined);
    return { id, bottom: reasonTop + height(text) };
  });

  // Evidence stacks under the reason it backs; evidence for the claim itself
  // goes under the claim, beside the reasons.
  const stackBottom = new Map<number, number>();
  const claimEvidenceX = left + columns * (WIDTH + GAP);
  for (const point of shape.evidence) {
    const index = point.backs ?? -1;
    const text = `Evidence\n\n${point.text}`;
    const owner = index >= 0 ? reasonIds[index] : undefined;
    const x = owner ? left + index * (WIDTH + GAP) : claimEvidenceX;
    const top = stackBottom.get(index) ?? (owner ? owner.bottom + 80 : reasonTop);
    const id = add(text, x, top, COLOR.evidence);
    link(id, owner ? owner.id : claimId, "evidence");
    stackBottom.set(index, top + height(text) + GAP);
  }

  // Objections in a column to the left of everything, pointing at the claim.
  const objectionX = left - WIDTH - GAP * 3;
  let objectionY = 0;
  for (const point of shape.objections) {
    const text = `Objection\n\n${point.text}`;
    const id = add(text, objectionX, objectionY, COLOR.objection);
    link(id, claimId, "objects", { from: "right", to: "left" }, COLOR.objection);
    objectionY += height(text) + GAP;
  }

  return { ...canvas, nodes, edges };
}
