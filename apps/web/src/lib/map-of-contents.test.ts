import { describe, expect, it } from "vitest";
import { mapOfContents, withMapOfContents, type MocNote } from "./map-of-contents";

const note = (path: string, title: string, tags: string[] = []): MocNote => ({ path, title, tags });

const hub = note("ml/Machine learning.md", "Machine learning", ["ml"]);
const notes = [
  hub,
  note("ml/gradient-descent.md", "Gradient descent", ["ml"]),
  note("ml/Backprop.md", "Backprop"),
  note("journal/2026-09-01.md", "1 September"),
  note("ml/Transformers.md", "Transformers", ["ML"]),
];

describe("mapOfContents", () => {
  it("lists links out, links in, and shared tags, each note once", () => {
    const text = mapOfContents({
      note: hub,
      linksTo: ["ml/Backprop.md", "missing.md"],
      linkedFrom: ["journal/2026-09-01.md", "ml/Backprop.md"],
      notes,
    });
    expect(text).toBe(
      [
        "## Map of contents",
        "",
        "### Linked from here",
        "",
        "- [[ml/Backprop]]",
        "",
        "### Links here",
        "",
        "- [[journal/2026-09-01|1 September]]",
        "",
        "### Tagged #ml",
        "",
        "- [[ml/gradient-descent|Gradient descent]]",
        "- [[ml/Transformers]]",
        "",
      ].join("\n"),
    );
  });

  it("says so when there is nothing to list", () => {
    expect(
      mapOfContents({ note: note("a.md", "A"), linksTo: [], linkedFrom: [], notes }),
    ).toContain("Nothing links here yet");
  });
});

describe("withMapOfContents", () => {
  const section = "## Map of contents\n\n- [[x]]\n";

  it("adds the section at the end", () => {
    expect(withMapOfContents("# Hub\n\nText\n\n", section)).toBe(`# Hub\n\nText\n\n${section}`);
  });

  it("replaces an earlier map and leaves what follows it", () => {
    const before = "# Hub\n\n## Map of contents\n\n- [[old]]\n\n## Notes\n\nMine";
    expect(withMapOfContents(before, section)).toBe(`# Hub\n\n${section}\n## Notes\n\nMine`);
  });
});
