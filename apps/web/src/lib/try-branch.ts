import { sanitizeBranchName } from "@/lib/branch-name";

/**
 * Trying a rewrite without losing what you had.
 *
 * Rewriting a note you care about is a small act of courage: the old version
 * goes into the history, where you have to know it exists and how to get it
 * back, so in practice people either do not try or paste the original into a
 * second note called `runbook-old.md`. Both are worse than the thing every
 * programmer has had for twenty years — work on a copy, keep it or throw it
 * away, and the original is never in any danger.
 *
 * That is a branch, which this app already has for free. All that was missing
 * was a name for it that says what it is, and somewhere to say "keep this" or
 * "that did not work" without either of those meaning `git`.
 *
 * The branch name carries everything needed to offer both: `try/<base>/<slug>`
 * says it is an experiment, which branch it came from and what it is about, so
 * a second device — or the same one next week — can pick the experiment up
 * knowing where it has to land. Nothing is written down anywhere else, because
 * anything written down anywhere else would be the thing that gets lost.
 */

export const TRY_PREFIX = "try/";

export interface TryBranch {
  /** The branch this experiment must land back on, when it is kept. */
  base: string;
  /** What it is about, for saying so on screen. */
  slug: string;
}

/** `main` + "The deploy runbook" → `try/main/the-deploy-runbook`. */
export function tryBranchFor(base: string, subject: string): string {
  // Slashes out of the subject, not out of the base: the last segment is the
  // subject and everything between the prefix and it is the base, so a subject
  // with a slash in it would be read back as part of the branch it came from.
  const slug =
    sanitizeBranchName(subject.toLowerCase().replace(/\//g, "-")).slice(0, 40) || "rewrite";

  return `${TRY_PREFIX}${sanitizeBranchName(base)}/${slug}`;
}

/**
 * Reads a branch name back, or null for a branch that is not an experiment.
 *
 * A base branch with slashes in it — `release/2026` — survives, because the
 * subject is the last segment and the base is everything before it.
 */
export function parseTryBranch(branch: string): TryBranch | null {
  if (!branch.startsWith(TRY_PREFIX)) return null;

  const rest = branch.slice(TRY_PREFIX.length);
  const cut = rest.lastIndexOf("/");
  if (cut <= 0) return null;

  const base = rest.slice(0, cut);
  const slug = rest.slice(cut + 1);
  return base && slug ? { base, slug } : null;
}

/** "the-deploy-runbook" → "the deploy runbook", for saying it out loud. */
export function describeTry(slug: string): string {
  return slug.replace(/-+/g, " ").trim();
}
