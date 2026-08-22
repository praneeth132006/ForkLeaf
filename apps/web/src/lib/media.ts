/**
 * The image formats ForkLeaf will store in a repository and serve back.
 *
 * A closed list rather than "anything that looks like an image": the bytes come
 * from a file picker or a clipboard, and both are attacker-reachable if someone
 * is talked into pasting the wrong thing. SVG is deliberately absent — it is a
 * document format that can carry script, and serving one from our own origin
 * would be a stored-XSS hole in every note that embeds it.
 */
export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

/** Largest image we will commit. Repositories are not an asset CDN. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Extension of a path, lowercased and without the dot. */
export function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** The MIME type for a path we are willing to serve, or null. */
export function imageTypeFor(path: string): string | null {
  return IMAGE_TYPES[extensionOf(path)] ?? null;
}

/** The extension to store a browser `File` under, from its type then its name. */
export function extensionForFile(file: { name?: string; type?: string }): string | null {
  const byType = Object.entries(IMAGE_TYPES).find(([, mime]) => mime === file.type);
  // `jpg` and `jpeg` share a MIME type; the first match is `jpg`, which is the
  // spelling we would rather write into a repository anyway.
  if (byType) return byType[0];

  const fromName = extensionOf(file.name ?? "");
  return fromName in IMAGE_TYPES ? fromName : null;
}

/**
 * A filename safe to commit: lowercase, no spaces, no directory separators.
 *
 * The name comes from the user's own disk or from a clipboard, so it can hold
 * anything at all — including `../` — and it ends up as a path in a git tree.
 */
export function safeAssetName(name: string, extension: string): string {
  const base = (name.split("/").pop() ?? name).replace(/\.[^.]*$/, "");

  const slug = base
    // Decompose accents so "Café" becomes "cafe" rather than "caf" — dropping
    // the letters outright turns a perfectly good name into initials.
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${slug || "image"}.${extension}`;
}
