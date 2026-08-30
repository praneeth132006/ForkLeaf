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
    unpushed: [],
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
    onShrink: vi.fn(async () => ({ before: 4_400_000, after: 780_000, width: 1280, height: 720 })),
    onLocate: vi.fn(),
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
        unpushed: [
          {
            id: "w::assets/screenshot.png",
            path: "assets/screenshot.png",
            bytes: 6.2 * 1024 * 1024,
            tooLarge: true,
            blocked: true,
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
        unpushed: [
          {
            id: "w::assets/screenshot.png",
            path: "assets/screenshot.png",
            bytes: 6.2 * 1024 * 1024,
            tooLarge: true,
            blocked: true,
            error: "6.2 MB",
          },
        ],
      }),
    );
    open();
    fireEvent.click(screen.getByRole("button", { name: /Remove assets\/screenshot\.png/ }));
    expect(props.onDiscard).toHaveBeenCalledWith("w::assets/screenshot.png");
    // And says what it does and does not touch, since "remove" beside a
    // filename could be read as deleting the note.
    expect(screen.getByText(/out of the notes that showed it/)).toBeTruthy();
  });
});

describe("SyncProblem — what did not get synced", () => {
  const queue = [
    {
      id: "w::assets/Pasted image 20260828.png",
      path: "assets/Pasted image 20260828.png",
      bytes: 6.2 * 1024 * 1024,
      tooLarge: true,
      blocked: false,
      error: null,
    },
    {
      id: "w::notes/tcm.md",
      path: "notes/tcm.md",
      bytes: 4096,
      tooLarge: false,
      blocked: false,
      error: null,
    },
  ];

  /**
   * The state the bar is most often read in — still failing, still retrying,
   * nothing parked yet. It used to list nothing at all here, which is how "2
   * changes waiting" ended up meaning "waiting for what, exactly".
   */
  it("lists the files while the push is still retrying, not only once it gives up", () => {
    view(state({ status: "error", blockedCount: 0, unpushed: queue }));
    open();
    expect(screen.getByText("Not synced (2)")).toBeTruthy();
    expect(screen.getByText("assets/Pasted image 20260828.png")).toBeTruthy();
    expect(screen.getByText("notes/tcm.md")).toBeTruthy();
  });

  it("says which one is too big, and how big it is", () => {
    view(state({ unpushed: queue }));
    open();
    expect(screen.getByText(/6\.2 MB/)).toBeTruthy();
    expect(screen.getByText(/Too big to send/)).toBeTruthy();
  });

  /**
   * The queue is better evidence than the last error: a batch carrying an
   * oversized file can die as a timeout or a 500 depending on where it fails,
   * and each of those would otherwise send the reader somewhere useless.
   */
  it("blames the large file even when the last attempt reported something else", () => {
    view(state({ lastErrorCode: "network", unpushed: queue }));
    open();
    expect(screen.getByText(/A file is too big to send to GitHub/)).toBeTruthy();
    expect(screen.getByText(/pasted image/)).toBeTruthy();
  });

  it("finds the note a stuck picture lives in, rather than describing the search", () => {
    const props = view(state({ unpushed: queue }));
    open();
    fireEvent.click(screen.getByRole("button", { name: /Find assets\/Pasted image/ }));
    expect(props.onLocate).toHaveBeenCalledWith("assets/Pasted image 20260828.png");
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

/**
 * The picture is fine. There is simply more of it than one request will take,
 * and "remove it" was the only thing on offer for that.
 */
describe("SyncProblem — making a picture fit rather than deleting it", () => {
  const oversized = (path: string) =>
    state({
      status: "blocked",
      lastErrorCode: "too-large",
      blockedCount: 1,
      unpushed: [
        {
          id: `w::${path}`,
          path,
          bytes: 6.2 * 1024 * 1024,
          tooLarge: true,
          blocked: true,
          error: "6.2 MB",
        },
      ],
    });

  it("offers to resize a screenshot, and asks how small", () => {
    view(oversized("assets/screenshot.png"));
    open();

    fireEvent.click(screen.getByRole("button", { name: /Resize assets\/screenshot\.png/ }));
    expect(screen.getByText(/Make it fit under/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /As large as will send/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^1 MB$/ })).toBeTruthy();
  });

  it("resizes to the size that was asked for, and says what it did", async () => {
    const props = view(oversized("assets/screenshot.png"));
    open();

    fireEvent.click(screen.getByRole("button", { name: /Resize assets\/screenshot\.png/ }));
    fireEvent.click(screen.getByRole("button", { name: /^1 MB$/ }));

    expect(props.onShrink).toHaveBeenCalledWith("w::assets/screenshot.png", 1024 * 1024);
    expect(await screen.findByText(/4\.2 MB → 762 KB at 1280×720/)).toBeTruthy();
  });

  it("keeps the choices open and explains itself when it cannot be done", async () => {
    const props = view(oversized("assets/screenshot.png"), {
      onShrink: vi.fn(async () => {
        throw new Error("Even at 600×450 this image is 3.4 MB.");
      }),
    });
    open();

    fireEvent.click(screen.getByRole("button", { name: /Resize assets\/screenshot\.png/ }));
    fireEvent.click(screen.getByRole("button", { name: /^500 KB$/ }));

    expect(await screen.findByText(/Even at 600×450 this image is 3\.4 MB\./)).toBeTruthy();
    expect(props.onShrink).toHaveBeenCalled();
    // Still open, because the next thing to try is a smaller size.
    expect(screen.getByText(/Make it fit under/)).toBeTruthy();
  });

  it("does not offer to resize an animation, which would lose every frame but one", () => {
    view(oversized("assets/loop.gif"));
    open();
    expect(screen.queryByRole("button", { name: /Resize/ })).toBeNull();
  });

  it("does not offer to resize a note", () => {
    view(
      state({
        status: "blocked",
        unpushed: [
          {
            id: "w::notes/big.md",
            path: "notes/big.md",
            bytes: 4e6,
            tooLarge: true,
            blocked: true,
            error: null,
          },
        ],
      }),
    );
    open();
    expect(screen.queryByRole("button", { name: /Resize/ })).toBeNull();
  });
});
