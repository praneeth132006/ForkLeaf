import { describe, expect, it } from "vitest";
import type { Note, Workspace } from "@forkleaf/types";
import {
  allFolderPaths,
  buildIndex,
  buildNoteTree,
  directCount,
  excerptOf,
  flattenTree,
  folderCounts,
  folderTrail,
  humanise,
  orphanedNotes,
  queryIndex,
  subfolders,
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

/** A note written here and never pushed, so no tree could list it. */
function unpushed(path: string, content: string, updatedAt: string): Note {
  return { ...note(path, content, updatedAt), baseSha: null, dirty: true };
}

/** A note that was pushed, and has been edited here since. */
function edited(path: string, content: string, updatedAt: string): Note {
  return { ...note(path, content, updatedAt), dirty: true };
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
      [unpushed("drafts/new.md", "# New", "2026-02-02T00:00:00.000Z")],
      { treeKnown: true },
    );

    expect(entries.map((entry) => entry.path).sort()).toEqual(["drafts/new.md", "welcome.md"]);
  });

  it("keeps a pushed note with unpushed edits, however the tree reads", () => {
    // Absent from the tree and carrying work that exists nowhere else. This is
    // the one case where the local copy has to win.
    const entries = buildIndex(
      workspace,
      ["welcome.md"],
      [edited("notes/roadmap.md", "# Roadmap", "2026-02-02T00:00:00.000Z")],
      { treeKnown: true },
    );

    expect(entries.map((entry) => entry.path).sort()).toEqual(["notes/roadmap.md", "welcome.md"]);
  });

  it("drops stored notes that the tree no longer lists", () => {
    // The tree is authoritative about what exists, so a note deleted on GitHub
    // must not linger in the index because a stale copy is still on the device.
    // This is what had the dashboard showing folders the repository no longer
    // had, while the editor — which reads the tree alone — showed the truth.
    const entries = buildIndex(
      workspace,
      ["welcome.md"],
      [note("deleted/gone.md", "# Gone", "2026-02-02T00:00:00.000Z")],
      { treeKnown: true },
    );

    expect(entries.map((entry) => entry.path)).toEqual(["welcome.md"]);
  });

  it("shows everything stored when no tree has been read yet", () => {
    // An empty list of paths means "nobody has asked GitHub" here, not "the
    // repository is empty" — emptying the dashboard while offline would be a
    // worse lie than showing a note that has since been deleted.
    const entries = buildIndex(
      workspace,
      [],
      [note("notes/roadmap.md", "# Roadmap", "2026-02-02T00:00:00.000Z")],
    );

    expect(entries.map((entry) => entry.path)).toEqual(["notes/roadmap.md"]);
  });
});

describe("orphanedNotes", () => {
  it("names the stored copies of notes the repository no longer has", () => {
    const orphans = orphanedNotes(
      ["welcome.md"],
      [
        note("welcome.md", "# Welcome", "2026-02-01T00:00:00.000Z"),
        note("deleted/gone.md", "# Gone", "2026-02-01T00:00:00.000Z"),
      ],
    );

    expect(orphans.map((orphan) => orphan.path)).toEqual(["deleted/gone.md"]);
  });

  it("never names a note holding work that has not been pushed", () => {
    const orphans = orphanedNotes(
      ["welcome.md"],
      [
        unpushed("drafts/new.md", "# New", "2026-02-01T00:00:00.000Z"),
        edited("notes/roadmap.md", "# Roadmap", "2026-02-01T00:00:00.000Z"),
      ],
    );

    expect(orphans).toEqual([]);
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

/**
 * Browsing one level at a time is what keeps the dashboard usable on a
 * repository with a hundred folders in it, so these are the cases that decide
 * whether a folder shows up in the right place.
 */
describe("subfolders", () => {
  const entries = buildIndex(
    workspace,
    [
      "readme.md",
      "skills/index.md",
      "skills/api/red/one.md",
      "skills/api/blue/two.md",
      "skills/ci-cd/three.md",
      "docs/four.md",
    ],
    [],
  );

  it("lists only the top level at the root, with counts from everything beneath", () => {
    expect(subfolders(entries, null)).toEqual([
      { path: "docs", name: "docs", count: 1 },
      { path: "skills", name: "skills", count: 4 },
    ]);
  });

  it("lists the children of a folder, not its grandchildren", () => {
    expect(subfolders(entries, "skills")).toEqual([
      { path: "skills/api", name: "api", count: 2 },
      { path: "skills/ci-cd", name: "ci-cd", count: 1 },
    ]);
  });

  it("goes another level down", () => {
    expect(subfolders(entries, "skills/api").map((item) => item.name)).toEqual(["blue", "red"]);
  });

  it("has nothing to offer at a leaf", () => {
    expect(subfolders(entries, "docs")).toEqual([]);
  });

  it("counts the notes sitting directly in a folder", () => {
    expect(directCount(entries, null)).toBe(1);
    expect(directCount(entries, "skills")).toBe(1);
    expect(directCount(entries, "skills/api")).toBe(0);
  });
});

describe("folderTrail", () => {
  it("builds a breadcrumb of ancestors", () => {
    expect(folderTrail("skills/api/red")).toEqual([
      { path: "skills", name: "skills" },
      { path: "skills/api", name: "api" },
      { path: "skills/api/red", name: "red" },
    ]);
  });

  it("is empty at the root", () => {
    expect(folderTrail(null)).toEqual([]);
    expect(folderTrail("")).toEqual([]);
  });
});

describe("buildNoteTree", () => {
  const entries = buildIndex(
    workspace,
    [
      "readme.md",
      "projects/api/spec.md",
      "projects/website/copy.md",
      "projects/website/roadmap.md",
      "meetings/2026-08-01.md",
    ],
    [],
  );

  it("nests folders and keeps notes in the folder they are actually in", () => {
    const root = buildNoteTree(entries);

    expect(root.notes.map((entry) => entry.path)).toEqual(["readme.md"]);
    expect(root.folders.map((folder) => folder.name)).toEqual(["meetings", "projects"]);

    const projects = root.folders.find((folder) => folder.name === "projects")!;
    expect(projects.notes).toEqual([]);
    expect(projects.folders.map((folder) => folder.path)).toEqual([
      "projects/api",
      "projects/website",
    ]);
  });

  it("rolls counts up through every level", () => {
    const root = buildNoteTree(entries);
    const projects = root.folders.find((folder) => folder.name === "projects")!;

    expect(root.count).toBe(5);
    expect(projects.count).toBe(3);
    expect(projects.folders.find((folder) => folder.name === "website")!.count).toBe(2);
  });

  it("lists every folder path, for expanding the whole tree at once", () => {
    expect(allFolderPaths(buildNoteTree(entries))).toEqual([
      "meetings",
      "projects",
      "projects/api",
      "projects/website",
    ]);
  });

  it("builds from whatever it is given, so a filtered tree holds only matches", () => {
    const matches = queryIndex(entries, { query: "roadmap" });
    const root = buildNoteTree(matches);

    expect(root.count).toBe(1);
    expect(root.folders.map((folder) => folder.name)).toEqual(["projects"]);
  });

  it("has nothing in it when there are no entries", () => {
    const root = buildNoteTree([]);
    expect(root.count).toBe(0);
    expect(root.folders).toEqual([]);
    expect(root.notes).toEqual([]);
  });
});
