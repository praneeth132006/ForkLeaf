// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Workspace } from "@forkleaf/types";

const fetchRepoPdf = vi.fn();
const openPdf = vi.fn();

vi.mock("@/lib/pdf-source", () => ({
  fetchRepoPdf: (...args: unknown[]) => fetchRepoPdf(...args),
}));

vi.mock("@/lib/pdf-index", () => ({ PDFJS_ASSETS: "/pdfjs" }));

vi.mock("@forkleaf/pdf", () => ({
  openPdf: (...args: unknown[]) => openPdf(...args),
}));

const { DocumentPageCompare } = await import("./DocumentPageCompare");

const WORKSPACE: Workspace = {
  id: "w",
  name: "me/notes",
  repo: { owner: "me", repo: "notes", branch: "main", directory: "" },
  isDefault: true,
  isLocal: false,
  createdAt: "",
  lastOpenedAt: "",
};

/** A document of `pages` A4-ish pages, and a record of what was drawn on it. */
function fakeSession(pages: number) {
  const renderPage = vi.fn().mockResolvedValue(undefined);
  const destroy = vi.fn().mockResolvedValue(undefined);

  return {
    info: {
      pageCount: pages,
      sizes: Array.from({ length: pages }, () => ({ width: 600, height: 800 })),
      metadata: {},
    },
    renderPage,
    destroy,
    outline: vi.fn(),
    textOf: vi.fn(),
    allText: vi.fn(),
  };
}

beforeEach(() => {
  fetchRepoPdf.mockResolvedValue(new Uint8Array([1]));
  // jsdom gives every element a zero width, and a page fitted to zero is never
  // drawn. The canvas holder needs a real one for the render to be attempted.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function open(over: Partial<React.ComponentProps<typeof DocumentPageCompare>> = {}) {
  const props = {
    workspace: WORKSPACE,
    path: "papers/attention.pdf",
    sha: "old000",
    page: 2,
    beforeLabel: "3 days ago",
    ...over,
  };

  render(<DocumentPageCompare {...props} />);
  return props;
}

describe("DocumentPageCompare", () => {
  it("draws the same page out of both versions", async () => {
    const before = fakeSession(3);
    const after = fakeSession(3);
    openPdf.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    open();

    await waitFor(() => expect(before.renderPage).toHaveBeenCalled());
    expect(before.renderPage.mock.calls[0]?.[0]).toBe(2);
    expect(after.renderPage.mock.calls[0]?.[0]).toBe(2);
  });

  /**
   * The older version is fetched at a commit, not at a branch. A branch has
   * moved on by definition — that is what is being compared — so reading the
   * "before" from one would show the same file twice.
   */
  it("reads the older version at the commit, not the branch", async () => {
    openPdf.mockResolvedValue(fakeSession(3));
    open();

    await waitFor(() => expect(fetchRepoPdf).toHaveBeenCalledTimes(2));

    const branches = fetchRepoPdf.mock.calls.map((call) => (call[0] as Workspace).repo.branch);
    expect(branches).toContain("old000");
    expect(branches).toContain("main");
  });

  it("labels which side is which", async () => {
    openPdf.mockResolvedValue(fakeSession(3));
    open();

    expect(await screen.findByText("3 days ago")).toBeTruthy();
    expect(screen.getByText("Now")).toBeTruthy();
  });

  /** A page the older version never had has nothing to fetch, or to draw. */
  it("does not go looking for a page that was added later", async () => {
    const after = fakeSession(3);
    openPdf.mockResolvedValue(after);

    open({ addedPage: true });

    await waitFor(() => expect(after.renderPage).toHaveBeenCalled());
    expect(fetchRepoPdf).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/it was added later/)).toBeTruthy();
  });

  it("says so rather than failing when a version is shorter than the page", async () => {
    const before = fakeSession(1);
    const after = fakeSession(3);
    openPdf.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    open();

    expect(await screen.findByText("This version has no page 2.")).toBeTruthy();
    expect(before.renderPage).not.toHaveBeenCalled();
  });

  /**
   * Two pdf.js workers per page looked at, and a reader that started
   * responsive would not stay that way.
   */
  it("closes both documents when it goes away", async () => {
    const before = fakeSession(3);
    const after = fakeSession(3);
    openPdf.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    open();
    await waitFor(() => expect(before.renderPage).toHaveBeenCalled());

    cleanup();

    await waitFor(() => {
      expect(before.destroy).toHaveBeenCalled();
      expect(after.destroy).toHaveBeenCalled();
    });
  });

  it("closes documents that finished opening after it went away", async () => {
    const before = fakeSession(3);
    const after = fakeSession(3);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));

    openPdf
      .mockImplementationOnce(async () => {
        await held;
        return before;
      })
      .mockResolvedValueOnce(after);

    open();
    cleanup();
    release();

    await waitFor(() => {
      expect(before.destroy).toHaveBeenCalled();
      expect(after.destroy).toHaveBeenCalled();
    });
  });

  it("reports two versions that cannot both be drawn", async () => {
    fetchRepoPdf.mockRejectedValue(new Error("That file is gone."));
    open();

    expect((await screen.findByRole("alert")).textContent).toContain("That file is gone.");
  });
});
