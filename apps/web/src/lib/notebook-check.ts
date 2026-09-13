import { parseDocument } from "@forkleaf/markdown-engine";
import {
  surveyNotebook,
  type StaleNote,
  type Survey,
  type SurveySource,
} from "@/lib/notebook-freshness";

/**
 * The stale-notes check, run against a repository instead of a browser.
 *
 * The same survey the app shows — files that have gone, links to no note,
 * claims nobody has checked in years — so a pull request can be told before it
 * merges that it deletes a picture three notes still show. What fails the
 * check is only what is certain: a missing file or a link to no note. Aged
 * claims are listed as worth re-reading and never fail anything, because the
 * version number may be deliberate.
 */

export interface RepositoryFile {
  path: string;
  content: string;
}

export interface CheckResult {
  /** True when no note points at a missing file or a note that does not exist. */
  ok: boolean;
  survey: Survey;
}

const DATE = /^\d{4}-\d{2}-\d{2}/;

/** When a note says it was last touched, from its own properties. */
function touchedAt(frontmatter: Record<string, unknown>): string | null {
  for (const key of ["updated", "created"]) {
    const value = frontmatter[key];
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === "string" && DATE.test(value)) return value;
  }
  return null;
}

export function sourcesFrom(files: readonly RepositoryFile[]): SurveySource[] {
  return files.map((file) => {
    const parsed = parseDocument(file.content);
    return {
      path: file.path,
      content: parsed.content,
      updatedAt: touchedAt(parsed.frontmatter),
      frontmatterTitle: parsed.frontmatter.title,
    };
  });
}

/**
 * @param notes The markdown files to check.
 * @param allPaths Every file in the repository, so a link to a picture or a PDF
 *   counts as found.
 */
export function runCheck(
  notes: readonly RepositoryFile[],
  allPaths: readonly string[],
  now?: number,
): CheckResult {
  const survey = surveyNotebook(sourcesFrom(notes), {
    files: new Set(allPaths),
    ...(now !== undefined ? { now } : {}),
  });
  return { ok: survey.counts.missingFiles === 0 && survey.counts.missingLinks === 0, survey };
}

/** Text safe inside inline code and bold in a GitHub comment. */
const code = (text: string) => `\`${text.replace(/`/g, "'")}\``;
const plain = (text: string) => text.replace(/[*_`[\]<>|]/g, (c) => `\\${c}`);

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function entry(note: StaleNote): string[] {
  const lines = [`- **${plain(note.title)}** — ${code(note.path)}`];
  for (const file of note.missingFiles)
    lines.push(`  - points at ${code(file)}, which is not in the repository`);
  for (const link of note.missingLinks)
    lines.push(`  - links to ${code(`[[${link}]]`)}, which matches no note`);
  if (note.missingFiles.length === 0 && note.missingLinks.length === 0) {
    for (const reason of note.reasons) lines.push(`  - ${plain(reason)}`);
  }
  return lines;
}

/** The report, as markdown for a job summary or a pull request comment. */
export function formatReport(
  result: CheckResult,
  context: { repository: string; ref: string; skipped?: number },
): string {
  const { survey } = result;
  const broken = survey.notes.filter(
    (note) => note.missingFiles.length > 0 || note.missingLinks.length > 0,
  );
  const aging = survey.notes.filter(
    (note) => note.missingFiles.length === 0 && note.missingLinks.length === 0,
  );

  const lines: string[] = [
    result.ok
      ? `### Notebook check passed`
      : `### Notebook check: ${plural(broken.length, "note")} with broken references`,
    "",
    `Read ${plural(survey.scanned, "note")} in ${code(context.repository)} at ${code(context.ref)}.`,
  ];
  if (context.skipped) {
    lines.push(
      `${plural(context.skipped, "file")} were too large or too many to read, and were not checked.`,
    );
  }

  if (broken.length > 0) {
    lines.push("", "#### Broken references", "", ...broken.flatMap(entry));
  }
  if (aging.length > 0) {
    lines.push(
      "",
      "#### Worth re-reading",
      "",
      "These make claims that may have aged. They never fail the check.",
      "",
      ...aging.flatMap(entry),
    );
  }
  if (survey.notes.length === 0) {
    lines.push("", "Every file a note points at is there, and every link finds its note.");
  }

  return `${lines.join("\n")}\n`;
}
