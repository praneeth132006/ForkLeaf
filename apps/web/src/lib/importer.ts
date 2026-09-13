import {
  basename,
  dirname,
  extname,
  normalizePath,
  relativeFromNote,
  uniquePath,
} from "@forkleaf/markdown-engine";
import { MAX_COMMITTABLE_BYTES, servableTypeFor } from "@/lib/media";

/**
 * Bringing a notebook in from Obsidian or Notion.
 *
 * Both export plain markdown already, which is most of the work. What differs
 * is the dialect around it:
 *
 *   - **Obsidian** keeps a vault as folders of `.md` files, embeds pictures
 *     with `![[picture.png]]` found by filename anywhere in the vault, and
 *     keeps its own settings in `.obsidian/`. The notes and folders come across
 *     unchanged; embeds become ordinary markdown images pointing at where the
 *     picture landed, so they render here and on github.com.
 *   - **Notion** appends a 32-character id to every page and folder name, and
 *     links pages with URL-encoded relative paths that carry those ids. The
 *     ids are removed, and every link is rewritten to the cleaned path so it
 *     still finds its page. Databases come out as CSV, which is not a note, and
 *     are skipped with a reason.
 *
 * Nothing is written here. The plan is read, shown, and only imported when the
 * person says so.
 */

export type ImportSource = "obsidian" | "notion";

export interface ImportInput {
  /** The file's path inside the folder that was picked, e.g. `Vault/Ideas/one.md`. */
  path: string;
  file: File;
}

export interface PlannedNote {
  from: string;
  path: string;
  content: string;
}

export interface PlannedAsset {
  from: string;
  path: string;
  file: File;
}

export interface ImportPlan {
  notes: PlannedNote[];
  assets: PlannedAsset[];
  skipped: { path: string; reason: string }[];
  /** Links and embeds that were changed to point at where things landed. */
  linksRewritten: number;
}

export const MAX_IMPORTED_NOTES = 2000;

const MARKDOWN = /\.mdx?$/i;
const NOTION_ID = /\s+[0-9a-f]{32}$/i;
const SKIPPED_FOLDERS = new Set([".obsidian", ".trash", ".git", "node_modules"]);

/** A Notion page or folder name without the id Notion appends to it. */
export function cleanNotionSegment(segment: string): string {
  const extension = extname(segment);
  const stem = extension ? segment.slice(0, -extension.length) : segment;
  const cleaned = stem.replace(NOTION_ID, "").trim();
  return `${cleaned || stem}${extension}`;
}

/** Markdown-safe form of a relative path: spaces and parentheses escaped. */
const linkTarget = (path: string) =>
  path.replace(/[ ()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The picked folder's own name is the first segment of every path; drop it. */
function withoutPickedFolder(inputs: readonly ImportInput[]): ImportInput[] {
  const firstSegments = new Set(inputs.map((input) => normalizePath(input.path).split("/")[0]));
  const shared =
    firstSegments.size === 1 && inputs.every((input) => normalizePath(input.path).includes("/"));
  return inputs.map((input) => {
    const path = normalizePath(input.path);
    return { ...input, path: shared ? path.split("/").slice(1).join("/") : path };
  });
}

export async function planImport(
  rawInputs: readonly ImportInput[],
  options: {
    source: ImportSource;
    /** Folder in this notebook the import goes into, e.g. `Imported/Obsidian`. */
    destination: string;
    /** Every path already in the notebook, so nothing is overwritten. */
    taken: Iterable<string>;
  },
): Promise<ImportPlan> {
  const destination = normalizePath(options.destination);
  const taken = new Set(options.taken);
  const skipped: ImportPlan["skipped"] = [];
  const noteInputs: ImportInput[] = [];
  const assetInputs: ImportInput[] = [];

  for (const input of withoutPickedFolder(rawInputs)) {
    const segments = input.path.split("/");
    if (segments.some((segment) => SKIPPED_FOLDERS.has(segment) || segment.startsWith("."))) {
      continue; // Settings, trash and hidden files are not part of the notebook.
    }
    if (MARKDOWN.test(input.path)) {
      if (input.file.size > MAX_COMMITTABLE_BYTES) {
        skipped.push({
          path: input.path,
          reason: "Larger than 3 MB, which is more than one commit carries.",
        });
      } else if (noteInputs.length >= MAX_IMPORTED_NOTES) {
        skipped.push({
          path: input.path,
          reason: `Only ${MAX_IMPORTED_NOTES} notes are imported at once.`,
        });
      } else {
        noteInputs.push(input);
      }
    } else if (/\.csv$/i.test(input.path) && options.source === "notion") {
      skipped.push({
        path: input.path,
        reason: "A Notion database table, exported as CSV — not a note.",
      });
    } else if (servableTypeFor(input.path)) {
      if (input.file.size > MAX_COMMITTABLE_BYTES) {
        skipped.push({
          path: input.path,
          reason: "Larger than 3 MB, which is more than one commit carries.",
        });
      } else {
        assetInputs.push(input);
      }
    } else {
      skipped.push({
        path: input.path,
        reason: "Not a note, and not a picture, PDF or recording ForkLeaf can keep.",
      });
    }
  }

  // Where each file lands, decided for everything before any content is read,
  // so links can be pointed at files that come later in the list.
  const landed = new Map<string, string>();
  const place = (from: string) => {
    const renamed =
      options.source === "notion" ? from.split("/").map(cleanNotionSegment).join("/") : from;
    const target = uniquePath(normalizePath(`${destination}/${renamed}`), taken);
    taken.add(target);
    landed.set(from, target);
    return target;
  };
  const assets = assetInputs.map((input) => ({
    from: input.path,
    path: place(input.path),
    file: input.file,
  }));
  const planned = noteInputs.map((input) => ({ input, path: place(input.path) }));

  // Obsidian finds an embedded file by its name, wherever it is in the vault.
  const assetsByName = new Map<string, string>();
  for (const asset of assets) {
    const name = basename(asset.from).toLowerCase();
    if (!assetsByName.has(name)) assetsByName.set(name, asset.path);
  }

  let linksRewritten = 0;
  const notes: PlannedNote[] = [];

  for (const { input, path } of planned) {
    let content = await input.file.text();

    if (options.source === "obsidian") {
      content = content.replace(
        /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g,
        (whole, target: string, alias?: string) => {
          const name = basename(target.trim()).toLowerCase();
          const asset = assetsByName.get(name) ?? assetsByName.get(`${name}.png`);
          if (asset) {
            linksRewritten += 1;
            const label = alias && !/^\d+(x\d+)?$/.test(alias.trim()) ? alias.trim() : "";
            return `![${label}](${linkTarget(relativeFromNote(path, asset))})`;
          }
          if (!extname(target.trim()) || MARKDOWN.test(target.trim())) {
            // A note embedded in another becomes a link to it; ForkLeaf does not transclude.
            linksRewritten += 1;
            return `[[${target.trim()}${alias ? `|${alias.trim()}` : ""}]]`;
          }
          return whole;
        },
      );
    } else {
      content = content.replace(
        /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g,
        (whole, bang: string, label: string, href: string) => {
          if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/"))
            return whole;
          const [target, anchor] = href.split("#") as [string, string | undefined];
          const resolved = normalizePath(`${dirname(input.path)}/${safeDecode(target)}`);
          const destinationPath = landed.get(resolved);
          if (!destinationPath) return whole;
          linksRewritten += 1;
          const relative = linkTarget(relativeFromNote(path, destinationPath));
          return `${bang}[${label}](${relative}${anchor ? `#${anchor}` : ""})`;
        },
      );
    }

    notes.push({ from: input.path, path, content });
  }

  return { notes, assets, skipped, linksRewritten };
}
