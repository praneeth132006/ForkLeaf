// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note, Workspace } from "@forkleaf/types";
import { PublishBookDialog } from "./PublishBookDialog";

const readBook = vi.fn();
const publishBook = vi.fn();
const unpublishBook = vi.fn();

vi.mock("@/lib/gateway", () => ({
  ApiGatewayError: class extends Error {},
  readBook: (...args: unknown[]) => readBook(...args),
  publishBook: (...args: unknown[]) => publishBook(...args),
  unpublishBook: (...args: unknown[]) => unpublishBook(...args),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  readBook.mockResolvedValue({ book: null, url: null, site: null });
  publishBook.mockResolvedValue({
    url: "https://me.github.io/notes/handbook/",
    siteUrl: "https://me.github.io/notes",
    status: "built",
    dir: "docs/handbook",
    chapters: 2,
    removed: 0,
  });
  unpublishBook.mockResolvedValue({ removed: 4, paths: [] });
});

const REPO = { owner: "me", repo: "notes", branch: "main", directory: "" };

const workspace: Workspace = {
  id: "me/notes@main:",
  name: "notes",
  repo: REPO,
  isDefault: false,
  isLocal: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
};

const note = (path: string, content = "Body."): Note =>
  ({
    id: path,
    path,
    content,
    frontmatter: {},
    viewMode: "wysiwyg",
  }) as Note;

const NOTES = [
  note("handbook/01-intro.md", "# Introduction\n\nSee [[setup]]."),
  note("handbook/02-setup.md", "# Setup"),
  // Deeper, and outside — neither belongs to this book.
  note("handbook/appendix/notes.md", "# Appendix note"),
  note("elsewhere/other.md", "# Other"),
];

const open = (folder = "handbook", notes: Note[] = NOTES) =>
  render(
    <PublishBookDialog
      folder={folder}
      workspace={workspace}
      notes={notes}
      onClose={() => undefined}
    />,
  );

describe("PublishBookDialog", () => {
  it("asks what the folder already is before offering anything", async () => {
    open();

    expect(screen.getByText(/Checking whether this is published/)).toBeTruthy();
    await waitFor(() => expect(readBook).toHaveBeenCalledWith(REPO, "handbook"));
  });

  /**
   * A folder with subfolders under it is a shelf rather than a book, and
   * flattening one into a single reading order invents a sequence its author
   * never chose.
   */
  it("takes the folder's own notes and nothing below them", async () => {
    open();

    await waitFor(() => expect(screen.getByText("2 chapters, in this order")).toBeTruthy());
    expect(screen.getByText("Introduction")).toBeTruthy();
    expect(screen.getByText("Setup")).toBeTruthy();
    expect(screen.queryByText("Appendix note")).toBeNull();
    expect(screen.queryByText("Other")).toBeNull();
  });

  it("shows the reading order before committing to it", async () => {
    open("handbook", [
      note("handbook/02-setup.md", "# Setup"),
      note("handbook/01-intro.md", "# Introduction"),
    ]);

    await waitFor(() => expect(screen.getByText("Introduction")).toBeTruthy());

    const titles = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(titles[0]).toContain("Introduction");
    expect(titles[1]).toContain("Setup");
  });

  it("says where the book will go", async () => {
    open();
    await waitFor(() => expect(screen.getByText(/docs\/handbook\//)).toBeTruthy());
  });

  it("refuses a folder with no notes directly in it", async () => {
    open("handbook", [note("handbook/appendix/notes.md")]);

    await waitFor(() => expect(screen.getByText(/no notes directly in this folder/)).toBeTruthy());
    expect(screen.queryByText("Publish book")).toBeNull();
  });

  it("builds the book and hands the server finished files", async () => {
    open();
    await waitFor(() => expect(screen.getByText("Publish book")).toBeTruthy());

    fireEvent.click(screen.getByText("Publish book"));
    await waitFor(() => expect(publishBook).toHaveBeenCalled());

    const sent = publishBook.mock.calls[0]![0];
    expect(sent.book).toBe("handbook");
    expect(sent.chapters.map((c: { slug: string }) => c.slug)).toEqual(["01-intro", "02-setup"]);

    const paths = sent.files.map((f: { path: string }) => f.path);
    expect(paths).toContain("index.html");
    expect(paths).toContain("01-intro.html");
    expect(paths).toContain("assets/style.css");
  });

  it("resolves a link between two chapters", async () => {
    open();
    await waitFor(() => expect(screen.getByText("Publish book")).toBeTruthy());

    fireEvent.click(screen.getByText("Publish book"));
    await waitFor(() => expect(publishBook).toHaveBeenCalled());

    const intro = publishBook.mock.calls[0]![0].files.find(
      (f: { path: string }) => f.path === "01-intro.html",
    );
    expect(intro.content).toContain('href="02-setup.html"');
  });

  it("hands over the address once it is published", async () => {
    open();
    await waitFor(() => expect(screen.getByText("Publish book")).toBeTruthy());

    fireEvent.click(screen.getByText("Publish book"));

    await waitFor(() =>
      expect(screen.getByText("https://me.github.io/notes/handbook/")).toBeTruthy(),
    );
    expect(screen.getByText("Unpublish")).toBeTruthy();
    expect(screen.getByText("Update book")).toBeTruthy();
  });

  /**
   * Reopening on a published book used to be the bug worth avoiding: it
   * offered to publish, as though it never had been, so there was no way to
   * find the address again and no way to reach Unpublish.
   */
  it("opens on the address when the folder is already published", async () => {
    readBook.mockResolvedValue({
      book: {
        version: 1,
        book: "handbook",
        title: "handbook",
        publishedAt: "2026-01-01T00:00:00.000Z",
        chapters: [{ slug: "01-intro", title: "Introduction", source: "handbook/01-intro.md" }],
        files: [],
      },
      url: "https://me.github.io/notes/handbook/",
      site: { url: "https://me.github.io/notes", status: "built", isPublic: true },
    });

    open();

    await waitFor(() =>
      expect(screen.getByText("https://me.github.io/notes/handbook/")).toBeTruthy(),
    );
    expect(screen.getByText("Unpublish")).toBeTruthy();
    expect(publishBook).not.toHaveBeenCalled();
  });

  it("says the book is committed when Pages is switched off", async () => {
    publishBook.mockResolvedValue({
      url: "https://me.github.io/notes/handbook/",
      siteUrl: "https://me.github.io/notes",
      status: "building",
      dir: "docs/handbook",
      chapters: 2,
      removed: 0,
    });

    open();
    await waitFor(() => expect(screen.getByText("Publish book")).toBeTruthy());
    fireEvent.click(screen.getByText("Publish book"));

    await waitFor(() => expect(screen.getByText(/GitHub is building the site now/)).toBeTruthy());
  });

  it("says when an earlier publish left pages behind", async () => {
    publishBook.mockResolvedValue({
      url: "https://me.github.io/notes/handbook/",
      siteUrl: "https://me.github.io/notes",
      status: "built",
      dir: "docs/handbook",
      chapters: 2,
      removed: 3,
    });

    open();
    await waitFor(() => expect(screen.getByText("Publish book")).toBeTruthy());
    fireEvent.click(screen.getByText("Publish book"));

    await waitFor(() => expect(screen.getByText(/3 pages from an earlier publish/)).toBeTruthy());
  });

  it("shows what went wrong rather than closing on a failure", async () => {
    publishBook.mockRejectedValue(new Error("GitHub said no."));

    open();
    await waitFor(() => expect(screen.getByText("Publish book")).toBeTruthy());
    fireEvent.click(screen.getByText("Publish book"));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("GitHub said no."));
    expect(screen.getByText("Publish book")).toBeTruthy();
  });
});
