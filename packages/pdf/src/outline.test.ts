import { describe, expect, it, vi } from "vitest";
import {
  buildOutline,
  flattenOutline,
  outlineEntryForPage,
  outlineKeys,
  type RawOutlineItem,
} from "./outline";
import type { PdfOutlineItem } from "./types";

const raw: RawOutlineItem[] = [
  {
    title: "Introduction",
    dest: "intro",
    items: [{ title: "Background", dest: "background", items: [] }],
  },
  { title: "Method", dest: "method", items: null },
];

const destinations: Record<string, number> = { intro: 1, background: 2, method: 5 };
const pageFor = async (destination: unknown) => destinations[String(destination)] ?? null;

describe("buildOutline", () => {
  it("resolves each entry to the page it points at", async () => {
    const outline = await buildOutline(raw, pageFor);

    expect(outline).toHaveLength(2);
    expect(outline[0]!.title).toBe("Introduction");
    expect(outline[0]!.page).toBe(1);
    expect(outline[0]!.children[0]!.page).toBe(2);
    expect(outline[1]!.page).toBe(5);
  });

  it("keeps an entry whose destination is broken, without a page", async () => {
    // A heading with a dead bookmark is still a heading. Dropping it leaves a
    // hole in the contents where a section used to be.
    const outline = await buildOutline([{ title: "Appendix", dest: "missing" }], pageFor);
    expect(outline[0]).toMatchObject({ title: "Appendix", page: null });
  });

  it("keeps an entry whose destination lookup throws", async () => {
    const outline = await buildOutline([{ title: "Broken", dest: "x" }], async () => {
      throw new Error("no such destination");
    });
    expect(outline[0]!.page).toBeNull();
  });

  it("does not ask about an entry with no destination", async () => {
    const spy = vi.fn(pageFor);
    await buildOutline([{ title: "Heading only" }], spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it("names an entry that has no title", async () => {
    expect((await buildOutline([{ dest: "intro" }], pageFor))[0]!.title).toBe("Untitled section");
  });

  it("flattens the line breaks bookmarks pick up from headings", async () => {
    const outline = await buildOutline([{ title: "A very\n  long   heading" }], pageFor);
    expect(outline[0]!.title).toBe("A very long heading");
  });

  it("is empty for a document with no outline", async () => {
    expect(await buildOutline(null, pageFor)).toEqual([]);
    expect(await buildOutline([], pageFor)).toEqual([]);
  });
});

const outline: PdfOutlineItem[] = [
  {
    title: "One",
    page: 1,
    children: [
      { title: "One A", page: 2, children: [] },
      { title: "One B", page: 4, children: [] },
    ],
  },
  { title: "Two", page: 6, children: [] },
];

describe("flattenOutline", () => {
  it("returns every row with its depth", () => {
    expect(flattenOutline(outline).map((row) => [row.title, row.depth])).toEqual([
      ["One", 0],
      ["One A", 1],
      ["One B", 1],
      ["Two", 0],
    ]);
  });

  it("gives each row a stable key from its position", () => {
    expect(flattenOutline(outline).map((row) => row.key)).toEqual(["0", "0.0", "0.1", "1"]);
  });

  it("skips the contents of a collapsed branch entirely", () => {
    expect(flattenOutline(outline, new Set(["0"])).map((row) => row.title)).toEqual(["One", "Two"]);
  });

  it("is empty for an empty outline", () => {
    expect(flattenOutline([])).toEqual([]);
  });
});

describe("outlineEntryForPage", () => {
  it("finds the section a page falls inside", () => {
    expect(outlineEntryForPage(outline, 3)?.title).toBe("One A");
  });

  it("prefers the deepest section that begins on the page", () => {
    expect(outlineEntryForPage(outline, 2)?.title).toBe("One A");
  });

  it("stays in the last section past the final heading", () => {
    expect(outlineEntryForPage(outline, 99)?.title).toBe("Two");
  });

  it("has no answer before the first heading", () => {
    const late: PdfOutlineItem[] = [{ title: "Chapter", page: 10, children: [] }];
    expect(outlineEntryForPage(late, 3)).toBeNull();
  });

  it("ignores entries whose destination never resolved", () => {
    const broken: PdfOutlineItem[] = [
      { title: "Unresolved", page: null, children: [] },
      { title: "Real", page: 1, children: [] },
    ];
    expect(outlineEntryForPage(broken, 5)?.title).toBe("Real");
  });
});

describe("outlineKeys", () => {
  it("lists only the rows that have something to expand", () => {
    expect(outlineKeys(outline)).toEqual(["0"]);
  });
});
