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
 * Dragging things around the tree.
 *
 * Notes could always be dragged into a folder. Folders could not, so the one
 * reorganisation anybody actually wants — "this whole subject belongs under
 * that one" — meant creating the destination by hand and moving the notes one
 * at a time.
 */
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
