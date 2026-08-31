import {
  assessDecay,
  buildLinkGraph,
  deriveTitle,
  referencedPaths,
  type DecayVerdict,
} from "@forkleaf/markdown-engine";

/**
 * Which notes in the whole notebook have gone off.
 *
 * The per-note freshness panel answers "is *this* note still true?" for the
 * note you happen to have open, which is the wrong shape for the question
 * people actually have. Nobody opens a note to find out that it rotted; they
 * find out when they act on it. The useful version is a short list that comes
 * to you: four notes point at a file that is not there any more, two make
 * claims about a version that has moved on.
 *
 * Three signals, in descending order of how much they are worth:
 *
 *   1. A note pointing at a file that is not in the repository. A fact, not a
 *      guess — the file list is right here.
 *   2. A `[[wikilink]]` matching no note. Also a fact, and usually a rename
 *      that took the link with it.
 *   3. Datable claims in a note nobody has touched for a long time. An
 *      inference, and reported as one.
 *
 * Entirely local. Every note is already on this device and the file list is
 * one request the caller has usually made anyway, so the sweep costs nothing
 * and can be run as often as somebody likes. Nothing here writes anything.
 */

export interface StaleNote {
  path: string;
  title: string;
  updatedAt: string | null;
  /** Whole months since anybody touched it, or null for one never edited. */
  ageMonths: number | null;
  verdict: DecayVerdict;
  /** Why, in sentences somebody can disagree with. */
  reasons: string[];
  /** Files it points at that are not in the repository. */
  missingFiles: string[];
  /** `[[Wikilinks]]` in it that match no note. */
  missingLinks: string[];
}

export interface Survey {
  /** Only the notes with something to say. A clean note is not a row. */
  notes: StaleNote[];
  /** How many notes were read to decide that. */
  scanned: number;
  counts: {
    missingFiles: number;
    missingLinks: number;
    likelyStale: number;
    worthChecking: number;
  };
}

export interface SurveySource {
  path: string;
  content: string;
  updatedAt: string | null;
  /** The note's own title, when it has declared one. */
  frontmatterTitle?: unknown;
}

const titleOf = (note: SurveySource) => deriveTitle(note.content, note.frontmatterTitle, note.path);

/** How much a note's worst problem is worth, for ordering the list. */
function weightOf(note: StaleNote): number {
  if (note.missingFiles.length > 0) return 3;
  if (note.missingLinks.length > 0) return 2;
  if (note.verdict === "likely-stale") return 1;
  return 0;
}

export function surveyNotebook(
  notes: readonly SurveySource[],
  options: {
    /**
     * Every path that exists — the repository's files and anything written
     * here that has not been pushed yet.
     *
     * Passed in rather than derived, because "the files that exist" has three
     * different answers depending on whether the workspace has a repository,
     * and getting it wrong means reporting a picture as deleted while the
     * reader is looking at it.
     */
    files: ReadonlySet<string>;
    now?: number;
  },
): Survey {
  const graph = buildLinkGraph(
    notes.map((note) => ({
      path: note.path,
      title: titleOf(note),
      content: note.content,
    })),
  );

  const found: StaleNote[] = [];

  for (const note of notes) {
    const missingFiles = referencedPaths(note.path, note.content).filter(
      // A note is allowed to point at itself, and a folder is not a file.
      (path) => path !== note.path && !options.files.has(path),
    );

    const missingLinks = [
      ...new Set(
        (graph.outgoing.get(note.path) ?? [])
          .filter((ref) => ref.to === null)
          .map((ref) => ref.target),
      ),
    ];

    const decay = assessDecay(note.content, {
      updatedAt: note.updatedAt,
      ...(options.now !== undefined ? { now: options.now } : {}),
      // The missing files are told to the decay report as well, so its verdict
      // is reached knowing the hardest evidence there is rather than in spite
      // of it.
      changedFiles: missingFiles,
    });

    const worthSaying =
      missingFiles.length > 0 || missingLinks.length > 0 || decay.verdict === "likely-stale";
    if (!worthSaying) continue;

    found.push({
      path: note.path,
      title: titleOf(note),
      updatedAt: note.updatedAt,
      ageMonths: decay.ageMonths,
      verdict: decay.verdict,
      reasons: decay.reasons,
      missingFiles,
      missingLinks,
    });
  }

  // Facts before inferences, and the oldest first within each kind — a note
  // nobody has touched in three years is more likely to be the one that has
  // actually rotted.
  found.sort(
    (a, b) =>
      weightOf(b) - weightOf(a) ||
      (b.ageMonths ?? 0) - (a.ageMonths ?? 0) ||
      a.path.localeCompare(b.path),
  );

  return {
    notes: found,
    scanned: notes.length,
    counts: {
      missingFiles: found.filter((note) => note.missingFiles.length > 0).length,
      missingLinks: found.filter((note) => note.missingLinks.length > 0).length,
      // Counted only where the age is the *reason* the note is on the list. A
      // note pointing at a deleted file is reported as "likely stale" too, and
      // counting it twice makes a summary whose numbers do not add up to the
      // rows underneath it.
      likelyStale: found.filter((note) => weightOf(note) === 1).length,
      worthChecking: found.filter((note) => weightOf(note) === 0).length,
    },
  };
}

/**
 * Notes the reader has said they are happy with, and when they said it.
 *
 * A list that reappears unchanged every time it is opened is a list people
 * stop opening. Dismissing one is remembered against the note's own
 * timestamp, so it comes back the moment the note is edited again — which is
 * the only moment its claims could have changed.
 */
export type Dismissals = Record<string, string>;

export function isDismissed(dismissals: Dismissals, note: StaleNote): boolean {
  const at = dismissals[note.path];
  return at !== undefined && at === (note.updatedAt ?? "never");
}

export function withDismissal(dismissals: Dismissals, note: StaleNote): Dismissals {
  return { ...dismissals, [note.path]: note.updatedAt ?? "never" };
}
