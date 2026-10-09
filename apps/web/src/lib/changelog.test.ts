import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatChangelogDate, parseChangelog, slugify } from "./changelog";

const SAMPLE = `# Changelog

Preamble that is not a release.

## Unreleased

### A new thing

It does something.

## 2026-09-29

### Fixed — a broken thing

- one
- two

### Security and privacy, tightened

Text.

\`\`\`md
## Not a heading
### Nor this
\`\`\`

## 1.0.0 — 2026-08-26

The first release.

### Writing

- Modes
`;

describe("parseChangelog", () => {
  const releases = parseChangelog(SAMPLE);

  it("reads every section, newest first, and skips the preamble", () => {
    expect(releases.map((release) => release.label)).toEqual([
      "Unreleased",
      "2026-09-29",
      "1.0.0 — 2026-08-26",
    ]);
  });

  it("reads dates and versions from the heading", () => {
    expect(releases[0]).toMatchObject({ date: null, version: null });
    expect(releases[1]).toMatchObject({ date: "2026-09-29", version: null });
    expect(releases[2]).toMatchObject({ date: "2026-08-26", version: "1.0.0" });
  });

  it("keeps a release's introduction apart from its entries", () => {
    expect(releases[2]!.intro).toBe("The first release.");
    expect(releases[2]!.entries.map((entry) => entry.title)).toEqual(["Writing"]);
  });

  it("labels fixes and security changes", () => {
    expect(releases[1]!.entries.map((entry) => entry.kind)).toEqual(["fixed", "security"]);
    expect(releases[0]!.entries[0]!.kind).toBe("new");
  });

  it("does not split on headings inside a code block", () => {
    const security = releases[1]!.entries[1]!;
    expect(security.body).toContain("## Not a heading");
    expect(security.body).toContain("### Nor this");
    expect(releases[1]!.entries).toHaveLength(2);
  });

  it("gives every entry a unique slug", () => {
    const twice = parseChangelog("## 2026-01-01\n\n### Same\n\nA\n\n### Same\n\nB\n");
    expect(twice[0]!.entries.map((entry) => entry.slug)).toEqual([
      "2026-01-01-same",
      "2026-01-01-same-2",
    ]);
  });
});

describe("helpers", () => {
  it("slugifies headings with markdown in them", () => {
    expect(slugify("Everything in the `/` menu")).toBe("everything-in-the-menu");
  });

  it("formats dates the same way everywhere", () => {
    expect(formatChangelogDate("2026-09-29")).toBe("29 September 2026");
  });
});

describe("the repository's CHANGELOG.md", () => {
  const file = readFileSync(
    fileURLToPath(new URL("../../../../CHANGELOG.md", import.meta.url)),
    "utf8",
  );
  const releases = parseChangelog(file);

  it("dates every section except Unreleased, newest first", () => {
    const dated = releases.filter((release) => release.label !== "Unreleased");
    expect(dated.length).toBeGreaterThan(5);
    for (const release of dated) expect(release.date).not.toBeNull();

    const dates = dated.map((release) => release.date!);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("has no section without entries, except possibly Unreleased", () => {
    for (const release of releases) {
      if (release.label === "Unreleased") continue;
      expect(release.entries.length, release.label).toBeGreaterThan(0);
    }
  });
});
