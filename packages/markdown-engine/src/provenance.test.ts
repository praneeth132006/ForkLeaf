import { describe, expect, it } from "vitest";
import { formatSource, isCapturable, sourcesIn, type CapturedSource } from "./provenance";

function source(overrides: Partial<CapturedSource> = {}): CapturedSource {
  return {
    title: "The article",
    url: "https://example.com/article",
    capturedAt: "2026-08-27T10:04:09.000Z",
    archiveUrl: "https://web.archive.org/web/20260827100409/https://example.com/article",
    archivedAt: "2026-08-27T10:04:09.000Z",
    ...overrides,
  };
}

describe("formatSource", () => {
  it("writes an ordinary blockquote, readable anywhere", () => {
    expect(formatSource(source())).toBe(
      "> **Source** — [The article](https://example.com/article)\n" +
        "> Read 2026-08-27 10:04 UTC · [archived copy](https://web.archive.org/web/20260827100409/https://example.com/article) from 2026-08-27 10:04 UTC",
    );
  });

  it("stamps in UTC, so a citation does not depend on the reader's locale", () => {
    expect(formatSource(source())).toContain("2026-08-27 10:04 UTC");
  });

  it("says plainly when there is no archived copy", () => {
    // Dropping the line silently would leave the reader believing the page is
    // safe when it is exactly as fragile as before.
    const text = formatSource(source({ archiveUrl: null, archivedAt: null }));
    expect(text).toContain("no archived copy");
    expect(text).not.toContain("archived copy](");
  });

  it("omits the snapshot date when the archive did not give one", () => {
    const text = formatSource(source({ archivedAt: null }));
    expect(text).toContain("[archived copy](");
    expect(text).not.toContain(" from ");
  });

  it("falls back to the URL when the page had no title", () => {
    expect(formatSource(source({ title: "" }))).toContain("[https://example.com/article]");
  });

  it("escapes brackets that would otherwise break the link", () => {
    const text = formatSource(source({ title: "A [bracketed] title" }));
    expect(text).toContain("A \\[bracketed\\] title");
  });

  it("flattens a title spanning several lines", () => {
    // A blockquote line that grew a newline would end the citation early.
    const text = formatSource(source({ title: "One\n\ntwo" }));
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain("One two");
  });

  it("survives a capture time it cannot read", () => {
    const text = formatSource(source({ capturedAt: "not a date" }));
    expect(text).not.toContain("Read ");
    expect(text).toContain("[archived copy](");
  });

  it("keeps the URL exactly as given", () => {
    const url = "https://example.com/a?b=c&d=e#f";
    expect(formatSource(source({ url }))).toContain(`(${url})`);
  });
});

describe("sourcesIn", () => {
  it("finds a citation this module wrote", () => {
    const note = `Some prose.\n\n${formatSource(source())}\n\nMore prose.`;
    const [found] = sourcesIn(note);

    expect(found?.title).toBe("The article");
    expect(found?.url).toBe("https://example.com/article");
    expect(found?.archived).toBe(true);
  });

  it("knows a citation with no archived copy is not archived", () => {
    const note = formatSource(source({ archiveUrl: null, archivedAt: null }));
    expect(sourcesIn(note)[0]?.archived).toBe(false);
  });

  it("finds several", () => {
    const note = [
      formatSource(source({ url: "https://a.example/1" })),
      "",
      formatSource(source({ url: "https://b.example/2" })),
    ].join("\n");

    expect(sourcesIn(note).map((s) => s.url)).toEqual([
      "https://a.example/1",
      "https://b.example/2",
    ]);
  });

  it("unescapes a bracketed title on the way back out", () => {
    const note = formatSource(source({ title: "A [bracketed] title" }));
    expect(sourcesIn(note)[0]?.title).toBe("A [bracketed] title");
  });

  it("points at the citation, so it can be highlighted", () => {
    const note = `Before.\n\n${formatSource(source())}`;
    const [found] = sourcesIn(note);
    expect(note.slice(found!.start, found!.end)).toContain("**Source**");
  });

  it("ignores ordinary links and ordinary blockquotes", () => {
    const note = "> Just a quote.\n\nSee [the article](https://example.com/article).";
    expect(sourcesIn(note)).toEqual([]);
  });

  it("returns nothing for a note citing nothing", () => {
    expect(sourcesIn("Just prose.")).toEqual([]);
  });
});

describe("isCapturable", () => {
  it("accepts ordinary web addresses", () => {
    expect(isCapturable("https://example.com/article")).toBe(true);
    expect(isCapturable("http://example.com")).toBe(true);
  });

  it("refuses a scheme that is not the web", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com",
      "javascript:alert(1)",
      "data:text/html,x",
    ]) {
      expect(isCapturable(url)).toBe(false);
    }
  });

  it("refuses a URL carrying credentials", () => {
    // Those would be fetched on somebody's behalf and written into the note.
    expect(isCapturable("https://user:pass@example.com/x")).toBe(false);
  });

  it("refuses a bare hostname with no dot in it", () => {
    for (const url of ["http://localhost/x", "http://intranet/x"]) {
      expect(isCapturable(url)).toBe(false);
    }
  });

  it("refuses something that is not a URL at all", () => {
    for (const url of ["", "   ", "not a url", "example.com"]) {
      expect(isCapturable(url)).toBe(false);
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(isCapturable("  https://example.com/x  ")).toBe(true);
  });
});
