// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TreeNode, Workspace } from "@forkleaf/types";
import { EditorSidebar } from "./EditorSidebar";

/**
 * Where a new note goes.
 *
 * "New note" used to always mean "new note at the repository root", whatever
 * you had open. Somebody three folders deep pressed the button and got a file
 * at the top of their repository — which on a connected repo was committed
 * there before they noticed, and then had to be dragged back. The button has
 * to follow the note you are in.
 */

afterEach(cleanup);

const workspace: Workspace = {
  id: "octocat/notes@main:",
  name: "notes",
  repo: { owner: "octocat", repo: "notes", branch: "main", directory: "" },
  isDefault: false,
  isLocal: false,
  createdAt: new Date(0).toISOString(),
  lastOpenedAt: new Date(0).toISOString(),
};

const tree: TreeNode[] = [
  {
    kind: "folder",
    name: "SOC 101",
    path: "SOC 101",
    children: [
      {
        kind: "folder",
        name: "Phishing analysis",
        path: "SOC 101/Phishing analysis",
        children: [
          {
            kind: "file",
            name: "introduction.md",
            path: "SOC 101/Phishing analysis/introduction.md",
          },
        ],
      },
    ],
  },
];

function renderSidebar(currentFolder: string, overrides: Record<string, unknown> = {}) {
  const onCreateNote = vi.fn();
  const onCreateFolder = vi.fn();

  render(
    <EditorSidebar
      collapsed={false}
      onToggle={() => {}}
      workspaces={[workspace]}
      activeWorkspace={workspace}
      onSwitchWorkspace={() => {}}
      onConnectRepo={() => {}}
      tree={tree}
      activePath="SOC 101/Phishing analysis/introduction.md"
      currentFolder={currentFolder}
      onOpenNote={() => {}}
      onCreateNote={onCreateNote}
      onDeleteNote={() => {}}
      onRenameNote={() => {}}
      onCreateFolder={onCreateFolder}
      onRenameFolder={() => {}}
      onDeleteFolder={() => {}}
      onMoveNote={() => {}}
      user={null}
      onSignIn={() => {}}
      onSignOut={() => {}}
      onOpenHelp={() => {}}
      onOpenPalette={() => {}}
      githubAvailable
      {...overrides}
    />,
  );

  return { onCreateNote, onCreateFolder };
}

describe("EditorSidebar — where new things go", () => {
  it("creates a note in the folder you are working in", () => {
    const { onCreateNote } = renderSidebar("SOC 101/Phishing analysis");

    fireEvent.click(screen.getByText("New Note"));

    expect(onCreateNote).toHaveBeenCalledWith("SOC 101/Phishing analysis");
  });

  it("creates a folder inside the folder you are working in", () => {
    const { onCreateFolder } = renderSidebar("SOC 101/Phishing analysis");

    fireEvent.click(screen.getByLabelText("New folder"));

    expect(onCreateFolder).toHaveBeenCalledWith("SOC 101/Phishing analysis");
  });

  it("falls back to the repository root when no note is open", () => {
    const { onCreateNote } = renderSidebar("", { activePath: null });

    fireEvent.click(screen.getByText("New Note"));

    expect(onCreateNote).toHaveBeenCalledWith("");
  });

  it("says where the note will be created, so it is not a surprise", () => {
    renderSidebar("SOC 101/Phishing analysis");

    expect(screen.getByTitle("New note in SOC 101/Phishing analysis (⌘⇧N)")).toBeTruthy();
  });

  it("still offers the repository root explicitly", () => {
    const { onCreateNote } = renderSidebar("SOC 101/Phishing analysis");

    fireEvent.click(screen.getByLabelText("New note in a folder"));
    fireEvent.click(screen.getByRole("menuitem", { name: "notes" }));

    expect(onCreateNote).toHaveBeenCalledWith("");
  });
});
