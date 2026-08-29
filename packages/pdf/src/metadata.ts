import type { PdfMetadata } from "./types";

/**
 * What a PDF says about itself, made trustworthy.
 *
 * The document information dictionary is free text written by whatever
 * produced the file, so every field here is treated as untrusted and optional.
 * Two things in particular are worth the code:
 *
 * `Title` is very often *not* the title. Word writes the first paragraph,
 * LaTeX writes nothing, and scanners write the model number of the scanner —
 * so a blank, whitespace-only or obviously-a-filename title is rejected in
 * favour of saying nothing, and the caller falls back to the filename, which
 * at least the user chose.
 *
 * Dates are in PDF's own format, not ISO, and are the reason this file is not
 * three lines long.
 */

/** The shape pdf.js returns from `getMetadata()`. Every field may be missing. */
export interface RawPdfInfo {
  Title?: unknown;
  Author?: unknown;
  Subject?: unknown;
  Keywords?: unknown;
  Producer?: unknown;
  Creator?: unknown;
  CreationDate?: unknown;
  ModDate?: unknown;
}

export function readMetadata(info: RawPdfInfo | null | undefined): PdfMetadata {
  const raw = info ?? {};

  return {
    title: text(raw.Title),
    author: text(raw.Author),
    subject: text(raw.Subject),
    keywords: keywords(raw.Keywords),
    createdAt: parsePdfDate(raw.CreationDate),
    modifiedAt: parsePdfDate(raw.ModDate),
    producer: text(raw.Producer) ?? text(raw.Creator),
  };
}

/** A string field, or null when it is absent, blank or not a string at all. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Some producers pad every field with the BOM they read the source with.
  const trimmed = value.replace(/^﻿/, "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * `Keywords` is one string, and no two producers agree on the separator.
 *
 * Commas, semicolons and plain spaces are all in the wild, sometimes in the
 * same file. Splitting on the first two and leaving spaces alone keeps
 * multi-word keywords — "machine learning" is one keyword, not two.
 */
function keywords(value: unknown): string[] {
  const raw = text(value);
  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(/[;,]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * PDF dates, which are their own format: `D:YYYYMMDDHHmmSSOHH'mm'`.
 *
 * Everything after the year is optional, the `D:` prefix is optional in
 * practice though the spec requires it, the timezone offset may be `Z`, `+`,
 * `-` or absent, and the apostrophes in the offset are sometimes there and
 * sometimes not. Files in the wild have all of these combinations.
 *
 * A date that cannot be read is null, not "now" and not the epoch. A note
 * saying a paper was published on 1 January 1970 is worse than one that does
 * not claim to know.
 */
export function parsePdfDate(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const match =
    /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})'?(?:(\d{2})'?)?)?/.exec(
      value.trim(),
    );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2] ?? "1");
  const day = Number(match[3] ?? "1");
  const hour = Number(match[4] ?? "0");
  const minute = Number(match[5] ?? "0");
  const second = Number(match[6] ?? "0");

  // Producers do write month 00 and day 00 when they mean "unspecified".
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const offsetMinutes =
    match[7] === "Z" || !match[8]
      ? 0
      : (match[8] === "-" ? -1 : 1) * (Number(match[9] ?? "0") * 60 + Number(match[10] ?? "0"));

  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(wall)) return null;

  // Rejects 31 February and friends, which `Date.UTC` rolls forward instead of
  // refusing — a rolled-over date is a wrong date presented as a right one.
  // Checked against the written fields before the offset is applied, since the
  // offset legitimately moves the date across midnight.
  const wallDate = new Date(wall);
  if (
    wallDate.getUTCFullYear() !== year ||
    wallDate.getUTCMonth() !== month - 1 ||
    wallDate.getUTCDate() !== day
  ) {
    return null;
  }

  return new Date(wall - offsetMinutes * 60_000).toISOString();
}

/**
 * The name to show for a document.
 *
 * The embedded title wins only when it looks like a title somebody wrote. A
 * "title" that is the filename with its extension still attached, or a bare
 * path, is metadata the producer invented, and the filename it was invented
 * from is the better answer — shorter, and the one the reader recognises.
 */
export function displayTitle(metadata: PdfMetadata, fileName: string): string {
  const fallback = fileName.replace(/\.pdf$/i, "") || "Untitled";
  const title = metadata.title;

  if (!title) return fallback;
  if (/\.(pdf|docx?|tex|indd|pages)$/i.test(title)) return fallback;
  if (title.includes("/") || title.includes("\\")) return fallback;
  // "Microsoft Word - report.doc" is what Word writes when there is no title.
  if (/^microsoft word\s*-/i.test(title)) return fallback;
  if (/^untitled$/i.test(title)) return fallback;

  return title;
}
