// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { RepoRef } from "@forkleaf/types";
import { useRevisionTexts } from "./useRevisionTexts";

const readNoteAtCommit = vi.fn();

vi.mock("@/lib/gateway", () => ({
  readNoteAtCommit: (...args: unknown[]) => readNoteAtCommit(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REPO: RepoRef = { owner: "me", repo: "notes", branch: "main", directory: "" };

/**
 * A probe that reports the cache as text, and exposes its two entry points.
 *
 * The `repo` object is rebuilt on every render on purpose: a caller passing a
 * fresh object literal is the normal case, and it must not defeat the cache.
 */
function Probe({
  path,
  onReady,
}: {
  path: string;
  onReady: (api: ReturnType<typeof useRevisionTexts>) => void;
}) {
  const revisions = useRevisionTexts({ ...REPO }, path);
  onReady(revisions);
  return (
    <div data-testid="cache">
      {Object.entries(revisions.texts)
        .map(([sha, text]) => `${sha}=${text ?? "<unreadable>"}`)
        .sort()
        .join(",")}
    </div>
  );
}

function mount(path = "notes/a.md") {
  let api!: ReturnType<typeof useRevisionTexts>;
  const view = render(<Probe path={path} onReady={(next) => (api = next)} />);
  return {
    view,
    request: (shas: string[]) => act(() => api.request(shas)),
    prefetch: (shas: string[]) => act(() => api.prefetch(shas)),
    cache: () => screen.getByTestId("cache").textContent,
  };
}

describe("useRevisionTexts", () => {
  it("starts empty and fetches nothing", () => {
    const { cache } = mount();
    expect(cache()).toBe("");
    expect(readNoteAtCommit).not.toHaveBeenCalled();
  });

  it("fetches what is asked for and files it under its SHA", async () => {
    readNoteAtCommit.mockResolvedValue("hello");
    const { request, cache } = mount();

    request(["aaa"]);
    await waitFor(() => expect(cache()).toBe("aaa=hello"));
    expect(readNoteAtCommit).toHaveBeenCalledWith(REPO, "notes/a.md", "aaa");
  });

  it("fetches a revision once however many times it is asked for", async () => {
    readNoteAtCommit.mockResolvedValue("hello");
    const { request, cache } = mount();

    request(["aaa"]);
    request(["aaa"]);
    request(["aaa", "bbb"]);
    await waitFor(() => expect(cache()).toContain("bbb="));

    expect(readNoteAtCommit).toHaveBeenCalledTimes(2);
  });

  it("does not re-fetch after a re-render with a new repo object", async () => {
    readNoteAtCommit.mockResolvedValue("hello");
    const { request, view, cache } = mount();

    request(["aaa"]);
    await waitFor(() => expect(cache()).toBe("aaa=hello"));

    view.rerender(<Probe path="notes/a.md" onReady={() => {}} />);
    request(["aaa"]);
    expect(readNoteAtCommit).toHaveBeenCalledTimes(1);
  });

  it("records a revision that could not be read, rather than retrying forever", async () => {
    readNoteAtCommit.mockRejectedValue(new Error("offline"));
    const { request, cache } = mount();

    request(["aaa"]);
    await waitFor(() => expect(cache()).toBe("aaa=<unreadable>"));

    request(["aaa"]);
    expect(readNoteAtCommit).toHaveBeenCalledTimes(1);
  });

  it("loads a whole history through the prefetch path", async () => {
    readNoteAtCommit.mockImplementation((_repo: unknown, _path: string, sha: string) =>
      Promise.resolve(`text-${sha}`),
    );
    const { prefetch, cache } = mount();

    prefetch(["aaa", "bbb", "ccc"]);
    await waitFor(() => expect(cache()).toBe("aaa=text-aaa,bbb=text-bbb,ccc=text-ccc"));
  });

  it("does not fetch the same revision through both paths", async () => {
    readNoteAtCommit.mockResolvedValue("hello");
    const { request, prefetch, cache } = mount();

    request(["aaa"]);
    prefetch(["aaa", "bbb"]);
    await waitFor(() => expect(cache()).toContain("bbb="));
    expect(readNoteAtCommit).toHaveBeenCalledTimes(2);
  });

  it("empties the cache when the note changes", async () => {
    readNoteAtCommit.mockResolvedValue("from note a");
    const { view, request, cache } = mount("notes/a.md");

    request(["shared"]);
    await waitFor(() => expect(cache()).toBe("shared=from note a"));

    // A commit that touched two notes appears in both their histories under
    // the same SHA, with different content for each — so switching notes has
    // to invalidate, not just accumulate.
    let api!: ReturnType<typeof useRevisionTexts>;
    view.rerender(<Probe path="notes/b.md" onReady={(next) => (api = next)} />);
    expect(cache()).toBe("");

    readNoteAtCommit.mockResolvedValue("from note b");
    act(() => api.request(["shared"]));
    await waitFor(() => expect(cache()).toBe("shared=from note b"));
    expect(readNoteAtCommit).toHaveBeenLastCalledWith(REPO, "notes/b.md", "shared");
  });

  it("drops a result that lands after the note has changed", async () => {
    let settle!: (text: string) => void;
    readNoteAtCommit.mockReturnValue(
      new Promise<string>((resolve) => {
        settle = resolve;
      }),
    );

    const { view, request, cache } = mount("notes/a.md");
    request(["shared"]);

    view.rerender(<Probe path="notes/b.md" onReady={() => {}} />);
    await act(async () => {
      settle("stale text from note a");
    });

    expect(cache()).toBe("");
  });

  it("reports whether a revision has settled", async () => {
    readNoteAtCommit.mockResolvedValue("hello");
    let api!: ReturnType<typeof useRevisionTexts>;
    render(<Probe path="notes/a.md" onReady={(next) => (api = next)} />);

    expect(api.has("aaa")).toBe(false);
    act(() => api.request(["aaa"]));
    await waitFor(() => expect(api.has("aaa")).toBe(true));
  });
});
