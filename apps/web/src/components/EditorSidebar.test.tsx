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
    name: "Fieldwork",
    path: "Fieldwork",
    children: [
      {
        kind: "folder",
        name: "Phishing analysis",
        path: "Fieldwork/Soil surveys",
        children: [
          {
            kind: "file",
            name: "introduction.md",
            path: "Fieldwork/Soil surveys/introduction.md",
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
      onDisconnectRepo={() => {}}
      tree={tree}
      activePath="Fieldwork/Soil surveys/introduction.md"
      currentFolder={currentFolder}
      onOpenNote={() => {}}
      onCreateNote={onCreateNote}
      onDeleteNote={() => {}}
      onRenameNote={() => {}}
      onCreateFolder={onCreateFolder}
      onRenameFolder={() => {}}
      onDeleteFolder={() => {}}
      onMoveNote={() => {}}
      onMoveFolder={() => {}}
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
    const { onCreateNote } = renderSidebar("Fieldwork/Soil surveys");

    fireEvent.click(screen.getByText("New Note"));

    expect(onCreateNote).toHaveBeenCalledWith("Fieldwork/Soil surveys");
  });

  it("creates a folder inside the folder you are working in", () => {
    const { onCreateFolder } = renderSidebar("Fieldwork/Soil surveys");

    fireEvent.click(screen.getByLabelText("New folder"));

    expect(onCreateFolder).toHaveBeenCalledWith("Fieldwork/Soil surveys");
  });

  it("falls back to the repository root when no note is open", () => {
    const { onCreateNote } = renderSidebar("", { activePath: null });

    fireEvent.click(screen.getByText("New Note"));

    expect(onCreateNote).toHaveBeenCalledWith("");
  });

  it("says where the note will be created, so it is not a surprise", () => {
    renderSidebar("Fieldwork/Soil surveys");

    expect(screen.getByTitle("New note in Fieldwork/Soil surveys (⌘⇧N)")).toBeTruthy();
  });

  it("still offers the repository root explicitly", () => {
    const { onCreateNote } = renderSidebar("Fieldwork/Soil surveys");

    fireEvent.click(screen.getByLabelText("New note in a folder"));
    fireEvent.click(screen.getByRole("menuitem", { name: "notes" }));

    expect(onCreateNote).toHaveBeenCalledWith("");
  });
});

describe("EditorSidebar — pinned notes", () => {
  const pinned = ["Fieldwork/Soil surveys/introduction.md"];

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
    renderSidebar("", { pinnedPaths: ["Fieldwork/deleted.md"] });
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("can reorder the list, which is the only thing about it anybody chose", () => {
    const onMovePin = vi.fn();
    const two = [...pinned, "Fieldwork/Soil surveys/second.md"];

    renderSidebar("", {
      pinnedPaths: two,
      onMovePin,
      tree: [
        {
          kind: "folder",
          name: "Fieldwork",
          path: "Fieldwork",
          children: [
            {
              kind: "folder",
              name: "Phishing analysis",
              path: "Fieldwork/Soil surveys",
              children: [
                {
                  kind: "file",
                  name: "introduction.md",
                  path: "Fieldwork/Soil surveys/introduction.md",
                },
                {
                  kind: "file",
                  name: "second.md",
                  path: "Fieldwork/Soil surveys/second.md",
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
    expect(onMovePin).toHaveBeenCalledWith("Fieldwork/Soil surveys/second.md", -1);
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
 * It was two controls in one card — the avatar and name navigated to the
 * profile, a gear beside them opened a menu whose first item went to the same
 * profile — with nothing to mark where one ended and the other began. It is
 * one button now, and everything it can do is named in the menu.
 */
describe("the account card", () => {
  const user = { login: "praneeth132006", name: "Praneeth", avatarUrl: "https://x/y.png" };

  it("is a single control, whichever part of it you press", () => {
    renderSidebar("", { user });

    // No second control hiding inside the card: the avatar, the name and the
    // gear all belong to the one button.
    const card = screen.getByLabelText("Account");
    expect(card.textContent).toContain("Praneeth");
    expect(card.textContent).toContain("@praneeth132006");
    expect(card.querySelectorAll("a, button")).toHaveLength(0);
  });

  it("offers the profile in the menu rather than under half the card", () => {
    renderSidebar("", { user });

    fireEvent.click(screen.getByLabelText("Account"));

    const link = screen.getByText("Your profile");
    expect(link.getAttribute("href")).toBe("/profile");
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

/**
 * Getting a repository back out of the list.
 *
 * The switcher only ever grew. Anything opened once stayed in it forever — a
 * fork tried and abandoned, someone else's repo read for an afternoon — and
 * the only way to be rid of it was to clear the browser's site data.
 */
describe("EditorSidebar — disconnecting a repository", () => {
  const local: Workspace = {
    ...workspace,
    id: "local",
    name: "On this device",
    isLocal: true,
  };

  it("offers to disconnect a connected repository", () => {
    const onDisconnectRepo = vi.fn();
    renderSidebar("", { onDisconnectRepo });

    fireEvent.click(screen.getByText("notes"));
    fireEvent.click(screen.getByLabelText("Disconnect notes"));

    expect(onDisconnectRepo).toHaveBeenCalledWith(workspace);
  });

  it("leaves the on-device workspace alone", () => {
    // There is nothing to disconnect it from, and it is where notes go when
    // there is nowhere else.
    renderSidebar("", {
      workspaces: [workspace, local],
      onDisconnectRepo: () => {},
    });

    fireEvent.click(screen.getByText("notes"));

    expect(screen.queryByLabelText("Disconnect On this device")).toBeNull();
    expect(screen.getByLabelText("Disconnect notes")).toBeTruthy();
  });

  it("closes the menu once a repository has been sent for disconnection", () => {
    renderSidebar("", { onDisconnectRepo: () => {} });

    fireEvent.click(screen.getByText("notes"));
    fireEvent.click(screen.getByLabelText("Disconnect notes"));

    expect(screen.queryByLabelText("Disconnect notes")).toBeNull();
  });
});
