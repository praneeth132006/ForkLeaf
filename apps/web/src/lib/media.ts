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

/**
 * Largest image we will commit.
 *
 * Repositories are not an asset CDN, and the ceiling is lower than it looks:
 * an image travels to the commit route as base64 inside a JSON body, which is
 * a third bigger again than the file, and the host in front of that route
 * refuses a body over 4.5 MB before any of our code runs. The old 10 MB limit
 * was therefore a promise the app could not keep — the paste was accepted, the
 * note saved, and the push then failed 413 forever with nothing said about
 * which file was at fault. Refusing the picture at the moment it is pasted is
 * the honest version of the same limit.
 */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * The document types ForkLeaf will read out of a repository.
 *
 * Separate from `IMAGE_TYPES` because the two are served under different
 * rules. An image is handed to an `<img>` and rendered by the browser; a
 * document here is fetched as bytes and parsed by code we ship, and is served
 * with `Content-Disposition: attachment` so that a browser which decides to
 * navigate to the URL directly downloads the file instead of rendering
 * repository content on this app's own origin.
 *
 * PDF is the only entry, and the list exists rather than a boolean so that
 * adding the next one is a line rather than a refactor.
 */
export const DOCUMENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
};

/**
 * Largest PDF ForkLeaf will open.
 *
 * Higher than the image ceiling, and for a different reason. A PDF is not
 * committed through the JSON commit route, so the 4.5 MB body limit that caps
 * images does not apply — this is a limit on what the browser can hold and
 * parse without the tab dying. Above about 100 MB, pdf.js and the canvas
 * layer together will exhaust memory on a modest laptop, and failing at the
 * point the file is chosen is far kinder than failing halfway through
 * rendering page 400.
 */
export const MAX_PDF_BYTES = 100 * 1024 * 1024;

/**
 * Largest file ForkLeaf can commit to a repository.
 *
 * Deliberately far below `MAX_PDF_BYTES`, and for a reason that has nothing to
 * do with PDFs: a file travels to the commit route as base64 inside a JSON
 * body, which is a third larger again than the file, and the host in front of
 * that route refuses a body over 4.5 MB before any of our code runs.
 *
 * So ForkLeaf can *read* a 90 MB scan happily and cannot *save* one. Saying so
 * at the moment somebody asks to save it is the honest version of that limit —
 * the alternative is a button that fails with a 413 nobody can interpret.
 */
export const MAX_COMMITTABLE_BYTES = 3 * 1024 * 1024;

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

/** The MIME type for a document path we are willing to serve, or null. */
export function documentTypeFor(path: string): string | null {
  return DOCUMENT_TYPES[extensionOf(path)] ?? null;
}

/**
 * The MIME type for any repository file ForkLeaf serves back, or null.
 *
 * The single gate the raw-asset route checks. Anything not named here is
 * refused, which is what keeps that route — which reads with the user's OAuth
 * token — from being a way to serve arbitrary repository content, HTML very
 * much included, from this app's origin.
 */
export function servableTypeFor(path: string): string | null {
  return imageTypeFor(path) ?? documentTypeFor(path);
}

/** True for a path that is a PDF. */
export function isPdfPath(path: string): boolean {
  return documentTypeFor(path) === "application/pdf";
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
