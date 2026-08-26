// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TreeNode, Workspace } from "@forkleaf/types";
import { UnusedImages } from "./UnusedImages";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const workspace: Workspace = {
  id: "octo/notes@main:",
  name: "notes",
  repo: { owner: "octo", repo: "notes", branch: "main", directory: "" },
  isDefault: true,
  isLocal: false,
  createdAt: new Date(0).toISOString(),
  lastOpenedAt: new Date(0).toISOString(),
};

const file = (path: string, size?: number): TreeNode => ({
  path,
  name: path.split("/").pop()!,
  kind: "file",
  ...(size === undefined ? {} : { size }),
});

/**
 * A repository that answers the three routes this uses.
 *
 * `notes` is the markdown and its text; `images` is everything else in the
 * tree. Commits are recorded rather than performed, so a test can assert on
 * exactly which paths would have been deleted.
 */
function server(notes: Record<string, string>, images: [string, number][]) {
  const commits: { message: string; changes: { op: string; path: string }[] }[] = [];

  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

    if (url.startsWith("/api/gh/commit")) {
      commits.push(JSON.parse(String(init!.body)));
      return json({ sha: "c" });
    }

    if (url.startsWith("/api/gh/tree")) {
      const all = url.includes("all=1");
      const paths = all
        ? [...Object.keys(notes).map((p) => file(p)), ...images.map(([p, s]) => file(p, s))]
        : Object.keys(notes).map((p) => file(p));
      return json({ tree: paths });
    }

    if (url.startsWith("/api/gh/file")) {
      const path = decodeURIComponent(new URL(url, "http://x").searchParams.get("path")!);
      return json({ file: { content: notes[path] ?? "", sha: "s" } });
    }

    throw new Error(`unexpected request: ${url}`);
  });

  vi.stubGlobal("fetch", fetchImpl);
  return { commits, fetchImpl };
}

/**
 * Clearing out images no note uses.
 *
 * This deletes files from somebody's repository, so the behaviour under test
 * is as much about restraint as about finding things: it must never act on one
 * press, and it must show every path before it acts at all.
 */
describe("scanning", () => {
  beforeEach(() => cleanup());

  it("lists the image nothing links to, with its size", async () => {
    server({ "Intro/a.md": "![](assets/used.png)" }, [
      ["Intro/assets/used.png", 1024],
      ["Intro/assets/stray.png", 4096],
    ]);
    render(<UnusedImages workspace={workspace} />);

    fireEvent.click(screen.getByText("Scan for unused images"));

    expect(await screen.findByText("Intro/assets/stray.png")).toBeTruthy();
    expect(screen.queryByText("Intro/assets/used.png")).toBeNull();
    expect(screen.getByText("4 KB")).toBeTruthy();
  });

  it("says so plainly when there is nothing to clean up", async () => {
    server({ "Intro/a.md": "![](assets/used.png)" }, [["Intro/assets/used.png", 1024]]);
    render(<UnusedImages workspace={workspace} />);

    fireEvent.click(screen.getByText("Scan for unused images"));

    expect(await screen.findByText(/Nothing unused/)).toBeTruthy();
  });

  it("deletes nothing by scanning", async () => {
    const { commits } = server({ "Intro/a.md": "# hi" }, [["Intro/assets/stray.png", 10]]);
    render(<UnusedImages workspace={workspace} />);

    fireEvent.click(screen.getByText("Scan for unused images"));
    await screen.findByText("Intro/assets/stray.png");

    expect(commits).toHaveLength(0);
  });

  it("refuses to report anything when a note cannot be read", async () => {
    // The dangerous case: a note whose text is unavailable is a note whose
    // images cannot be accounted for, so every picture it uses would look
    // unused. Failing is the only safe answer.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith("/api/gh/tree")) {
          const nodes = url.includes("all=1")
            ? [file("Intro/a.md"), file("Intro/assets/stray.png", 10)]
            : [file("Intro/a.md")];
          return new Response(JSON.stringify({ tree: nodes }), { status: 200 });
        }
        return new Response("nope", { status: 500 });
      }),
    );
    render(<UnusedImages workspace={workspace} />);

    fireEvent.click(screen.getByText("Scan for unused images"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Intro/assets/stray.png")).toBeNull();
  });
});

describe("deleting", () => {
  it("waits for a second, separate press", async () => {
    const { commits } = server({ "Intro/a.md": "# hi" }, [["Intro/assets/stray.png", 10]]);
    render(<UnusedImages workspace={workspace} />);

    fireEvent.click(screen.getByText("Scan for unused images"));
    await screen.findByText("Intro/assets/stray.png");
    expect(commits).toHaveLength(0);

    fireEvent.click(screen.getByText(/Delete it from GitHub/));

    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]!.changes).toEqual([{ op: "delete", path: "Intro/assets/stray.png" }]);
  });

  it("removes them in one commit, not one each", async () => {
    const { commits } = server({ "Intro/a.md": "# hi" }, [
      ["Intro/assets/one.png", 10],
      ["Intro/assets/two.png", 20],
    ]);
    render(<UnusedImages workspace={workspace} />);

    fireEvent.click(screen.getByText("Scan for unused images"));
    await screen.findByText("Intro/assets/one.png");
    fireEvent.click(screen.getByText(/Delete them from GitHub/));

    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]!.changes).toHaveLength(2);
    expect(commits[0]!.message).toContain("2 unused images");
  });

  it("leaves them alone when asked to", async () => {
    const { commits } = server({ "Intro/a.md": "# hi" }, [["Intro/assets/stray.png", 10]]);
    render(<UnusedImages workspace={workspace} />);

    fireEvent.click(screen.getByText("Scan for unused images"));
    await screen.findByText("Intro/assets/stray.png");
    fireEvent.click(screen.getByText("Leave them"));

    expect(commits).toHaveLength(0);
    expect(screen.getByText("Scan for unused images")).toBeTruthy();
  });
});
