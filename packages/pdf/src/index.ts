/**
 * `@forkleaf/pdf` — reading PDFs, and citing them.
 *
 * The split to know about: everything except `document.ts` is pure functions
 * over plain data, so the behaviour that actually matters — where a quotation
 * lives, whether it is still there, what page a phrase is on — is testable
 * without a rendering engine. `document.ts` is the only file that imports
 * pdf.js, and the only one that needs a browser.
 */

export type {
  PdfCitation,
  PdfCitationMatch,
  PdfDocumentInfo,
  PdfMatchQuality,
  PdfMetadata,
  PdfOutlineItem,
  PdfPageSize,
  PdfPageText,
  PdfSearchHit,
  PdfTextRun,
} from "./types";

export {
  assemblePageText,
  normalizeForMatch,
  rectsForRange,
  toSourceRange,
  type AssembleOptions,
  type NormalizedText,
  type RawTextItem,
} from "./text";

export {
  CONTEXT_LENGTH,
  MAX_QUOTE_LENGTH,
  citationLink,
  compose,
  createCitation,
  isPdfTarget,
  parseCitation,
  resolveCitation,
  serializeCitation,
  splitTarget,
  stripPunctuation,
} from "./citation";

export { countMatches, pagesMatching, searchPdf, type PdfSearchOptions } from "./search";

export { displayTitle, parsePdfDate, readMetadata, type RawPdfInfo } from "./metadata";

export {
  buildOutline,
  flattenOutline,
  outlineEntryForPage,
  outlineKeys,
  type FlatOutlineItem,
  type RawOutlineItem,
} from "./outline";

export { PdfOpenError, openPdf, type OpenPdfOptions, type PdfSession } from "./document";
