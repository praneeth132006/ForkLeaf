import { describe, expect, it } from "vitest";
import { findOrphanAssets, formatBytes, referencedPaths } from "./orphan-assets";

/**
 * Finding images no note uses.
 *
 * This decides what gets deleted from somebody's repository, so the tests that
 * matter most are the ones asserting what is *not* an orphan. A miss in
 * `referencedPaths` does not produce a wrong number on a screen — it deletes a
 * picture out of a note somebody is still reading.
 */

describe("referencedPaths", () => {
  it("finds a pasted screenshot", () => {
    expect(referencedPaths("Intro/note.md", "![](assets/a.png)")).toEqual(["Intro/assets/a.png"]);
  });

  it("finds one linked rather than embedded", () => {
    expect(referencedPaths("Intro/note.md", "[the chart](assets/a.png)")).toEqual([
      "Intro/assets/a.png",
    ]);
  });

  it("finds one written as HTML, which markdown permits", () => {
    expect(referencedPaths("Intro/note.md", '<img src="assets/a.png" width="40">')).toEqual([
      "Intro/assets/a.png",
    ]);
  });

  it("finds one behind a reference definition", () => {
    const content = "Look at ![the chart][c].\n\n[c]: assets/a.png\n";
    expect(referencedPaths("Intro/note.md", content)).toContain("Intro/assets/a.png");
  });

  it("resolves a path that climbs out of the note's folder", () => {
    expect(referencedPaths("Intro/deep/note.md", "![](../assets/a.png)")).toEqual([
      "Intro/assets/a.png",
    ]);
  });

  it("decodes a percent-encoded path, as a renderer writes it", () => {
    // A folder with a space in it comes back from the editor as `%20`, and
    // comparing that literally against the repository path matches nothing —
    // which would report every image in every such folder as unused.
    expect(referencedPaths("Python 101/note.md", "![](assets/a%20b.png)")).toEqual([
      "Python 101/assets/a b.png",
    ]);
  });

  it("ignores an image hosted somewhere else", () => {
    expect(referencedPaths("note.md", "![](https://example.com/a.png)")).toEqual([]);
  });

  it("ignores a title after the path", () => {
    expect(referencedPaths("Intro/note.md", '![](assets/a.png "A chart")')).toEqual([
      "Intro/assets/a.png",
    ]);
  });
});

describe("findOrphanAssets", () => {
  const files = [
    { path: "Intro/note.md", size: 100 },
    { path: "Intro/assets/used.png", size: 2048 },
    { path: "Intro/assets/stray.png", size: 4096 },
  ];
  const notes = new Map([["Intro/note.md", "# Intro\n\n![](assets/used.png)\n"]]);

  it("reports the image nothing points at", () => {
    expect(findOrphanAssets(files, notes)).toEqual([
      { path: "Intro/assets/stray.png", size: 4096 },
    ]);
  });

  it("never reports a note", () => {
    const orphans = findOrphanAssets(files, notes).map((asset) => asset.path);
    expect(orphans).not.toContain("Intro/note.md");
  });

  it("leaves alone every file that is not an image", () => {
    // A repository is not only ours. Deleting a licence or a config file
    // because no note links to it would be indefensible.
    const repo = [
      ...files,
      { path: "LICENSE", size: 1000 },
      { path: ".gitignore", size: 20 },
      { path: "src/index.ts", size: 500 },
      { path: "README", size: 300 },
    ];

    expect(findOrphanAssets(repo, notes).map((asset) => asset.path)).toEqual([
      "Intro/assets/stray.png",
    ]);
  });

  it("counts an image used by any note, not just the one beside it", () => {
    // Sharing a picture across folders is unusual and entirely legal, and
    // getting it wrong deletes it out of the note that does use it.
    const shared = new Map([
      ["Intro/note.md", "# Intro\n"],
      ["Other/far.md", "![](../Intro/assets/stray.png)"],
    ]);

    expect(findOrphanAssets(files, shared).map((asset) => asset.path)).toEqual([
      "Intro/assets/used.png",
    ]);
  });

  it("reports nothing when every image is spoken for", () => {
    const all = new Map([["Intro/note.md", "![](assets/used.png)\n\n![](assets/stray.png)"]]);

    expect(findOrphanAssets(files, all)).toEqual([]);
  });

  it("carries a null size rather than inventing a zero", () => {
    const unsized = [{ path: "Intro/assets/stray.png" }];
    expect(findOrphanAssets(unsized, new Map())).toEqual([
      { path: "Intro/assets/stray.png", size: null },
    ]);
  });
});

describe("formatBytes", () => {
  it("reads as a size a person would recognise", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3_500_000)).toBe("3.3 MB");
  });
});
