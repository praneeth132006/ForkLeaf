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
  const onReplay = vi.fn();
  const onBlame = vi.fn();

  render(
    <EditorRightPanel
      collapsed={false}
      onToggle={vi.fn()}
      note={NOTE}
      workspace={workspace}
      onFrontmatterChange={vi.fn()}
      onExport={vi.fn()}
      onShowHistory={onShowHistory}
      onReplay={onReplay}
      onBlame={onBlame}
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

  return { onShowHistory, onReplay, onBlame };
}

/**
 * The properties panel is where somebody goes looking for what they can do
 * with the note in front of them, which makes it the one place the replay has
 * to be named. It shipped reachable only as a tab inside the history dialog —
 * two steps past anywhere its name appears — so these guard the way in, not
 * just the thing at the end of it.
 */
describe("EditorRightPanel actions", () => {
  it("offers the replay by name, next to history", () => {
    panel();
    const replay = screen.getByRole("button", { name: /replay how this was written/i });
    const history = screen.getByRole("button", { name: /history & commits/i });
    expect(replay).toBeTruthy();
    // Adjacent, so finding one finds the other.
    expect(history.compareDocumentPosition(replay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the replay when that button is pressed", () => {
    const { onReplay, onShowHistory } = panel();
    fireEvent.click(screen.getByRole("button", { name: /replay how this was written/i }));
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onShowHistory).not.toHaveBeenCalled();
  });

  it("offers the blame view by name, beside the replay", () => {
    panel();
    const blame = screen.getByRole("button", { name: /when each paragraph was written/i });
    const replay = screen.getByRole("button", { name: /replay how this was written/i });
    expect(blame).toBeTruthy();
    expect(replay.compareDocumentPosition(blame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the blame view when that button is pressed", () => {
    const { onBlame, onReplay, onShowHistory } = panel();
    fireEvent.click(screen.getByRole("button", { name: /when each paragraph was written/i }));
    expect(onBlame).toHaveBeenCalledTimes(1);
    expect(onReplay).not.toHaveBeenCalled();
    expect(onShowHistory).not.toHaveBeenCalled();
  });

  it("hides all three when there is no repository to read history from", () => {
    panel(LOCAL);
    expect(screen.queryByRole("button", { name: /replay how this was written/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /when each paragraph was written/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /history & commits/i })).toBeNull();
  });
});
