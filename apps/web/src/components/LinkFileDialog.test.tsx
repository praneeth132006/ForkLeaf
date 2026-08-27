// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Workspace } from "@forkleaf/types";
import { LinkFileDialog } from "./LinkFileDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const workspace = {
  id: "me/notes@main:",
  name: "notes",
  repo: { owner: "me", repo: "notes", branch: "main", directory: "" },
  isDefault: false,
  isLocal: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
} as Workspace;

/** Answers the tree listing, then the revision lookup. */
function serve(tree: unknown, head: unknown = { sha: "a1b2c3d4e5f6", exists: true }) {
  const mock = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes("file-head")
          ? { ok: true, json: () => Promise.resolve(head) }
          : { ok: true, json: () => Promise.resolve(tree) },
      ),
    );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function view(onInsert = vi.fn()) {
  render(<LinkFileDialog workspace={workspace} onInsert={onInsert} onClose={vi.fn()} />);
  return onInsert;
}

const TREE = {
  tree: [{ path: "scripts/scan.sh" }, { path: "README.md" }, { path: "node_modules/x.js" }],
};

beforeEach(() => serve(TREE));

describe("LinkFileDialog", () => {
  it("lists the repository's files", async () => {
    view();
    await waitFor(() => expect(screen.getByText("scripts/scan.sh")).toBeTruthy());
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  it("leaves out the folders nobody documents", async () => {
    view();
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
    expect(screen.queryByText("node_modules/x.js")).toBeNull();
  });

  it("filters as you type, so a big repository stays usable", async () => {
    view();
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/filter files/i), { target: { value: "scan" } });
    expect(screen.getByText("scripts/scan.sh")).toBeTruthy();
    expect(screen.queryByText("README.md")).toBeNull();
  });

  it("says when nothing matches", async () => {
    view();
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/filter files/i), { target: { value: "zzz" } });
    expect(screen.getByText(/nothing matches/i)).toBeTruthy();
  });

  it("pins the revision for you — the part a person cannot do", async () => {
    const onInsert = view();
    await waitFor(() => expect(screen.getByText("scripts/scan.sh")).toBeTruthy());
    fireEvent.click(screen.getByText("scripts/scan.sh"));

    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("[[repo:scripts/scan.sh@a1b2c3d]]"));
  });

  it("still inserts a link when the revision cannot be looked up", async () => {
    // Half the feature beats none of it; it just cannot report staleness yet.
    serve(TREE, {});
    const onInsert = view();

    await waitFor(() => expect(screen.getByText("scripts/scan.sh")).toBeTruthy());
    fireEvent.click(screen.getByText("scripts/scan.sh"));

    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("[[repo:scripts/scan.sh]]"));
  });

  it("says so when the repository cannot be listed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Repository not found." } }),
      }),
    );
    view();

    await waitFor(() => expect(screen.getByText(/repository not found/i)).toBeTruthy());
  });

  it("says so when GitHub cannot be reached at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    view();

    await waitFor(() => expect(screen.getByText(/could not reach github/i)).toBeTruthy());
  });
});
