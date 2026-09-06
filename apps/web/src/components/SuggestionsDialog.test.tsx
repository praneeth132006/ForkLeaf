// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RepoRef } from "@forkleaf/types";

const listSuggestions = vi.fn();
const acceptSuggestion = vi.fn();

vi.mock("@/lib/gateway", () => ({
  listSuggestions: (...args: unknown[]) => listSuggestions(...args),
  acceptSuggestion: (...args: unknown[]) => acceptSuggestion(...args),
}));

// The diff has its own tests, and pulling the real one in here would make
// every test in this file about a second network call it does not care about.
vi.mock("@/components/SuggestionDiff", () => ({
  SuggestionDiff: ({ number }: { number: number }) => <p>the change in #{number}</p>,
}));

const { SuggestionsDialog } = await import("./SuggestionsDialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REPO: RepoRef = { owner: "me", repo: "notes", branch: "main", directory: "" };

const suggestion = (over: Record<string, unknown> = {}) => ({
  number: 7,
  url: "https://github.com/me/notes/pull/7",
  state: "open",
  title: "Fix the version in the deploy runbook",
  draft: false,
  head: "reader:patch-1",
  base: "main",
  author: "a-reader",
  updatedAt: new Date().toISOString(),
  ...over,
});

function open(over: Partial<React.ComponentProps<typeof SuggestionsDialog>> = {}) {
  const props = { onClose: vi.fn(), repo: REPO, onAccepted: vi.fn(), ...over };
  render(<SuggestionsDialog {...props} />);
  return props;
}

describe("SuggestionsDialog — the list", () => {
  it("names who suggested what, and where it would land", async () => {
    listSuggestions.mockResolvedValue([suggestion()]);
    open();

    expect(await screen.findByText("Fix the version in the deploy runbook")).toBeTruthy();
    expect(screen.getByText(/by a-reader/)).toBeTruthy();
    expect(screen.getByText(/reader:patch-1 → main/)).toBeTruthy();
  });

  /**
   * The empty state has work to do: somebody who has never been sent a
   * suggestion does not know the feature exists, and this is the one place
   * they will read about it.
   */
  it("explains how one would arrive when there are none", async () => {
    listSuggestions.mockResolvedValue([]);
    open();

    expect(await screen.findByText(/Nothing has been suggested yet/)).toBeTruthy();
    expect(screen.getByText("Suggest an edit")).toBeTruthy();
  });

  it("says so when GitHub cannot be read", async () => {
    listSuggestions.mockRejectedValue(new Error("Bad credentials"));
    open();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

describe("SuggestionsDialog — accepting one", () => {
  it("merges it, and tells the notebook to catch up", async () => {
    listSuggestions.mockResolvedValue([suggestion()]);
    acceptSuggestion.mockResolvedValue({ merged: true, sha: "abc" });
    const props = open();

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(acceptSuggestion).toHaveBeenCalledWith({
        owner: "me",
        repo: "notes",
        number: 7,
        title: "Fix the version in the deploy runbook",
      }),
    );
    expect(await screen.findByText(/It is in your notes now/)).toBeTruthy();
    // Merged on GitHub is not the same as present on this device.
    expect(props.onAccepted).toHaveBeenCalled();
  });

  it("passes GitHub's own words on when it refuses", async () => {
    listSuggestions.mockResolvedValue([suggestion()]);
    acceptSuggestion.mockRejectedValue(
      new Error("this branch has conflicts that must be resolved"),
    );
    open();

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    // Better than ours: it says exactly what to do next, on a page that can
    // do it.
    expect(await screen.findByText(/conflicts that must be resolved/)).toBeTruthy();
  });

  it("will not accept a draft, which is not finished being written", async () => {
    listSuggestions.mockResolvedValue([suggestion({ draft: true })]);
    open();

    expect((await screen.findByRole("button", { name: "Accept" })).hasAttribute("disabled")).toBe(
      true,
    );
  });

  /**
   * The point of the whole dialog: deciding without leaving.
   *
   * This used to be a link to github.com, on the argument that GitHub renders
   * a diff better than a notes app would. It does — and it also meant three
   * context switches to approve a one-word correction, which is what nearly
   * all of these are.
   */
  it("shows what a suggestion changes without leaving", async () => {
    listSuggestions.mockResolvedValue([suggestion()]);
    open();

    fireEvent.click(await screen.findByRole("button", { name: "Read what changed" }));
    expect(await screen.findByText(/the change in #7/)).toBeTruthy();
  });

  it("puts the change away again", async () => {
    listSuggestions.mockResolvedValue([suggestion()]);
    open();

    fireEvent.click(await screen.findByRole("button", { name: "Read what changed" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hide what changed" }));

    await waitFor(() => expect(screen.queryByText(/the change in #7/)).toBeNull());
  });

  /** The conversation is the half that genuinely belongs on GitHub. */
  it("still offers the conversation on GitHub", async () => {
    listSuggestions.mockResolvedValue([suggestion()]);
    open();

    const link = await screen.findByRole("link", { name: /Discuss on GitHub/ });
    expect(link.getAttribute("href")).toBe("https://github.com/me/notes/pull/7");
  });

  it("reads one suggestion at a time", async () => {
    listSuggestions.mockResolvedValue([suggestion(), suggestion({ number: 8, title: "Another" })]);
    open();

    const [first, second] = await screen.findAllByRole("button", { name: "Read what changed" });
    fireEvent.click(first!);
    expect(await screen.findByText(/the change in #7/)).toBeTruthy();

    fireEvent.click(second!);
    expect(await screen.findByText(/the change in #8/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/the change in #7/)).toBeNull());
  });
});
