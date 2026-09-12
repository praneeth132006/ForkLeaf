import { describe, expect, it } from "vitest";
import {
  boardFrom,
  filterRows,
  formatValue,
  inFolder,
  parseValue,
  sortRows,
  tableFrom,
} from "./folder-views";

const note = (path: string, frontmatter: Record<string, unknown> = {}) => ({
  path,
  title: path.split("/").pop()!.replace(".md", ""),
  frontmatter,
});

describe("inFolder", () => {
  it("keeps notes in the folder and below, and not a folder that only shares a prefix", () => {
    const notes = [note("work/a.md"), note("work/sub/b.md"), note("workshop/c.md"), note("d.md")];
    expect(inFolder(notes, "work").map((n) => n.path)).toEqual(["work/a.md", "work/sub/b.md"]);
    expect(inFolder(notes, "")).toHaveLength(4);
  });
});

describe("formatValue and parseValue", () => {
  it("writes lists, dates and objects as one line", () => {
    expect(formatValue(["a", "b"])).toBe("a, b");
    expect(formatValue(new Date("2026-09-13T10:00:00Z"))).toBe("2026-09-13");
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
    expect(formatValue(null)).toBe("");
    expect(formatValue(false)).toBe("false");
  });

  it("keeps the shape a property already had", () => {
    expect(parseValue("a, b ,", ["x"])).toEqual(["a", "b"]);
    expect(parseValue("42", 7)).toBe(42);
    expect(parseValue("forty", 7)).toBe("forty");
    expect(parseValue("TRUE", false)).toBe(true);
  });

  it("stores a new property as text, and empty as removal", () => {
    expect(parseValue("1.10", undefined)).toBe("1.10");
    expect(parseValue("   ", "x")).toBeUndefined();
  });
});

describe("boardFrom", () => {
  it("groups by the property, defaults first, notes with none in their own column", () => {
    const columns = boardFrom(
      [
        note("b.md", { status: "Doing" }),
        note("a.md", { status: "doing" }),
        note("c.md", { status: "Blocked" }),
        note("d.md"),
      ],
      "status",
    );
    expect(columns.map((column) => [column.value, column.cards.map((card) => card.title)])).toEqual(
      [
        ["", ["d"]],
        ["To do", []],
        ["Doing", ["a", "b"]],
        ["Done", []],
        ["Blocked", ["c"]],
      ],
    );
  });

  it("offers the usual columns on a folder with no statuses yet", () => {
    expect(boardFrom([note("a.md")], "status").map((column) => column.value)).toEqual([
      "",
      "To do",
      "Doing",
      "Done",
    ]);
  });

  it("uses a folder's own vocabulary without adding the defaults to it", () => {
    const columns = boardFrom(
      [note("a.md", { stage: "Draft" }), note("b.md", { stage: "Published" })],
      "stage",
      ["Review"],
    );
    expect(columns.map((column) => column.value)).toEqual(["Draft", "Published", "Review"]);
  });
});

describe("tableFrom, sortRows, filterRows", () => {
  const notes = [
    note("b.md", { rating: 4, tags: ["book"], created: "2026-01-01", author: "Le Guin" }),
    note("a.md", { rating: 10, tags: ["film"], created: "2026-01-02" }),
    note("c.md", { created: "2026-01-03", title: "C" }),
  ];

  it("orders columns by how many notes have them, created and updated last, title hidden", () => {
    expect(tableFrom(notes).columns).toEqual(["rating", "tags", "author", "created"]);
  });

  it("hides the generator stamp and puts the fields ForkLeaf maintains last", () => {
    const stamped = [
      note("x.md", {
        generator: "https://forkleaf.app",
        editedBy: "ada",
        updated: "2026-09-13",
        status: "Doing",
      }),
    ];
    expect(tableFrom(stamped).columns).toEqual(["status", "editedBy", "updated"]);
  });

  it("sorts numbers as numbers, puts empty cells last either way", () => {
    const { rows } = tableFrom(notes);
    expect(sortRows(rows, "rating", "asc").map((row) => row.title)).toEqual(["b", "a", "c"]);
    expect(sortRows(rows, "rating", "desc").map((row) => row.title)).toEqual(["a", "b", "c"]);
    expect(sortRows(rows, "title", "desc").map((row) => row.title)).toEqual(["c", "b", "a"]);
  });

  it("filters on every word, across title and values", () => {
    const { rows } = tableFrom(notes);
    expect(filterRows(rows, "book guin").map((row) => row.title)).toEqual(["b"]);
    expect(filterRows(rows, "  ")).toHaveLength(3);
  });
});
