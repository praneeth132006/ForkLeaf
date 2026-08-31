import { describe, expect, it } from "vitest";
import type { RepoRef } from "@forkleaf/types";
import { documentUrl, linkDocuments } from "./publish-citations";

const repo: RepoRef = { owner: "me", repo: "notes", branch: "main", directory: "" };
const options = { notePath: "reading/attention.md", repo };

describe("linkDocuments", () => {
  it("points a citation at a document a reader can actually reach", () => {
    const markdown =
      "> A passage.\n>\n> — [Paper, p. 12](../papers/attention.pdf#page=12&q=A%20passage)";

    expect(linkDocuments(markdown, options)).toContain(
      "https://github.com/me/notes/blob/main/papers/attention.pdf#page=12&q=A%20passage",
    );
  });

  it("keeps the fragment exactly as it was", () => {
    // It is the standard `#page=` plus the quotation, and it is what makes the
    // link open the right page in anything.
    const markdown = "[p. 3](../papers/x.pdf#page=3&q=words&pre=before&suf=after)";

    expect(linkDocuments(markdown, options)).toContain("#page=3&q=words&pre=before&suf=after");
  });

  it("resolves against the note, not the repository root", () => {
    const deep = { notePath: "a/b/c/note.md", repo };
    expect(linkDocuments("[x](../../papers/y.pdf#page=1)", deep)).toContain(
      "/blob/main/a/papers/y.pdf",
    );
  });

  it("leaves everything that is not a document alone", () => {
    const markdown = [
      "[a note](../other.md)",
      "[a site](https://example.com/x.pdf#page=2)",
      "![a picture](assets/chart.png)",
      "[an anchor](#heading)",
    ].join("\n\n");

    expect(linkDocuments(markdown, options)).toBe(markdown);
  });

  it("leaves an image of a document alone, which is not a citation", () => {
    const markdown = "![figure](../papers/x.pdf)";
    expect(linkDocuments(markdown, options)).toBe(markdown);
  });

  it("keeps the words of the link", () => {
    const markdown = "[On Attention, p. 12](../papers/attention.pdf#page=12)";
    expect(linkDocuments(markdown, options)).toContain("[On Attention, p. 12](");
  });
});

describe("documentUrl", () => {
  it("includes the workspace's folder, since that is where the file is", () => {
    expect(documentUrl({ ...repo, directory: "wiki" }, "papers/x.pdf")).toBe(
      "https://github.com/me/notes/blob/main/wiki/papers/x.pdf",
    );
  });

  it("encodes each segment without encoding the slashes between them", () => {
    expect(documentUrl(repo, "SOC 101/week one.pdf")).toBe(
      "https://github.com/me/notes/blob/main/SOC%20101/week%20one.pdf",
    );
  });
});
