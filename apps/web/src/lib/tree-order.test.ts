import { describe, expect, it } from "vitest";
import { compareTreeNames, serialNumberOf, type TreeNode } from "@forkleaf/types";
import {
  DEFAULT_TREE_ORDER,
  orderTree,
  prunedOrder,
  withCreated,
  withCreatedRenamed,
  withDropped,
  withMoved,
  withPathRenamed,
  withoutCreated,
  withoutManual,
  type TreeOrder,
} from "./tree-order";

function folder(name: string, children: TreeNode[] = [], parent = ""): TreeNode {
  const path = parent ? `${parent}/${name}` : name;
  return { path, name, kind: "folder", children };
}

function file(name: string, parent = ""): TreeNode {
  const path = parent ? `${parent}/${name}` : name;
  return { path, name, kind: "file" };
}

const names = (nodes: TreeNode[]) => nodes.map((node) => node.name);

describe("compareTreeNames", () => {
  it("puts a numbered folder where its number says, not where its first digit does", () => {
    const sorted = ["10. Attacking AD", "1. Introduction", "2. Networking"].sort(compareTreeNames);
    expect(sorted).toEqual(["1. Introduction", "2. Networking", "10. Attacking AD"]);
  });

  it("compares runs of digits too long for a double by value", () => {
    expect(compareTreeNames("n9007199254740993", "n9007199254740992")).toBeGreaterThan(0);
  });

  it("ignores case the way a file listing does", () => {
    expect(compareTreeNames("apple.md", "Banana.md")).toBeLessThan(0);
  });

  it("orders two spellings of the same name the same way every time", () => {
    expect(compareTreeNames("Notes.md", "notes.md")).not.toBe(0);
  });
});

describe("serialNumberOf", () => {
  it("reads a leading serial number", () => {
    expect(serialNumberOf("7. Capstone Projects")).toBe(7);
    expect(serialNumberOf("03 - Recon")).toBe(3);
    expect(serialNumberOf("12) Notes")).toBe(12);
  });

  it("does not treat a word that starts with a digit as numbering", () => {
    expect(serialNumberOf("2fa-notes")).toBeNull();
    expect(serialNumberOf("Reconnaissance")).toBeNull();
  });
});

describe("orderTree", () => {
  const tree = [
    folder("10. Attacking AD"),
    folder("1. Introduction"),
    folder("2. Networking"),
    folder("Python 101"),
    folder("OSINT"),
    file("readme.md"),
  ];

  it("reads a numbered notebook in its own order", () => {
    expect(names(orderTree(tree, DEFAULT_TREE_ORDER, {}))).toEqual([
      "1. Introduction",
      "2. Networking",
      "10. Attacking AD",
      "OSINT",
      "Python 101",
      "readme.md",
    ]);
  });

  it("falls back to creation order for anything unnumbered", () => {
    const created = {
      "Python 101": "2026-01-01T00:00:00.000Z",
      OSINT: "2026-03-01T00:00:00.000Z",
    };

    expect(names(orderTree(tree, DEFAULT_TREE_ORDER, created))).toEqual([
      "1. Introduction",
      "2. Networking",
      "10. Attacking AD",
      "Python 101",
      "OSINT",
      "readme.md",
    ]);
  });

  it("keeps folders above files", () => {
    const ordered = orderTree(tree, DEFAULT_TREE_ORDER, {});
    expect(ordered[ordered.length - 1]!.kind).toBe("file");
  });

  it("sorts by name alone when asked to", () => {
    const order: TreeOrder = { mode: "name", manual: {} };
    expect(names(orderTree(tree, order, {})).slice(0, 3)).toEqual([
      "1. Introduction",
      "2. Networking",
      "10. Attacking AD",
    ]);
  });

  it("puts anything with no known creation date after everything that has one", () => {
    const order: TreeOrder = { mode: "created", manual: {} };
    const created = { OSINT: "2026-05-01T00:00:00.000Z" };
    expect(names(orderTree(tree, order, created))[0]).toBe("OSINT");
  });

  it("orders the inside of a folder as well as the top level", () => {
    const nested = [
      folder("Course", [
        folder("10. Ten", [], "Course"),
        folder("2. Two", [], "Course"),
        file("9. nine.md", "Course"),
      ]),
    ];

    expect(names(orderTree(nested, DEFAULT_TREE_ORDER, {})[0]!.children!)).toEqual([
      "2. Two",
      "10. Ten",
      "9. nine.md",
    ]);
  });
});

describe("rearranging by hand", () => {
  const siblings = [folder("A"), folder("B"), file("c.md")];

  it("moves one row down and writes the whole run down with it", () => {
    const order = withMoved(DEFAULT_TREE_ORDER, siblings, "A", 1);
    expect(order.manual[""]).toEqual(["B", "A", "c.md"]);
    expect(names(orderTree(siblings, order, {}))).toEqual(["B", "A", "c.md"]);
  });

  it("refuses to move the first row up or the last row down", () => {
    expect(withMoved(DEFAULT_TREE_ORDER, siblings, "A", -1)).toBe(DEFAULT_TREE_ORDER);
    expect(withMoved(DEFAULT_TREE_ORDER, siblings, "c.md", 1)).toBe(DEFAULT_TREE_ORDER);
  });

  it("drops a row above another one", () => {
    const order = withDropped(DEFAULT_TREE_ORDER, siblings, "c.md", "A", "before");
    expect(order.manual[""]).toEqual(["c.md", "A", "B"]);
  });

  it("lets a note sit above a folder once somebody put it there", () => {
    const order = withDropped(DEFAULT_TREE_ORDER, siblings, "c.md", "A", "before");
    expect(names(orderTree(siblings, order, {}))[0]).toBe("c.md");
  });

  it("shows a newly added row after the ones that were arranged", () => {
    const order = withMoved(DEFAULT_TREE_ORDER, siblings, "A", 1);
    const withNew = [...siblings, folder("New")];
    expect(names(orderTree(withNew, order, {}))).toEqual(["B", "A", "c.md", "New"]);
  });

  it("puts a folder back under the sort mode when the order is cleared", () => {
    const order = withoutManual(withMoved(DEFAULT_TREE_ORDER, siblings, "A", 1), "");
    expect(names(orderTree(siblings, order, {}))).toEqual(["A", "B", "c.md"]);
  });

  it("carries a hand-made position across a rename", () => {
    const order = withMoved(DEFAULT_TREE_ORDER, siblings, "A", 1);
    expect(withPathRenamed(order, "A", "Z").manual[""]).toEqual(["B", "Z", "c.md"]);
  });

  it("forgets the arrangement of a folder that no longer exists", () => {
    const order: TreeOrder = { mode: "smart", manual: { gone: ["gone/a.md"], "": ["A"] } };
    expect(Object.keys(prunedOrder(order, siblings).manual)).toEqual([""]);
  });
});

describe("creation stamps", () => {
  it("keeps the first date it was told, not the latest", () => {
    const once = withCreated({}, "a.md", "2026-01-01T00:00:00.000Z");
    expect(withCreated(once, "a.md", "2026-06-01T00:00:00.000Z")).toBe(once);
  });

  it("moves the stamps under a renamed folder", () => {
    const created = withCreated(withCreated({}, "old", "1"), "old/a.md", "2");
    expect(withCreatedRenamed(created, "old", "new")).toEqual({ new: "1", "new/a.md": "2" });
  });

  it("drops the stamps for a deleted folder and its contents", () => {
    const created = withCreated(withCreated({}, "gone", "1"), "gone/a.md", "2");
    expect(withoutCreated(created, "gone")).toEqual({});
  });
});
