// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { carriesOpenableFile, isPdfName, isTextName, readDroppedFiles } from "./local-files";

/** A drop as the browser builds one: an item per file, with or without a handle. */
function transferOf(files: File[], handles?: (FileSystemHandle | null)[]): DataTransfer {
  return {
    files: files as unknown as FileList,
    items: files.map((file, index) => ({
      kind: "file",
      getAsFile: () => file,
      ...(handles ? { getAsFileSystemHandle: () => Promise.resolve(handles[index] ?? null) } : {}),
    })) as unknown as DataTransferItemList,
  } as DataTransfer;
}

describe("file names", () => {
  it("opens markdown and plain text as notes", () => {
    for (const name of ["a.md", "B.MARKDOWN", "c.mdown", "d.mkd", "e.mdx", "f.txt", "g.text"]) {
      expect(isTextName(name)).toBe(true);
    }
    expect(isTextName("paper.pdf")).toBe(false);
    expect(isTextName("photo.png")).toBe(false);
    expect(isTextName("md")).toBe(false);
  });

  it("sends PDFs to the reader", () => {
    expect(isPdfName("Paper.PDF")).toBe(true);
    expect(isPdfName("notes.md")).toBe(false);
  });
});

describe("readDroppedFiles", () => {
  it("opens a dropped markdown file as a note, with no handle where the browser gives none", async () => {
    const opened = await readDroppedFiles(
      transferOf([new File(["# Hello\n"], "hello.md", { type: "text/markdown" })]),
    );

    expect(opened).toEqual([{ kind: "text", handle: null, name: "hello.md", text: "# Hello\n" }]);
  });

  it("keeps the handle Chromium gives, so the note saves back to its file", async () => {
    const file = new File(["from disk"], "disk.md");
    const handle = {
      kind: "file",
      name: "disk.md",
      getFile: () => Promise.resolve(file),
    } as unknown as FileSystemFileHandle;

    const [opened] = await readDroppedFiles(transferOf([file], [handle]));

    expect(opened).toMatchObject({ kind: "text", handle, name: "disk.md", text: "from disk" });
  });

  it("opens a PDF and a note from one drop, and skips what it cannot open", async () => {
    const opened = await readDroppedFiles(
      transferOf([
        new File(["%PDF-1.7"], "paper.pdf", { type: "application/pdf" }),
        new File(["x"], "photo.png", { type: "image/png" }),
        new File(["plain"], "todo.txt", { type: "text/plain" }),
      ]),
    );

    expect(opened.map((entry) => [entry.kind, entry.name])).toEqual([
      ["pdf", "paper.pdf"],
      ["text", "todo.txt"],
    ]);
  });
});

describe("carriesOpenableFile", () => {
  it("is true only for a drag with a file ForkLeaf opens", () => {
    expect(carriesOpenableFile(transferOf([new File([""], "a.md")]))).toBe(true);
    expect(carriesOpenableFile(transferOf([new File([""], "a.png")]))).toBe(false);
    expect(carriesOpenableFile(null)).toBe(false);
  });
});
