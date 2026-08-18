/**
 * What ForkLeaf does, as a list.
 *
 * There are no plans any more. This used to be a three-tier catalogue with
 * entitlement lookup behind it; the tiers are gone and every feature ships to
 * everyone, so all that survives is the feature list the pricing section reads.
 *
 * Deliberately free of any Firebase or React import, so server components can
 * render it without pulling a client SDK into the bundle.
 */

/**
 * Only what actually ships today.
 *
 * Branch switching, pull requests and cross-repo full-text search are planned
 * but not built, so they are deliberately absent — a feature list is a promise,
 * and the previous tier copy already over-promised once.
 */
export const EVERYTHING: readonly string[] = [
  "Unlimited notes in your own repo",
  "Unlimited connected repositories",
  "Rich, split and source editing",
  "Mermaid diagram studio with a visual builder",
  "Markdown, HTML, Word and PDF export",
  "Offline-first with background sync",
  "Full commit history for every note",
  "Conflict resolution that shows both versions",
  "Works with any repo you can push to",
];
