import { describe, expect, it } from "vitest";
import { workspaceId, type RepoRef, type Workspace } from "@forkleaf/types";
import {
  describeTarget,
  idIsStableAcross,
  isSplitPublishing,
  suggestEditUrl,
  parseTarget,
  publishTargetOf,
  targetWarning,
  withPublishTarget,
} from "./publish-target";

const NOTES: RepoRef = { owner: "me", repo: "notes", branch: "main", directory: "vault" };
const PUBLIC: RepoRef = { owner: "me", repo: "site", branch: "main", directory: "" };

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: workspaceId(NOTES),
    name: "notes",
    repo: NOTES,
    isDefault: false,
    isLocal: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("publishTargetOf", () => {
  it("publishes beside the notes when nothing else was chosen", () => {
    // Every workspace made before this existed answers this way, which is why
    // no migration was needed.
    expect(publishTargetOf(workspace())).toEqual(NOTES);
  });

  it("publishes to the chosen repository when there is one", () => {
    expect(publishTargetOf(workspace({ publishRepo: PUBLIC }))).toEqual(PUBLIC);
  });
});

describe("isSplitPublishing", () => {
  it("is false for a workspace publishing into its own repository", () => {
    expect(isSplitPublishing(workspace())).toBe(false);
  });

  it("is true once pages go somewhere else", () => {
    expect(isSplitPublishing(workspace({ publishRepo: PUBLIC }))).toBe(true);
  });

  it("is false when the target names the same repository on another branch", () => {
    // Same repository is not a split, whatever branch the pages land on.
    const sameRepo = { ...NOTES, branch: "gh-pages", directory: "" };
    expect(isSplitPublishing(workspace({ publishRepo: sameRepo }))).toBe(false);
  });
});

describe("parseTarget", () => {
  it("reads owner/name", () => {
    expect(parseTarget("me/site")).toEqual({
      owner: "me",
      repo: "site",
      branch: "main",
      directory: "",
    });
  });

  it("reads a pasted GitHub URL, which is what people actually have", () => {
    expect(parseTarget("https://github.com/me/site")?.repo).toBe("site");
    expect(parseTarget("https://github.com/me/site.git")?.repo).toBe("site");
  });

  it("always targets the repository root, never the notes' subfolder", () => {
    // Inheriting `vault/` would bury `docs/` where Pages does not look.
    expect(parseTarget("me/site")?.directory).toBe("");
  });

  it("honours a branch when one is given", () => {
    expect(parseTarget("me/site", "gh-pages")?.branch).toBe("gh-pages");
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseTarget("  me/site  ")?.repo).toBe("site");
  });

  it("refuses anything that is not exactly two parts", () => {
    for (const value of ["me", "me/site/extra", "", "   ", "/", "me/"]) {
      expect(parseTarget(value)).toBeNull();
    }
  });

  it("refuses names GitHub would not accept", () => {
    for (const value of ["me/si te", "../x", "me/..", "./x"]) {
      expect(parseTarget(value)).toBeNull();
    }
  });
});

describe("targetWarning", () => {
  it("says nothing about the ordinary case", () => {
    expect(targetWarning(NOTES, NOTES)).toBeNull();
  });

  it("explains why a private notebook cannot serve its own pages", () => {
    const warning = targetWarning(NOTES, NOTES, { notesArePrivate: true });
    expect(warning).toMatch(/paid plan/);
    expect(warning).toMatch(/notes stay private/);
  });

  it("warns that a different repository means anyone can read it", () => {
    const warning = targetWarning(PUBLIC, NOTES);
    expect(warning).toMatch(/me\/site/);
    expect(warning).toMatch(/readable by anyone/);
  });

  it("says when the chosen target is itself private, which serves nothing", () => {
    const warning = targetWarning(PUBLIC, NOTES, { targetIsPrivate: true });
    expect(warning).toMatch(/me\/site is private/);
  });

  it("prefers the private-target warning over the general one", () => {
    const warning = targetWarning(PUBLIC, NOTES, { targetIsPrivate: true });
    expect(warning).not.toMatch(/readable by anyone/);
  });
});

describe("withPublishTarget", () => {
  it("records a chosen target", () => {
    expect(withPublishTarget(workspace(), PUBLIC).publishRepo).toEqual(PUBLIC);
  });

  it("drops the field entirely when cleared, rather than storing a null", () => {
    const split = workspace({ publishRepo: PUBLIC });
    const cleared = withPublishTarget(split, null);

    expect("publishRepo" in cleared).toBe(false);
    expect(publishTargetOf(cleared)).toEqual(NOTES);
  });

  it("leaves the rest of the workspace alone", () => {
    const before = workspace();
    const after = withPublishTarget(before, PUBLIC);

    expect(after.name).toBe(before.name);
    expect(after.repo).toEqual(before.repo);
    expect(after.createdAt).toBe(before.createdAt);
  });

  it("never moves the workspace id, which the stored notes hang off", () => {
    const after = withPublishTarget(workspace(), PUBLIC);
    expect(after.id).toBe(workspace().id);
    expect(idIsStableAcross(after)).toBe(true);
  });
});

describe("describeTarget", () => {
  it("reads as owner/name", () => {
    expect(describeTarget(PUBLIC)).toBe("me/site");
  });
});

/**
 * The reader's way to send a correction back. GitHub's own editor forks,
 * commits and opens the pull request; none of that has to be built here.
 */
describe("suggestEditUrl", () => {
  const repo: RepoRef = { owner: "me", repo: "notes", branch: "main", directory: "" };

  it("points at the note's own file, on its own branch", () => {
    expect(suggestEditUrl(repo, "notes/runbook.md")).toBe(
      "https://github.com/me/notes/edit/main/notes/runbook.md",
    );
  });

  it("includes the workspace's folder, since that is where the file is", () => {
    expect(suggestEditUrl({ ...repo, directory: "wiki" }, "a.md")).toBe(
      "https://github.com/me/notes/edit/main/wiki/a.md",
    );
  });

  it("encodes each segment without encoding the slashes between them", () => {
    // A path is a path: percent-encoding its separators makes GitHub look for
    // one file with slashes in its name.
    expect(suggestEditUrl(repo, "SOC 101/week one.md")).toBe(
      "https://github.com/me/notes/edit/main/SOC%20101/week%20one.md",
    );
  });

  it("points at the source repository, whatever the page was published to", () => {
    // A page published into a separate public site is a copy. A suggestion
    // against the copy is one the author cannot accept without hand-copying it
    // back.
    expect(suggestEditUrl(repo, "a.md")).toContain("/me/notes/");
  });
});
