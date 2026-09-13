/**
 * A notebook's health, as a badge for its README.
 *
 * Three numbers anybody looking at a notes repository wants at a glance: links
 * that point at nothing, notes that have probably gone stale, and how many days
 * in a row flashcards have been reviewed. The badge is an SVG in the style
 * shields.io made familiar, so it sits beside a project's other badges.
 */

export type HealthStatus = "healthy" | "attention" | "broken" | "unknown";

export interface NotebookHealth {
  status: HealthStatus;
  /** Links and file references that go nowhere. */
  broken: number;
  /** Notes judged likely stale. */
  stale: number;
  /** Days in a row, up to today or yesterday, with a review. */
  streak: number;
  scanned: number;
}

export const COLOURS: Record<HealthStatus, string> = {
  healthy: "#2ea44f",
  attention: "#dfb317",
  broken: "#e05d44",
  unknown: "#9f9f9f",
};

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Days in a row with at least one review, counting back from today.
 *
 * A streak is still alive on a day nothing has been reviewed yet, so it counts
 * from yesterday when today has no review — the badge should not break every
 * morning before breakfast.
 */
export function streakFrom(reviewedAt: readonly string[], today: Date): number {
  const days = new Set(
    reviewedAt
      .map((stamp) => new Date(stamp))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map(dayOf),
  );
  const cursor = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  if (!days.has(dayOf(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(dayOf(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function healthOf(input: {
  counts: { missingFiles: number; missingLinks: number; likelyStale: number };
  scanned: number;
  reviewedAt: readonly string[];
  today: Date;
}): NotebookHealth {
  const broken = input.counts.missingFiles + input.counts.missingLinks;
  const stale = input.counts.likelyStale;
  return {
    status: broken > 0 ? "broken" : stale > 0 ? "attention" : "healthy",
    broken,
    stale,
    streak: streakFrom(input.reviewedAt, input.today),
    scanned: input.scanned,
  };
}

export function healthMessage(health: NotebookHealth): string {
  const parts = [
    health.broken > 0 ? `${health.broken} broken` : "links ok",
    `${health.stale} stale`,
  ];
  if (health.streak > 0) parts.push(`${health.streak}-day streak`);
  return parts.join(" · ");
}

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Roughly how wide text is in 11px Verdana, which is what badges are set in. */
const widthOf = (text: string) => Math.round(text.length * 6.6 + 10);

/** A flat badge: a grey label, and a coloured message. */
export function badgeSvg(options: { label: string; message: string; color: string }): string {
  const label = escapeXml(options.label);
  const message = escapeXml(options.message);
  const left = widthOf(options.label);
  const right = widthOf(options.message);
  const total = left + right;
  const color = /^#[0-9a-f]{6}$/i.test(options.color) ? options.color : COLOURS.unknown;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${label}: ${message}">` +
    `<title>${label}: ${message}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${left}" height="20" fill="#555"/><rect x="${left}" width="${right}" height="20" fill="${color}"/><rect width="${total}" height="20" fill="url(#s)"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${left / 2}" y="14">${label}</text><text x="${left + right / 2}" y="14">${message}</text></g>` +
    `</svg>`
  );
}

export function healthBadge(health: NotebookHealth): string {
  return badgeSvg({
    label: "notebook",
    message: healthMessage(health),
    color: COLOURS[health.status],
  });
}

/** The markdown for a README: the badge, linking to the repository. */
export function badgeMarkdown(
  origin: string,
  repository: { owner: string; repo: string; directory?: string },
): string {
  const params = new URLSearchParams({ owner: repository.owner, repo: repository.repo });
  if (repository.directory) params.set("dir", repository.directory);
  return `[![Notebook health](${origin}/api/badge?${params.toString()})](https://github.com/${repository.owner}/${repository.repo})`;
}
