import { describe, expect, it, vi } from "vitest";
import type { InsertAction } from "./EditorToolbar";
import {
  APP_GROUP,
  filterSlashItems,
  groupSlashItems,
  insertTextOf,
  slashItems,
} from "./slash-items";

const flashcard: InsertAction = {
  id: "tool:flashcard",
  label: "Flashcard",
  hint: "Question :: Answer",
  icon: null,
  group: "Study",
  keywords: ["anki", "spaced repetition"],
  insert: "Question :: Answer",
};
const review: InsertAction = {
  id: "tool:flashcards",
  label: "Review flashcards",
  hint: "The cards due today",
  icon: null,
  group: "Study",
};
const graph: InsertAction = { id: "tool:graph", label: "Graph of my notes", hint: "", icon: null };

describe("slashItems", () => {
  it("puts everyday blocks first, the app's tools next, fine print last", () => {
    const groups = groupSlashItems(slashItems("rich", [flashcard, review, graph])).map(
      (group) => group.group,
    );
    expect(groups.slice(0, 5)).toEqual(["Text", "Lists", "Insert", "Study", APP_GROUP]);
    expect(groups).toContain("Formatting");
    expect(groups.indexOf("Formatting")).toBeGreaterThan(groups.indexOf(APP_GROUP));
  });

  it("keeps a surface's own rules about which blocks it can hold", () => {
    const rich = slashItems("rich").map((item) => item.id);
    const source = slashItems("source").map((item) => item.id);
    expect(rich).not.toContain("frontmatter");
    expect(source).toContain("frontmatter");
  });
});

describe("filterSlashItems", () => {
  it("still finds blocks by what people type", () => {
    expect(filterSlashItems("h1", "rich")[0]!.id).toBe("h1");
    expect(filterSlashItems("table", "rich")[0]!.id).toBe("table");
  });

  it("finds tools by name, keyword and group, ignoring the tool: prefix", () => {
    const extras = [flashcard, review, graph];
    expect(
      filterSlashItems("flash", "rich", extras)
        .map((item) => item.id)
        .slice(0, 2),
    ).toEqual(["tool:flashcard", "tool:flashcards"]);
    expect(filterSlashItems("anki", "rich", extras)[0]!.id).toBe("tool:flashcard");
    expect(filterSlashItems("study", "rich", extras).map((item) => item.id)).toEqual(
      expect.arrayContaining(["tool:flashcard", "tool:flashcards"]),
    );
    expect(filterSlashItems("zzzz", "rich", extras)).toEqual([]);
  });
});

describe("insertTextOf", () => {
  it("reads fixed text, calls a function at the moment of choosing, and is null for dialogs", () => {
    expect(insertTextOf(flashcard)).toBe("Question :: Answer");
    const make = vi.fn(() => "- [ ] Task 📅 2026-09-14");
    expect(insertTextOf({ ...review, insert: make })).toBe("- [ ] Task 📅 2026-09-14");
    expect(make).toHaveBeenCalledTimes(1);
    expect(insertTextOf(review)).toBeNull();
  });
});
