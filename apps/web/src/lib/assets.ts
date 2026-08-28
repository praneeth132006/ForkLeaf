"use client";

import {
  dirname,
  relativeFromNote,
  resolveFromNote,
  stripExtension,
  uniquePath,
} from "@forkleaf/markdown-engine";
import type { LocalAsset, Workspace } from "@forkleaf/types";
import { extensionForFile, imageTypeFor, MAX_IMAGE_BYTES, safeAssetName } from "@/lib/media";

/**
 * Images in notes.
 *
 * The rule this file exists to keep is that a note stays a plain markdown file
 * that renders correctly on github.com, in an IDE, or in anything else that
 * reads the repository. So an image is committed as a real file next to the
 * notes, and the note links to it by a *relative* path — `../assets/chart.png`
 * — exactly as a hand-written markdown file would.
 *
 * That path is not something a browser sitting on `/editor` can resolve, and
 * for a private repository it could not fetch the bytes anyway, since the
 * OAuth token never leaves the server. `resolveImageSrc` is the other half:
 * it turns the portable path back into a same-origin URL the page can render.
 * Nothing that gets written to disk knows this app exists.
 *
 * A workspace with no repository behind it has nowhere to commit to, and used
 * to inline the image into the note as a `data:` URI — which turned a two-line
 * note into a screenful of base64, unreadable in the source view and useless to
 * every other tool that opens the file. The bytes go into local storage instead
 * and the note gets the same relative path it would have had. The markdown is
 * identical either way; only where the file lives differs.
 */

/** Folder, relative to the workspace directory, that uploads are committed to. */
const ASSET_FOLDER = "assets";

/** True for a clipboard or drop payload we can actually store. */
export function isSupportedImage(file: File): boolean {
  return extensionForFile(file) !== null;
}

/** Pulls every image out of a clipboard or drag payload. */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];

  const files: File[] = [];
  for (const item of Array.from(data.files)) {
    if (isSupportedImage(item)) files.push(item);
  }
  return files;
}

/**
 * Reads a `File` as base64, without the `data:…;base64,` prefix.
 *
 * FileReader rather than `arrayBuffer()` + manual encoding: the manual loop
 * blows the call-stack argument limit on anything above a megabyte or so,
 * which is most screenshots.
 */
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** Reads a `File` as a `data:` URL, for workspaces with nowhere to commit to. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

/**
 * `notes/2026/plan.md` + `assets/chart.png` → `../../assets/chart.png`.
 *
 * Written relative rather than absolute because that is what works everywhere:
 * a leading-slash path in markdown resolves against the *site* root on GitHub
 * Pages and against nothing at all in an editor, while `../assets/chart.png`
 * means the same thing in every one of them.
 */
export function relativeSrc(fromNotePath: string, toAssetPath: string): string {
  return relativeFromNote(fromNotePath, toAssetPath);
}

/**
 * Resolves a src written in a note back to the repo path it points at.
 *
 * The src is percent-decoded first, and that is the whole point of this
 * function existing rather than being a `normalizePath` call.
 *
 * A markdown renderer writes URLs, not paths: a note in `SOC 101` comes back
 * from both the preview and the rich editor as `../SOC%20101/assets/x.png`,
 * because that is what belongs in an `<img src>`. Resolving that literally
 * produced the repo path `SOC%20101/assets/x.png`, which matches nothing in
 * the local store and asks GitHub for a file whose name really does contain a
 * per-cent sign — so every image in every folder with a space in its name was
 * a broken box in this app while rendering perfectly on github.com.
 */
export function resolveAgainstNote(notePath: string, src: string): string {
  return resolveFromNote(notePath, src);
}

/** True for a src that names a file in the repository rather than somewhere else. */
export function isRepoRelative(src: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("//") && !src.startsWith("/");
}

/**
 * Stand-in for an image whose bytes are nowhere to be found.
 *
 * Inline SVG rather than a hosted file so it renders with no request at all,
 * including offline, which is when it is most likely to be needed.
 */
export const MISSING_IMAGE_SRC =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120" role="img" aria-label="Image not on this device">` +
      `<rect x="0.5" y="0.5" width="319" height="119" rx="7" fill="none" stroke="#8b8b8b" stroke-opacity="0.45" stroke-dasharray="5 4"/>` +
      `<text x="160" y="56" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#8b8b8b">Image not on this device</text>` +
      `<text x="160" y="76" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11.5" fill="#8b8b8b" fill-opacity="0.75">Connect the repository it was saved to</text>` +
      `</svg>`,
  );

/**
 * The URL the browser should actually load for an image in a note.
 *
 * Absolute URLs and `data:` images are already loadable and pass through
 * untouched; a repository-relative path becomes a call to our own proxy, which
 * reads it with the session's token.
 */
export function resolveImageSrc(
  workspace: Workspace | null,
  notePath: string | null,
  src: string,
  /** Object URLs for assets held on this device, keyed by repository path. */
  local?: Readonly<Record<string, string>>,
): string {
  if (!src || !isRepoRelative(src)) return src;
  if (!workspace || !notePath) return src;

  const path = resolveAgainstNote(notePath, src);

  // A copy on this device is both the only source for a workspace with no
  // repository and the faster one for a workspace that has been given a
  // repository — it renders without a round trip through the proxy.
  const stored = local?.[path];
  if (stored) return stored;

  // A workspace with no repository has exactly one place the bytes could be,
  // and they are not there. Returning the note-relative path made the browser
  // ask the app's own origin for `/assets/…`, get a 404, and draw the broken
  // image icon with the filename next to it — which reads like a bug in the
  // note rather than a file this device does not have.
  if (workspace.isLocal) return MISSING_IMAGE_SRC;

  const params = new URLSearchParams({
    owner: workspace.repo.owner,
    repo: workspace.repo.repo,
    branch: workspace.repo.branch,
    path,
  });
  if (workspace.repo.directory) params.set("dir", workspace.repo.directory);

  return `/api/gh/raw?${params.toString()}`;
}

// ─── Local storage ──────────────────────────────────────────────────────────

/**
 * Chooses the repository path a file should be committed to.
 *
 * Images are filed under the folder of the note that uses them —
 * `SOC 101/Phishing analysis/assets/…` for a note in `SOC 101/Phishing
 * analysis` — rather than all together at the top of the repository.
 *
 * One flat `assets/` folder is fine for a week and unusable after a year: a
 * few hundred screenshots from unrelated notes in one listing, none of which
 * can be traced back to what they belong to without opening them. Filing them
 * beside their note means the folder you are reading contains the pictures
 * that folder uses, deleting a project takes its images with it, and the
 * relative link in the note is shorter and more obviously correct.
 *
 * A pasted screenshot arrives called "image.png" every single time. The date
 * keeps a week of them apart in the listing, and the random tail keeps two
 * pasted in the same minute from overwriting each other — the repository tree
 * we index only lists markdown, so there is no reliable "does this name
 * already exist" to ask.
 */
export function assetPathFor(
  workspace: Workspace,
  file: File,
  taken: Iterable<string>,
  /** The note the image is being added to; its folder is where they are kept. */
  notePath?: string,
): string {
  const extension = extensionForFile(file);
  if (!extension) {
    throw new Error("That file is not an image ForkLeaf can store.");
  }

  // The note's folder, then the workspace's own subdirectory, then the root —
  // whichever is the most specific thing we actually know.
  const noteFolder = notePath ? dirname(notePath) : "";
  const base = noteFolder || workspace.repo.directory || "";
  const folder = base ? `${base}/${ASSET_FOLDER}` : ASSET_FOLDER;

  const stamp = new Date().toISOString().slice(0, 10);
  const tail = Math.random().toString(36).slice(2, 6);
  const named = safeAssetName(file.name || "image", extension);

  return uniquePath(`${folder}/${stamp}-${stripExtension(named)}-${tail}.${extension}`, taken);
}

/** Reads a file into the shape the local asset store holds. */
export async function assetFrom(options: {
  workspace: Workspace;
  repoPath: string;
  file: File;
  pushed: boolean;
}): Promise<LocalAsset> {
  const { workspace, repoPath, file, pushed } = options;

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Images have to be under 3 MB to be committed to GitHub — save a smaller copy and paste that instead.`,
    );
  }

  return {
    id: `${workspace.id}::${repoPath}`,
    workspaceId: workspace.id,
    path: repoPath,
    mimeType: file.type || (imageTypeFor(repoPath) ?? "application/octet-stream"),
    data: await readAsBase64(file),
    createdAt: new Date().toISOString(),
    pushed,
  };
}

/**
 * An object URL for a stored asset.
 *
 * Object URLs rather than `data:` ones: the browser holds the bytes once and
 * hands the `<img>` a handle, where a data URL means a second full copy of
 * every image sitting in a React state object. The caller owns the URL and
 * must revoke it — `URL.revokeObjectURL` — when the note it belongs to closes.
 */
export function assetObjectUrl(asset: LocalAsset): string {
  const binary = atob(asset.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: asset.mimeType }));
}

/** True when a path is one of the image types we serve. */
export function isImagePath(path: string): boolean {
  return imageTypeFor(path) !== null;
}
