import { describe, expect, it } from "vitest";
import { MemoryNotebook } from "./notebook";
import { createServer, type Tool, type ToolResult } from "./protocol";
import { notebookTools } from "./tools";

const ENCRYPTED =
  "<!-- forkleaf:encrypted v1 -->\n\nThis note is encrypted.\n\n```forkleaf-encrypted\nv=1\nAAAA\n```\n";
const NOW = () => new Date(2026, 8, 13, 10, 0);

function setup(files: Record<string, string>, options: Parameters<typeof notebookTools>[1] = {}) {
  const notebook = new MemoryNotebook(files);
  const tools = notebookTools(notebook, { now: NOW, ...options });
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const run = (name: string, args: Record<string, unknown> = {}) => byName.get(name)!.run(args);
  return { notebook, tools, byName, run };
}

const body = (result: ToolResult) => result.content.map((part) => part.text).join("");

const NOTES = {
  "projects/plan.md":
    "---\ntitle: Launch plan\ntags: [launch]\n---\n\n# Launch plan\n\nShip the beta in October.",
  "projects/notes.md": "# Meeting notes\n\nWe agreed on [[projects/plan|the plan]].",
  "journal/2026-09-12.md": "# Yesterday\n\nRead about kubernetes.",
  "private/diary.md": ENCRYPTED,
  "assets/logo.png": "binary",
};

describe("the notebook tools", () => {
  it("offers five tools, and only the three that read in read-only mode", () => {
    expect(setup(NOTES).tools.map((tool) => tool.name)).toEqual([
      "list_notes",
      "search_notes",
      "read_note",
      "write_note",
      "append_to_daily_note",
    ]);
    const readOnly = setup(NOTES, { readOnly: true }).tools;
    expect(readOnly.map((tool) => tool.name)).toEqual(["list_notes", "search_notes", "read_note"]);
    expect(readOnly.every((tool: Tool) => tool.annotations?.readOnlyHint)).toBe(true);
  });

  describe("list_notes", () => {
    it("lists notes, not other files, optionally within a folder", async () => {
      const { run } = setup(NOTES);
      const all = body(await run("list_notes"));
      expect(all).toContain("4 notes:");
      expect(all).not.toContain("logo.png");
      expect(body(await run("list_notes", { folder: "projects" }))).toBe(
        "2 notes:\nprojects/notes.md\nprojects/plan.md",
      );
      expect(body(await run("list_notes", { folder: "nowhere" }))).toBe("No notes in nowhere/.");
    });
  });

  describe("search_notes", () => {
    it("finds notes by title, tag or body, with the matching line", async () => {
      const { run } = setup(NOTES);
      const found = body(await run("search_notes", { query: "october beta" }));
      expect(found).toContain("1. Launch plan — projects/plan.md");
      expect(found).toContain("Ship the beta in October.");
      expect(body(await run("search_notes", { query: "launch" }))).toContain("projects/plan.md");
    });

    it("never searches inside an encrypted note, and says when nothing matches", async () => {
      const { run } = setup(NOTES);
      expect(body(await run("search_notes", { query: "encrypted" }))).toBe(
        'No note matches "encrypted".',
      );
    });

    it("asks for a query", async () => {
      const { run } = setup(NOTES);
      await expect(run("search_notes", {})).rejects.toThrow(/query is required/);
    });
  });

  describe("read_note", () => {
    it("returns the whole note and the notes that link to it", async () => {
      const { run } = setup(NOTES);
      const text = body(await run("read_note", { path: "projects/plan.md" }));
      expect(text).toContain("title: Launch plan");
      expect(text).toContain("Linked from: projects/notes.md");
    });

    it("does not reveal an encrypted note", async () => {
      const { run } = setup(NOTES);
      const result = await run("read_note", { path: "private/diary.md" });
      expect(body(result)).toContain("is encrypted");
      expect(body(result)).not.toContain("forkleaf-encrypted");
    });

    it("says where to look when the note does not exist", async () => {
      const { run } = setup(NOTES);
      const result = await run("read_note", { path: "projects/missing.md" });
      expect(result.isError).toBe(true);
      expect(body(result)).toContain("search_notes");
    });

    it("refuses paths that are not notes in the notebook", async () => {
      const { run } = setup(NOTES);
      await expect(run("read_note", { path: "../outside.md" })).rejects.toThrow(/`\.\.`/);
      await expect(run("read_note", { path: "projects/../../x.md" })).rejects.toThrow(/`\.\.`/);
      await expect(run("read_note", { path: "assets/logo.png" })).rejects.toThrow(/not a note/);
      await expect(run("read_note", { path: ".github/copilot.md" })).rejects.toThrow(/hidden/);
    });
  });

  describe("write_note", () => {
    it("creates and updates notes as commits, with a message", async () => {
      const { run, notebook } = setup(NOTES);
      expect(body(await run("write_note", { path: "ideas/new.md", content: "# New" }))).toBe(
        "Created ideas/new.md.",
      );
      expect(
        body(
          await run("write_note", {
            path: "/ideas//new.md",
            content: "# New, revised",
            message: "Revise the idea",
          }),
        ),
      ).toBe("Updated ideas/new.md.");
      expect(notebook.commits).toEqual([
        {
          path: "ideas/new.md",
          content: "# New",
          message: "Create ideas/new.md (via an assistant)",
        },
        { path: "ideas/new.md", content: "# New, revised", message: "Revise the idea" },
      ]);
    });

    it("never overwrites an encrypted note it cannot read", async () => {
      const { run, notebook } = setup(NOTES);
      await expect(
        run("write_note", { path: "private/diary.md", content: "oops" }),
      ).rejects.toThrow(/encrypted/);
      expect(notebook.files.get("private/diary.md")).toBe(ENCRYPTED);
    });

    it("requires content, and refuses a note far too large", async () => {
      const { run } = setup(NOTES);
      await expect(run("write_note", { path: "a.md" })).rejects.toThrow(/content/);
      await expect(
        run("write_note", { path: "a.md", content: "x".repeat(1_000_001) }),
      ).rejects.toThrow(/too large/);
    });
  });

  describe("append_to_daily_note", () => {
    it("starts today's note, then adds to it", async () => {
      const { run, notebook } = setup(NOTES);
      expect(body(await run("append_to_daily_note", { text: "- [ ] Call the bank" }))).toBe(
        "Started journal/2026-09-13.md.",
      );
      expect(body(await run("append_to_daily_note", { text: "Bank called back." }))).toBe(
        "Added to journal/2026-09-13.md.",
      );
      expect(notebook.files.get("journal/2026-09-13.md")).toBe(
        "# Sunday, September 13, 2026\n\n- [ ] Call the bank\n\nBank called back.\n",
      );
    });
  });

  describe("a notebook in a folder of the repository", () => {
    it("keeps every read and write inside that folder", async () => {
      const { run, notebook } = setup(
        { "docs/a.md": "# A", "README.md": "# Repository readme" },
        { root: "docs" },
      );
      expect(body(await run("list_notes"))).toBe("1 note:\ndocs/a.md");
      await expect(run("read_note", { path: "README.md" })).rejects.toThrow(/outside/);
      await run("append_to_daily_note", { text: "Hello" });
      expect(notebook.files.has("docs/journal/2026-09-13.md")).toBe(true);
    });
  });

  it("reaches the assistant as a readable error through the protocol", async () => {
    const { tools } = setup(NOTES);
    const handle = createServer({ name: "forkleaf", version: "1" }, tools);
    const response = await handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "write_note", arguments: { path: "../x.md", content: "x" } },
    });
    expect(response!.result).toEqual({
      content: [
        { type: "text", text: "A note path must stay inside the notebook; `..` is not allowed." },
      ],
      isError: true,
    });
  });
});
