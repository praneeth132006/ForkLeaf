/**
 * Repo-relative path helpers.
 *
 * Every path in mdnotion is POSIX-style, relative to the repo root, and never
 * starts or ends with a slash. GitHub rejects paths containing `..` or leading
 * slashes, so normalisation happens here once rather than at each call site.
 */

/** Collapses separators and resolves `.`/`..` segments, refusing to escape the root. */
export function normalizePath(input: string): string {
  const segments: string[] = [];

  for (const raw of input.split("/")) {
    const segment = raw.trim();
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.join("/");
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.join("/"));
}

export function dirname(path: string): string {
  const idx = normalizePath(path).lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

export function basename(path: string): string {
  return normalizePath(path).split("/").pop() ?? "";
}

export function extname(path: string): string {
  const base = basename(path);
  const idx = base.lastIndexOf(".");
  return idx <= 0 ? "" : base.slice(idx);
}

export function stripExtension(path: string): string {
  const ext = extname(path);
  return ext ? path.slice(0, -ext.length) : path;
}

export function isMarkdownPath(path: string): boolean {
  return /\.mdx?$/i.test(path);
}

/**
 * Turns a free-text note title into a safe filename segment.
 *
 * Uses an allowlist rather than a denylist: a denylist of "illegal on Windows"
 * characters keeps quietly letting new ones through, and a filename is the one
 * thing in this app that has to survive being cloned onto any OS.
 */
export function slugifyFilename(title: string): string {
  const cleaned = title
    // Decompose accents so "Café" becomes "Cafe" instead of being stripped.
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .toLowerCase();

  return cleaned || "untitled";
}

/**
 * Finds a path that does not collide with an existing one by appending `-2`,
 * `-3`, … before the extension.
 */
export function uniquePath(desired: string, taken: Iterable<string>): string {
  const existing = new Set(taken);
  if (!existing.has(desired)) return desired;

  const ext = extname(desired);
  const stem = stripExtension(desired);

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem}-${n}${ext}`;
    if (!existing.has(candidate)) return candidate;
  }

  return `${stem}-${Date.now()}${ext}`;
}

/** True when `path` sits inside `folder` (or `folder` is the repo root). */
export function isInsideFolder(path: string, folder: string): boolean {
  if (folder === "") return true;
  return path === folder || path.startsWith(`${folder}/`);
}

/** Removes a workspace's directory prefix, giving a path relative to the workspace. */
export function relativeToDirectory(path: string, directory: string): string {
  if (directory === "") return path;
  return path.startsWith(`${directory}/`) ? path.slice(directory.length + 1) : path;
}
