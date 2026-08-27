// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NoteFreshness, hasFreshnessToReport } from "./NoteFreshness";

afterEach(cleanup);
beforeEach(() => vi.unstubAllGlobals());

const REPO = { owner: "me", repo: "notes", branch: "main" };
const NOW = new Date().toISOString();
const OLD = new Date(Date.now() - 24 * 30.44 * 86_400_000).toISOString();

/** Every file-head request answers with this. */
function heads(body: Record<string, unknown>) {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ exists: true, sha: "a1b2c3d", committedAt: null, ...body }),
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function view(content: string, updatedAt: string | null = NOW, onChange?: (c: string) => void) {
  return render(
    <NoteFreshness content={content} updatedAt={updatedAt} repo={REPO} onChange={onChange} />,
  );
}

/** The same, for a local notebook with no repository behind it. */
function viewLocal(content: string, updatedAt: string | null = NOW) {
  return render(<NoteFreshness content={content} updatedAt={updatedAt} repo={null} />);
}

describe("NoteFreshness — when it stays out of the way", () => {
  it("renders nothing for a note with no claims and no linked files", () => {
    heads({});
    const { container } = view("This is how I think about the problem.");
    expect(container.firstChild).toBeNull();
  });

  it("asks GitHub nothing when the note links no files", () => {
    const fetchMock = heads({});
    view("Just prose here.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still appears for an old note full of versions", () => {
    heads({});
    view("nmap 7.80 and v1.2.3 and 2.31.0 and 3.11.4", OLD);
    expect(screen.getByText("Likely out of date")).toBeTruthy();
  });
});

describe("NoteFreshness — linked files", () => {
  it("reads the file by name rather than by its whole path", async () => {
    heads({});
    view("See [[repo:scripts/scan.sh]]");
    await waitFor(() => expect(screen.getByText("scan.sh")).toBeTruthy());
  });

  it("links to the file on GitHub", async () => {
    heads({});
    view("See [[repo:scripts/scan.sh]]");

    await waitFor(() => expect(screen.getByText("scan.sh")).toBeTruthy());
    expect(screen.getByText("scan.sh").getAttribute("href")).toBe(
      "https://github.com/me/notes/blob/main/scripts/scan.sh",
    );
  });

  it("asks about the repository the link names, not the note's own", async () => {
    const fetchMock = heads({});
    view("See [[repo:you/tools:scripts/scan.sh]]");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("owner=you");
    expect(url).toContain("repo=tools");
  });

  it("says a pinned file is unchanged when it is", async () => {
    heads({ sha: "a1b2c3d" });
    view("[[repo:scripts/scan.sh@a1b2c3d]]");

    await waitFor(() => expect(screen.getByText(/unchanged since you linked it/)).toBeTruthy());
  });

  it("says a file changed after the note described it", async () => {
    heads({ sha: "9999999" });
    view("[[repo:scripts/scan.sh@a1b2c3d]]");

    await waitFor(() => expect(screen.getByText(/changed since you linked it/)).toBeTruthy());
  });

  it("will not call an unpinned link fresh", async () => {
    heads({ sha: "a1b2c3d" });
    view("[[repo:scripts/scan.sh]]");

    await waitFor(() => expect(screen.getByText("never pinned")).toBeTruthy());
  });

  it("says a deleted file is gone", async () => {
    heads({ exists: false, sha: null });
    view("[[repo:scripts/scan.sh@a1b2c3d]]");

    await waitFor(() => expect(screen.getByText(/no longer in the repository/)).toBeTruthy());
  });

  it("separates a failed check from a statement about the file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    view("[[repo:scripts/scan.sh@a1b2c3d]]");

    await waitFor(() => expect(screen.getByText(/could not be checked/)).toBeTruthy());
  });

  it("lists one entry per file however often it is mentioned", async () => {
    heads({});
    view("[[repo:scripts/scan.sh]] then [[repo:scripts/scan.sh]] again");

    await waitFor(() => expect(screen.getAllByText("scan.sh")).toHaveLength(1));
  });

  it("ignores ordinary note links", async () => {
    const fetchMock = heads({});
    // One version and no CVE is not "heavy", so age alone leaves this at
    // worth-reading rather than stale — the point here is that no request was
    // made for `[[Roadmap]]`.
    view("[[Roadmap]] and [[notes/other]] and nmap 7.80", OLD);

    await waitFor(() => expect(screen.getByText("Worth re-reading")).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("NoteFreshness — a changed file outranks the guesswork", () => {
  it("calls a recent note stale when a file it describes has moved", async () => {
    heads({ sha: "9999999" });
    view("Prose with nothing perishable. [[repo:scripts/scan.sh@a1b2c3d]]", NOW);

    await waitFor(() => expect(screen.getByText("Likely out of date")).toBeTruthy());
    expect(
      screen.getByText(/scripts\/scan\.sh has changed since this note described it/),
    ).toBeTruthy();
  });

  it("does not call it stale when the file has not moved", async () => {
    heads({ sha: "a1b2c3d" });
    view("Prose with nothing perishable. [[repo:scripts/scan.sh@a1b2c3d]]", NOW);

    await waitFor(() => expect(screen.getByText(/unchanged/)).toBeTruthy());
    expect(screen.queryByText("Likely out of date")).toBeNull();
  });
});

describe("NoteFreshness — re-pinning", () => {
  it("rewrites the link to the revision it just read", async () => {
    heads({ sha: "9999999" });
    const onChange = vi.fn();
    view("[[repo:scripts/scan.sh@a1b2c3d]]", NOW, onChange);

    await waitFor(() => expect(screen.getByRole("button", { name: /re-read it/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /re-read it/i }));

    expect(onChange).toHaveBeenCalledWith("[[repo:scripts/scan.sh@9999999]]");
  });

  it("offers to pin a link that never was", async () => {
    heads({ sha: "a1b2c3d" });
    const onChange = vi.fn();
    view("[[repo:scripts/scan.sh]]", NOW, onChange);

    await waitFor(() => expect(screen.getByRole("button", { name: /pin it/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /pin it/i }));

    expect(onChange).toHaveBeenCalledWith("[[repo:scripts/scan.sh@a1b2c3d]]");
  });

  it("offers nothing to re-pin on a file that has not moved", async () => {
    heads({ sha: "a1b2c3d" });
    view("[[repo:scripts/scan.sh@a1b2c3d]]", NOW, vi.fn());

    await waitFor(() => expect(screen.getByText(/unchanged/)).toBeTruthy());
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is read-only when the note cannot be written to", async () => {
    heads({ sha: "9999999" });
    view("[[repo:scripts/scan.sh@a1b2c3d]]", NOW);

    await waitFor(() => expect(screen.getByText("changed since you linked it")).toBeTruthy());
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("cannot pin against a file it could not read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    view("[[repo:scripts/scan.sh]]", NOW, vi.fn());

    await waitFor(() => expect(screen.getByText(/could not be checked/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /pin it/i })).toBeNull();
  });
});

describe("NoteFreshness — a notebook with no repository", () => {
  it("still says whether the note's claims have aged", () => {
    heads({});
    viewLocal("nmap 7.80 and CVE-2024-3094", OLD);

    // Whether a note's claims have aged is a question about the note; gating
    // it on GitHub would gate it on the other half's plumbing.
    expect(screen.getByText("Likely out of date")).toBeTruthy();
  });

  it("asks GitHub nothing, even about repository links it cannot follow", () => {
    const fetchMock = heads({});
    viewLocal("[[repo:scripts/scan.sh]] and nmap 7.80", OLD);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists no files, since none could be checked", () => {
    heads({});
    viewLocal("[[repo:scripts/scan.sh]] and nmap 7.80", OLD);

    expect(screen.queryByText("scan.sh")).toBeNull();
  });

  it("still renders nothing for a note with nothing to say about it", () => {
    heads({});
    const { container } = viewLocal("Just prose.", NOW);
    expect(container.firstChild).toBeNull();
  });
});

describe("NoteFreshness — the verdicts", () => {
  it("says a note has never been checked here", () => {
    heads({});
    view("nmap 7.80", null);
    expect(screen.getByText("Never checked here")).toBeTruthy();
  });

  it("calls a middling note worth re-reading", () => {
    heads({});
    view("nmap 7.80", new Date(Date.now() - 10 * 30.44 * 86_400_000).toISOString());
    expect(screen.getByText("Worth re-reading")).toBeTruthy();
  });

  it("explains itself rather than only labelling", () => {
    heads({});
    view("nmap 7.80 and CVE-2024-3094", OLD);
    expect(screen.getByText(/1 CVE, 1 version number/)).toBeTruthy();
  });
});

describe("hasFreshnessToReport", () => {
  it("says no for a note with nothing perishable and nothing linked", () => {
    // The panel draws no section heading at all in this case; the component
    // returning null on its own left a bare title over empty space.
    expect(hasFreshnessToReport("Just prose.", NOW, true)).toBe(false);
  });

  it("says yes when the note links a file worth checking", () => {
    expect(hasFreshnessToReport("[[repo:scripts/scan.sh]]", NOW, true)).toBe(true);
  });

  it("says no about a linked file when there is no repository to check it in", () => {
    expect(hasFreshnessToReport("[[repo:scripts/scan.sh]]", NOW, false)).toBe(false);
  });

  it("says yes for an old note making datable claims, repository or not", () => {
    expect(hasFreshnessToReport("nmap 7.80 and CVE-2024-3094", OLD, false)).toBe(true);
    expect(hasFreshnessToReport("nmap 7.80 and CVE-2024-3094", OLD, true)).toBe(true);
  });

  it("says yes for a note that has never been checked here", () => {
    expect(hasFreshnessToReport("nmap 7.80", null, false)).toBe(true);
  });

  it("agrees with what the component actually renders", () => {
    // The heading and its contents must never disagree about emptiness.
    for (const [content, updatedAt] of [
      ["Just prose.", NOW],
      ["nmap 7.80", OLD],
      ["[[repo:scripts/scan.sh]]", NOW],
    ] as const) {
      heads({});
      const shows = hasFreshnessToReport(content, updatedAt, true);
      const { container } = view(content, updatedAt);
      expect(container.firstChild === null).toBe(!shows);
      cleanup();
    }
  });
});
