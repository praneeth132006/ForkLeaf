import { describe, expect, it } from "vitest";
import {
  formatRepoTarget,
  freshnessOf,
  isRepoTarget,
  parseRepoTarget,
  pinRepoLink,
  repoTargetLabel,
  repoTargetUrl,
  repoTargetsIn,
} from "./repolinks";

const HERE = { owner: "me", repo: "notes", branch: "main" };

describe("isRepoTarget", () => {
  it("recognises the scheme however it is cased", () => {
    expect(isRepoTarget("repo:scripts/scan.sh")).toBe(true);
    expect(isRepoTarget("REPO:scripts/scan.sh")).toBe(true);
    expect(isRepoTarget("  repo:scripts/scan.sh")).toBe(true);
  });

  it("leaves ordinary note links alone", () => {
    for (const target of ["Roadmap", "projects/roadmap", "notes/a.md", "reporting"]) {
      expect(isRepoTarget(target)).toBe(false);
    }
  });
});

describe("parseRepoTarget — this note's own repository", () => {
  it("reads a plain path", () => {
    expect(parseRepoTarget("repo:scripts/scan.sh")).toEqual({
      owner: null,
      repo: null,
      path: "scripts/scan.sh",
      ref: null,
    });
  });

  it("reads a file at the repository root", () => {
    expect(parseRepoTarget("repo:README.md")?.path).toBe("README.md");
  });

  it("drops a leading slash rather than asking GitHub for an empty segment", () => {
    expect(parseRepoTarget("repo:/scripts/scan.sh")?.path).toBe("scripts/scan.sh");
  });

  it("tolerates whitespace around the whole thing", () => {
    expect(parseRepoTarget("  repo: scripts/scan.sh  ")?.path).toBe("scripts/scan.sh");
  });
});

describe("parseRepoTarget — another repository", () => {
  it("reads owner, repository and path", () => {
    expect(parseRepoTarget("repo:me/tools:scripts/scan.sh")).toEqual({
      owner: "me",
      repo: "tools",
      path: "scripts/scan.sh",
      ref: null,
    });
  });

  it("keeps a path containing slashes intact", () => {
    expect(parseRepoTarget("repo:me/tools:a/b/c/d.sh")?.path).toBe("a/b/c/d.sh");
  });

  it("accepts the punctuation GitHub allows in names", () => {
    const parsed = parseRepoTarget("repo:my-org/some.repo_name:x.sh");
    expect(parsed?.owner).toBe("my-org");
    expect(parsed?.repo).toBe("some.repo_name");
  });
});

describe("parseRepoTarget — pinned revisions", () => {
  it("reads a short SHA off the end", () => {
    expect(parseRepoTarget("repo:scripts/scan.sh@a1b2c3d")).toEqual({
      owner: null,
      repo: null,
      path: "scripts/scan.sh",
      ref: "a1b2c3d",
    });
  });

  it("reads a full SHA", () => {
    const sha = "a".repeat(40);
    expect(parseRepoTarget(`repo:x.sh@${sha}`)?.ref).toBe(sha);
  });

  it("folds a SHA to lowercase so comparison does not depend on typing", () => {
    expect(parseRepoTarget("repo:x.sh@A1B2C3D")?.ref).toBe("a1b2c3d");
  });

  it("reads a revision alongside an explicit repository", () => {
    const parsed = parseRepoTarget("repo:me/tools:scripts/scan.sh@a1b2c3d");
    expect(parsed).toEqual({
      owner: "me",
      repo: "tools",
      path: "scripts/scan.sh",
      ref: "a1b2c3d",
    });
  });

  it("leaves an @ that is part of a filename alone", () => {
    // `@types/node.md` is a real path; treating it as a revision would lose it.
    const parsed = parseRepoTarget("repo:docs/@types/node.md");
    expect(parsed?.path).toBe("docs/@types/node.md");
    expect(parsed?.ref).toBeNull();
  });

  it("ignores something after @ that is not a commit", () => {
    expect(parseRepoTarget("repo:x.sh@latest")?.ref).toBeNull();
    expect(parseRepoTarget("repo:x.sh@latest")?.path).toBe("x.sh@latest");
  });
});

describe("parseRepoTarget — what it refuses", () => {
  it("refuses anything without the scheme", () => {
    expect(parseRepoTarget("scripts/scan.sh")).toBeNull();
  });

  it("refuses an empty path", () => {
    for (const target of ["repo:", "repo:   ", "repo:/", "repo:me/tools:"]) {
      expect(parseRepoTarget(target)).toBeNull();
    }
  });

  it("refuses a path trying to climb out of the repository", () => {
    // This is interpolated into a URL, so a near-miss is a typo, not a request.
    for (const target of ["repo:../secrets", "repo:a/../../b", "repo:./x"]) {
      expect(parseRepoTarget(target)).toBeNull();
    }
  });

  it("refuses a path with an empty segment", () => {
    expect(parseRepoTarget("repo:a//b")).toBeNull();
  });

  it("refuses a repository half-named", () => {
    for (const target of ["repo:me:x.sh", "repo:/tools:x.sh", "repo:me/:x.sh"]) {
      expect(parseRepoTarget(target)).toBeNull();
    }
  });

  it("refuses names GitHub would not accept", () => {
    expect(parseRepoTarget("repo:me/to ols:x.sh")).toBeNull();
  });

  it("refuses a dotted name that would put traversal in the URL", () => {
    // Dots are legal in repository names, so a naive name pattern matches
    // `..` — and `repo:../x/y:z.sh` parsed with owner `..` until it did not.
    expect(parseRepoTarget("repo:../x/y:z.sh")).toBeNull();
    expect(parseRepoTarget("repo:./x:y.sh")).toBeNull();
    expect(parseRepoTarget("repo:x/..:y.sh")).toBeNull();
    expect(parseRepoTarget("repo:.../x:y.sh")).toBeNull();
  });
});

describe("formatRepoTarget", () => {
  it("round-trips a plain path", () => {
    const target = parseRepoTarget("repo:scripts/scan.sh")!;
    expect(formatRepoTarget(target)).toBe("repo:scripts/scan.sh");
  });

  it("round-trips an explicit repository and revision", () => {
    const written = "repo:me/tools:scripts/scan.sh@a1b2c3d";
    expect(formatRepoTarget(parseRepoTarget(written)!)).toBe(written);
  });

  it("writes a newly pinned revision back into the same syntax", () => {
    const target = { ...parseRepoTarget("repo:scripts/scan.sh")!, ref: "deadbee" };
    expect(formatRepoTarget(target)).toBe("repo:scripts/scan.sh@deadbee");
    expect(parseRepoTarget(formatRepoTarget(target))).toEqual(target);
  });
});

describe("repoTargetLabel and repoTargetUrl", () => {
  it("reads as the filename rather than the whole path", () => {
    expect(repoTargetLabel(parseRepoTarget("repo:a/b/scan.sh")!)).toBe("scan.sh");
    expect(repoTargetLabel(parseRepoTarget("repo:README.md")!)).toBe("README.md");
  });

  it("points at the file in this note's own repository", () => {
    expect(repoTargetUrl(parseRepoTarget("repo:scripts/scan.sh")!, HERE)).toBe(
      "https://github.com/me/notes/blob/main/scripts/scan.sh",
    );
  });

  it("points at the named repository when the link gives one", () => {
    expect(repoTargetUrl(parseRepoTarget("repo:you/tools:x.sh")!, HERE)).toBe(
      "https://github.com/you/tools/blob/main/x.sh",
    );
  });

  it("points at the pinned revision, not at the branch", () => {
    expect(repoTargetUrl(parseRepoTarget("repo:x.sh@a1b2c3d")!, HERE)).toBe(
      "https://github.com/me/notes/blob/a1b2c3d/x.sh",
    );
  });
});

describe("freshnessOf", () => {
  const pinned = parseRepoTarget("repo:x.sh@a1b2c3d")!;
  const loose = parseRepoTarget("repo:x.sh")!;

  it("calls a pinned link current when the file has not moved", () => {
    expect(freshnessOf(pinned, "a1b2c3d")).toBe("current");
  });

  it("matches a short SHA against the full one it stands for", () => {
    expect(freshnessOf(pinned, "a1b2c3d4e5f6789012345678901234567890abcd")).toBe("current");
  });

  it("ignores case on both sides", () => {
    expect(freshnessOf(pinned, "A1B2C3D")).toBe("current");
  });

  it("says a file changed after the note described it", () => {
    expect(freshnessOf(pinned, "9999999")).toBe("changed");
  });

  it("will not call an unpinned link fresh", () => {
    // Nothing has been checked, so saying "current" would be a lie of exactly
    // the kind this feature exists to stop.
    expect(freshnessOf(loose, "a1b2c3d")).toBe("unverified");
  });

  it("says a file is gone when it is gone", () => {
    expect(freshnessOf(pinned, "a1b2c3d", { exists: false })).toBe("missing");
    expect(freshnessOf(loose, null, { exists: false })).toBe("missing");
  });

  it("separates a failed check from a statement about the file", () => {
    expect(freshnessOf(pinned, null)).toBe("unknown");
  });
});

describe("repoTargetsIn", () => {
  it("picks the repository links out of a note's targets", () => {
    const found = repoTargetsIn(["Roadmap", "repo:scripts/scan.sh", "notes/a.md"]);
    expect(found.map((t) => t.path)).toEqual(["scripts/scan.sh"]);
  });

  it("keeps the order they were written in", () => {
    const found = repoTargetsIn(["repo:b.sh", "repo:a.sh"]);
    expect(found.map((t) => t.path)).toEqual(["b.sh", "a.sh"]);
  });

  it("lists one entry per file, not one per mention", () => {
    const found = repoTargetsIn(["repo:x.sh@a1b2c3d", "repo:x.sh@9999999", "repo:x.sh"]);
    expect(found).toHaveLength(1);
  });

  it("treats the same path in two repositories as two files", () => {
    const found = repoTargetsIn(["repo:me/a:x.sh", "repo:me/b:x.sh"]);
    expect(found).toHaveLength(2);
  });

  it("returns nothing for a note with no repository links", () => {
    expect(repoTargetsIn(["Roadmap", "notes/a.md"])).toEqual([]);
  });
});

describe("pinRepoLink", () => {
  const target = parseRepoTarget("repo:scripts/scan.sh")!;

  it("pins an unpinned link", () => {
    expect(pinRepoLink("See [[repo:scripts/scan.sh]] for it.", target, "a1b2c3d")).toBe(
      "See [[repo:scripts/scan.sh@a1b2c3d]] for it.",
    );
  });

  it("moves a pin that is already there", () => {
    expect(pinRepoLink("[[repo:scripts/scan.sh@0000000]]", target, "a1b2c3d")).toBe(
      "[[repo:scripts/scan.sh@a1b2c3d]]",
    );
  });

  it("updates every mention of the same file", () => {
    const content = "[[repo:scripts/scan.sh]] and later [[repo:scripts/scan.sh]]";
    expect(pinRepoLink(content, target, "a1b2c3d")).toBe(
      "[[repo:scripts/scan.sh@a1b2c3d]] and later [[repo:scripts/scan.sh@a1b2c3d]]",
    );
  });

  it("leaves links to other files alone", () => {
    const content = "[[repo:scripts/other.sh]] [[repo:scripts/scan.sh]]";
    expect(pinRepoLink(content, target, "a1b2c3d")).toBe(
      "[[repo:scripts/other.sh]] [[repo:scripts/scan.sh@a1b2c3d]]",
    );
  });

  it("leaves the same path in another repository alone", () => {
    const content = "[[repo:you/tools:scripts/scan.sh]] [[repo:scripts/scan.sh]]";
    expect(pinRepoLink(content, target, "a1b2c3d")).toBe(
      "[[repo:you/tools:scripts/scan.sh]] [[repo:scripts/scan.sh@a1b2c3d]]",
    );
  });

  it("leaves ordinary note links entirely alone", () => {
    const content = "[[Roadmap]] and [[notes/scan.sh]]";
    expect(pinRepoLink(content, target, "a1b2c3d")).toBe(content);
  });

  it("keeps an alias", () => {
    expect(pinRepoLink("[[repo:scripts/scan.sh|the scan script]]", target, "a1b2c3d")).toBe(
      "[[repo:scripts/scan.sh@a1b2c3d|the scan script]]",
    );
  });

  it("keeps an embed marker", () => {
    expect(pinRepoLink("![[repo:scripts/scan.sh]]", target, "a1b2c3d")).toBe(
      "![[repo:scripts/scan.sh@a1b2c3d]]",
    );
  });

  it("refuses to write something that is not a commit", () => {
    const content = "[[repo:scripts/scan.sh]]";
    for (const bad of ["latest", "", "zzz", "HEAD"]) {
      expect(pinRepoLink(content, target, bad)).toBe(content);
    }
  });

  it("folds the written pin to lowercase", () => {
    expect(pinRepoLink("[[repo:scripts/scan.sh]]", target, "A1B2C3D")).toBe(
      "[[repo:scripts/scan.sh@a1b2c3d]]",
    );
  });

  it("round-trips: what it writes parses back to what it meant", () => {
    const written = pinRepoLink("[[repo:scripts/scan.sh]]", target, "a1b2c3d");
    const inner = written.slice(2, -2);
    expect(parseRepoTarget(inner)).toEqual({ ...target, ref: "a1b2c3d" });
  });
});
