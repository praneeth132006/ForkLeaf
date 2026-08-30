import { workspaceId, type Workspace } from "@forkleaf/types";
import { isPdfTarget, serializeCitation, splitTarget, type PdfCitation } from "@forkleaf/pdf";
import { resolveAgainstNote, isRepoRelative } from "@/lib/assets";
import { isPdfPath, MAX_COMMITTABLE_BYTES, MAX_PDF_BYTES } from "@/lib/media";
import { dirname, stripExtension, uniquePath } from "@forkleaf/markdown-engine";
import { safeAssetName } from "@/lib/media";

/**
 * Where a PDF's bytes come from.
 *
 * There are three ways into the reader and they have almost nothing in common
 * except that a document comes out:
 *
 *   - a file on this machine, chosen in a picker or handed over by the
 *     operating system, which is already bytes;
 *   - a file in the connected repository, which is a path that has to be read
 *     through the same authenticated proxy that serves images;
 *   - a link inside a note, which is a *relative* path that means nothing
 *     until it is resolved against the note holding it.
 *
 * Collapsing those into one description here is what keeps the reader itself
 * from knowing about any of it. It is handed a source and gets bytes.
 */

export type PdfSource =
  | {
      kind: "local";
      /** Stable identity for a document with no repository path. */
      id: string;
      name: string;
      bytes: Uint8Array;
    }
  | {
      kind: "repo";
      id: string;
      name: string;
      workspaceId: string;
      /** Repo-relative path, the form everything else in ForkLeaf uses. */
      path: string;
    };

/** A source for a PDF held in the connected repository. */
export function repoSource(workspace: Workspace, path: string): PdfSource {
  return {
    kind: "repo",
    id: `${workspace.id}::${path}`,
    name: path.split("/").pop() ?? path,
    workspaceId: workspace.id,
    path,
  };
}

/**
 * A source for a PDF from this machine.
 *
 * The id includes the size and a counter rather than only the name, because
 * two different files called `paper.pdf` from two different folders are two
 * documents, and opening the second should not silently show the first.
 */
let localCounter = 0;

export function localSource(name: string, bytes: Uint8Array): PdfSource {
  localCounter += 1;
  return { kind: "local", id: `local:${localCounter}:${name}`, name, bytes };
}

/** The repository coordinates a document is addressed by, as query parameters. */
function repoParams(workspace: Workspace, path: string): URLSearchParams {
  const params = new URLSearchParams({
    owner: workspace.repo.owner,
    repo: workspace.repo.repo,
    branch: workspace.repo.branch,
    path,
  });
  if (workspace.repo.directory) params.set("dir", workspace.repo.directory);
  return params;
}

/**
 * A link to the reader tab for a document in the repository.
 *
 * The whole address goes in the URL — which repository, which branch, which
 * file, and which passage — rather than a workspace id that only means
 * something to the database on this device. So the tab opens without touching
 * IndexedDB at all, the link survives being bookmarked, and it still works for
 * a colleague with access to the same repository. A workspace id would have
 * been shorter and would have meant nothing anywhere else.
 */
export function readerUrl(
  workspace: Workspace,
  path: string,
  citation?: PdfCitation | null,
): string {
  const params = repoParams(workspace, path);
  const fragment = citation ? serializeCitation(citation) : "";

  return `/reader?${params.toString()}${fragment ? `#${fragment}` : ""}`;
}

/**
 * The URL the reader should fetch a repository PDF from.
 *
 * The same proxy that serves images, for the same two reasons: a repo-relative
 * path is not something the browser can resolve, and for a private repository
 * the token needed to read it never leaves the server.
 */
export function pdfFetchUrl(workspace: Workspace, path: string): string {
  return `/api/gh/raw?${repoParams(workspace, path).toString()}`;
}

/**
 * Reads the repository coordinates back out of a reader URL's parameters.
 *
 * Returns null when anything required is missing, which is the reader tab
 * being opened with a hand-edited or truncated link — a case worth saying
 * something about rather than showing an empty viewer.
 */
export function workspaceFromParams(params: URLSearchParams): {
  workspace: Workspace;
  path: string;
} | null {
  const owner = params.get("owner");
  const repo = params.get("repo");
  const branch = params.get("branch");
  const path = params.get("path");
  if (!owner || !repo || !branch || !path) return null;

  const directory = params.get("dir") ?? "";
  const ref = { owner, repo, branch, directory };

  // A workspace shaped from a URL rather than read from storage. Only the
  // repository reference is ever used downstream — the reader neither writes
  // notes nor syncs — so the presentation fields are filled in honestly rather
  // than invented from a database this tab has not opened.
  return {
    workspace: {
      id: workspaceId(ref),
      name: `${owner}/${repo}`,
      repo: ref,
      isDefault: false,
      isLocal: false,
      createdAt: "",
      lastOpenedAt: "",
    },
    path,
  };
}

/**
 * Fetches a repository PDF, refusing one too large to hold.
 *
 * The size is taken from the response header before the body is read, so a
 * 400 MB scan is declined rather than downloaded and then declined.
 */
export async function fetchRepoPdf(workspace: Workspace, path: string): Promise<Uint8Array> {
  const response = await fetch(pdfFetchUrl(workspace, path));

  if (!response.ok) {
    // The proxy answers in plain text, and its messages are written to be
    // read by a person — an expired sign-in says so.
    throw new Error((await response.text()) || "That PDF could not be read from the repository.");
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_PDF_BYTES) {
    throw new Error(
      `That PDF is ${(declared / (1024 * 1024)).toFixed(0)} MB, which is larger than ForkLeaf can open.`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * What a link in a note points at, when it points at a PDF.
 *
 * Returns null for every other link, which is most of them — this runs on
 * every click in the preview, so saying "not mine" quickly matters.
 *
 * An absolute URL to a PDF somewhere on the web is deliberately *not* claimed.
 * ForkLeaf would have to fetch it through a proxy to read it, which means
 * telling this app's server which papers somebody is reading; a link to
 * another site stays a link to another site.
 */
export function pdfLinkTarget(
  notePath: string,
  href: string,
): { path: string; fragment: string } | null {
  if (!href || !isPdfTarget(href)) return null;
  if (!isRepoRelative(href)) return null;

  const { path, fragment } = splitTarget(href);
  const resolved = resolveAgainstNote(notePath, path);

  return isPdfPath(resolved) ? { path: resolved, fragment } : null;
}

// ─── Keeping a PDF ──────────────────────────────────────────────────────────

/**
 * Folder, relative to the note using it, that saved documents are filed under.
 *
 * `papers` rather than `assets`, which is where images go. They are different
 * kinds of thing to a reader looking at the repository on github.com: an image
 * is part of a note's presentation, and a paper is a source the note is
 * *about*. Filing them together would make both folders harder to read.
 */
const PAPER_FOLDER = "papers";

/**
 * Where a PDF should be committed, given the note it is being read beside.
 *
 * Beside that note, for the reason images are: a folder you are reading holds
 * the things that folder uses, deleting a project takes its sources with it,
 * and the relative link in the note is short and obviously correct.
 *
 * The name is kept close to the one the file already had — a paper called
 * `1706.03762v7.pdf` should not become `document-3.pdf` — but slugified,
 * because it came from somebody's disk and can contain anything at all,
 * including `../`.
 */
export function pdfPathFor(
  workspace: Workspace,
  fileName: string,
  taken: Iterable<string>,
  notePath?: string,
): string {
  const noteFolder = notePath ? dirname(notePath) : "";
  const base = noteFolder || workspace.repo.directory || "";
  const folder = base ? `${base}/${PAPER_FOLDER}` : PAPER_FOLDER;

  // `safeAssetName` falls back to "image" for a name that slugifies to
  // nothing, which is the right word for the thing it was written for and the
  // wrong one here — a paper called `image.pdf` helps nobody.
  const slug = stripExtension(safeAssetName(fileName, "pdf"));
  const named = !slug || slug === "image" ? "paper" : slug;

  return uniquePath(`${folder}/${named}.pdf`, taken);
}

/** Why a PDF cannot be saved into the notebook, or null when it can. */
export function whyCannotSave(workspace: Workspace | null, bytes: number): string | null {
  if (!workspace || workspace.isLocal) {
    return "Connect a GitHub repository to keep documents in your notebook.";
  }
  if (bytes > MAX_COMMITTABLE_BYTES) {
    return `This PDF is ${(bytes / (1024 * 1024)).toFixed(1)} MB. ForkLeaf can read it, but GitHub commits from the browser are capped at ${MAX_COMMITTABLE_BYTES / (1024 * 1024)} MB — so it cannot be saved here.`;
  }
  return null;
}

/**
 * The bytes of a PDF as base64, for the commit route.
 *
 * Built in chunks. `String.fromCharCode(...bytes)` is the obvious way to do
 * this and blows the call-stack argument limit somewhere above a megabyte,
 * which is most of the documents anybody would want to keep.
 */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";

  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }

  return btoa(binary);
}
