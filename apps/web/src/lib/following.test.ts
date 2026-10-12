// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  compareParagraphs,
  followingNote,
  markSeen,
  paragraphsOf,
  parseFollowing,
  parseRepoInput,
  quoteWithCredit,
  readSeen,
  seenSince,
  withFollowed,
  withoutFollowed,
} from "./following";

afterEach(() => window.localStorage.clear());

describe("following.md", () => {
  it("lists the notebooks in it, once each, and ignores anything else", () => {
    const content = `${followingNote()}- [Ada](https://github.com/ada/notes)
- [Grace's garden](https://github.com/grace/garden/)
Some prose about [a repo](https://github.com/x/y).
- [Ada again](https://github.com/ADA/notes)
- [Not GitHub](https://example.com/a/b)
`;
    expect(parseFollowing(content)).toEqual([
      { owner: "ada", repo: "notes", label: "Ada" },
      { owner: "grace", repo: "garden", label: "Grace's garden" },
    ]);
  });

  it("adds a notebook as a line, and not twice", () => {
    const once = withFollowed(followingNote(), { owner: "ada", repo: "notes", label: "ada/notes" });
    expect(
      once.endsWith(
        "Notebooks I follow in ForkLeaf. Remove a line to stop following one.\n\n- [ada/notes](https://github.com/ada/notes)\n",
      ),
    ).toBe(true);
    const twice = withFollowed(once, { owner: "grace", repo: "garden", label: "Grace" });
    expect(
      twice.endsWith(
        "- [ada/notes](https://github.com/ada/notes)\n- [Grace](https://github.com/grace/garden)\n",
      ),
    ).toBe(true);
    expect(withFollowed(twice, { owner: "Ada", repo: "Notes", label: "x" })).toBe(twice);
  });

  it("removes a notebook", () => {
    const content = withFollowed(
      withFollowed(followingNote(), { owner: "ada", repo: "notes", label: "Ada" }),
      { owner: "grace", repo: "garden", label: "Grace" },
    );
    expect(parseFollowing(withoutFollowed(content, { owner: "ada", repo: "notes" }))).toEqual([
      { owner: "grace", repo: "garden", label: "Grace" },
    ]);
  });

  it("reads owner/name or a GitHub address, and nothing that is not one", () => {
    expect(parseRepoInput(" ada/notes ")).toEqual({ owner: "ada", repo: "notes" });
    expect(parseRepoInput("https://github.com/ada/notes.git")).toEqual({
      owner: "ada",
      repo: "notes",
    });
    expect(parseRepoInput("ada")).toBeNull();
    expect(parseRepoInput("../..")).toBeNull();
    expect(parseRepoInput("https://example.com/ada/notes/extra")).toBeNull();
  });
});

describe("reading what they wrote", () => {
  it("splits a note into paragraphs, list items, headings and whole code blocks", () => {
    expect(
      paragraphsOf(
        "---\ntitle: x\n---\n# Heading\nFirst line\nsame paragraph\n\n- one\n- two\n\n```js\na\n\nb\n```\n",
      ),
    ).toEqual([
      { markdown: "# Heading", line: 4 },
      { markdown: "First line\nsame paragraph", line: 5 },
      { markdown: "- one", line: 8 },
      { markdown: "- two", line: 9 },
      { markdown: "```js\na\n\nb\n```", line: 11 },
    ]);
  });

  it("marks the paragraphs that are new since the version last seen", () => {
    const before = "# Cities\n\nTrams are quiet.\n\nBikes are cheap.";
    const after =
      "# Cities\n\nTrams are quiet.\n\nBuses come every five minutes.\n\nBikes are **cheap**.";
    expect(compareParagraphs(before, after).map((p) => [p.markdown, p.isNew])).toEqual([
      ["# Cities", false],
      ["Trams are quiet.", false],
      ["Buses come every five minutes.", true],
      // Bold added, words unchanged: not news.
      ["Bikes are **cheap**.", false],
    ]);
  });

  it("marks everything new in a note never seen", () => {
    expect(compareParagraphs(null, "One.\n\nTwo.").every((p) => p.isNew)).toBe(true);
  });

  it("quotes a paragraph with a permanent link to where it came from", () => {
    expect(
      quoteWithCredit(
        { markdown: "Trams are quiet.\nAnd clean.", line: 12 },
        {
          owner: "ada",
          repo: "notes",
          path: "ideas/city life.md",
          sha: "abc123",
          title: "City [life]",
        },
      ),
    ).toBe(
      "> Trams are quiet.\n> And clean.\n>\n> — from [City life](https://github.com/ada/notes/blob/abc123/ideas/city%20life.md#L12) by @ada\n",
    );
  });
});

describe("when you last caught up", () => {
  it("defaults to two weeks back, and remembers per notebook on this device", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(seenSince(readSeen("w"), { owner: "ada", repo: "notes" }, now)).toBe(
      "2026-10-01T12:00:00Z",
    );
    markSeen("w", { owner: "Ada", repo: "Notes" }, "2026-10-14T09:00:00Z");
    expect(seenSince(readSeen("w"), { owner: "ada", repo: "notes" }, now)).toBe(
      "2026-10-14T09:00:00Z",
    );
    expect(readSeen("other")).toEqual({});
  });
});
