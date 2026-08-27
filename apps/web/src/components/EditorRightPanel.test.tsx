// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Note, Workspace } from "@forkleaf/types";
import { EditorRightPanel } from "./EditorRightPanel";

afterEach(cleanup);

const NOTE = {
  path: "notes/a.md",
  content: "# Title\n\nSome words.",
  frontmatter: {},
} as unknown as Note;

const CONNECTED = {
  isLocal: false,
  repo: { owner: "me", repo: "notes", branch: "main", directory: "" },
} as Workspace;

const LOCAL = { isLocal: true } as Workspace;

function panel(workspace: Workspace | null = CONNECTED) {
  const onShowHistory = vi.fn();

  render(
    <EditorRightPanel
      collapsed={false}
      onToggle={vi.fn()}
      note={NOTE}
      workspace={workspace}
      onFrontmatterChange={vi.fn()}
      onExport={vi.fn()}
      onShowHistory={onShowHistory}
      syncMode="auto"
      onSyncNow={vi.fn()}
      links={{
        ready: true,
        backlinks: [],
        outgoing: [],
        titleFor: (path: string) => path,
        onOpen: vi.fn(),
        onCreate: vi.fn(),
      }}
      assetUrls={{}}
    />,
  );

  return { onShowHistory };
}

/**
 * The properties panel is where somebody goes looking for what they can do
 * with the note in front of them, which makes it the one place history has to
 * be named.
 *
 * Replay and blame each had their own button here when they were built,
 * because each had shipped buried in a tab nobody opened. Three buttons
 * opening three tabs of one window turned out to be the opposite mistake, so
 * there is one now and the tabs do the choosing. These guard that there is
 * still exactly one obvious way in.
 */
describe("EditorRightPanel actions", () => {
  it("offers one way into history, naming all three things it holds", () => {
    panel();
    const button = screen.getByRole("button", { name: /history, replay & who wrote what/i });
    expect(button).toBeTruthy();
  });

  it("opens it when pressed", () => {
    const { onShowHistory } = panel();
    fireEvent.click(screen.getByRole("button", { name: /history, replay & who wrote what/i }));
    expect(onShowHistory).toHaveBeenCalledTimes(1);
  });

  it("does not repeat replay and blame as buttons of their own", () => {
    // They are tabs inside the window this opens; a button per tab made the
    // reader choose before they could look.
    panel();
    expect(screen.queryByRole("button", { name: /replay how this was written/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /when each paragraph was written/i })).toBeNull();
  });

  it("hides it when there is no repository to read history from", () => {
    panel(LOCAL);
    expect(screen.queryByRole("button", { name: /history, replay & who wrote what/i })).toBeNull();
  });
});
