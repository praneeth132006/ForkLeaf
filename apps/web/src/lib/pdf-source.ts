import type { Workspace } from "@forkleaf/types";
import { isPdfTarget, splitTarget } from "@forkleaf/pdf";
import { resolveAgainstNote, isRepoRelative } from "@/lib/assets";
import { isPdfPath, MAX_PDF_BYTES } from "@/lib/media";

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

/**
 * The URL the reader should fetch a repository PDF from.
 *
 * The same proxy that serves images, for the same two reasons: a repo-relative
 * path is not something the browser can resolve, and for a private repository
 * the token needed to read it never leaves the server.
 */
export function pdfFetchUrl(workspace: Workspace, path: string): string {
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
