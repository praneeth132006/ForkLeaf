import { describe, expect, it } from "vitest";
import { cleanNotionSegment, planImport, type ImportInput } from "./importer";

const file = (path: string, content: string | Uint8Array, type = "text/markdown"): ImportInput => ({
  path,
  file: new File([content as BlobPart], path.split("/").pop()!, { type }),
});

describe("cleanNotionSegment", () => {
  it("removes the id Notion appends, from pages and folders", () => {
    expect(cleanNotionSegment("Project Plan 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md")).toBe(
      "Project Plan.md",
    );
    expect(cleanNotionSegment("Projects 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d")).toBe("Projects");
    expect(cleanNotionSegment("Plain name.md")).toBe("Plain name.md");
    // A page called only by its id keeps it rather than becoming nameless.
    expect(cleanNotionSegment("1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md")).toBe(
      "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md",
    );
  });
});

describe("planImport — Obsidian", () => {
  const vault = [
    file(
      "My Vault/Ideas/Launch.md",
      "# Launch\n\n![[chart.png]]\n\n![[diagram.png|400]]\n\n![[Roadmap]] and [[Roadmap]]",
    ),
    file("My Vault/Roadmap.md", "---\ntags: [plan]\n---\n\n# Roadmap"),
    file("My Vault/attachments/chart.png", new Uint8Array([137, 80, 78, 71]), "image/png"),
    file("My Vault/attachments/diagram.png", new Uint8Array([137, 80, 78, 71]), "image/png"),
    file("My Vault/.obsidian/workspace.json", "{}", "application/json"),
    file("My Vault/.trash/old.md", "# Deleted"),
    file("My Vault/archive.zip", "zip", "application/zip"),
  ];

  it("keeps the vault's folders under the destination, and skips settings and trash silently", async () => {
    const plan = await planImport(vault, {
      source: "obsidian",
      destination: "Imported/Obsidian",
      taken: [],
    });
    expect(plan.notes.map((note) => note.path).sort()).toEqual([
      "Imported/Obsidian/Ideas/Launch.md",
      "Imported/Obsidian/Roadmap.md",
    ]);
    expect(plan.assets.map((asset) => asset.path).sort()).toEqual([
      "Imported/Obsidian/attachments/chart.png",
      "Imported/Obsidian/attachments/diagram.png",
    ]);
    expect(plan.skipped).toEqual([
      {
        path: "archive.zip",
        reason: "Not a note, and not a picture, PDF or recording ForkLeaf can keep.",
      },
    ]);
  });

  it("turns picture embeds into markdown images, and note embeds into links", async () => {
    const plan = await planImport(vault, {
      source: "obsidian",
      destination: "Imported",
      taken: [],
    });
    const launch = plan.notes.find((note) => note.path === "Imported/Ideas/Launch.md")!;
    expect(launch.content).toBe(
      "# Launch\n\n![](../attachments/chart.png)\n\n![](../attachments/diagram.png)\n\n[[Roadmap]] and [[Roadmap]]",
    );
    expect(plan.linksRewritten).toBe(3);
    // Front matter comes across untouched.
    expect(plan.notes.find((note) => note.path === "Imported/Roadmap.md")!.content).toContain(
      "tags: [plan]",
    );
  });

  it("never overwrites something already in the notebook", async () => {
    const plan = await planImport(vault, {
      source: "obsidian",
      destination: "Imported",
      taken: ["Imported/Roadmap.md"],
    });
    expect(plan.notes.map((note) => note.path)).toContain("Imported/Roadmap-2.md");
  });
});

describe("planImport — Notion", () => {
  const id = "0123456789abcdef0123456789abcdef";
  const other = "fedcba9876543210fedcba9876543210";
  const exportFolder = [
    file(
      `Export-abc/Home ${id}.md`,
      `# Home\n\nSee [Project Plan](Projects%20${other}/Project%20Plan%20${id}.md) and [the site](https://notion.so/x).\n\n![Chart](Home%20${id}/chart.png)`,
    ),
    file(
      `Export-abc/Projects ${other}/Project Plan ${id}.md`,
      `# Project Plan\n\nBack to [Home](../Home%20${id}.md#top)`,
    ),
    file(`Export-abc/Home ${id}/chart.png`, new Uint8Array([1, 2, 3]), "image/png"),
    file(`Export-abc/Tasks ${other}.csv`, "Name,Status", "text/csv"),
  ];

  it("removes Notion's ids from every name and rewrites links to match", async () => {
    const plan = await planImport(exportFolder, {
      source: "notion",
      destination: "Imported/Notion",
      taken: [],
    });
    expect(plan.notes.map((note) => note.path).sort()).toEqual([
      "Imported/Notion/Home.md",
      "Imported/Notion/Projects/Project Plan.md",
    ]);
    expect(plan.assets.map((asset) => asset.path)).toEqual(["Imported/Notion/Home/chart.png"]);

    const home = plan.notes.find((note) => note.path === "Imported/Notion/Home.md")!;
    expect(home.content).toContain("[Project Plan](Projects/Project%20Plan.md)");
    expect(home.content).toContain("[the site](https://notion.so/x)");
    expect(home.content).toContain("![Chart](Home/chart.png)");

    const planDoc = plan.notes.find((note) => note.path.endsWith("Project Plan.md"))!;
    expect(planDoc.content).toContain("[Home](../Home.md#top)");
    expect(plan.linksRewritten).toBe(3);
  });

  it("skips database tables, saying why", async () => {
    const plan = await planImport(exportFolder, {
      source: "notion",
      destination: "Imported",
      taken: [],
    });
    expect(plan.skipped).toEqual([
      {
        path: `Tasks ${other}.csv`,
        reason: "A Notion database table, exported as CSV — not a note.",
      },
    ]);
  });
});

describe("planImport limits", () => {
  it("skips a note or attachment too large to commit", async () => {
    const big = new Uint8Array(3 * 1024 * 1024 + 1);
    const plan = await planImport(
      [file("v/huge.md", big), file("v/huge.png", big, "image/png"), file("v/ok.md", "# Ok")],
      { source: "obsidian", destination: "In", taken: [] },
    );
    expect(plan.notes.map((note) => note.path)).toEqual(["In/ok.md"]);
    expect(plan.skipped.map((entry) => entry.path)).toEqual(["huge.md", "huge.png"]);
  });

  it("works on files picked without a containing folder", async () => {
    const plan = await planImport([file("one.md", "# One")], {
      source: "obsidian",
      destination: "In",
      taken: [],
    });
    expect(plan.notes.map((note) => note.path)).toEqual(["In/one.md"]);
  });
});
