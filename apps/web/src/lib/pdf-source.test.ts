import { describe, expect, it } from "vitest";
import type { Workspace } from "@forkleaf/types";
import {
  localSource,
  pdfFetchUrl,
  pdfLinkTarget,
  pdfPathFor,
  readerUrl,
  repoSource,
  toBase64,
  whyCannotSave,
  workspaceFromParams,
} from "@/lib/pdf-source";

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

describe("pdfPathFor", () => {
  it("files a document beside the note being read from it", () => {
    expect(pdfPathFor(workspace, "attention.pdf", [], "projects/2026/plan.md")).toBe(
      "projects/2026/papers/attention.pdf",
    );
  });

  it("falls back to the workspace's own folder for a note at the top", () => {
    // Same convention images already follow: the workspace directory, then the
    // repository root, whichever is the most specific thing we know.
    expect(pdfPathFor(workspace, "attention.pdf", [], "plan.md")).toBe("docs/papers/attention.pdf");
    expect(pdfPathFor(workspace, "attention.pdf", [])).toBe("docs/papers/attention.pdf");
  });

  it("uses the repository root for a workspace with no subfolder", () => {
    const root = { ...workspace, repo: { ...workspace.repo, directory: "" } };
    expect(pdfPathFor(root, "attention.pdf", [])).toBe("papers/attention.pdf");
  });

  it("keeps a recognisable name rather than inventing one", () => {
    expect(pdfPathFor(workspace, "1706.03762v7.pdf", [], "reading/notes.md")).toBe(
      "reading/papers/1706-03762v7.pdf",
    );
  });

  it("cannot be talked out of the folder it was given", () => {
    // The name came off somebody's disk and can contain anything, including
    // a path that climbs out of the repository.
    expect(pdfPathFor(workspace, "../../../etc/passwd.pdf", [], "reading/notes.md")).toBe(
      "reading/papers/passwd.pdf",
    );
  });

  it("does not overwrite a document that is already there", () => {
    expect(
      pdfPathFor(workspace, "paper.pdf", ["reading/papers/paper.pdf"], "reading/notes.md"),
    ).not.toBe("reading/papers/paper.pdf");
  });

  it("calls a document with no usable name a paper, not an image", () => {
    expect(pdfPathFor(workspace, "!!!.pdf", [], "reading/notes.md")).toBe(
      "reading/papers/paper.pdf",
    );
  });
});

describe("whyCannotSave", () => {
  it("says nothing when the document can be saved", () => {
    expect(whyCannotSave(workspace, 1024)).toBeNull();
  });

  it("explains that a workspace with no repository has nowhere to put it", () => {
    const local = { ...workspace, isLocal: true };
    expect(whyCannotSave(local, 1024)).toMatch(/Connect a GitHub repository/);
  });

  it("explains the commit limit rather than letting the save fail with a 413", () => {
    // ForkLeaf can read a 90 MB scan and cannot commit one. Saying so before
    // the attempt is the honest version of that.
    const message = whyCannotSave(workspace, 8 * 1024 * 1024);
    expect(message).toMatch(/8\.0 MB/);
    expect(message).toMatch(/3 MB/);
  });

  it("is refused for a signed-out session with no workspace", () => {
    expect(whyCannotSave(null, 10)).toMatch(/Connect a GitHub repository/);
  });
});

describe("toBase64", () => {
  it("encodes bytes the way the commit route expects", () => {
    expect(toBase64(new TextEncoder().encode("hello"))).toBe("aGVsbG8=");
  });

  it("encodes a payload far past the call-stack argument limit", () => {
    // `String.fromCharCode(...bytes)` throws somewhere above a megabyte, which
    // is most of the documents anybody would want to keep.
    const big = new Uint8Array(3 * 1024 * 1024).fill(65);
    expect(() => toBase64(big)).not.toThrow();
    expect(toBase64(big).startsWith("QUFB")).toBe(true);
  });

  it("handles an empty file", () => {
    expect(toBase64(new Uint8Array())).toBe("");
  });
});

describe("readerUrl", () => {
  it("carries the whole address, so the tab needs no local database", () => {
    const url = new URL(readerUrl(workspace, "papers/a.pdf"), "https://forkleaf.app");

    expect(url.pathname).toBe("/reader");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      owner: "me",
      repo: "notes",
      branch: "main",
      path: "papers/a.pdf",
      dir: "docs",
    });
  });

  it("puts the passage in the fragment, where a PDF reader expects it", () => {
    const url = readerUrl(workspace, "papers/a.pdf", {
      quote: "the key result",
      prefix: "",
      suffix: "",
      page: 12,
    });

    expect(url).toContain("#page=12&q=the%20key%20result");
  });

  it("has no fragment when no passage was asked for", () => {
    expect(readerUrl(workspace, "papers/a.pdf")).not.toContain("#");
    expect(readerUrl(workspace, "papers/a.pdf", null)).not.toContain("#");
  });

  it("round-trips through workspaceFromParams", () => {
    const url = new URL(readerUrl(workspace, "SOC 101/papers/a.pdf"), "https://forkleaf.app");
    const parsed = workspaceFromParams(url.searchParams);

    expect(parsed?.path).toBe("SOC 101/papers/a.pdf");
    expect(parsed?.workspace.repo).toEqual(workspace.repo);
    // The same id the notebook would have given it, so a reader tab and an
    // editor tab agree about which workspace they are looking at.
    expect(parsed?.workspace.id).toBe(workspace.id);
  });
});

describe("workspaceFromParams", () => {
  const full = new URLSearchParams({
    owner: "me",
    repo: "notes",
    branch: "main",
    path: "a.pdf",
  });

  it("reads a workspace with no subdirectory", () => {
    expect(workspaceFromParams(full)?.workspace.repo.directory).toBe("");
  });

  it("names the workspace after the repository it points at", () => {
    expect(workspaceFromParams(full)?.workspace.name).toBe("me/notes");
  });

  it("never claims to be the on-device workspace", () => {
    // The reader fetches through the proxy; a workspace flagged local would
    // make it look for bytes on a device that does not have them.
    expect(workspaceFromParams(full)?.workspace.isLocal).toBe(false);
  });

  it.each(["owner", "repo", "branch", "path"])("refuses a link with no %s", (missing) => {
    const params = new URLSearchParams(full);
    params.delete(missing);
    expect(workspaceFromParams(params)).toBeNull();
  });

  it("refuses an empty link", () => {
    expect(workspaceFromParams(new URLSearchParams())).toBeNull();
  });
});
