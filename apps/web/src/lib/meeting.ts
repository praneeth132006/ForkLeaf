import { dateStamp } from "@/lib/templates";

/**
 * Meeting notes that end with what was decided and who is doing what.
 *
 * The part of a meeting anybody needs a week later is three lists — decisions,
 * actions, open questions — and they are exactly the part that gets lost in
 * the middle of the notes. This reads the notes (or a voice note's transcript)
 * for the phrases people actually use when they decide or take something on,
 * and writes the lists at the end of the note under their own heading, so
 * running it again after more notes replaces them instead of adding a copy.
 *
 * The heading is the marker, not an HTML comment: the rich editor saves a
 * comment as escaped text, which showed up in the note and could not be found
 * again. A heading survives every view.
 *
 * Action items are written as `- [ ]` to-dos, with the owner and any date, so
 * they show up in every open to-do and in the weekly review like any other.
 */

export interface ActionItem {
  text: string;
  /** Who took it on, when the notes say. */
  owner: string | null;
  /** `YYYY-MM-DD`, when the notes give one. */
  due: string | null;
}

export interface MeetingItems {
  decisions: string[];
  actions: ActionItem[];
  questions: string[];
}

export const SUMMARY_HEADING = "## Meeting summary";

const PREFIX = /^\s*(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s+)?/;
/** "**Sam:** …", "**Sam**: …" or "Sam: …" at the start of a transcript line. */
const SPEAKER = /^(?:\*\*)?([A-Z][\w'-]{1,20})(?::\*\*|\*\*:|:)\s+(?=\S)/;
/** Labels that look like a speaker's name followed by a colon, but are not one. */
const NOT_A_SPEAKER =
  /^(?:decision|decided|agreed|resolved|conclusion|action|todo|question|unresolved|tbd|follow|next|note|notes|agenda|attendees|date|summary)$/i;
const DECISION_LABEL = /^(?:decision|decided|agreed|resolved|conclusion)\s*[:\-–—]\s*/i;
const ACTION_LABEL =
  /^(?:action(?:\s+item)?|todo|to-do|to do|follow[- ]?up|next step)\s*[:\-–—]\s*/i;
const QUESTION_LABEL = /^(?:open question|question|unresolved|tbd|to be decided)\s*[:\-–—]\s*/i;
const DECIDED_PHRASE =
  /\b(?:we|they|the team|everyone|i)\s+(?:have\s+)?(?:decided|agreed|chose|settled on|are going with|will go with)\b/i;
const ACTION_VERBS =
  "send|write|draft|prepare|schedule|share|fix|update|follow up|look into|review|book|call|email|create|set up|check|investigate|organise|organize|order|plan|publish|test|finish|ask";
const OWNER_WILL = new RegExp(
  `^@?([A-Z][\\w'-]{1,20})\\s+(?:will|to|should|needs to|is going to)\\s+(?:${ACTION_VERBS})\\b`,
);
const MENTION = /@([\w'-]{2,30})/;
const DUE = /(?:📅\s*|\bdue:?\s*|\bby\s+)(\d{4}-\d{2}-\d{2})\b/iu;

const clean = (text: string) =>
  text
    .replace(/\*\*|__|`/g, "")
    .replace(/\s*\\$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;]$/, "");

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const isSummaryHeading = (line: string) => /^##\s+meeting summary\s*$/i.test(line.trim());

/** Where the summary is: its heading's line, and the line after its last. */
function summaryRange(lines: readonly string[]): { start: number; end: number } | null {
  const start = lines.findIndex(isSummaryHeading);
  if (start === -1) return null;
  // It runs to the next heading at its own level or above; its lists sit under `###`.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,2}\s/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** The note without a summary this wrote before, so it is not read back in. */
export function withoutSummary(content: string): string {
  const lines = content.split("\n");
  const range = summaryRange(lines);
  if (!range) return content;
  return [...lines.slice(0, range.start), ...lines.slice(range.end)].join("\n");
}

export function extractMeeting(content: string): MeetingItems {
  const decisions: string[] = [];
  const actions: ActionItem[] = [];
  const questions: string[] = [];
  const seen = new Set<string>();
  const once = (kind: string, text: string) => {
    const key = `${kind}:${text.toLowerCase()}`;
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  let fence = false;
  for (const raw of withoutSummary(content).split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fence = !fence;
      continue;
    }
    // Headings and existing to-do boxes are already structure; code is not prose.
    if (fence || /^\s*#/.test(raw) || /^\s*(?:[-*+]\s+)\[[ xX]\]/.test(raw)) continue;

    let line = raw.replace(PREFIX, "");
    const found = SPEAKER.exec(line);
    const speaker = found && !NOT_A_SPEAKER.test(found[1]!) ? found : null;
    if (speaker) line = line.slice(speaker[0].length);
    if (!line.trim()) continue;

    if (DECISION_LABEL.test(line)) {
      const text = capitalise(clean(line.replace(DECISION_LABEL, "")));
      if (once("d", text)) decisions.push(text);
      continue;
    }
    if (QUESTION_LABEL.test(line)) {
      const text = capitalise(clean(line.replace(QUESTION_LABEL, "")));
      if (once("q", text)) questions.push(text);
      continue;
    }

    const labelled = ACTION_LABEL.test(line);
    // Read after the label: in "Action: Sam to draft it" the owner is Sam.
    const body = labelled ? line.replace(ACTION_LABEL, "") : line;
    const ownerWill = OWNER_WILL.exec(body);
    if (labelled || ownerWill || MENTION.test(body)) {
      const owner =
        MENTION.exec(body)?.[1] ??
        (ownerWill ? ownerWill[1]! : null) ??
        (labelled && speaker ? speaker[1]! : null);
      const due = DUE.exec(body)?.[1] ?? null;
      if (labelled || ownerWill || /\b(?:will|to|should|please|can you)\b/i.test(body)) {
        const text = capitalise(clean(body.replace(DUE, "").replace(/\s{2,}/g, " ")));
        if (once("a", text)) actions.push({ text, owner, due });
        continue;
      }
    }

    if (DECIDED_PHRASE.test(line)) {
      const text = capitalise(clean(line));
      if (once("d", text)) decisions.push(text);
    }
  }

  return { decisions, actions, questions };
}

/** The lists as markdown, under the heading that lets them be replaced. */
export function formatSummary(items: MeetingItems): string {
  const lines = [SUMMARY_HEADING, ""];
  const list = (heading: string, entries: string[]) => {
    lines.push(`### ${heading}`, "", ...(entries.length ? entries : ["Nothing noted."]), "");
  };
  list(
    "Decisions",
    items.decisions.map((text) => `- ${text}`),
  );
  list(
    "Action items",
    items.actions.map((action) => {
      const owner =
        action.owner && !action.text.includes(`@${action.owner}`) ? ` @${action.owner}` : "";
      const due = action.due ? ` 📅 ${action.due}` : "";
      return `- [ ] ${action.text}${owner}${due}`;
    }),
  );
  list(
    "Open questions",
    items.questions.map((text) => `- ${text}`),
  );
  return lines.join("\n").replace(/\n+$/, "");
}

/** The note with its summary written, or rewritten in place. */
export function withMeetingSummary(content: string, items: MeetingItems): string {
  const summary = formatSummary(items);
  const lines = content.split("\n");
  const range = summaryRange(lines);
  if (!range) return `${content.replace(/\s*$/, "")}\n\n${summary}\n`;

  const before = lines.slice(0, range.start).join("\n").replace(/\s*$/, "");
  const after = lines.slice(range.end).join("\n").replace(/^\s*/, "");
  return after ? `${before}\n\n${summary}\n\n${after}` : `${before}\n\n${summary}\n`;
}

export const MEETING_FOLDER = "meetings";

/** A new meeting note, ready to take notes in. */
export function meetingNote(title: string, now: Date): { title: string; content: string } {
  const date = dateStamp(now);
  return {
    title: `${date} ${title}`,
    content: [
      `# ${title}`,
      "",
      `**Date:** ${date}`,
      "**Attendees:** ",
      "",
      "## Agenda",
      "",
      "- ",
      "",
      "## Notes",
      "",
      "Write as you go. Lines starting **Decision:**, **Action:** or **Question:** — or",
      '"@Sam will send the draft by 2026-09-20" — are gathered into a summary by',
      "/ → Pull out decisions and to-dos.",
      "",
    ].join("\n"),
  };
}
