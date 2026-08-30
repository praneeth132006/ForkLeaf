"use client";

import { resolveCitation, type PdfMatchQuality } from "@forkleaf/pdf";
import type { PdfPageText } from "@forkleaf/pdf";
import { allPdfMentions, type MentionSource, type PdfMention } from "@/lib/pdf-mentions";

/**
 * Checking that every quotation still says what the note says it says.
 *
 * Every other tool stores a page number, and a page number is a claim that
 * quietly stops being true: the author adds a figure to page 4 and every
 * citation after it points one page short. Nothing tells you. The link still
 * opens, it just shows the wrong paragraph — and you find out, if you ever
 * do, when somebody checks your reference.
 *
 * A ForkLeaf citation records the sentence, so the question "is this still
 * true?" has an answer, and this is the sweep that asks it of the whole
 * notebook at once. Four outcomes, and they are genuinely different things:
 *
 *   - `exact` — the words are there, on the page the note recorded
 *   - `moved` — the words are there, on a different page. Nothing is wrong
 *     with the quotation; the link's page number is stale and can be corrected
 *   - `fuzzy` — the words are there after allowing for hyphenation, ligatures
 *     and spacing. Worth an eye: it can also mean the passage was edited
 *   - `lost` — the words are not in the document any more. This is the one
 *     that matters, and the one no other reader can tell you about
 *
 * A pure function over text, with the reading of documents handed in. That is
 * what makes the interesting half testable without a rendering engine, and it
 * is why the caller decides whether a document comes from the cache or off
 * the network.
 */

export interface CitationCheck {
  mention: PdfMention;
  quality: PdfMatchQuality;
  /** Where the passage is now, or null when it is nowhere. */
  page: number | null;
  /** True when the citation's page number no longer matches where it is. */
  stale: boolean;
}

export interface DocumentAudit {
  pdfPath: string;
  checks: CitationCheck[];
  /** Why this document could not be checked, when it could not be. */
  error: string | null;
}

export interface AuditSummary {
  documents: DocumentAudit[];
  /** Citations checked, across every document. */
  checked: number;
  lost: number;
  moved: number;
  fuzzy: number;
  /** Documents that could not be read at all. */
  unreadable: number;
}

/** Reads a document's text, from wherever the caller keeps it. */
export type PagesFor = (pdfPath: string) => Promise<PdfPageText[]>;

/**
 * Checks one document's citations.
 *
 * Mentions with no quotation are skipped rather than reported. A link written
 * as `#page=4` records no words, so there is nothing to look for and nothing
 * that could have gone wrong with it that this could detect — reporting it as
 * "fine" would be a claim nobody checked.
 */
export function checkAgainst(
  pages: PdfPageText[],
  mentions: readonly PdfMention[],
): CitationCheck[] {
  const checks: CitationCheck[] = [];

  for (const mention of mentions) {
    const citation = mention.citation;
    if (!citation || !citation.quote.trim()) continue;

    const match = resolveCitation(pages, citation);
    checks.push({
      mention,
      quality: match.quality,
      page: match.page,
      stale: match.page != null && match.page !== citation.page,
    });
  }

  return checks;
}

/**
 * The whole notebook, document by document.
 *
 * Sequential on purpose. Each document means fetching a file and running a
 * pdf.js worker over every page of it, and doing forty of those at once is how
 * a browser tab runs out of memory — the reader would rather wait and be told
 * where it has got to.
 */
export async function auditCitations(
  notes: readonly MentionSource[],
  pagesFor: PagesFor,
  options: { onProgress?: (done: number, total: number, pdfPath: string) => void } = {},
): Promise<AuditSummary> {
  const mentions = allPdfMentions(notes);

  const byDocument = new Map<string, PdfMention[]>();
  for (const mention of mentions) {
    // A mention with no quotation cannot be checked, and a document mentioned
    // only by such links is a document there is no reason to open.
    if (!mention.citation?.quote.trim()) continue;
    byDocument.set(mention.pdfPath, [...(byDocument.get(mention.pdfPath) ?? []), mention]);
  }

  const paths = [...byDocument.keys()].sort();
  const documents: DocumentAudit[] = [];
  let done = 0;

  for (const pdfPath of paths) {
    options.onProgress?.(done, paths.length, pdfPath);

    try {
      const pages = await pagesFor(pdfPath);
      documents.push({
        pdfPath,
        checks: checkAgainst(pages, byDocument.get(pdfPath) ?? []),
        error: null,
      });
    } catch (problem: unknown) {
      // A document that cannot be read is reported as unread, never as a
      // notebook full of broken citations — which is what treating a failed
      // fetch as "no pages" would produce.
      documents.push({
        pdfPath,
        checks: [],
        error: problem instanceof Error ? problem.message : "That document could not be read.",
      });
    }

    done += 1;
    options.onProgress?.(done, paths.length, pdfPath);
  }

  return summarise(documents);
}

export function summarise(documents: DocumentAudit[]): AuditSummary {
  const all = documents.flatMap((document) => document.checks);

  return {
    documents,
    checked: all.length,
    lost: all.filter((check) => check.quality === "lost").length,
    moved: all.filter((check) => check.quality === "moved").length,
    fuzzy: all.filter((check) => check.quality === "fuzzy").length,
    unreadable: documents.filter((document) => document.error !== null).length,
  };
}

/**
 * The note with one citation's page number brought up to date.
 *
 * Only the `page=` field, and only on links that resolve to this document at
 * this passage — the quotation, the context and the path are what identify the
 * link and are left exactly as they were. A citation whose words have moved is
 * still a correct citation; it is the page hint beside it that has gone stale,
 * and rewriting anything else would be editing somebody's note rather than
 * repairing a link in it.
 */
export function withCorrectedPage(content: string, check: CitationCheck): string {
  const { mention, page } = check;
  if (page == null) return content;

  const lines = content.split("\n");
  const index = mention.line - 1;
  const line = lines[index];
  if (line === undefined) return content;

  const quote = mention.citation?.quote ?? "";
  const encoded = encodeURIComponent(quote);

  const repaired = line.replace(/\(([^()\s]*\.pdf#[^()\s]*)\)/gi, (whole, target: string) => {
    // The right link on a line that may hold several: the one quoting these
    // words. Comparing the encoded quotation rather than re-parsing keeps
    // this honest about which link is being rewritten.
    if (quote && !target.includes(encoded) && !target.includes(quote)) return whole;
    return `(${target.replace(/(^|[#&])(page|p)=\d+/i, `$1$2=${page}`)})`;
  });

  lines[index] = repaired;
  return lines.join("\n");
}
