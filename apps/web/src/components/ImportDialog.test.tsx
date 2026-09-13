// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImportDialog } from "./ImportDialog";

afterEach(cleanup);

function picked(path: string, content: string, type = "text/markdown"): File {
  const file = new File([content], path.split("/").pop()!, { type });
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

function open(over: Partial<React.ComponentProps<typeof ImportDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    taken: [] as string[],
    onImport: vi.fn(async () => ({ notes: 2, assets: 0, failed: [] })),
    onOpenNote: vi.fn(),
    ...over,
  };
  render(<ImportDialog {...props} />);
  return props;
}

function choose(files: File[]) {
  fireEvent.change(screen.getByLabelText("Folder to import"), { target: { files } });
}

describe("ImportDialog", () => {
  it("lets a folder be picked, marked as a directory picker", () => {
    open();
    const input = screen.getByLabelText("Folder to import");
    expect(input.hasAttribute("webkitdirectory")).toBe(true);
  });

  it("shows what an Obsidian vault will bring, then imports it", async () => {
    const props = open();
    choose([
      picked("Vault/one.md", "# One\n\n![[missing.png]]"),
      picked("Vault/Ideas/two.md", "# Two"),
      picked("Vault/.obsidian/app.json", "{}", "application/json"),
      picked("Vault/song.flac", "x", "audio/flac"),
    ]);
    expect(await screen.findByText(/2 notes and 0 files will be imported into/)).toBeTruthy();
    expect(screen.getByText("1 file left out")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Import 2 notes" }));
    await waitFor(() => expect(props.onImport).toHaveBeenCalled());
    const plan = (
      vi.mocked(props.onImport).mock.calls[0] as unknown as [{ notes: { path: string }[] }]
    )[0];
    expect(plan.notes.map((note) => note.path).sort()).toEqual([
      "Imported/Obsidian/Ideas/two.md",
      "Imported/Obsidian/one.md",
    ]);

    expect(await screen.findByText("Imported 2 notes and 0 files.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the first note" }));
    expect(props.onOpenNote).toHaveBeenCalledWith("Imported/Obsidian/one.md");
  });

  it("switches the destination with the source, and honours an edited one", async () => {
    const props = open();
    fireEvent.click(screen.getByRole("radio", { name: "Notion export" }));
    const destination = screen.getByDisplayValue("Imported/Notion");
    fireEvent.change(destination, { target: { value: "From Notion" } });
    choose([picked("Export/Home 0123456789abcdef0123456789abcdef.md", "# Home")]);
    fireEvent.click(await screen.findByRole("button", { name: "Import 1 note" }));
    await waitFor(() => expect(props.onImport).toHaveBeenCalled());
    const plan = (
      vi.mocked(props.onImport).mock.calls[0] as unknown as [{ notes: { path: string }[] }]
    )[0];
    expect(plan.notes[0]!.path).toBe("From Notion/Home.md");
  });

  it("will not import a folder with no notes in it", async () => {
    open();
    choose([picked("Vault/picture.png", "x", "image/png")]);
    expect(await screen.findByText("There are no notes in that folder to import.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Import 0 notes" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("lists what could not be imported", async () => {
    open({
      onImport: vi.fn(async () => ({
        notes: 0,
        assets: 0,
        failed: [{ path: "Imported/Obsidian/one.md", reason: "Storage is full." }],
      })),
    });
    choose([picked("Vault/one.md", "# One")]);
    fireEvent.click(await screen.findByRole("button", { name: "Import 1 note" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("1 item could not be imported");
    expect(alert.textContent).toContain("Storage is full.");
  });
});
