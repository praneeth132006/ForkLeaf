import { inboxNote, siteOf, type SaveKind, type SaveRequest } from "@/lib/inbox";
import { plainText } from "@/lib/mind";
import { dateStamp } from "@/lib/templates";

/**
 * Where things saved from the web are kept: a repository of their own.
 *
 * Saving a page used to write a note into whichever notebook happened to be
 * open, so pages, quotes and pictures collected on the web ended up scattered
 * across repositories that are about something else. They now go to one
 * private repository, `forkleaf-saves`, filed without anybody having to file
 * them:
 *
 *     pages/2026/09/2026-09-13-how-rivers-move.md
 *     quotes/2026/09/2026-09-13-cities-are-for-people.md
 *     links/…   images/…
 *
 * One folder per kind, then year, then month, and the date at the front of
 * every name, so a folder sorts by when things were saved. `index.json` lists
 * everything for the app, and `INDEX.md` is the same list for a person on
 * github.com, grouped by month and kind, newest first. Both are rewritten in
 * the same commit as the save, so they never disagree with the folders.
 */

export const SAVES_REPO = "forkleaf-saves";
export const INDEX_JSON = "index.json";
export const INDEX_MD = "INDEX.md";

export const KIND_FOLDERS: Record<SaveKind, string> = {
  page: "pages",
  quote: "quotes",
  link: "links",
  image: "images",
};

const KIND_TITLES: Record<SaveKind, string> = {
  page: "Pages",
  quote: "Quotes",
  link: "Links",
  image: "Images",
};

const KIND_ORDER: readonly SaveKind[] = ["page", "quote", "link", "image"];
const EXCERPT_LENGTH = 280;

export interface SavedEntry {
  path: string;
  title: string;
  kind: SaveKind;
  url: string | null;
  site: string | null;
  /** `YYYY-MM-DD`. */
  saved: string;
  /** ISO timestamp, for ordering saves made on the same day. */
  savedAt: string;
  excerpt: string;
}

/** A filename-safe version of a title: lowercase words joined by hyphens. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "saved";
}

/** Where a save is filed, never on top of something already there. */
export function savePath(
  request: SaveRequest & { title: string },
  now: Date,
  taken: ReadonlySet<string>,
): string {
  const date = dateStamp(now);
  const [year, month] = date.split("-");
  const folder = `${KIND_FOLDERS[request.kind]}/${year}/${month}`;
  const stem = `${date}-${slugify(request.title)}`;
  let path = `${folder}/${stem}.md`;
  for (let n = 2; taken.has(path); n += 1) path = `${folder}/${stem}-${n}.md`;
  return path;
}

/** YAML for one value: JSON's double-quoted strings are valid YAML too. */
const yamlValue = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : JSON.stringify(value);

/** The file for one save: front matter, a heading, and what was saved. */
export function saveDocument(
  request: SaveRequest,
  now: Date,
): { title: string; markdown: string; body: string; frontmatter: Record<string, unknown> } {
  const made = inboxNote(request, now);
  const frontmatter = { title: made.title, ...made.frontmatter, savedAt: now.toISOString() };
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${yamlValue(value)}`)
    .join("\n");
  const body = `# ${made.title}\n\n${made.content}`;
  return { title: made.title, markdown: `---\n${yaml}\n---\n\n${body}`, body, frontmatter };
}

export function entryFor(
  path: string,
  request: SaveRequest,
  document: ReturnType<typeof saveDocument>,
): SavedEntry {
  const text = plainText(document.body.replace(/^# .*\n/, ""));
  return {
    path,
    title: document.title,
    kind: request.kind,
    url: request.url,
    site: siteOf(request.url),
    saved: String(document.frontmatter.saved),
    savedAt: String(document.frontmatter.savedAt),
    excerpt: text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text,
  };
}

const isKind = (value: unknown): value is SaveKind =>
  typeof value === "string" && (KIND_ORDER as readonly string[]).includes(value);

/** Reads `index.json`, keeping every entry that is well formed and dropping the rest. */
export function parseIndex(json: string | null | undefined): SavedEntry[] {
  if (!json) return [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const items = (data as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item): SavedEntry[] => {
    const entry = item as Partial<SavedEntry>;
    if (typeof entry.path !== "string" || typeof entry.title !== "string" || !isKind(entry.kind)) {
      return [];
    }
    return [
      {
        path: entry.path,
        title: entry.title,
        kind: entry.kind,
        url: typeof entry.url === "string" ? entry.url : null,
        site: typeof entry.site === "string" ? entry.site : null,
        saved: typeof entry.saved === "string" ? entry.saved : "",
        savedAt: typeof entry.savedAt === "string" ? entry.savedAt : "",
        excerpt: typeof entry.excerpt === "string" ? entry.excerpt : "",
      },
    ];
  });
}

/** Newest first; the same path is only ever listed once. */
export function withEntry(entries: readonly SavedEntry[], entry: SavedEntry): SavedEntry[] {
  return [entry, ...entries.filter((existing) => existing.path !== entry.path)].sort((a, b) =>
    b.savedAt.localeCompare(a.savedAt),
  );
}

/** The same address saved as the same kind of thing before. Quotes can repeat. */
export function findDuplicate(
  entries: readonly SavedEntry[],
  request: SaveRequest,
): SavedEntry | null {
  if (!request.url || request.kind === "quote") return null;
  return entries.find((entry) => entry.url === request.url && entry.kind === request.kind) ?? null;
}

export function indexJson(entries: readonly SavedEntry[]): string {
  return `${JSON.stringify({ version: 1, items: entries }, null, 2)}\n`;
}

const monthName = (saved: string) => {
  const [year, month] = saved.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return Number.isNaN(date.getTime())
    ? "Undated"
    : date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

const escapeLabel = (text: string) => text.replace(/([[\]\\])/g, "\\$1");

/** `INDEX.md`: everything saved, by month, then by kind, newest first. */
export function indexMarkdown(entries: readonly SavedEntry[]): string {
  const lines = [
    "# Everything saved",
    "",
    `${entries.length} ${entries.length === 1 ? "item" : "items"}, newest first. Filed automatically by ForkLeaf: each kind has its own folder, by year and month.`,
  ];

  const months = new Map<string, SavedEntry[]>();
  for (const entry of entries) {
    const key = entry.saved.slice(0, 7) || "undated";
    months.set(key, [...(months.get(key) ?? []), entry]);
  }

  for (const [key, inMonth] of [...months.entries()].sort(([a], [b]) => b.localeCompare(a))) {
    lines.push("", `## ${monthName(`${key}-01`)}`);
    for (const kind of KIND_ORDER) {
      const ofKind = inMonth.filter((entry) => entry.kind === kind);
      if (ofKind.length === 0) continue;
      lines.push("", `### ${KIND_TITLES[kind]}`, "");
      for (const entry of ofKind) {
        const details = [entry.site, entry.saved].filter(Boolean).join(" · ");
        lines.push(
          `- [${escapeLabel(entry.title)}](${entry.path})${details ? ` — ${details}` : ""}`,
        );
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

export function savesReadme(): string {
  return [
    "# Saved with ForkLeaf",
    "",
    "Pages, quotes, links and images saved from the web with the Save to ForkLeaf",
    "extension, the bookmarklet or the share sheet.",
    "",
    "Everything is filed automatically — `pages/`, `quotes/`, `links/` and `images/`,",
    "each by year and month — and listed newest first in [INDEX.md](INDEX.md).",
    "",
  ].join("\n");
}
