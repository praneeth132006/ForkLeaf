import { describe, expect, it } from "vitest";
import { buildPdf } from "./fixture";
import { openPdf, PdfOpenError } from "./document";
import { createCitation, parseCitation, resolveCitation, serializeCitation } from "./citation";
import { searchPdf } from "./search";

/**
 * The seam between pdf.js and this package, tested against a real document.
 *
 * Everything else here is tested against plain data, which proves the logic and
 * not the assumption underneath it: that the runs pdf.js hands back are the
 * runs `assemblePageText` expects. This is the test that fails if a pdf.js
 * upgrade changes the shape of a text item, and it is the only one that could.
 *
 * ## Two polyfills
 *
 * pdf.js 6 targets current browsers and uses two methods Node does not have
 * yet. Its own guidance for Node is to use the `legacy` build, which is a
 * second, transpiled copy of the whole library; three lines here are cheaper
 * and leave the app running the build it actually ships.
 */
const proto = Map.prototype as unknown as Record<string, unknown>;
proto.getOrInsertComputed ??= function <K, V>(this: Map<K, V>, key: K, make: (key: K) => V): V {
  if (!this.has(key)) this.set(key, make(key));
  return this.get(key)!;
};
const maths = Math as unknown as Record<string, unknown>;
maths.sumPrecise ??= (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

const DOCUMENT = buildPdf([
  {
    lines: [
      { text: "The Testing of Documents", x: 72, y: 720, size: 18 },
      { text: "An introduction, which mentions the key result in passing.", x: 72, y: 690 },
      { text: "Filler about method. The key result is that latency", x: 72, y: 670 },
      { text: "fell by half. More filler follows here.", x: 72, y: 650 },
    ],
  },
  {
    lines: [
      { text: "A second page, restating the key result once more.", x: 72, y: 720 },
      { text: "It also mentions latency, separately.", x: 72, y: 700 },
    ],
  },
]);

async function open() {
  return openPdf(DOCUMENT);
}

describe("openPdf", () => {
  it("reports how many pages the document has", async () => {
    const session = await open();
    expect(session.info.pageCount).toBe(2);
    await session.destroy();
  });

  it("reports each page's size in points", async () => {
    const session = await open();
    expect(session.info.sizes[0]).toEqual({ width: 612, height: 792, rotation: 0 });
    expect(session.info.sizes).toHaveLength(2);
    await session.destroy();
  });

  it("does not detach the caller's bytes", async () => {
    // pdf.js transfers the buffer it is given to the worker. Without the
    // defensive copy in `openPdf`, the caller's array is zero-length the
    // instant the document opens — which is baffling from the outside and
    // happens exactly when the same bytes are needed twice.
    const bytes = new Uint8Array(DOCUMENT);
    const session = await openPdf(bytes);
    expect(bytes.length).toBe(DOCUMENT.length);
    await session.destroy();
  });

  it("refuses something that is not a PDF, and says which problem it is", async () => {
    await expect(openPdf(new TextEncoder().encode("this is not a PDF"))).rejects.toMatchObject({
      name: "PdfOpenError",
      reason: "corrupt",
    });
  });

  it("raises a PdfOpenError rather than a bare failure", async () => {
    await expect(openPdf(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(PdfOpenError);
  });
});

describe("text extraction", () => {
  it("reads the words that were written on the page", async () => {
    const session = await open();
    const page = await session.textOf(1);

    expect(page.page).toBe(1);
    expect(page.text).toContain("The Testing of Documents");
    expect(page.text).toContain("An introduction, which mentions the key result in passing.");
    await session.destroy();
  });

  it("separates lines rather than welding them together", async () => {
    // The failure this guards is silent: "latencyfell" instead of
    // "latency fell" means every phrase search across a line break fails, and
    // the document looks like it does not contain words that are printed in it.
    const session = await open();
    const page = await session.textOf(1);

    expect(page.text).not.toContain("latencyfell");
    expect(page.text.replace(/\s+/g, " ")).toContain("latency fell by half");
    await session.destroy();
  });

  it("gives every run a range that indexes the page text", async () => {
    const session = await open();
    const page = await session.textOf(1);

    expect(page.runs.length).toBeGreaterThan(0);
    for (const run of page.runs) {
      expect(run.end).toBeGreaterThan(run.start);
      expect(run.end).toBeLessThanOrEqual(page.text.length);
    }
    await session.destroy();
  });

  it("places runs where the page drew them", async () => {
    const session = await open();
    const page = await session.textOf(1);
    const heading = page.runs[0]!;

    expect(heading.x).toBeCloseTo(72, 0);
    expect(heading.y).toBeCloseTo(720, 0);
    await session.destroy();
  });

  it("reads the same page twice without reading it twice", async () => {
    const session = await open();
    const [first, second] = await Promise.all([session.textOf(1), session.textOf(1)]);
    expect(second).toBe(first);
    await session.destroy();
  });

  it("reads every page in order", async () => {
    const session = await open();
    const pages = await session.allText();

    expect(pages.map((page) => page.page)).toEqual([1, 2]);
    expect(pages[1]!.text).toContain("A second page");
    await session.destroy();
  });

  it("reports progress while reading", async () => {
    const session = await open();
    const seen: [number, number][] = [];
    await session.allText({ onProgress: (done, total) => seen.push([done, total]) });

    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
    await session.destroy();
  });

  it("stops reading when the reader moves on", async () => {
    const session = await open();
    const controller = new AbortController();
    controller.abort();

    await expect(session.allText({ signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    await session.destroy();
  });
});

describe("citing a real document", () => {
  it("finds a passage again after a full round trip through markdown", async () => {
    // The end-to-end property the feature rests on: text extracted from a real
    // document, cited, written into a link, parsed back out and found again,
    // pointing at the same characters.
    const session = await open();
    const pages = await session.allText();

    const at = pages[0]!.text.indexOf("The key result");
    expect(at).toBeGreaterThan(-1);

    const citation = createCitation(pages[0]!, at, at + "The key result is that latency".length);
    const parsed = parseCitation(serializeCitation(citation))!;
    const match = resolveCitation(pages, parsed);

    expect(match.quality).toBe("exact");
    expect(match.page).toBe(1);
    expect(pages[0]!.text.slice(...match.range!)).toBe(citation.quote);
    await session.destroy();
  });

  it("follows a passage that has moved to a different page", async () => {
    const session = await open();
    const pages = await session.allText();

    const at = pages[1]!.text.indexOf("restating the key result");
    const citation = { ...createCitation(pages[1]!, at, at + 24), page: 1 };

    const match = resolveCitation(pages, citation);
    expect(match.quality).toBe("moved");
    expect(match.page).toBe(2);
    await session.destroy();
  });

  it("finds a phrase across the line break it is printed over", async () => {
    const session = await open();
    const pages = await session.allText();

    const hits = searchPdf(pages, "latency fell by half");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.page).toBe(1);
    await session.destroy();
  });

  it("finds a word that appears on more than one page", async () => {
    const session = await open();
    const pages = await session.allText();

    expect(searchPdf(pages, "latency").map((hit) => hit.page)).toEqual([1, 2]);
    await session.destroy();
  });
});

describe("the outline", () => {
  it("is empty for a document that has none, rather than failing", async () => {
    const session = await open();
    expect(await session.outline()).toEqual([]);
    await session.destroy();
  });
});
