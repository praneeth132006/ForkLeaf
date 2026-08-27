import { describe, expect, it } from "vitest";
import { forgetLock, isPathLocked, lockedKey, renameLock, toggleLock } from "./locks";

describe("isPathLocked", () => {
  it("is false for a note nobody locked", () => {
    expect(isPathLocked(["a.md"], "b.md")).toBe(false);
  });

  it("is true for a note that is locked", () => {
    expect(isPathLocked(["a.md", "b.md"], "b.md")).toBe(true);
  });

  it("is false with no note open, rather than throwing", () => {
    expect(isPathLocked(["a.md"], null)).toBe(false);
    expect(isPathLocked(["a.md"], undefined)).toBe(false);
  });

  it("matches the whole path, not a prefix of it", () => {
    // `notes/a.md` and `notes/a.md.bak` are different files.
    expect(isPathLocked(["notes/a.md"], "notes/a.md.bak")).toBe(false);
  });
});

describe("toggleLock", () => {
  it("locks a note", () => {
    expect(toggleLock([], "a.md")).toEqual(["a.md"]);
  });

  it("unlocks one already locked", () => {
    expect(toggleLock(["a.md", "b.md"], "a.md")).toEqual(["b.md"]);
  });

  it("never grows a duplicate", () => {
    // A path listed twice would unlock on the first press and stay locked,
    // which is exactly the kind of bug a toggle hides.
    const once = toggleLock([], "a.md");
    expect(toggleLock(toggleLock(once, "a.md"), "a.md")).toEqual(["a.md"]);
  });

  it("leaves the list it was given alone", () => {
    const before = ["a.md"];
    toggleLock(before, "b.md");
    expect(before).toEqual(["a.md"]);
  });
});

describe("renameLock", () => {
  it("carries a lock across a rename", () => {
    expect(renameLock(["a.md"], "a.md", "b.md")).toEqual(["b.md"]);
  });

  it("leaves other notes where they are", () => {
    expect(renameLock(["a.md", "c.md"], "a.md", "b.md")).toEqual(["b.md", "c.md"]);
  });

  it("does nothing for a note that was not locked", () => {
    expect(renameLock(["a.md"], "c.md", "d.md")).toEqual(["a.md"]);
  });
});

describe("forgetLock", () => {
  it("drops the lock on a deleted note", () => {
    expect(forgetLock(["a.md", "b.md"], "a.md")).toEqual(["b.md"]);
  });

  it("drops the locks inside a deleted folder", () => {
    expect(forgetLock(["docs/a.md", "docs/deep/b.md", "c.md"], "docs")).toEqual(["c.md"]);
  });

  it("does not drop a note whose name merely starts the same way", () => {
    expect(forgetLock(["docs-old/a.md"], "docs")).toEqual(["docs-old/a.md"]);
  });
});

describe("lockedKey", () => {
  it("is per workspace, so a lock on one repo does not lock another", () => {
    expect(lockedKey("me/notes@main:")).not.toBe(lockedKey("me/notes@draft:"));
  });
});
