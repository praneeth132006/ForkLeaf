"use client";

import { dirname, normalizePath, stripExtension, uniquePath } from "@forkleaf/markdown-engine";
import type { Workspace } from "@forkleaf/types";
import { ApiGatewayError } from "@/lib/gateway";
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
 */

/** Folder, relative to the workspace directory, that uploads are committed to. */
const ASSET_FOLDER = "assets";

export interface UploadedImage {
  /** What to write into the markdown — relative to the note. */
  markdownSrc: string;
  /** Full repo path of the committed file. */
  repoPath: string;
}

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
  const from = normalizePath(dirname(fromNotePath)).split("/").filter(Boolean);
  const to = normalizePath(toAssetPath).split("/").filter(Boolean);

  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) {
    shared += 1;
  }

  const up = from.length - shared;
  const down = to.slice(shared);
  const steps = [...Array.from({ length: up }, () => ".."), ...down];

  // A file in the same folder needs the `./`, or a name containing a colon
  // would be read as a URL scheme.
  return up === 0 && down.length === 1 ? `./${steps.join("/")}` : steps.join("/");
}

/** Resolves a src written in a note back to the repo path it points at. */
export function resolveAgainstNote(notePath: string, src: string): string {
  return normalizePath(`${dirname(notePath)}/${src}`);
}

/** True for a src that names a file in the repository rather than somewhere else. */
export function isRepoRelative(src: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("//") && !src.startsWith("/");
}

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
): string {
  if (!src || !isRepoRelative(src)) return src;
  if (!workspace || workspace.isLocal || !notePath) return src;

  const path = resolveAgainstNote(notePath, src);
  const params = new URLSearchParams({
    owner: workspace.repo.owner,
    repo: workspace.repo.repo,
    branch: workspace.repo.branch,
    path,
  });
  if (workspace.repo.directory) params.set("dir", workspace.repo.directory);

  return `/api/gh/raw?${params.toString()}`;
}

/**
 * Commits an image and returns the src to write into the note.
 *
 * `taken` is every path already in the workspace, so two screenshots pasted a
 * second apart do not overwrite one another.
 */
export async function uploadImage(options: {
  workspace: Workspace;
  notePath: string;
  file: File;
  taken: Iterable<string>;
}): Promise<UploadedImage> {
  const { workspace, notePath, file, taken } = options;

  const extension = extensionForFile(file);
  if (!extension) {
    throw new Error("That file is not an image ForkLeaf can store.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("That image is larger than 10 MB.");
  }

  const folder = workspace.repo.directory
    ? `${workspace.repo.directory}/${ASSET_FOLDER}`
    : ASSET_FOLDER;

  // A pasted screenshot arrives called "image.png" every single time. The date
  // keeps a week of them apart in the folder listing, and the random tail
  // keeps two pasted in the same minute from overwriting each other — the
  // repository tree we index only lists markdown, so there is no reliable
  // "does this name already exist" to ask.
  const stamp = new Date().toISOString().slice(0, 10);
  const tail = Math.random().toString(36).slice(2, 6);
  const named = safeAssetName(file.name || "image", extension);
  const repoPath = uniquePath(
    `${folder}/${stamp}-${stripExtension(named)}-${tail}.${extension}`,
    taken,
  );

  const content = await readAsBase64(file);

  const response = await fetch("/api/gh/asset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: workspace.repo.owner,
      repo: workspace.repo.repo,
      branch: workspace.repo.branch,
      dir: workspace.repo.directory,
      path: repoPath,
      content,
      message: `add ${repoPath}`,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;

    throw new ApiGatewayError(
      body?.error?.code ?? "unknown",
      body?.error?.message ?? "That image could not be uploaded.",
      response.status,
    );
  }

  return { markdownSrc: relativeSrc(notePath, repoPath), repoPath };
}

/** True when a path is one of the image types we serve. */
export function isImagePath(path: string): boolean {
  return imageTypeFor(path) !== null;
}
