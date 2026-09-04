import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.fn();
const commitChanges = vi.fn();
const enablePages = vi.fn();
const getPages = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
  getLiveSession: () => Promise.resolve({ token: "t", user: { login: "me" } }),
}));

// Publishing is rate-limited harder than an ordinary save, which a test making
// a dozen calls from one address would otherwise trip.
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => undefined }));

vi.mock("@forkleaf/github-client", async () => {
  const actual =
    await vi.importActual<typeof import("@forkleaf/github-client")>("@forkleaf/github-client");
  return {
    ...actual,
    GitHubClient: class {
      readFile = readFile;
      commitChanges = commitChanges;
      enablePages = enablePages;
      getPages = getPages;
    },
  };
});

const { GET, POST, DELETE } = await import("./route");

const REPO = { owner: "me", repo: "notes", branch: "main" };

beforeEach(() => {
  readFile.mockResolvedValue(null);
  commitChanges.mockResolvedValue({ sha: "c0ffee" });
  enablePages.mockResolvedValue({ url: "https://me.github.io/notes", status: "built" });
  getPages.mockResolvedValue({
    url: "https://me.github.io/notes",
    status: "built",
    isPublic: true,
  });
});

afterEach(() => vi.clearAllMocks());

const publish = async (body: unknown) => {
  const response = await POST(
    new Request("http://localhost/api/gh/publish/book", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never,
  );
  return { status: response.status, body: await response.json() };
};

const unpublish = async (body: unknown) => {
  const response = await DELETE(
    new Request("http://localhost/api/gh/publish/book", {
      method: "DELETE",
      body: JSON.stringify(body),
    }) as never,
  );
  return { status: response.status, body: await response.json() };
};

const read = async (query: string) => {
  const response = await GET(new Request(`http://localhost/api/gh/publish/book?${query}`) as never);
  return { status: response.status, body: await response.json() };
};

/** A minimal, valid book. */
const BOOK = {
  ...REPO,
  book: "handbook",
  title: "The Handbook",
  chapters: [{ slug: "intro", title: "Intro", source: "handbook/intro.md" }],
  files: [
    { path: "index.html", content: "<html>contents</html>" },
    { path: "intro.html", content: "<html>intro</html>" },
    { path: "assets/style.css", content: "body{}" },
  ],
};

/** Paths from the most recent `commitChanges`, by operation. */
const committed = (op: "upsert" | "delete"): string[] =>
  (commitChanges.mock.calls[0]?.[1] ?? [])
    .filter((change: { op: string }) => change.op === op)
    .map((change: { path: string }) => change.path);

describe("POST /api/gh/publish/book", () => {
  it("writes the whole book in one commit", async () => {
    const { status, body } = await publish(BOOK);

    expect(status).toBe(200);
    expect(commitChanges).toHaveBeenCalledTimes(1);
    expect(committed("upsert")).toEqual([
      "docs/handbook/index.html",
      "docs/handbook/intro.html",
      "docs/handbook/assets/style.css",
      "docs/handbook/forkleaf-book.json",
    ]);
    expect(body.url).toBe("https://me.github.io/notes/handbook/");
    expect(body.chapters).toBe(1);
  });

  it("records what it wrote, including the record itself", async () => {
    await publish(BOOK);

    const written = (commitChanges.mock.calls[0]![1] as { path: string; content: string }[]).find(
      (change) => change.path === "docs/handbook/forkleaf-book.json",
    )!;
    const manifest = JSON.parse(written.content);

    expect(manifest.book).toBe("handbook");
    expect(manifest.files).toContain("docs/handbook/forkleaf-book.json");
    expect(manifest.files).toContain("docs/handbook/assets/style.css");
    expect(manifest.chapters).toEqual(BOOK.chapters);
  });

  it("turns Pages on for docs/, and says whether it is live yet", async () => {
    enablePages.mockResolvedValue({ url: "https://me.github.io/notes", status: "building" });
    const { body } = await publish(BOOK);

    expect(enablePages).toHaveBeenCalledWith("me", "notes", { branch: "main", path: "/docs" });
    expect(body.status).toBe("building");
  });

  /**
   * Every path is re-derived rather than trusted. The list arrives over HTTP
   * and names files in somebody's repository.
   */
  it("refuses to write a file a book is not made of", async () => {
    for (const path of [
      "deploy.sh",
      "CNAME",
      "notes.md",
      "assets/deploy.sh",
      "assets/nested/style.css",
      "../../.github/workflows/ci.yml",
      "../escape.html",
    ]) {
      const { status } = await publish({ ...BOOK, files: [{ path, content: "x" }] });
      expect(status, path).toBe(400);
    }
    expect(commitChanges).not.toHaveBeenCalled();
  });

  it("refuses a book name that is really a path", async () => {
    for (const book of ["", "..", "../evil", "a/b", ".hidden"]) {
      expect((await publish({ ...BOOK, book })).status).toBe(400);
    }
    expect(commitChanges).not.toHaveBeenCalled();
  });

  it("refuses a book with nothing in it", async () => {
    expect((await publish({ ...BOOK, chapters: [] })).status).toBe(400);
    expect((await publish({ ...BOOK, files: [] })).status).toBe(400);
  });

  it("refuses a book too big to be one", async () => {
    const many = Array.from({ length: 201 }, (_, i) => ({
      slug: `c${i}`,
      title: `Chapter ${i}`,
      source: `c${i}.md`,
    }));
    expect((await publish({ ...BOOK, chapters: many })).status).toBe(400);
  });

  it("refuses a chapter too big to publish", async () => {
    const huge = { path: "intro.html", content: "x".repeat(5 * 1024 * 1024 + 1) };
    expect((await publish({ ...BOOK, files: [huge] })).status).toBe(413);
  });

  /**
   * Renaming a note changes its chapter's address. Without this the old file
   * stays for ever: served at its old URL, absent from the contents page, and
   * reachable only by knowing it is there.
   */
  it("removes what the last publish wrote and this one does not", async () => {
    readFile.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        book: "handbook",
        title: "The Handbook",
        publishedAt: "2026-01-01T00:00:00.000Z",
        chapters: [],
        files: [
          "docs/handbook/index.html",
          "docs/handbook/old-name.html",
          "docs/handbook/forkleaf-book.json",
        ],
      }),
    });

    const { body } = await publish(BOOK);

    expect(committed("delete")).toEqual(["docs/handbook/old-name.html"]);
    expect(body.removed).toBe(1);
  });

  it("keeps a file that is still part of the book", async () => {
    readFile.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        book: "handbook",
        title: "The Handbook",
        publishedAt: "",
        chapters: [],
        files: ["docs/handbook/index.html", "docs/handbook/intro.html"],
      }),
    });

    await publish(BOOK);
    expect(committed("delete")).toEqual([]);
  });

  it("ignores a previous record that belongs to another book", async () => {
    // Copied or hand-edited. Its paths describe some other folder, and acting
    // on it would delete them.
    readFile.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        book: "other-book",
        title: "",
        publishedAt: "",
        chapters: [],
        files: ["docs/other-book/index.html"],
      }),
    });

    await publish(BOOK);
    expect(committed("delete")).toEqual([]);
  });
});

describe("DELETE /api/gh/publish/book", () => {
  const manifest = (files: string[], book = "handbook") => ({
    content: JSON.stringify({
      version: 1,
      book,
      title: "The Handbook",
      publishedAt: "",
      chapters: [],
      files,
    }),
  });

  it("deletes exactly what the record names", async () => {
    readFile.mockResolvedValue(
      manifest([
        "docs/handbook/index.html",
        "docs/handbook/intro.html",
        "docs/handbook/assets/style.css",
        "docs/handbook/forkleaf-book.json",
      ]),
    );

    const { status, body } = await unpublish({ ...REPO, book: "handbook" });

    expect(status).toBe(200);
    expect(body.removed).toBe(4);
    expect(committed("delete")).toEqual([
      "docs/handbook/assets/style.css",
      "docs/handbook/forkleaf-book.json",
      "docs/handbook/index.html",
      "docs/handbook/intro.html",
    ]);
  });

  /**
   * The record is a file in the user's repository, so it is a file the user
   * can edit. It is a claim to be checked, never an instruction to carry out.
   */
  it("never deletes anything outside the book, however the record asks", async () => {
    readFile.mockResolvedValue(
      manifest([
        "docs/handbook/index.html",
        "docs/handbook/../../.github/workflows/ci.yml",
        "docs/other-book/index.html",
        "README.md",
      ]),
    );

    await unpublish({ ...REPO, book: "handbook" });
    expect(committed("delete")).toEqual(["docs/handbook/index.html"]);
  });

  it("never deletes a file inside the book that ForkLeaf did not write", async () => {
    readFile.mockResolvedValue(
      manifest(["docs/handbook/index.html", "docs/handbook/CNAME", "docs/handbook/notes.md"]),
    );

    await unpublish({ ...REPO, book: "handbook" });
    expect(committed("delete")).toEqual(["docs/handbook/index.html"]);
  });

  it("will not unpublish a folder it did not publish", async () => {
    readFile.mockResolvedValue(null);

    const { status } = await unpublish({ ...REPO, book: "handbook" });

    expect(status).toBe(404);
    expect(commitChanges).not.toHaveBeenCalled();
  });

  it("will not act on a record it cannot read", async () => {
    readFile.mockResolvedValue({ content: "{ not json" });

    expect((await unpublish({ ...REPO, book: "handbook" })).status).toBe(404);
    expect(commitChanges).not.toHaveBeenCalled();
  });

  it("will not act on a record naming nothing it may remove", async () => {
    readFile.mockResolvedValue(manifest(["README.md", "docs/other/index.html"]));

    expect((await unpublish({ ...REPO, book: "handbook" })).status).toBe(400);
    expect(commitChanges).not.toHaveBeenCalled();
  });
});

describe("GET /api/gh/publish/book", () => {
  it("answers from the record, not from the folder", async () => {
    readFile.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        book: "handbook",
        title: "The Handbook",
        publishedAt: "2026-09-04T00:00:00.000Z",
        chapters: [{ slug: "intro", title: "Intro", source: "handbook/intro.md" }],
        files: ["docs/handbook/index.html"],
      }),
    });

    const { status, body } = await read("owner=me&repo=notes&branch=main&book=handbook");

    expect(status).toBe(200);
    expect(body.book.title).toBe("The Handbook");
    expect(body.url).toBe("https://me.github.io/notes/handbook/");
  });

  it("says there is no book rather than inventing one", async () => {
    readFile.mockResolvedValue(null);
    const { body } = await read("owner=me&repo=notes&branch=main&book=handbook");

    expect(body.book).toBeNull();
    expect(body.url).toBeNull();
  });

  it("still lists the book when Pages is switched off", async () => {
    getPages.mockRejectedValue(new Error("nope"));
    readFile.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        book: "handbook",
        title: "The Handbook",
        publishedAt: "",
        chapters: [],
        files: [],
      }),
    });

    const { status, body } = await read("owner=me&repo=notes&branch=main&book=handbook");

    expect(status).toBe(200);
    expect(body.book.title).toBe("The Handbook");
    expect(body.url).toBeNull();
    expect(body.site).toBeNull();
  });
});
