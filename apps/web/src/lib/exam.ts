import { judgeAnswer } from "@forkleaf/editor";
import { stripExtension } from "@forkleaf/markdown-engine";
import { compareRecall } from "@/lib/explain-back";
import { findCards, readable, typedVerdict } from "@/lib/flashcards";
import { definitionsIn } from "@/lib/glossary";
import { plainText } from "@/lib/mind";

/**
 * The exam simulator: a timed mock exam built from a folder of notes.
 *
 * Three kinds of question, all from what the notes already hold:
 *
 * - **Cards** — every `Question :: Answer` line, answered by typing, marked the
 *   way flashcard review marks a typed answer.
 * - **Definitions** — every term the notes define ("What does *latency* mean?"),
 *   marked by how much of the definition's meaning came back.
 * - **Explain** — every section with enough under its heading to explain
 *   ("Explain: Mitochondria"), marked like Explain it back: the share of the
 *   section's key ideas the answer covers.
 *
 * The result is written as a note of its own, with every missed question
 * linked back to the exact place in the notes to reread.
 */

export interface ExamNote {
  path: string;
  title: string;
  content: string;
}

export type QuestionKind = "card" | "define" | "explain";

export interface ExamQuestion {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** What a full answer says. */
  expected: string;
  path: string;
  title: string;
  /** 1-based line the question comes from. */
  line: number;
  /** The heading it sits under, for a link straight to it. */
  heading: string | null;
}

export type ExamVerdict = "right" | "partly" | "wrong" | "skipped";

export interface ExamGrade {
  verdict: ExamVerdict;
  /** 0–1. */
  score: number;
  /** For definitions and explanations: what was left out, in the note's words. */
  missing: string[];
}

export interface ExamOptions {
  /** Only notes in this folder (and below). Null for the whole notebook. */
  folder: string | null;
  count: number;
  /** Same seed, same exam: lets a person retake exactly the same paper. */
  seed: number;
}

const SKIPPED = /^(templates|reviews|exams)\//;
const MIN_SECTION_WORDS = 25;

/** A small, fast, seeded random number generator (mulberry32). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function inFolder(path: string, folder: string | null): boolean {
  if (!folder) return true;
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  return path.startsWith(prefix);
}

/** Every folder that holds at least one note, for choosing what to be examined on. */
export function examFolders(paths: readonly string[]): string[] {
  const folders = new Set<string>();
  for (const path of paths) {
    if (SKIPPED.test(path) || !/\.(md|markdown)$/i.test(path)) continue;
    const parts = path.split("/").slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      folders.add(parts.slice(0, depth).join("/"));
    }
  }
  return [...folders].sort((a, b) => a.localeCompare(b));
}

interface Section {
  heading: string;
  line: number;
  body: string;
}

/** A note's sections: each heading and the prose under it, without code or cards. */
function sectionsOf(content: string): Section[] {
  const sections: Section[] = [];
  let current: { heading: string; line: number; lines: string[] } | null = null;
  let fence = false;

  const close = () => {
    if (current) {
      sections.push({
        heading: current.heading,
        line: current.line,
        body: current.lines.join("\n").trim(),
      });
    }
  };

  content.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    const heading = /^\s*#{2,4}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      close();
      current = { heading: plainText(heading[1]!).trim(), line: index + 1, lines: [] };
      return;
    }
    if (current && !line.includes("::") && !/^\s*\|/.test(line)) current.lines.push(line);
  });
  close();
  return sections;
}

/** What a heading is called, for "Explain: …". */
function headingAt(content: string, line: number): string | null {
  const lines = content.split("\n").slice(0, line);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const heading = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[index]!);
    if (heading) return plainText(heading[1]!).trim();
  }
  return null;
}

/** Every question the notes could be examined on. */
export function questionBank(notes: readonly ExamNote[], folder: string | null): ExamQuestion[] {
  const bank: ExamQuestion[] = [];

  for (const note of notes) {
    if (SKIPPED.test(note.path) || !inFolder(note.path, folder)) continue;

    for (const card of findCards(note.path, note.title, note.content)) {
      bank.push({
        id: `card:${card.id}`,
        kind: "card",
        prompt: readable(card.question),
        expected: readable(card.answer),
        path: note.path,
        title: note.title,
        line: card.line,
        heading: headingAt(note.content, card.line),
      });
    }

    for (const entry of definitionsIn(note)) {
      const meaning = entry.definition
        .replace(
          new RegExp(
            `^(?:an? |the )?${escape(entry.term)}\\s+(?:is|are|was|were|means|refers to|describes|stands for|denotes)\\s+(?:an? |the )?`,
            "i",
          ),
          "",
        )
        .trim();
      bank.push({
        id: `define:${note.path}:${entry.line}`,
        kind: "define",
        prompt: `What does “${entry.term}” mean?`,
        expected: meaning.charAt(0).toUpperCase() + meaning.slice(1),
        path: note.path,
        title: note.title,
        line: entry.line,
        heading: headingAt(note.content, entry.line),
      });
    }

    for (const section of sectionsOf(note.content)) {
      const text = plainText(section.body).replace(/\s+/g, " ").trim();
      if (text.split(" ").length < MIN_SECTION_WORDS) continue;
      bank.push({
        id: `explain:${note.path}:${section.line}`,
        kind: "explain",
        prompt: `Explain “${section.heading}”, from ${note.title}.`,
        expected: section.body,
        path: note.path,
        title: note.title,
        line: section.line,
        heading: section.heading,
      });
    }
  }

  return bank;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The paper: `count` questions, mostly cards, with definitions and
 * explanations mixed in when there are any. Explanations take longest, so
 * there are fewest of them.
 */
export function buildExam(notes: readonly ExamNote[], options: ExamOptions): ExamQuestion[] {
  const next = random(options.seed);
  const bank = questionBank(notes, options.folder);
  const byKind = {
    card: shuffle(
      bank.filter((question) => question.kind === "card"),
      next,
    ),
    define: shuffle(
      bank.filter((question) => question.kind === "define"),
      next,
    ),
    explain: shuffle(
      bank.filter((question) => question.kind === "explain"),
      next,
    ),
  };

  const count = Math.max(1, options.count);
  const want = {
    explain: Math.min(byKind.explain.length, Math.max(1, Math.round(count * 0.2))),
    define: Math.min(byKind.define.length, Math.max(1, Math.round(count * 0.25))),
    card: 0,
  };
  want.card = Math.min(byKind.card.length, count - want.explain - want.define);

  const chosen = [
    ...byKind.card.slice(0, want.card),
    ...byKind.define.slice(0, want.define),
    ...byKind.explain.slice(0, want.explain),
  ];
  // Short of cards: fill from whatever is left, in the same order.
  const rest = [
    ...byKind.card.slice(want.card),
    ...byKind.define.slice(want.define),
    ...byKind.explain.slice(want.explain),
  ];
  while (chosen.length < count && rest.length > 0) chosen.push(rest.shift()!);

  return shuffle(chosen, next).slice(0, count);
}

/** Marks one answer. */
export function gradeAnswer(question: ExamQuestion, answer: string): ExamGrade {
  const typed = answer.trim();
  if (!typed) return { verdict: "skipped", score: 0, missing: [] };

  if (question.kind === "card") {
    // "ATP, NADPH" answers "ATP and NADPH": a list typed with commas instead of
    // its "and" is the same answer.
    const bare = (text: string) =>
      text.replace(/(?<![\p{L}])(and|or|&|plus|then)(?![\p{L}])/giu, " ");
    const byWords =
      judgeAnswer(bare(question.expected), bare(typed)) === "right"
        ? "right"
        : judgeAnswer(question.expected, typed);
    const verdict = typedVerdict(question.expected, typed, byWords);
    return verdict === "right"
      ? { verdict: "right", score: 1, missing: [] }
      : verdict === "close"
        ? { verdict: "partly", score: 0.5, missing: [] }
        : { verdict: "wrong", score: 0, missing: [] };
  }

  const report = compareRecall(question.expected, typed);
  const missing = report.sentences
    .flatMap((sentence) => sentence.missing)
    .filter((word, index, all) => all.indexOf(word) === index)
    .slice(0, 6);
  // A definition is short, so fewer of its words are needed for full marks.
  const [full, half] = question.kind === "define" ? [60, 30] : [70, 35];
  if (report.score >= full) return { verdict: "right", score: 1, missing };
  if (report.score >= half) return { verdict: "partly", score: 0.5, missing };
  return { verdict: "wrong", score: 0, missing };
}

export interface ExamSummary {
  total: number;
  /** Right counts 1, partly a half. */
  points: number;
  percent: number;
  right: number;
  partly: number;
  wrong: number;
  skipped: number;
}

export function summarise(grades: readonly ExamGrade[]): ExamSummary {
  const points = grades.reduce((sum, grade) => sum + grade.score, 0);
  const count = (verdict: ExamVerdict) =>
    grades.filter((grade) => grade.verdict === verdict).length;
  return {
    total: grades.length,
    points,
    percent: grades.length === 0 ? 0 : Math.round((points / grades.length) * 100),
    right: count("right"),
    partly: count("partly"),
    wrong: count("wrong"),
    skipped: count("skipped"),
  };
}

const MARK: Record<ExamVerdict, string> = {
  right: "✓ Right",
  partly: "◐ Partly",
  wrong: "✗ Wrong",
  skipped: "— Skipped",
};

function link(question: ExamQuestion): string {
  const target = stripExtension(question.path) + (question.heading ? `#${question.heading}` : "");
  const label = question.heading ? `${question.title}: ${question.heading}` : question.title;
  return `[[${target.replace(/[|\]]/g, "")}|${label.replace(/[|\]]/g, "")}]]`;
}

function quote(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export interface ExamRecord {
  questions: readonly ExamQuestion[];
  answers: readonly string[];
  grades: readonly ExamGrade[];
  folder: string | null;
  /** `YYYY-MM-DD HH:MM`. */
  takenAt: string;
  minutesUsed: number;
  minutesAllowed: number | null;
}

/** The folder results notes are filed in. */
export const EXAM_FOLDER = "exams";

/** What the results note is called: when, and on what. */
export function examTitle(record: Pick<ExamRecord, "folder" | "takenAt">): string {
  const subject = record.folder ? record.folder.split("/").pop()! : "Notebook";
  const stamp = record.takenAt.replace(":", "");
  return `${stamp} ${subject.replace(/[\\/:*?"<>|#^[\]]/g, "-")} exam`;
}

/** The results, as a note: the score, what to reread, then every question. */
export function examNote(record: ExamRecord): string {
  const summary = summarise(record.grades);
  const subject = record.folder ?? "the whole notebook";
  const time =
    record.minutesAllowed !== null
      ? `${record.minutesUsed} of ${record.minutesAllowed} min`
      : `${record.minutesUsed} min`;

  const weak = record.questions
    .map((question, index) => ({ question, grade: record.grades[index]! }))
    .filter(({ grade }) => grade.verdict !== "right");

  const lines = [
    "---",
    `title: "Exam: ${subject.replace(/"/g, "'")}, ${record.takenAt.slice(0, 10)}"`,
    "tags: [exam]",
    "---",
    "",
    `# Exam: ${subject}`,
    "",
    `**${summary.points % 1 === 0 ? summary.points : summary.points.toFixed(1)} / ${summary.total} (${summary.percent}%)** · ${summary.right} right, ${summary.partly} partly, ${summary.wrong} wrong, ${summary.skipped} skipped · ${time} · ${record.takenAt}`,
    "",
  ];

  if (weak.length > 0) {
    lines.push("## To go over again", "");
    for (const { question, grade } of weak) {
      const missed = grade.missing.length > 0 ? ` — missed ${grade.missing.join(", ")}` : "";
      lines.push(`- [ ] ${link(question)}: ${question.prompt}${missed}`);
    }
    lines.push("");
  } else {
    lines.push("Everything right. Nothing to go over.", "");
  }

  lines.push("## Every question", "");
  record.questions.forEach((question, index) => {
    const grade = record.grades[index]!;
    const answer = record.answers[index]?.trim();
    lines.push(
      `### ${index + 1}. ${question.prompt} — ${MARK[grade.verdict]}`,
      "",
      `**Your answer:** ${answer ? answer.replace(/\n+/g, " ") : "_(none)_"}`,
      "",
      "**The notes say:**",
      "",
      quote(question.kind === "explain" ? plainText(question.expected) : question.expected),
      "",
      `From ${link(question)}`,
      "",
    );
  });

  return lines.join("\n");
}
