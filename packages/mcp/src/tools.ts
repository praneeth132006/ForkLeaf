import {
  buildLinkGraph,
  deriveTitle,
  isMarkdownPath,
  normalizePath,
  parseDocument,
} from "@forkleaf/markdown-engine";
import { SearchIndex } from "@forkleaf/store";
import { singleNotebook, type NotebookLibrary, type OpenedNotebook } from "./library";
import type { Notebook, NotebookFile } from "./notebook";
import { ToolInputError, text, type Tool } from "./protocol";

/**
 * What an assistant can do with a ForkLeaf notebook.
 *
 * Six tools, chosen for what people actually ask an assistant to do with their
 * notes: find something, read it, write something down — and see which of
 * their repositories it can do that in. Writes are ordinary commits in the
 * user's own repository, so every one is in the history and can be undone like
 * any other.
 *
 * Two things the tools insist on, because without them people lost track of
 * what an assistant had written: every write says which repository and path it
 * went to, with a link; and a new note goes beside the notes already there, in
 * `inbox/`, or at the top — never into a folder the assistant made up, unless
 * the person asked for one.
 *
 * What the tools refuse, and say why: paths outside the notebook, files that
 * are not notes, hidden folders like `.github`, and encrypted notes — which are
 * neither shown nor overwritten, because an assistant that cannot read one
 * would only destroy it by writing.
 */

export const INSTRUCTIONS =
  "This is a ForkLeaf notebook: markdown notes in the user's own GitHub repositories. " +
  "Notes link to each other with [[wikilinks]]. Search before creating a note that may already exist, " +
  "and read a note before replacing it (write_note replaces the whole file). " +
  "Put a new note beside related notes — list_notes shows the folders. If the user did not say where " +
  "and nothing fits, put it in inbox/. Do not invent new folders unless the user asks for one. " +
  "Prefer append_to_daily_note for quick captures. " +
  "Tools use the default repository unless you pass repository; list_repositories shows which ones you can use. " +
  "After every write, tell the user the repository and the full path of the note, and give the link the tool returns. " +
  "Every write is a commit in the user's repository.";

/** Where notes go when nobody said where: the same folder ForkLeaf's own captures use. */
export const INBOX_FOLDER = "inbox";

/** The marker ForkLeaf writes at the top of an encrypted note. */
/**
 * Every version of encrypted note — under a passphrase (v1) or for people
 * (v2). An assistant must neither read one as prose nor write over it, and a
 * check for v1 alone would have let it do both to a v2 note.
 */
const isEncrypted = (content: string) =>
  /^<!-- forkleaf:encrypted v\d+ -->/.test(content.trimStart());

const MAX_NOTE_CHARS = 1_000_000;
const MAX_LISTED = 500;

export interface ToolOptions {
  /** Leave out the tools that write. */
  readOnly?: boolean;
  /**
   * The folder notes live under; every path must be inside it. "" is the whole
   * repository. Only for a single notebook — a library knows each one's own.
   */
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

const isLibrary = (source: Notebook | NotebookLibrary): source is NotebookLibrary =>
  "open" in source && typeof source.open === "function";

/** The folder a path is in, "" at the top. */
const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

export function notebookTools(
  source: Notebook | NotebookLibrary,
  options: ToolOptions = {},
): Tool[] {
  const library = isLibrary(source)
    ? source
    : singleNotebook(source, {
        root: options.root ?? "",
        ...(options.readOnly !== undefined ? { readOnly: options.readOnly } : {}),
      });
  const now = options.now ?? (() => new Date());

  /** The notebook a call is about: the one it names, or the default. */
  async function opened(args: Record<string, unknown>): Promise<OpenedNotebook> {
    const named = typeof args.repository === "string" ? args.repository.trim() : "";
    return library.open(named || undefined);
  }

  const rootOf = (open: OpenedNotebook) => normalizePath(open.root);
  const inRoot = (open: OpenedNotebook, path: string) => {
    const root = rootOf(open);
    return root === "" || path.startsWith(`${root}/`);
  };

  /**
   * " in owner/name", so every answer says which repository it is about. Left
   * out for a notebook that is not a repository, where there is nothing to say.
   */
  const where = (open: OpenedNotebook) =>
    open.repository === "notebook" ? "" : ` in ${open.repository}`;

  /** The answer to a write: where it went, and a link a person can follow. */
  const written = (open: OpenedNotebook, verb: string, path: string) => {
    const link = open.link(path);
    return text(`${verb} ${path}${where(open)}.` + (link ? `\nOpen it: ${link}` : ""));
  };

  /** A path an assistant gave, checked and made canonical. */
  function notePath(open: OpenedNotebook, value: string): string {
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
    if (!inRoot(open, path)) {
      throw new ToolInputError(`${path} is outside the notebook folder ${rootOf(open)}/.`);
    }
    return path;
  }

  /**
   * Refuses a new note in a folder that does not exist yet, unless asked.
   *
   * This is what stopped notes landing "somewhere random": an assistant left
   * to choose a path would invent `notes/ai/2026/thoughts.md`, and the person
   * then had to go looking for a folder they never made. The top of the
   * notebook, `inbox/`, and any folder that already holds a note are always
   * fine; anything else needs `new_folder: true`, which the tool description
   * reserves for when the person asked for it.
   */
  async function checkFolder(open: OpenedNotebook, path: string, allowNew: boolean) {
    const root = rootOf(open);
    const folder = folderOf(path);
    const inbox = normalizePath(`${root}/${INBOX_FOLDER}`);
    if (allowNew || folder === root || folder === inbox || folder.startsWith(`${inbox}/`)) return;

    const folders = new Set<string>();
    for (const each of await open.notebook.paths()) {
      if (!inRoot(open, each)) continue;
      for (let at = folderOf(each); at && at !== root; at = folderOf(at)) folders.add(at);
    }
    if (folders.has(folder)) return;

    const known = [...folders].sort();
    throw new ToolInputError(
      `${folder}/ does not exist${where(open)}, so the note was not written. ` +
        `Put it in an existing folder${known.length ? ` (${known.slice(0, 40).join(", ")}${known.length > 40 ? ", …" : ""})` : ""}, ` +
        `in ${inbox}/, or at the top. Pass new_folder: true only if the user asked for a new folder.`,
    );
  }

  /** Added to every tool's input when there is more than one repository to choose from. */
  const repositoryProperty = library.multiple
    ? {
        repository: {
          type: "string",
          description: `Which repository, as owner/name. Leave it out for ${library.defaultRepository}. See list_repositories.`,
        },
      }
    : {};

  const tools: Tool[] = [
    {
      name: "list_repositories",
      title: "List repositories",
      description:
        "List the repositories this connection can use, which one is the default, and which can be written to.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: async () => {
        const repositories = await library.repositories();
        const lines = repositories.map(
          (entry) =>
            `${entry.name}${entry.isDefault ? " (default)" : ""}${entry.writable ? "" : " — read only"}`,
        );
        return text(
          lines.join("\n") +
            (library.multiple
              ? "\nPass repository: owner/name to any tool to use one that is not the default."
              : `\nThis connection only covers ${library.defaultRepository}. To use other repositories, ` +
                `the user can remove ForkLeaf from the assistant and connect again with "Also let it use my other repositories" ticked.`),
        );
      },
    },
    {
      name: "list_notes",
      title: "List notes",
      description:
        "List the paths of the notes in the notebook, optionally only those inside one folder.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Only notes inside this folder, e.g. projects" },
          ...repositoryProperty,
        },
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: async (args) => {
        const open = await opened(args);
        const folder =
          typeof args.folder === "string" ? normalizePath(args.folder.replace(/\\/g, "/")) : "";
        const paths = (await open.notebook.paths()).filter(
          (path) => inRoot(open, path) && (folder === "" || path.startsWith(`${folder}/`)),
        );
        if (paths.length === 0) {
          return text(
            folder
              ? `No notes in ${folder}/${where(open)}.`
              : `The notebook${where(open)} has no notes yet.`,
          );
        }
        const shown = paths.slice(0, MAX_LISTED);
        const more = paths.length - shown.length;
        return text(
          `${paths.length} note${paths.length === 1 ? "" : "s"}${where(open)}:\n${shown.join("\n")}` +
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
          ...repositoryProperty,
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: async (args) => {
        const open = await opened(args);
        const query = stringArg(args, "query", '"deploy runbook"');
        const limit = Math.min(25, Math.max(1, Math.floor(Number(args.limit) || 10)));
        const index = new SearchIndex();
        const files = (await open.notebook.readAll()).filter(
          (file) => inRoot(open, file.path) && !isEncrypted(file.content),
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
        if (hits.length === 0) {
          return text(`No note${where(open)} matches ${JSON.stringify(query)}.`);
        }
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
          ...repositoryProperty,
        },
        required: ["path"],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: async (args) => {
        const open = await opened(args);
        const path = notePath(open, stringArg(args, "path", "projects/plan.md"));
        const content = await open.notebook.read(path);
        if (content === null) {
          return text(
            `There is no note at ${path}${where(open)}. Use search_notes or list_notes to find it.`,
            true,
          );
        }
        if (isEncrypted(content)) {
          return text(
            `${path} is encrypted. It can only be read in ForkLeaf with its passphrase, and this server does not have it.`,
          );
        }

        const all = (await open.notebook.readAll()).filter((file) => !isEncrypted(file.content));
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
        "Read the note first when replacing it. Encrypted notes cannot be written. " +
        `A new note goes in a folder that already exists, in ${INBOX_FOLDER}/ when the user did not say where, ` +
        "or at the top. Returns where it went and a link — tell the user both.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Where the note goes, e.g. projects/plan.md" },
          content: { type: "string", description: "The whole markdown file" },
          message: { type: "string", description: "A short commit message" },
          new_folder: {
            type: "boolean",
            description:
              "Allow creating a folder that does not exist yet. Only when the user asked.",
          },
          ...repositoryProperty,
        },
        required: ["path", "content"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      run: async (args) => {
        const open = await opened(args);
        if (open.readOnly) {
          throw new ToolInputError(`${open.repository} is read only for this connection.`);
        }
        const path = notePath(open, stringArg(args, "path", "projects/plan.md"));
        const content = args.content;
        if (typeof content !== "string") throw new ToolInputError("content must be a string.");
        if (content.length > MAX_NOTE_CHARS) {
          throw new ToolInputError("That note is too large to write in one go (over 1 MB).");
        }
        const existing = await open.notebook.read(path);
        if (existing !== null && isEncrypted(existing)) {
          throw new ToolInputError(
            `${path} is encrypted. This server cannot read it, so it will not overwrite it.`,
          );
        }
        if (existing === null) await checkFolder(open, path, args.new_folder === true);
        const message =
          typeof args.message === "string" && args.message.trim()
            ? args.message.trim().slice(0, 200)
            : `${existing === null ? "Create" : "Update"} ${path} (via an assistant)`;
        await open.notebook.write(path, content, message);
        return written(open, existing === null ? "Created" : "Updated", path);
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
        properties: {
          text: { type: "string", description: "Markdown to add" },
          ...repositoryProperty,
        },
        required: ["text"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      run: async (args) => {
        const open = await opened(args);
        if (open.readOnly) {
          throw new ToolInputError(`${open.repository} is read only for this connection.`);
        }
        const addition = stringArg(args, "text", "- [ ] Call the bank").trim();
        const today = now();
        const path = normalizePath(`${rootOf(open)}/journal/${stamp(today)}.md`);
        const existing = await open.notebook.read(path);
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
        await open.notebook.write(path, content, `Add to today's note (via an assistant)`);
        return written(open, existing === null ? "Started" : "Added to", path);
      },
    },
  );

  return tools;
}
