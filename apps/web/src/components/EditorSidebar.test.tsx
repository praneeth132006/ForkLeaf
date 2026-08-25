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
      pinnedPaths={[]}
      onTogglePin={() => {}}
      onMovePin={() => {}}
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

describe("EditorSidebar — pinned notes", () => {
  const pinned = ["SOC 101/Phishing analysis/introduction.md"];

  it("shows a pinned note above the tree", () => {
    renderSidebar("", { pinnedPaths: pinned });

    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(screen.getByTitle(pinned[0]!)).toBeTruthy();
  });

  it("says nothing at all when nothing is pinned", () => {
    renderSidebar("");
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("opens the note when the pinned row is clicked", () => {
    const onOpenNote = vi.fn();
    renderSidebar("", { pinnedPaths: pinned, onOpenNote });

    fireEvent.click(screen.getByTitle(pinned[0]!));

    expect(onOpenNote).toHaveBeenCalledWith(pinned[0]);
  });

  it("drops a pin whose note no longer exists, rather than showing a dead row", () => {
    renderSidebar("", { pinnedPaths: ["SOC 101/deleted.md"] });
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("can reorder the list, which is the only thing about it anybody chose", () => {
    const onMovePin = vi.fn();
    const two = [...pinned, "SOC 101/Phishing analysis/second.md"];

    renderSidebar("", {
      pinnedPaths: two,
      onMovePin,
      tree: [
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
                {
                  kind: "file",
                  name: "second.md",
                  path: "SOC 101/Phishing analysis/second.md",
                },
              ],
            },
          ],
        },
      ],
    });

    fireEvent.click(screen.getByLabelText("Move second down"));
    expect(onMovePin).not.toHaveBeenCalled(); // already last, so the button is off

    fireEvent.click(screen.getByLabelText("Move second up"));
    expect(onMovePin).toHaveBeenCalledWith("SOC 101/Phishing analysis/second.md", -1);
  });

  it("can unpin from the row itself", () => {
    const onTogglePin = vi.fn();
    renderSidebar("", { pinnedPaths: pinned, onTogglePin });

    fireEvent.click(screen.getByLabelText("Unpin introduction"));

    expect(onTogglePin).toHaveBeenCalledWith(pinned[0]);
  });
});

/**
 * The account card at the bottom of the sidebar.
 *
 * It looks exactly like a button — avatar, name, handle, in a bordered card
 * where every application puts the way into your account — and did nothing at
 * all when clicked. The menu beside it opened but never closed except by
 * clicking the same gear again.
 */
describe("the account card", () => {
  const user = { login: "praneeth132006", name: "Praneeth", avatarUrl: "https://x/y.png" };

  it("goes to the profile when clicked", () => {
    renderSidebar("", { user });

    const link = screen.getByTitle("Your profile");
    expect(link.getAttribute("href")).toBe("/profile");
    expect(link.textContent).toContain("Praneeth");
  });

  it("closes its menu on Escape", () => {
    renderSidebar("", { user });

    fireEvent.click(screen.getByLabelText("Account"));
    expect(screen.getByText("Sign out")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("closes its menu when something else is clicked", () => {
    renderSidebar("", { user });

    fireEvent.click(screen.getByLabelText("Account"));
    expect(screen.getByText("Sign out")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Sign out")).toBeNull();
  });
});
