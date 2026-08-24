import { describe, expect, it } from "vitest";
import {
  rewriteRelativeLinks,
  relativeFromNote,
  resolveFromNote,
  repairRelativeLinks,
} from "./relocate";

describe("rewriteRelativeLinks", () => {
  it("keeps an image pointing at the same file after a move", () => {
    const before = "![shot](./assets/a.png)";
    const after = rewriteRelativeLinks(before, "SOC 101/Phishing/notes.md", "OSINT/notes.md");

    expect(after).toBe("![shot](../SOC%20101/Phishing/assets/a.png)");
    // And it names the file it always named.
    expect(resolveFromNote("OSINT/notes.md", "../SOC 101/Phishing/assets/a.png")).toBe(
      "SOC 101/Phishing/assets/a.png",
    );
  });

  it("moves a note up to the root", () => {
    expect(rewriteRelativeLinks("![a](./assets/a.png)", "notes/deep/n.md", "n.md")).toBe(
      "![a](notes/deep/assets/a.png)",
    );
  });

  it("moves a note down into a folder", () => {
    expect(rewriteRelativeLinks("![a](assets/a.png)", "n.md", "notes/deep/n.md")).toBe(
      "![a](../../assets/a.png)",
    );
  });

  it("rewrites ordinary links and reference definitions too", () => {
    const before = "See [the other note](./other.md) and [ref].\n\n[ref]: ./assets/b.png";
    expect(rewriteRelativeLinks(before, "a/n.md", "b/n.md")).toBe(
      "See [the other note](../a/other.md) and [ref].\n\n[ref]: ../a/assets/b.png",
    );
  });

  it("keeps a title and an anchor", () => {
    expect(rewriteRelativeLinks('![a](./assets/a.png "A shot")', "a/n.md", "b/n.md")).toBe(
      '![a](../a/assets/a.png "A shot")',
    );
    expect(rewriteRelativeLinks("[x](./other.md#part)", "a/n.md", "b/n.md")).toBe(
      "[x](../a/other.md#part)",
    );
  });

  it("leaves absolute URLs, anchors and wikilinks alone", () => {
    const before =
      "[web](https://example.com/a.png)\n[root](/a.png)\n[here](#section)\n[[another note]]";
    expect(rewriteRelativeLinks(before, "a/n.md", "b/n.md")).toBe(before);
  });

  it("leaves link-shaped text inside a code fence alone", () => {
    const before = "```md\n![a](./assets/a.png)\n```\n\n![b](./assets/b.png)";
    expect(rewriteRelativeLinks(before, "a/n.md", "b/n.md")).toBe(
      "```md\n![a](./assets/a.png)\n```\n\n![b](../a/assets/b.png)",
    );
  });

  it("reads a path whose spaces were percent-encoded", () => {
    expect(rewriteRelativeLinks("![a](./assets/my%20shot.png)", "a/n.md", "b/n.md")).toBe(
      "![a](../a/assets/my%20shot.png)",
    );
  });

  it("reads a destination already wrapped in angle brackets", () => {
    expect(rewriteRelativeLinks("![a](<./assets/my shot.png>)", "a/n.md", "b/n.md")).toBe(
      "![a](../a/assets/my%20shot.png)",
    );
  });

  it("does nothing for a rename within the same folder", () => {
    const before = "![a](./assets/a.png)";
    expect(rewriteRelativeLinks(before, "a/n.md", "a/renamed.md")).toBe(before);
  });
});

describe("relativeFromNote", () => {
  it("keeps a sibling explicit so a colon cannot read as a scheme", () => {
    expect(relativeFromNote("a/n.md", "a/c:d.png")).toBe("./c:d.png");
  });
});

/**
 * Repairing links that already point nowhere.
 *
 * The case this exists for is real and specific: notes written before images
 * were committed beside the note that uses them hold `assets/shot.png` while
 * the file itself sits in the repository root's `assets/`, so every picture in
 * the note is a broken box in the app and on github.com.
 */
describe("repairRelativeLinks", () => {
  const repo = [
    "SOC 101/Phishing/notes.md",
    "SOC 101/Phishing/assets/2026-08-24-later.png",
    "assets/2026-08-24-99586.png",
    "README.md",
  ];

  it("repoints a broken image at the file of that name", () => {
    const result = repairRelativeLinks(
      "![shot](assets/2026-08-24-99586.png)",
      "SOC 101/Phishing/notes.md",
      repo,
    );

    expect(result.content).toBe("![shot](../../assets/2026-08-24-99586.png)");
    expect(result.fixed).toEqual([
      { from: "assets/2026-08-24-99586.png", to: "../../assets/2026-08-24-99586.png" },
    ]);
  });

  it("leaves a link that already resolves exactly as it is", () => {
    const before = "![ok](./assets/2026-08-24-later.png)";
    const result = repairRelativeLinks(before, "SOC 101/Phishing/notes.md", repo);

    expect(result.content).toBe(before);
    expect(result.fixed).toEqual([]);
  });

  it("reports a link it cannot match rather than guessing", () => {
    const result = repairRelativeLinks(
      "![gone](./assets/never-uploaded.png)",
      "SOC 101/Phishing/notes.md",
      repo,
    );

    expect(result.content).toContain("./assets/never-uploaded.png");
    expect(result.unresolved).toEqual(["./assets/never-uploaded.png"]);
  });

  it("prefers the copy nearest the note when a name is not unique", () => {
    const result = repairRelativeLinks("![a](shot.png)", "a/b/notes.md", [
      "a/b/assets/shot.png",
      "far/away/shot.png",
    ]);

    expect(result.content).toBe("![a](assets/shot.png)");
  });

  it("leaves a genuine tie for a person to settle", () => {
    const result = repairRelativeLinks("![a](shot.png)", "notes.md", [
      "one/shot.png",
      "two/shot.png",
    ]);

    expect(result.fixed).toEqual([]);
    expect(result.unresolved).toEqual(["shot.png"]);
  });

  it("leaves absolute URLs alone", () => {
    const before = "![web](https://example.com/shot.png)";
    expect(repairRelativeLinks(before, "a/n.md", repo).content).toBe(before);
  });
});
