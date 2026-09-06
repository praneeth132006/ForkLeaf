// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const readSuggestion = vi.fn();

vi.mock("@/lib/gateway", () => ({
  readSuggestion: (...args: unknown[]) => readSuggestion(...args),
}));

const { SuggestionDiff } = await import("./SuggestionDiff");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const file = (over: Record<string, unknown> = {}) => ({
  path: "notes/runbook.md",
  status: "modified",
  previousPath: null,
  before: "Deploy with make ship.",
  after: "Deploy with pnpm ship.",
  diffable: true,
  ...over,
});

const detail = (over: Record<string, unknown> = {}) => ({
  pull: {
    number: 7,
    title: "Fix the deploy command",
    url: "https://github.com/me/notes/pull/7",
    author: "a-reader",
    base: "main",
    head: "reader:patch-1",
    baseSha: "base000",
    headSha: "head000",
  },
  truncated: false,
  files: [file()],
  ...over,
});

const open = () => render(<SuggestionDiff owner="me" repo="notes" number={7} />);

describe("SuggestionDiff", () => {
  it("shows the note as it is and as it is proposed", async () => {
    readSuggestion.mockResolvedValue(detail());
    open();

    expect(await screen.findByText("Yours")).toBeTruthy();
    expect(screen.getByText("Suggested")).toBeTruthy();
    expect(screen.getAllByText("make").length).toBeGreaterThan(0);
    expect(screen.getAllByText("pnpm").length).toBeGreaterThan(0);
  });

  it("asks for the suggestion it was given", async () => {
    readSuggestion.mockResolvedValue(detail());
    open();

    await screen.findByText("Yours");
    expect(readSuggestion).toHaveBeenCalledWith("me", "notes", 7);
  });

  it("shows every note a suggestion touches", async () => {
    readSuggestion.mockResolvedValue(detail({ files: [file(), file({ path: "notes/other.md" })] }));
    open();

    expect(await screen.findByText("notes/runbook.md")).toBeTruthy();
    expect(screen.getByText("notes/other.md")).toBeTruthy();
  });

  it("names a change it cannot put a diff through", async () => {
    readSuggestion.mockResolvedValue(
      detail({
        files: [
          file({
            path: "notes/shot.png",
            status: "added",
            diffable: false,
            before: null,
            after: null,
          }),
        ],
      }),
    );
    open();

    expect(await screen.findByText(/It is not text/)).toBeTruthy();
  });

  it("shows a rename as the two paths it has", async () => {
    readSuggestion.mockResolvedValue(
      detail({
        files: [file({ path: "notes/new.md", status: "renamed", previousPath: "notes/old.md" })],
      }),
    );
    open();

    expect(await screen.findByText("notes/old.md → notes/new.md")).toBeTruthy();
  });

  it("says when a suggestion touches more than it can show", async () => {
    readSuggestion.mockResolvedValue(detail({ truncated: true }));
    open();

    expect(await screen.findByText(/touches more files than are shown/)).toBeTruthy();
  });

  it("says so when a suggestion changes no files at all", async () => {
    readSuggestion.mockResolvedValue(detail({ files: [] }));
    open();

    expect(await screen.findByText(/does not change any files/)).toBeTruthy();
  });

  it("reports a suggestion that could not be read", async () => {
    readSuggestion.mockRejectedValue(new Error("GitHub is not answering."));
    open();

    expect((await screen.findByRole("alert")).textContent).toContain("GitHub is not answering.");
  });

  it("does not set state after it has been closed", async () => {
    let settle: (value: unknown) => void = () => {};
    readSuggestion.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    open();

    cleanup();
    settle(detail());

    await waitFor(() => expect(screen.queryByText("Yours")).toBeNull());
  });
});
