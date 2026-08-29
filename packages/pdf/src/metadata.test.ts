import { describe, expect, it } from "vitest";
import { displayTitle, parsePdfDate, readMetadata } from "./metadata";
import type { PdfMetadata } from "./types";

describe("parsePdfDate", () => {
  it("reads a full PDF date with a timezone offset", () => {
    expect(parsePdfDate("D:20240115103000+05'30'")).toBe("2024-01-15T05:00:00.000Z");
  });

  it("reads a negative offset", () => {
    expect(parsePdfDate("D:20240115103000-05'00'")).toBe("2024-01-15T15:30:00.000Z");
  });

  it("reads an offset written without apostrophes", () => {
    expect(parsePdfDate("D:202401151030+0530")).toBe("2024-01-15T05:00:00.000Z");
  });

  it("reads Zulu time", () => {
    expect(parsePdfDate("D:20240115103000Z")).toBe("2024-01-15T10:30:00.000Z");
  });

  it("reads a date with no time at all", () => {
    expect(parsePdfDate("D:20240115")).toBe("2024-01-15T00:00:00.000Z");
  });

  it("reads a year on its own", () => {
    expect(parsePdfDate("D:2024")).toBe("2024-01-01T00:00:00.000Z");
  });

  it("tolerates the missing D: prefix that real files have", () => {
    expect(parsePdfDate("20240115103000")).toBe("2024-01-15T10:30:00.000Z");
  });

  it("refuses the zero month producers write for 'unspecified'", () => {
    expect(parsePdfDate("D:20240015")).toBeNull();
  });

  it("refuses a date that does not exist rather than rolling it over", () => {
    // `Date.UTC` would answer 2 March. A wrong date presented confidently is
    // worse than no date.
    expect(parsePdfDate("D:20240230")).toBeNull();
  });

  it("refuses an impossible time", () => {
    expect(parsePdfDate("D:20240115256000")).toBeNull();
  });

  it("is null for anything that is not a string", () => {
    expect(parsePdfDate(undefined)).toBeNull();
    expect(parsePdfDate(1_700_000_000)).toBeNull();
  });

  it("is null for free text", () => {
    expect(parsePdfDate("last Tuesday")).toBeNull();
  });
});

describe("readMetadata", () => {
  it("reads the fields a well-behaved producer writes", () => {
    const metadata = readMetadata({
      Title: "On Attention",
      Author: "A. Researcher",
      Subject: "Machine learning",
      Keywords: "attention; transformers, machine learning",
      Producer: "pdfTeX",
      CreationDate: "D:20240115103000Z",
    });

    expect(metadata.title).toBe("On Attention");
    expect(metadata.keywords).toEqual(["attention", "transformers", "machine learning"]);
    expect(metadata.createdAt).toBe("2024-01-15T10:30:00.000Z");
    expect(metadata.producer).toBe("pdfTeX");
  });

  it("treats blank and whitespace-only fields as absent", () => {
    expect(readMetadata({ Title: "   ", Author: "" }).title).toBeNull();
  });

  it("strips the byte-order mark some producers leave in every field", () => {
    expect(readMetadata({ Title: "﻿Report" }).title).toBe("Report");
  });

  it("ignores fields that are not strings", () => {
    expect(readMetadata({ Title: { text: "x" } as never }).title).toBeNull();
  });

  it("falls back to Creator when there is no Producer", () => {
    expect(readMetadata({ Creator: "Scrivener" }).producer).toBe("Scrivener");
  });

  it("de-duplicates keywords", () => {
    expect(readMetadata({ Keywords: "a, a, b" }).keywords).toEqual(["a", "b"]);
  });

  it("survives no metadata at all", () => {
    expect(readMetadata(null)).toEqual({
      title: null,
      author: null,
      subject: null,
      keywords: [],
      createdAt: null,
      modifiedAt: null,
      producer: null,
    });
  });
});

describe("displayTitle", () => {
  const base: PdfMetadata = {
    title: null,
    author: null,
    subject: null,
    keywords: [],
    createdAt: null,
    modifiedAt: null,
    producer: null,
  };

  it("uses a real embedded title", () => {
    expect(displayTitle({ ...base, title: "On Attention" }, "1706.03762.pdf")).toBe("On Attention");
  });

  it("falls back to the filename when there is no title", () => {
    expect(displayTitle(base, "quarterly-report.pdf")).toBe("quarterly-report");
  });

  it("rejects the filename-shaped titles Word and LaTeX write", () => {
    expect(displayTitle({ ...base, title: "report.doc" }, "quarterly.pdf")).toBe("quarterly");
    expect(displayTitle({ ...base, title: "Microsoft Word - draft.doc" }, "final.pdf")).toBe(
      "final",
    );
  });

  it("rejects a path masquerading as a title", () => {
    expect(displayTitle({ ...base, title: "/Users/x/Desktop/thing" }, "thing.pdf")).toBe("thing");
  });

  it("rejects a literal 'Untitled'", () => {
    expect(displayTitle({ ...base, title: "Untitled" }, "notes.pdf")).toBe("notes");
  });

  it("has something to say even for a file with no name", () => {
    expect(displayTitle(base, "")).toBe("Untitled");
  });
});
