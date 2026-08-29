// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import type { TreeNode } from "@forkleaf/types";
import { FileTree } from "./FileTree";

afterEach(cleanup);

const tree: TreeNode[] = [
  {
    kind: "folder",
    name: "Fieldwork",
    path: "Fieldwork",
    children: [{ kind: "file", name: "notes", path: "Fieldwork/notes.md" }],
  },
  {
    kind: "folder",
    name: "OSINT",
    path: "OSINT",
    children: [
      { kind: "file", name: "osint", path: "OSINT/osint.md" },
      {
        kind: "folder",
        name: "Sources",
        path: "OSINT/Sources",
        children: [{ kind: "file", name: "feeds", path: "OSINT/Sources/feeds.md" }],
      },
    ],
  },
];

/** The row `label` sits on — the element carrying the drag handlers. */
function row(label: string): HTMLElement {
  const button = screen.getByText(label).closest("button");
  const element = button?.parentElement;
  if (!element) throw new Error(`no row for ${label}`);
  return element;
}

/**
 * One drag, start to finish.
 *
 * `dataTransfer` is a stub because jsdom does not implement it, and because
 * the component deliberately does not read the payload back during `dragover`
 * — the browser forbids it — so what it does has to be driven by the state the
 * drag start recorded.
 */
function dragOnto(from: string, to: string) {
  const dataTransfer = { setData: vi.fn(), getData: () => from, effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(row(from), { dataTransfer });
  fireEvent.dragOver(row(to), { dataTransfer });
  fireEvent.drop(row(to), { dataTransfer });
}

function draw(props: Partial<React.ComponentProps<typeof FileTree>> = {}) {
  return render(
    <FileTree
      nodes={tree}
      activePath={null}
      onOpen={vi.fn()}
      onDelete={vi.fn()}
      onRename={vi.fn()}
      onCreateIn={vi.fn()}
      onCreateFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      filter=""
      {...props}
    />,
  );
}

/**
 * A sidebar that forgets is one you have to re-navigate on every visit.
 */
describe("which folders are open", () => {
  it("opens the ones the reader had open, and nothing else", () => {
    draw({ openFolders: ["OSINT"] });

    expect(screen.getByText("osint")).toBeTruthy();
    expect(screen.queryByText("notes")).toBeNull();
  });

  it("opens the top level on a first visit, when nothing is remembered", () => {
    draw();

    expect(screen.getByText("osint")).toBeTruthy();
    expect(screen.getByText("notes")).toBeTruthy();
  });

  it("honours an empty record as deliberately closed", () => {
    draw({ openFolders: [] });

    expect(screen.queryByText("osint")).toBeNull();
    expect(screen.queryByText("notes")).toBeNull();
  });

  it("reports what is open, in the order it was opened", () => {
    const onOpenFoldersChange = vi.fn();
    draw({ openFolders: [], onOpenFoldersChange });

    fireEvent.click(screen.getByText("OSINT"));
    fireEvent.click(screen.getByText("Fieldwork"));

    expect(onOpenFoldersChange).toHaveBeenLastCalledWith(["OSINT", "Fieldwork"]);
  });
});

/**
 * Finding a note you just made.
 *
 * A note created into a shut folder was selected, opened in the editor, and
 * nowhere to be seen in the sidebar — so people went looking through GitHub
 * for a file the app had just told them it created.
 */
describe("showing where the selected note lives", () => {
  it("opens every folder above it", () => {
    draw({ openFolders: [], activePath: "OSINT/Sources/feeds.md" });

    expect(screen.getByText("feeds")).toBeTruthy();
  });

  it("does not record them as folders the reader chose to open", () => {
    const onOpenFoldersChange = vi.fn();
    draw({ openFolders: [], activePath: "OSINT/Sources/feeds.md", onOpenFoldersChange });

    expect(onOpenFoldersChange).not.toHaveBeenCalled();
  });

  it("lets a revealed folder be closed again, and leaves it closed", () => {
    draw({ openFolders: [], activePath: "OSINT/Sources/feeds.md" });

    fireEvent.click(screen.getByText("Sources"));

    expect(screen.queryByText("feeds")).toBeNull();
  });

  it("opens them when the selection moves, not only on arrival", () => {
    const { rerender } = draw({ openFolders: [], activePath: null });
    expect(screen.queryByText("notes")).toBeNull();

    rerender(
      <FileTree
        nodes={tree}
        activePath="Fieldwork/notes.md"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onCreateIn={vi.fn()}
        onCreateFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        openFolders={[]}
        filter=""
      />,
    );

    expect(screen.getByText("notes")).toBeTruthy();
  });

  it("leaves a closed tree closed for a note at the top level", () => {
    const onOpenFoldersChange = vi.fn();
    draw({
      nodes: [...tree, { kind: "file", name: "readme", path: "readme.md" }],
      openFolders: [],
      activePath: "readme.md",
      onOpenFoldersChange,
    });

    expect(screen.queryByText("osint")).toBeNull();
    expect(onOpenFoldersChange).not.toHaveBeenCalled();
  });
});

/**
 * Dragging things around the tree.
 *
 * Notes could always be dragged into a folder. Folders could not, so the one
 * reorganisation anybody actually wants — "this whole subject belongs under
 * that one" — meant creating the destination by hand and moving the notes one
 * at a time.
 */
describe("rearranging by hand", () => {
  /** Right-clicks a row and returns the labels its menu offers. */
  function menuFor(label: string): string[] {
    fireEvent.contextMenu(screen.getByText(label), { clientX: 0, clientY: 0 });
    return screen.getAllByRole("menuitem").map((item) => item.textContent ?? "");
  }

  it("offers to move a row down, and reports the siblings it is moving among", () => {
    const onReorder = vi.fn();
    draw({ openFolders: ["OSINT"], onReorder });

    expect(menuFor("Fieldwork")).toContain("Move down");
    fireEvent.click(screen.getByText("Move down"));

    const [siblings, path, direction] = onReorder.mock.calls[0]!;
    expect(siblings.map((node: TreeNode) => node.path)).toEqual(["Fieldwork", "OSINT"]);
    expect([path, direction]).toEqual(["Fieldwork", 1]);
  });

  it("does not offer to move the first row up or the last row down", () => {
    draw({ openFolders: [], onReorder: vi.fn() });

    expect(menuFor("Fieldwork")).not.toContain("Move up");
    cleanup();

    draw({ openFolders: [], onReorder: vi.fn() });
    expect(menuFor("OSINT")).not.toContain("Move down");
  });

  it("moves notes as readily as folders", () => {
    const onReorder = vi.fn();
    draw({ openFolders: ["OSINT"], onReorder });

    expect(menuFor("osint")).toContain("Move down");
  });

  it("says nothing about order for an only child", () => {
    const onReorder = vi.fn();
    draw({ openFolders: ["Fieldwork"], onReorder });

    expect(menuFor("notes")).not.toContain("Move up");
    expect(menuFor("notes")).not.toContain("Move down");
  });

  it("stays quiet while a filter is narrowing the tree, which reorders nothing", () => {
    draw({ filter: "o", onReorder: vi.fn() });

    expect(menuFor("OSINT")).not.toContain("Move down");
  });

  it("offers to reset a folder that was arranged, and only that one", () => {
    const onResetOrder = vi.fn();
    draw({ openFolders: ["OSINT"], onReorder: vi.fn(), onResetOrder, manualFolders: ["OSINT"] });

    expect(menuFor("Fieldwork")).not.toContain("Reset order");
    cleanup();

    draw({ openFolders: ["OSINT"], onReorder: vi.fn(), onResetOrder, manualFolders: ["OSINT"] });
    expect(menuFor("osint")).toContain("Reset order in OSINT");

    fireEvent.click(screen.getByText("Reset order in OSINT"));
    expect(onResetOrder).toHaveBeenCalledWith("OSINT");
  });
});

describe("rearranging by drag", () => {
  it("moves a note into a folder", () => {
    const onMoveNote = vi.fn();
    draw({ openFolders: ["Fieldwork", "OSINT"], onMoveNote });

    dragOnto("notes", "OSINT");

    expect(onMoveNote).toHaveBeenCalledWith("Fieldwork/notes.md", "OSINT");
  });

  it("moves a folder into another folder", () => {
    const onMoveFolder = vi.fn();
    draw({ openFolders: ["Fieldwork", "OSINT"], onMoveFolder });

    dragOnto("Fieldwork", "OSINT");

    expect(onMoveFolder).toHaveBeenCalledWith("Fieldwork", "OSINT");
  });

  it("refuses to drop a folder inside itself", () => {
    const onMoveFolder = vi.fn();
    draw({ openFolders: ["Fieldwork", "OSINT"], onMoveFolder });

    dragOnto("OSINT", "OSINT");

    expect(onMoveFolder).not.toHaveBeenCalled();
  });

  it("refuses to drop a folder into its own descendant", () => {
    // The move that loses notes: renaming `OSINT` to `OSINT/Sources/OSINT`
    // walks the folder into a path underneath itself.
    const onMoveFolder = vi.fn();
    draw({ openFolders: ["Fieldwork", "OSINT"], onMoveFolder });

    dragOnto("OSINT", "Sources");

    expect(onMoveFolder).not.toHaveBeenCalled();
  });

  it("does nothing when the destination is where it already is", () => {
    const onMoveNote = vi.fn();
    draw({ openFolders: ["Fieldwork", "OSINT"], onMoveNote });

    dragOnto("notes", "Fieldwork");

    expect(onMoveNote).not.toHaveBeenCalled();
  });
});
