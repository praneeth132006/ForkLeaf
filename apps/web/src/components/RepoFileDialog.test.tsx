// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { RepoTarget } from "@forkleaf/markdown-engine";
import { RepoFileDialog } from "./RepoFileDialog";

// Rendering markdown is `Preview`'s job and is tested where it lives; pulling
// the real one in drags mermaid into a jsdom run for no gain here.
vi.mock("@forkleaf/editor", () => ({
  Preview: ({ markdown }: { markdown: string }) => <pre data-testid="preview">{markdown}</pre>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REPO = { owner: "me", repo: "notes", branch: "main" };

function target(overrides: Partial<RepoTarget> = {}): RepoTarget {
  return { owner: null, repo: null, path: "scripts/scan.sh", ref: "a1b2c3d", ...overrides };
}

/** Answers the contents route with a file, and records what was asked for. */
function serve(file: unknown) {
  const mock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ file }) });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("RepoFileDialog", () => {
  it("reads the file at the revision the link pinned", async () => {
    const fetchMock = serve({ content: "echo hi", sha: "blob" });
    render(<RepoFileDialog target={target()} repo={REPO} onClose={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0]?.[0]);
    // The pin, not the branch: a link that reports itself stale has to show
    // the file the note was written about.
    expect(url).toContain("branch=a1b2c3d");
    expect(url).toContain("path=scripts%2Fscan.sh");
  });

  it("falls back to the workspace's branch for an unpinned link", async () => {
    const fetchMock = serve({ content: "echo hi", sha: "blob" });
    render(<RepoFileDialog target={target({ ref: null })} repo={REPO} onClose={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("branch=main");
  });

  it("shows a non-markdown file as highlighted source", async () => {
    serve({ content: "echo hi", sha: "blob" });
    render(<RepoFileDialog target={target()} repo={REPO} onClose={vi.fn()} />);

    const preview = await screen.findByTestId("preview");
    expect(preview.textContent).toContain("```bash");
    expect(preview.textContent).toContain("echo hi");
  });

  it("renders a markdown file as markdown rather than as source", async () => {
    serve({ content: "# Playbook", sha: "blob" });
    render(
      <RepoFileDialog target={target({ path: "docs/deploy.md" })} repo={REPO} onClose={vi.fn()} />,
    );

    const preview = await screen.findByTestId("preview");
    expect(preview.textContent).toBe("# Playbook");
  });

  it("outruns a fence the file itself contains", async () => {
    // A file with ``` in it used to end the block early and render the rest of
    // itself as prose.
    serve({ content: "```\nnested\n```", sha: "blob" });
    render(<RepoFileDialog target={target({ path: "notes.txt" })} repo={REPO} onClose={vi.fn()} />);

    const preview = await screen.findByTestId("preview");
    expect(preview.textContent?.startsWith("````")).toBe(true);
  });

  it("says so when the file is not there at that revision", async () => {
    serve(null);
    render(<RepoFileDialog target={target()} repo={REPO} onClose={vi.fn()} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not in me\/notes at a1b2c3d/i);
  });

  it("offers github.com as the way out, in a tab of its own", async () => {
    serve({ content: "echo hi", sha: "blob" });
    render(<RepoFileDialog target={target()} repo={REPO} onClose={vi.fn()} />);

    const link = await screen.findByRole("link", { name: /open on github/i });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/me/notes/blob/a1b2c3d/scripts/scan.sh",
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
