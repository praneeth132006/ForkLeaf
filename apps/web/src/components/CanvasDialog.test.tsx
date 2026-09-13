// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CanvasDialog } from "./CanvasDialog";

afterEach(cleanup);

const BOARD = JSON.stringify({
  nodes: [
    { id: "a", type: "text", text: "First idea", x: 0, y: 0, width: 200, height: 100 },
    { id: "b", type: "file", file: "notes/Plan.md", x: 300, y: 0, width: 250, height: 120 },
  ],
  edges: [{ id: "e", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" }],
});

const NOTES = [
  { path: "notes/Plan.md", title: "Plan", excerpt: "Ship in October" },
  { path: "notes/Risks.md", title: "Risks", excerpt: "Budget and hiring" },
];

function open(over: Partial<React.ComponentProps<typeof CanvasDialog>> = {}) {
  const props = {
    path: "canvases/Launch.canvas",
    onClose: vi.fn(),
    load: vi.fn(async () => BOARD as string | null),
    save: vi.fn(async (text: string) => void text),
    notes: NOTES,
    onOpenNote: vi.fn(),
    ...over,
  };
  const view = render(<CanvasDialog {...props} />);
  return { props, container: view.container };
}

const lastSaved = (save: (text: string) => Promise<void>) =>
  JSON.parse(vi.mocked(save).mock.calls.at(-1)![0]) as {
    nodes: { id: string; type: string; file?: string }[];
    edges: { id: string }[];
  };

describe("CanvasDialog", () => {
  it("shows the cards, notes and connections in the file", async () => {
    open();
    expect(await screen.findByText("First idea")).toBeTruthy();
    expect(screen.getByText("Plan")).toBeTruthy();
    expect(screen.getByText("Ship in October")).toBeTruthy();
    expect(document.querySelectorAll("[data-edge-id]")).toHaveLength(1);
  });

  it("adds a card and saves the board as JSON Canvas", async () => {
    const { props } = open();
    await screen.findByText("First idea");
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    fireEvent.change(screen.getByLabelText("Card text"), { target: { value: "Second idea" } });

    await waitFor(() => expect(props.save).toHaveBeenCalled(), { timeout: 2000 });
    const saved = lastSaved(props.save);
    expect(saved.nodes).toHaveLength(3);
    expect(saved.nodes.at(-1)).toMatchObject({ type: "text", text: "Second idea" });
    expect(vi.mocked(props.save).mock.calls.at(-1)![0]).toContain('\n\t"nodes"');
  });

  it("deletes the selected card along with its connections", async () => {
    const { props } = open();
    const card = (await screen.findByText("First idea")).closest("[data-node-id]")!;
    fireEvent.pointerDown(card);
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => expect(props.save).toHaveBeenCalled(), { timeout: 2000 });
    const saved = lastSaved(props.save);
    expect(saved.nodes.map((node) => node.id)).toEqual(["b"]);
    expect(saved.edges).toEqual([]);
  });

  it("places a note on the board, and opens it from there", async () => {
    const { props } = open();
    await screen.findByText("First idea");
    fireEvent.change(screen.getByLabelText("Add a note"), { target: { value: "notes/Risks.md" } });
    expect(await screen.findByText("Budget and hiring")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open Risks" }));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onOpenNote).toHaveBeenCalledWith("notes/Risks.md");
    // The change was written on the way out rather than lost.
    expect(lastSaved(props.save).nodes.some((node) => node.file === "notes/Risks.md")).toBe(true);
  });

  it("adds a link only when it is an http address", async () => {
    open();
    await screen.findByText("First idea");
    const add = screen.getByRole("button", { name: "Add link" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Link to add"), {
      target: { value: "javascript:alert(1)" },
    });
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Link to add"), {
      target: { value: "example.com/page" },
    });
    fireEvent.click(add);
    expect(await screen.findByText("https://example.com/page")).toBeTruthy();
  });

  it("will not show, or overwrite, a file that is not a canvas", async () => {
    const { props } = open({ load: vi.fn(async () => "# A note, not a canvas") });
    expect(await screen.findByText(/not valid JSON Canvas/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add card" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(props.save).not.toHaveBeenCalled();
  });

  it("starts an empty board for a new file, and saves nothing until something changes", async () => {
    const { props } = open({ load: vi.fn(async () => null) });
    expect(await screen.findByText(/Double-click anywhere to add a card/)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(props.save).not.toHaveBeenCalled();
  });
});
