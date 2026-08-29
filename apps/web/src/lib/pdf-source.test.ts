import { describe, expect, it } from "vitest";
import type { Workspace } from "@forkleaf/types";
import { localSource, pdfFetchUrl, pdfLinkTarget, repoSource } from "@/lib/pdf-source";

const workspace: Workspace = {
  id: "me/notes@main:docs",
  name: "Notes",
  repo: { owner: "me", repo: "notes", branch: "main", directory: "docs" },
  isDefault: false,
  isLocal: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
};

describe("repoSource", () => {
  it("names a document by its filename and identifies it by workspace and path", () => {
    expect(repoSource(workspace, "papers/attention.pdf")).toEqual({
      kind: "repo",
      id: "me/notes@main:docs::papers/attention.pdf",
      name: "attention.pdf",
      workspaceId: workspace.id,
      path: "papers/attention.pdf",
    });
  });

  it("handles a PDF at the root of the workspace", () => {
    expect(repoSource(workspace, "read-me.pdf").name).toBe("read-me.pdf");
  });
});

describe("localSource", () => {
  it("gives two files with the same name different identities", () => {
    // Otherwise opening `paper.pdf` from a second folder shows the first one.
    const first = localSource("paper.pdf", new Uint8Array([1]));
    const second = localSource("paper.pdf", new Uint8Array([2]));
    expect(first.id).not.toBe(second.id);
  });
});

describe("pdfFetchUrl", () => {
  it("goes through the app's own proxy, never to GitHub directly", () => {
    const url = pdfFetchUrl(workspace, "papers/a.pdf");
    expect(url.startsWith("/api/gh/raw?")).toBe(true);
  });

  it("carries the repository, branch and subdirectory", () => {
    const params = new URLSearchParams(pdfFetchUrl(workspace, "papers/a.pdf").split("?")[1]);
    expect(Object.fromEntries(params)).toEqual({
      owner: "me",
      repo: "notes",
      branch: "main",
      path: "papers/a.pdf",
      dir: "docs",
    });
  });

  it("omits the subdirectory for a workspace at the repository root", () => {
    const root = { ...workspace, repo: { ...workspace.repo, directory: "" } };
    expect(pdfFetchUrl(root, "a.pdf")).not.toContain("dir=");
  });

  it("escapes a path with a space in it", () => {
    expect(pdfFetchUrl(workspace, "SOC 101/notes.pdf")).toContain("SOC+101%2Fnotes.pdf");
  });
});

describe("pdfLinkTarget", () => {
  it("resolves a relative link against the note holding it", () => {
    expect(pdfLinkTarget("projects/2026/plan.md", "../papers/attention.pdf")).toEqual({
      path: "projects/papers/attention.pdf",
      fragment: "",
    });
  });

  it("keeps the citation fragment", () => {
    expect(pdfLinkTarget("plan.md", "a.pdf#page=12&q=hello")).toEqual({
      path: "a.pdf",
      fragment: "page=12&q=hello",
    });
  });

  it("percent-decodes a folder name with a space, as the renderer wrote it", () => {
    // The renderer writes URLs, not paths: a note in `SOC 101` links out as
    // `../SOC%20101/…`, and resolving that literally asks for a file whose
    // name really contains a per-cent sign.
    expect(pdfLinkTarget("SOC 101/notes.md", "../SOC%20101/paper.pdf")?.path).toBe(
      "SOC 101/paper.pdf",
    );
  });

  it("claims a PDF regardless of how the extension is cased", () => {
    expect(pdfLinkTarget("a.md", "Paper.PDF")).not.toBeNull();
  });

  it("does not claim a link to another kind of file", () => {
    expect(pdfLinkTarget("a.md", "other.md")).toBeNull();
    expect(pdfLinkTarget("a.md", "chart.png")).toBeNull();
  });

  it("does not claim a heading anchor that merely mentions pdf", () => {
    expect(pdfLinkTarget("a.md", "#pdf-export")).toBeNull();
  });

  it("leaves a PDF on someone else's server alone", () => {
    // Fetching it would mean telling this app's server which papers somebody
    // reads. A link to another site stays a link to another site.
    expect(pdfLinkTarget("a.md", "https://arxiv.org/pdf/1706.03762.pdf")).toBeNull();
    expect(pdfLinkTarget("a.md", "//cdn.example.com/a.pdf")).toBeNull();
  });

  it("leaves a site-absolute path alone", () => {
    expect(pdfLinkTarget("a.md", "/public/a.pdf")).toBeNull();
  });

  it("is null for an empty href", () => {
    expect(pdfLinkTarget("a.md", "")).toBeNull();
  });
});
