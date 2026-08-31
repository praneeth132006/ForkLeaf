"use client";

import { openPdf, searchPdf, type PdfPageText, type PdfSearchHit } from "@forkleaf/pdf";
import type { PdfTextEntry, Workspace } from "@forkleaf/types";
import { fetchRepoPdf } from "@/lib/pdf-source";

/**
 * Keeping the words a document is made of.
 *
 * The reader has always extracted every page's text — that is what makes
 * find-in-document work through hyphenation and ligatures — and then thrown it
 * away when the document closed. So the words were searchable for as long as
 * somebody was looking at them and nowhere else: not from ⌘K, not while
 * checking whether a citation still points at anything.
 *
 * Extracting them again is seconds of work per document. Keeping them is a few
 * hundred kilobytes. This is the small module that turns the second into the
 * first: read once, stored beside the notebook, and used by everything that
 * has a question about what a document says.
 *
 * Only the text is kept. The positioned runs behind it are for drawing a
 * highlight on a page and are far larger; anything that needs them has the
 * document open in front of it.
 */

/** Where pdf.js finds its standard fonts and character maps. */
export const PDFJS_ASSETS = "/pdfjs";

export const pdfTextId = (workspaceId: string, path: string) => `${workspaceId}::${path}`;

/**
 * Stored pages as the search and citation code want them.
 *
 * Both take `PdfPageText`, whose `runs` they never read — the runs exist to
 * turn a character range into rectangles on a canvas, which is a question only
 * an open document can answer.
 */
export function pagesOf(entry: PdfTextEntry): PdfPageText[] {
  return entry.pages.map((page) => ({ page: page.page, text: page.text, runs: [] }));
}

/** The text of a repository document, read out of the file itself. */
export async function readDocumentText(
  workspace: Workspace,
  path: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ page: number; text: string }[]> {
  const bytes = await fetchRepoPdf(workspace, path);
  const session = await openPdf(bytes, { assetsUrl: PDFJS_ASSETS });

  try {
    const pages = await (onProgress ? session.allText({ onProgress }) : session.allText());
    return pages.map((page) => ({ page: page.page, text: page.text }));
  } finally {
    // A worker per document, held open for as long as this takes and not one
    // moment longer. Indexing a shelf of papers otherwise ends with a dozen
    // pdf.js workers alive at once.
    await session.destroy().catch(() => {});
  }
}

export function entryFrom(
  workspaceId: string,
  path: string,
  pages: { page: number; text: string }[],
  now = new Date(),
): PdfTextEntry {
  return {
    id: pdfTextId(workspaceId, path),
    workspaceId,
    path,
    pages,
    indexedAt: now.toISOString(),
  };
}

/** One occurrence of a phrase, in one document. */
export interface DocumentHit {
  path: string;
  page: number;
  /** A line of the page around the match, for the result list. */
  snippet: string;
  /** Where the match sits inside `snippet`. */
  snippetRange: [start: number, end: number];
}

/**
 * Every occurrence of a phrase across the documents whose text is kept.
 *
 * Capped per document as well as overall, deliberately. A three-hundred-page
 * paper that uses the word "model" on every page would otherwise fill the
 * whole result list before the second document was reached, which is the
 * opposite of what somebody searching their notebook wants — they are looking
 * for *which* document, not for all four hundred occurrences in one of them.
 */
export function searchDocuments(
  entries: readonly PdfTextEntry[],
  query: string,
  options: { perDocument?: number; limit?: number } = {},
): DocumentHit[] {
  const needle = query.trim();
  // Two characters is where "find as you type" stops being a search of every
  // word in every document and starts being a question.
  if (needle.length < 2) return [];

  const perDocument = options.perDocument ?? 3;
  const limit = options.limit ?? 12;
  const found: DocumentHit[] = [];

  for (const entry of entries) {
    const hits: PdfSearchHit[] = searchPdf(pagesOf(entry), needle, { limit: perDocument });

    for (const hit of hits) {
      found.push({
        path: entry.path,
        page: hit.page,
        snippet: hit.snippet,
        snippetRange: hit.snippetRange,
      });
      if (found.length >= limit) return found;
    }
  }

  return found;
}
