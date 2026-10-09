import { describe, expect, it } from "vitest";
import { buildBook, type BookNote } from "./book";
import { gardenLayout, gardenLinks, MAP_HEIGHT, MAP_WIDTH } from "./garden";

const note = (path: string, markdown: string): BookNote => ({
  path,
  title: path.replace(/\.md$/, ""),
  markdown,
  frontmatter: {},
});

const notes = [
  note("seeds.md", "Start with [[soil]] and [[water]]."),
  note("soil.md", "Needs [[water]]. Also [[soil]] itself, and [[nowhere]]."),
  note("water.md", "Plain.\n\n```\n[[soil]] in code is not a link\n```\n![[seeds]]"),
];

describe("gardenLinks", () => {
  it("finds links between the notes, ignoring self-links, embeds, code and strangers", () => {
    const links = gardenLinks(notes);

    expect(links.outgoing).toEqual([[1, 2], [2], []]);
    expect(links.backlinks).toEqual([[], [0], [0, 1]]);
  });
});

describe("gardenLayout", () => {
  it("is deterministic and stays inside the map", () => {
    const outgoing = [[1, 2], [2], [], []];
    const first = gardenLayout(4, outgoing);

    expect(gardenLayout(4, outgoing)).toEqual(first);
    for (const point of first) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(MAP_WIDTH);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });

  it("handles nothing and one note", () => {
    expect(gardenLayout(0, [])).toEqual([]);
    expect(gardenLayout(1, [[]])).toEqual([{ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }]);
  });
});

describe("buildBook as a garden", () => {
  const files = async (garden: boolean) =>
    (await buildBook(notes, { title: "Garden", theme: "light", renderDiagrams: false, garden }))
      .files;
  const at = (all: { path: string; content: string }[], path: string) =>
    all.find((file) => file.path === path)?.content ?? "";

  it("lists the pages that link here, and leaves the box off a page nothing links to", async () => {
    const all = await files(true);

    expect(at(all, "water.html")).toContain("Linked from");
    expect(at(all, "water.html")).toContain('<a href="seeds.html">seeds</a>');
    expect(at(all, "water.html")).toContain('<a href="soil.html">soil</a>');
    expect(at(all, "seeds.html")).not.toContain("Linked from");
  });

  it("draws a map on the contents page that links to every note", async () => {
    const index = at(await files(true), "index.html");

    expect(index).toContain('class="garden-map"');
    expect(index.match(/<circle /g)).toHaveLength(3);
    expect(index.match(/<line /g)).toHaveLength(3);
    expect(index).toContain('href="soil.html"><title>soil</title>');
  });

  it("is a plain book when not asked for", async () => {
    const all = await files(false);

    expect(at(all, "index.html")).not.toContain("garden-map");
    expect(at(all, "water.html")).not.toContain("Linked from");
  });

  it("escapes titles in the map", async () => {
    const built = await buildBook(
      [note("a.md", "[[b]]"), { ...note("b.md", ""), title: '<script>"x"</script>' }],
      { title: "G", theme: "light", renderDiagrams: false, garden: true },
    );
    const index = built.files.find((file) => file.path === "index.html")!.content;

    expect(index).not.toContain("<script>");
  });
});
