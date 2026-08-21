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
    name: "SOC 101",
    path: "SOC 101",
    children: [{ kind: "file", name: "notes", path: "SOC 101/notes.md" }],
  },
  {
    kind: "folder",
    name: "OSINT",
    path: "OSINT",
    children: [{ kind: "file", name: "osint", path: "OSINT/osint.md" }],
  },
];

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
    fireEvent.click(screen.getByText("SOC 101"));

    expect(onOpenFoldersChange).toHaveBeenLastCalledWith(["OSINT", "SOC 101"]);
  });
});
