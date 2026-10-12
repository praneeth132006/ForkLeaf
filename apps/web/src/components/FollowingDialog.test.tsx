// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FollowingDialog, type FollowingDialogProps } from "./FollowingDialog";

afterEach(cleanup);

const ada = { owner: "ada", repo: "notes", label: "Ada's notes" };

const BEFORE = "# Cities\n\nTrams are quiet.";
const AFTER = "# Cities\n\nTrams are quiet.\n\nBuses come every five minutes.";

function mount(overrides: Partial<FollowingDialogProps> = {}) {
  const props: FollowingDialogProps = {
    onClose: vi.fn(),
    signedIn: true,
    following: [ada],
    onFollow: vi.fn(async () => {}),
    onUnfollow: vi.fn(async () => {}),
    since: () => "2026-10-01T00:00:00Z",
    onCaughtUp: vi.fn(),
    loadChanges: vi.fn(async () => ({
      baseSha: "base",
      headSha: "head",
      files: [
        { path: "ideas/cities.md", status: "modified", previousPath: null },
        { path: "gone.md", status: "removed", previousPath: null },
        { path: "fresh.md", status: "added", previousPath: null },
      ],
      truncated: false,
    })),
    readAt: vi.fn(async (_followed, path: string, sha: string) =>
      path === "ideas/cities.md"
        ? sha === "head"
          ? AFTER
          : BEFORE
        : sha === "head"
          ? "Hello"
          : null,
    ),
    onCopy: vi.fn(async () => "My reading list"),
    ...overrides,
  };
  render(<FollowingDialog {...props} />);
  return props;
}

describe("FollowingDialog", () => {
  it("lists what each notebook added or changed since the last look", async () => {
    const props = mount();
    const list = await screen.findByTestId("following-list");
    await waitFor(() => expect(within(list).getByText("cities")).toBeTruthy());
    expect(within(list).getByText("Updated")).toBeTruthy();
    expect(within(list).getByText("New")).toBeTruthy();
    // A deleted note is not something to read.
    expect(within(list).queryByText("gone")).toBeNull();
    expect(props.loadChanges).toHaveBeenCalledWith(ada, "2026-10-01T00:00:00Z");
  });

  it("opens a changed note with its new paragraphs marked, and quotes one into my note", async () => {
    const props = mount();
    fireEvent.click(await screen.findByText("cities"));
    const reader = await screen.findByTestId("following-reader");
    await waitFor(() =>
      expect(within(reader).getByText("Buses come every five minutes.")).toBeTruthy(),
    );
    expect(within(reader).getAllByText("New")).toHaveLength(1);

    fireEvent.click(within(reader).getAllByText("Add to my note")[2]!);
    await screen.findByText("Added to My reading list");
    expect(props.onCopy).toHaveBeenCalledWith(
      "> Buses come every five minutes.\n>\n> — from [cities](https://github.com/ada/notes/blob/head/ideas/cities.md#L5) by @ada\n",
    );
  });

  it("does not mark every paragraph of a brand-new note as new", async () => {
    mount();
    fireEvent.click(await screen.findByText("fresh"));
    const reader = await screen.findByTestId("following-reader");
    await waitFor(() => expect(within(reader).getByText("Hello")).toBeTruthy());
    expect(within(reader).queryByText("New")).toBeNull();
  });

  it("says why a paragraph could not be added", async () => {
    mount({
      onCopy: vi.fn(async () => Promise.reject(new Error("Open one of your notes to add it to."))),
    });
    fireEvent.click(await screen.findByText("cities"));
    const reader = await screen.findByTestId("following-reader");
    await waitFor(() =>
      expect(within(reader).getAllByText("Add to my note").length).toBeGreaterThan(0),
    );
    fireEvent.click(within(reader).getAllByText("Add to my note")[0]!);
    expect(await screen.findByText("Open one of your notes to add it to.")).toBeTruthy();
  });

  it("follows a notebook by name or address, and refuses anything else", async () => {
    const props = mount({ following: [] });
    expect(screen.getByText(/not following any notebooks yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Notebook to follow"), {
      target: { value: "nonsense" },
    });
    fireEvent.click(screen.getByText("Follow"));
    expect(screen.getByRole("alert").textContent).toContain("owner/name");
    fireEvent.change(screen.getByLabelText("Notebook to follow"), {
      target: { value: "https://github.com/grace/garden" },
    });
    fireEvent.click(screen.getByText("Follow"));
    await waitFor(() => expect(props.onFollow).toHaveBeenCalledWith("grace", "garden"));
  });

  it("says when a notebook cannot be read, and lets you unfollow it", async () => {
    const props = mount({
      loadChanges: vi.fn(async () => Promise.reject(new Error("Not found."))),
    });
    expect(await screen.findByText("Not found.")).toBeTruthy();
    fireEvent.click(screen.getByText("Unfollow"));
    expect(props.onUnfollow).toHaveBeenCalledWith(ada);
  });

  it("marks a notebook caught up", async () => {
    const props = mount();
    fireEvent.click(await screen.findByText("Caught up"));
    expect(props.onCaughtUp).toHaveBeenCalledWith(ada);
  });

  it("asks to sign in first", () => {
    mount({ signedIn: false });
    expect(screen.getByText(/needs you signed in with/)).toBeTruthy();
  });
});
