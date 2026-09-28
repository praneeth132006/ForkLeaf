import { describe, expect, it } from "vitest";
import { relativesOf, type LineageNote } from "./lineage";

const note = (path: string, content: string, created: string | null = null): LineageNote => ({
  path,
  title: path.replace(/\.md$/, ""),
  content,
  created,
});

const passage =
  "The billing service retries failed charges three times over a week before it gives up";

describe("relativesOf", () => {
  it("finds the notes a passage was copied between, and which came first", () => {
    const meeting = note("meeting.md", `# Standup\n\n${passage}.\n\nOther things.`, "2026-09-01");
    const spec = note(
      "billing-spec.md",
      `# Billing\n\nWe decided: ${passage}, and emails the owner.`,
      "2026-09-10",
    );
    const unrelated = note(
      "garden.md",
      "# Garden\n\nTomatoes need sun and water every single day.",
    );
    const found = relativesOf(spec, [meeting, spec, unrelated]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ path: "meeting.md", relation: "parent" });
    expect(found[0]!.sharedWords).toBe(15);
    expect(found[0]!.passages[0]).toContain("billing service retries failed charges");
  });

  it("calls the newer note a child, and an undated one a sibling", () => {
    const a = note("a.md", passage, "2026-01-01");
    const b = note("b.md", passage, "2026-02-01");
    expect(relativesOf(a, [b])[0]!.relation).toBe("child");
    expect(relativesOf(note("c.md", passage), [b])[0]!.relation).toBe("sibling");
  });

  it("does not count a common short phrase, or code and front matter", () => {
    const a = note("a.md", "In the end it was fine. We shipped it.");
    const b = note("b.md", "In the end it was fine, said nobody at all.");
    expect(relativesOf(a, [b])).toEqual([]);
    const code =
      "```\nconst a = retry(charge, three, times, over, a, week, before, giving, up)\n```";
    expect(relativesOf(note("c.md", `${code}\nshort`), [note("d.md", code)])).toEqual([]);
  });
});
