import { describe, expect, it } from "vitest";
import type { Note, Workspace } from "@forkleaf/types";
import {
  buildIndex,
  excerptOf,
  flattenTree,
  folderCounts,
  humanise,
  queryIndex,
  tagCounts,
} from "./library";

const workspace: Workspace = {
  id: "me/notes@main:",
  name: "notes",
  repo: { owner: "me", repo: "notes", branch: "main", directory: "" },
  isDefault: true,
  isLocal: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
};

function note(path: string, content: string, updatedAt: string, tags: string[] = []): Note {
  return {
    id: `${workspace.id}::${path}`,
    workspaceId: workspace.id,
    path,
    content,
    frontmatter: tags.length > 0 ? { tags } : {},
    baseSha: "abc",
    updatedAt,
    dirty: false,
  };
}

describe("flattenTree", () => {
  it("returns every file path and no folders", () => {
    expect(
      flattenTree([
        {
          path: "projects",
          name: "projects",
          kind: "folder",
          children: [{ path: "projects/roadmap.md", name: "roadmap.md", kind: "file" }],
        },
        { path: "welcome.md", name: "welcome.md", kind: "file" },
      ]),
    ).toEqual(["projects/roadmap.md", "welcome.md"]);
  });
});

describe("buildIndex", () => {
  it("reads title, tags and words from notes that are stored locally", () => {
    const [entry] = buildIndex(
      workspace,
      ["notes/roadmap.md"],
      [
        note(
          "notes/roadmap.md",
          "# The roadmap\n\nWhat we ship next.",
          "2026-02-01T00:00:00.000Z",
          ["planning"],
        ),
      ],
    );

    expect(entry).toMatchObject({
      title: "The roadmap",
      folder: "notes",
      tags: ["planning"],
      indexed: true,
    });
    expect(entry!.words).toBeGreaterThan(0);
    expect(entry!.excerpt).toBe("What we ship next.");
  });

  it("marks paths that have not been read rather than reporting zero words as fact", () => {
    const [entry] = buildIndex(workspace, ["inbox/quick-capture.md"], []);

    expect(entry).toMatchObject({
      title: "Quick capture",
      words: 0,
      indexed: false,
      updatedAt: null,
    });
  });

  it("includes locally created notes that are not in the tree yet", () => {
    const entries = buildIndex(
      workspace,
      ["welcome.md"],
      [note("drafts/new.md", "# New", "2026-02-02T00:00:00.000Z")],
    );

    expect(entries.map((entry) => entry.path).sort()).toEqual(["drafts/new.md", "welcome.md"]);
  });

  it("drops stored notes that the tree no longer lists", () => {
    // The tree is authoritative about what exists, so a note deleted on GitHub
    // must not linger in the index because a stale copy is still on the device.
    const entries = buildIndex(workspace, ["welcome.md"], []);
    expect(entries).toHaveLength(1);
  });
});

describe("queryIndex", () => {
  const entries = buildIndex(
    workspace,
    ["notes/roadmap.md", "notes/archive/old-roadmap.md", "inbox/idea.md"],
    [
      note("notes/roadmap.md", "# Roadmap\n\nShipping plan.", "2026-03-01T00:00:00.000Z", [
        "planning",
      ]),
      note(
        "notes/archive/old-roadmap.md",
        "# Old roadmap\n\nLast year.",
        "2026-01-01T00:00:00.000Z",
      ),
      note("inbox/idea.md", "# A stray idea\n\nRoadmap adjacent.", "2026-02-01T00:00:00.000Z"),
    ],
  );

  it("ranks an exact title above a mere mention", () => {
    const [first] = queryIndex(entries, { query: "roadmap" });
    expect(first!.path).toBe("notes/roadmap.md");
  });

  it("sorts by most recently edited when nothing is searched", () => {
    expect(queryIndex(entries, {}).map((entry) => entry.path)).toEqual([
      "notes/roadmap.md",
      "inbox/idea.md",
      "notes/archive/old-roadmap.md",
    ]);
  });

  it("includes nested folders when filtering by a parent", () => {
    expect(queryIndex(entries, { folder: "notes" })).toHaveLength(2);
  });

  it("filters by tag", () => {
    expect(queryIndex(entries, { tag: "planning" }).map((entry) => entry.path)).toEqual([
      "notes/roadmap.md",
    ]);
  });

  it("sorts unread notes last rather than treating a missing date as 1970", () => {
    const mixed = buildIndex(
      workspace,
      ["read.md", "unread.md"],
      [note("read.md", "# Read", "2026-01-01T00:00:00.000Z")],
    );

    expect(queryIndex(mixed, { sort: "recent" }).map((entry) => entry.path)).toEqual([
      "read.md",
      "unread.md",
    ]);
  });
});

describe("facets", () => {
  const entries = buildIndex(
    workspace,
    ["notes/a.md", "notes/deep/b.md"],
    [
      note("notes/a.md", "# A", "2026-01-01T00:00:00.000Z", ["x"]),
      note("notes/deep/b.md", "# B", "2026-01-02T00:00:00.000Z", ["x", "y"]),
    ],
  );

  it("counts a note into every folder above it", () => {
    expect(folderCounts(entries)).toEqual([
      { path: "notes", count: 2 },
      { path: "notes/deep", count: 1 },
    ]);
  });

  it("orders tags by how often they are used", () => {
    expect(tagCounts(entries)).toEqual([
      { tag: "x", count: 2 },
      { tag: "y", count: 1 },
    ]);
  });
});

describe("excerptOf", () => {
  it("skips headings, fences and tables to find real prose", () => {
    expect(excerptOf("# Title\n\n```js\ncode\n```\n\n| a | b |\n\nActual prose here.")).toBe(
      "Actual prose here.",
    );
  });

  it("strips link and emphasis markup", () => {
    expect(excerptOf("See the **[docs](https://example.com)** for more.")).toBe(
      "See the docs for more.",
    );
  });

  it("returns nothing for a note that is only a heading", () => {
    expect(excerptOf("# Just a title")).toBe("");
  });
});

describe("humanise", () => {
  it("turns a filename slug into something readable", () => {
    expect(humanise("q3-roadmap_draft")).toBe("Q3 roadmap draft");
    expect(humanise("")).toBe("Untitled");
  });
});
