import {
  buildLinkGraph,
  deriveTitle,
  isMarkdownPath,
  normalizePath,
  parseDocument,
} from "@forkleaf/markdown-engine";
import { SearchIndex } from "@forkleaf/store";
import type { Notebook, NotebookFile } from "./notebook";
import { ToolInputError, text, type Tool } from "./protocol";

/**
 * What an assistant can do with a ForkLeaf notebook.
 *
 * Five tools, chosen for what people actually ask an assistant to do with their
 * notes: find something, read it, write something down. Writes are ordinary
 * commits in the user's own repository, so every one is in the history and can
 * be undone like any other.
 *
 * What the tools refuse, and say why: paths outside the notebook, files that
 * are not notes, hidden folders like `.github`, and encrypted notes — which are
 * neither shown nor overwritten, because an assistant that cannot read one
 * would only destroy it by writing.
 */

export const INSTRUCTIONS =
  "This is a ForkLeaf notebook: markdown notes in the user's own GitHub repository. " +
  "Notes link to each other with [[wikilinks]]. Search before creating a note that may already exist, " +
  "read a note before replacing it (write_note replaces the whole file), and prefer append_to_daily_note " +
  "for quick captures. Every write is a commit in the user's repository.";

/** The marker ForkLeaf writes at the top of an encrypted note. */
const ENCRYPTED_MARKER = "<!-- forkleaf:encrypted v1 -->";
const isEncrypted = (content: string) => content.trimStart().startsWith(ENCRYPTED_MARKER);

const MAX_NOTE_CHARS = 1_000_000;
const MAX_LISTED = 500;

export interface ToolOptions {
  /** Leave out the tools that write. */
  readOnly?: boolean;
  /** The folder notes live under; every path must be inside it. "" is the whole repository. */
  root?: string;
  /** For tests; defaults to the clock. */
  now?: () => Date;
}

function stringArg(args: Record<string, unknown>, name: string, example: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolInputError(`${name} is required — for example ${example}.`);
  }
  return value;
}

function titleOf(file: NotebookFile): string {
  const parsed = parseDocument(file.content);
  return deriveTitle(parsed.content, parsed.frontmatter.title, file.path);
}

const pad = (value: number) => String(value).padStart(2, "0");
const stamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function notebookTools(notebook: Notebook, options: ToolOptions = {}): Tool[] {
  const root = normalizePath(options.root ?? "");
  const now = options.now ?? (() => new Date());
  const inRoot = (path: string) => root === "" || path.startsWith(`${root}/`);

  /** A path an assistant gave, checked and made canonical. */
  function notePath(value: string): string {
    const raw = value.trim().replace(/\\/g, "/");
    // Checked before normalising: normalising quietly drops `..`, which would
    // turn "../secrets.md" into "secrets.md" instead of refusing it.
    if (raw.split("/").some((segment) => segment.trim() === "..")) {
      throw new ToolInputError("A note path must stay inside the notebook; `..` is not allowed.");
    }
    const path = normalizePath(raw);
    if (!isMarkdownPath(path)) {
      throw new ToolInputError(`${path} is not a note. Only .md and .mdx files can be used.`);
    }
    if (path.split("/").some((segment) => segment.startsWith("."))) {
      throw new ToolInputError(`${path} is in a hidden folder, which is not part of the notebook.`);
    }
    if (!inRoot(path)) {
      throw new ToolInputError(`${path} is outside the notebook folder ${root}/.`);
    }
    return path;
  }

  const tools: Tool[] = [
    {
      name: "list_notes",
      title: "List notes",
      description:
        "List the paths of the notes in the notebook, optionally only those inside one folder.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Only notes inside this folder, e.g. projects" },
        },
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: async (args) => {
        const folder =
          typeof args.folder === "string" ? normalizePath(args.folder.replace(/\\/g, "/")) : "";
        const paths = (await notebook.paths()).filter(
          (path) => inRoot(path) && (folder === "" || path.startsWith(`${folder}/`)),
        );
        if (paths.length === 0) {
          return text(folder ? `No notes in ${folder}/.` : "The notebook has no notes yet.");
        }
        const shown = paths.slice(0, MAX_LISTED);
        const more = paths.length - shown.length;
        return text(
          `${paths.length} note${paths.length === 1 ? "" : "s"}:\n${shown.join("\n")}` +
            (more > 0 ? `\n…and ${more} more. Narrow it with folder.` : ""),
        );
      },
    },
    {
      name: "search_notes",
      title: "Search notes",
      description:
        "Full-text search across every note, ranked, with the line each match was found on. " +
        'Every word must appear; put a phrase in "double quotes" to match it exactly.',
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to look for" },
          limit: { type: "number", description: "At most this many results (1–25, default 10)" },
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: async (args) => {
        const query = stringArg(args, "query", '"deploy runbook"');
        const limit = Math.min(25, Math.max(1, Math.floor(Number(args.limit) || 10)));
        const index = new SearchIndex();
        const files = (await notebook.readAll()).filter(
          (file) => inRoot(file.path) && !isEncrypted(file.content),
        );
        for (const file of files) {
          const parsed = parseDocument(file.content);
          const tags = Array.isArray(parsed.frontmatter.tags)
            ? parsed.frontmatter.tags.filter((tag): tag is string => typeof tag === "string")
            : [];
          index.add({
            id: file.path,
            workspaceId: "notebook",
            path: file.path,
            title: deriveTitle(parsed.content, parsed.frontmatter.title, file.path),
            tags,
            content: parsed.content,
          });
        }
        const hits = index.search(query, { limit, prefixLast: false });
        if (hits.length === 0) return text(`No note matches ${JSON.stringify(query)}.`);
        return text(
          hits
            .map(
              (hit, position) =>
                `${position + 1}. ${hit.title} — ${hit.path}` +
                (hit.snippet ? `\n   ${hit.snippet.text.replace(/\s+/g, " ").trim()}` : ""),
            )
            .join("\n"),
        );
      },
    },
    {
      name: "read_note",
      title: "Read a note",
      description: "Read one note in full, front matter included, with the notes that link to it.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "The note's path, e.g. projects/plan.md" },
        },
        required: ["path"],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: async (args) => {
        const path = notePath(stringArg(args, "path", "projects/plan.md"));
        const content = await notebook.read(path);
        if (content === null) {
          return text(
            `There is no note at ${path}. Use search_notes or list_notes to find it.`,
            true,
          );
        }
        if (isEncrypted(content)) {
          return text(
            `${path} is encrypted. It can only be read in ForkLeaf with its passphrase, and this server does not have it.`,
          );
        }

        const all = (await notebook.readAll()).filter((file) => !isEncrypted(file.content));
        const graph = buildLinkGraph(
          all.map((file) => ({
            path: file.path,
            title: titleOf(file),
            content: parseDocument(file.content).content,
          })),
        );
        const backlinks = [...new Set((graph.backlinks.get(path) ?? []).map((ref) => ref.from))];

        return text(
          `${content}` +
            (backlinks.length > 0
              ? `\n\n---\nLinked from: ${backlinks.join(", ")}`
              : "\n\n---\nNo other note links here."),
        );
      },
    },
  ];

  if (options.readOnly) return tools;

  tools.push(
    {
      name: "write_note",
      title: "Write a note",
      description:
        "Create a note, or replace an existing note's whole content, as one commit. " +
        "Read the note first when replacing it. Encrypted notes cannot be written.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Where the note goes, e.g. projects/plan.md" },
          content: { type: "string", description: "The whole markdown file" },
          message: { type: "string", description: "A short commit message" },
        },
        required: ["path", "content"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      run: async (args) => {
        const path = notePath(stringArg(args, "path", "projects/plan.md"));
        const content = args.content;
        if (typeof content !== "string") throw new ToolInputError("content must be a string.");
        if (content.length > MAX_NOTE_CHARS) {
          throw new ToolInputError("That note is too large to write in one go (over 1 MB).");
        }
        const existing = await notebook.read(path);
        if (existing !== null && isEncrypted(existing)) {
          throw new ToolInputError(
            `${path} is encrypted. This server cannot read it, so it will not overwrite it.`,
          );
        }
        const message =
          typeof args.message === "string" && args.message.trim()
            ? args.message.trim().slice(0, 200)
            : `${existing === null ? "Create" : "Update"} ${path} (via an assistant)`;
        await notebook.write(path, content, message);
        return text(`${existing === null ? "Created" : "Updated"} ${path}.`);
      },
    },
    {
      name: "append_to_daily_note",
      title: "Add to today's note",
      description:
        "Append text to today's journal note (journal/YYYY-MM-DD.md), creating it if needed. " +
        "The quickest way to write something down.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "Markdown to add" } },
        required: ["text"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      run: async (args) => {
        const addition = stringArg(args, "text", "- [ ] Call the bank").trim();
        const today = now();
        const path = normalizePath(`${root}/journal/${stamp(today)}.md`);
        const existing = await notebook.read(path);
        if (existing !== null && isEncrypted(existing)) {
          throw new ToolInputError(`Today's note is encrypted, so nothing was added to it.`);
        }
        const heading = today.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const content =
          existing === null
            ? `# ${heading}\n\n${addition}\n`
            : `${existing.replace(/\s+$/, "")}\n\n${addition}\n`;
        await notebook.write(path, content, `Add to today's note (via an assistant)`);
        return text(`${existing === null ? "Started" : "Added to"} ${path}.`);
      },
    },
  );

  return tools;
}
