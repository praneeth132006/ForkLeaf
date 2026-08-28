// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SyncState, Workspace } from "@forkleaf/types";
import { SyncProblem } from "./SyncProblem";

afterEach(cleanup);

const WORKSPACE: Workspace = {
  id: "me/notes@main:",
  name: "notes",
  repo: { owner: "me", repo: "notes", branch: "main", directory: "" },
  isDefault: false,
  isLocal: false,
  createdAt: new Date().toISOString(),
  lastOpenedAt: new Date().toISOString(),
};

function state(over: Partial<SyncState> = {}): SyncState {
  return {
    status: "error",
    mode: "auto",
    pendingCount: 3,
    blockedCount: 0,
    lastSyncedAt: null,
    lastError: "Could not push to GitHub just now.",
    lastErrorDetail: "GitRPC::BadObjectState",
    lastErrorCode: "unknown",
    lastErrorAt: new Date().toISOString(),
    failedAttempts: 4,
    blockedChanges: [],
    conflicts: [],
    ...over,
  };
}

function view(sync: SyncState, over: Partial<React.ComponentProps<typeof SyncProblem>> = {}) {
  const props = {
    sync,
    expired: false,
    workspace: WORKSPACE,
    label: "Not pushed to GitHub",
    labelClassName: "",
    dot: "",
    onRetry: vi.fn(),
    onSignIn: vi.fn(),
    onShowConflicts: vi.fn(),
    onPropose: vi.fn(),
    onDiscard: vi.fn(),
    ...over,
  };
  render(<SyncProblem {...props} />);
  return props;
}

/** Opens the panel the way a reader does. */
function open() {
  fireEvent.click(screen.getByRole("button", { name: /Not pushed to GitHub/ }));
}

describe("SyncProblem — the reason, not just the failure", () => {
  it("stays out of the way until asked", () => {
    view(state());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names what GitHub actually said, rather than hiding it in a tooltip", () => {
    view(state());
    open();
    expect(screen.getByText(/GitRPC::BadObjectState/)).toBeTruthy();
  });

  it("says how many attempts have already gone the same way", () => {
    view(state());
    open();
    expect(screen.getByText(/4 failed in a row/)).toBeTruthy();
  });

  it("answers the question the reader actually has first", () => {
    view(state());
    open();
    expect(screen.getByText(/3 changes are saved on this device/)).toBeTruthy();
  });

  it("gives steps for a permission failure that only the reader can take", () => {
    view(state({ lastErrorCode: "forbidden" }));
    open();
    expect(screen.getByText(/write access to this repository/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /pull request instead/ })).toBeTruthy();
  });

  it("names the proxy case for a network failure, which is the one nobody guesses", () => {
    view(state({ lastErrorCode: "network" }));
    open();
    expect(screen.getByText(/api\.github\.com is not blocked/)).toBeTruthy();
  });

  /**
   * The failure that made the old status bar a dead end. Retrying sends the
   * same oversized request and signing in again changes nothing about it, so
   * the file has to be named or there is nothing anybody can do.
   */
  it("names the file that is too big to send, and says so as the reason", () => {
    view(
      state({
        status: "blocked",
        lastErrorCode: "too-large",
        lastErrorDetail: "assets/screenshot.png is 6.2 MB, which is too big",
        blockedCount: 1,
        blockedChanges: [
          {
            id: "w::assets/screenshot.png",
            path: "assets/screenshot.png",
            error: "assets/screenshot.png is 6.2 MB",
          },
        ],
      }),
    );
    open();
    expect(screen.getByText("assets/screenshot.png")).toBeTruthy();
    expect(screen.getByText(/pasted image/)).toBeTruthy();
  });

  /**
   * The step nobody can actually perform on their own: the file is called
   * something like `Pasted image 20260828.png` and lives in one of hundreds of
   * notes. The app is holding the change, so the app removes it.
   */
  it("removes the stuck file itself rather than describing where to look", () => {
    const props = view(
      state({
        status: "blocked",
        lastErrorCode: "too-large",
        blockedCount: 1,
        blockedChanges: [
          { id: "w::assets/screenshot.png", path: "assets/screenshot.png", error: "6.2 MB" },
        ],
      }),
    );
    open();
    fireEvent.click(screen.getByRole("button", { name: /Remove assets\/screenshot\.png/ }));
    expect(props.onDiscard).toHaveBeenCalledWith("w::assets/screenshot.png");
    // And says what it did and did not touch, since "remove" beside a filename
    // could be read as deleting the note.
    expect(screen.getByText(/notes and their text are untouched/)).toBeTruthy();
  });
});

describe("SyncProblem — offering the thing that would work", () => {
  it("retries from inside the panel", () => {
    const props = view(state());
    open();
    fireEvent.click(screen.getByRole("button", { name: "Try again now" }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("shows a push in flight rather than looking inert", () => {
    view(state({ status: "syncing" }));
    open();
    expect(screen.getByRole("button", { name: "Trying…" })).toBeTruthy();
  });

  it("offers the sign-in, not a retry, when the sign-in is what is wrong", () => {
    const props = view(state({ lastErrorCode: "unauthorized" }), { expired: true });
    open();
    // Still available for anybody who disagrees, just no longer the answer.
    expect(screen.getByRole("button", { name: /Try again anyway/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Sign in to GitHub again/ }));
    expect(props.onSignIn).toHaveBeenCalled();
  });

  it("sends a conflict to the resolver instead of a retry", () => {
    const props = view(
      state({
        status: "conflict",
        conflicts: [
          {
            workspaceId: WORKSPACE.id,
            path: "a.md",
            localContent: "mine",
            remoteContent: "theirs",
            remoteSha: "abc123",
            detectedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    open();
    fireEvent.click(screen.getByRole("button", { name: /Resolve conflicts/ }));
    expect(props.onShowConflicts).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Try again now/ })).toBeNull();
  });
});
