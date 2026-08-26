import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { detectLanguage, evenSpacing, isLinesOfText, looksLikeCode } from "../paste";

/**
 * Pasting things that are not prose.
 *
 * The clipboard is the only content this editor does not shape itself, and
 * what arrives on it is routinely the wrong shape for a note. Two cases came
 * up over and over:
 *
 * A script, or a run of shell commands, pasted as writing — every line its own
 * paragraph, a paragraph's margin between each, no monospace and no
 * highlighting. Selecting the lot afterwards and pressing the code button made
 * it worse: twenty paragraphs became twenty separate code blocks, each one
 * line long.
 *
 * And notes apps, chat clients and code panes that write one `<p>` per *line*.
 * ProseMirror believes the HTML it is given, which is right in general and
 * wrong here: the note ends up as a column of one-line paragraphs, spaced as
 * if every line were a new thought, and closing the gaps by hand runs a second
 * line into the end of the one above it.
 *
 * So: a paste that looks like code becomes one code block, tagged with the
 * language it appears to be in. A paste whose HTML says nothing the plain text
 * does not goes through the markdown parser instead, where a newline is a line
 * break and a bare address becomes a link. Everything else — real headings,
 * lists, tables, images, prose — is left to ProseMirror, which handles it
 * well.
 *
 * The decisions live in `../paste`; this is only the wiring.
 */
export const SmartPaste = Extension.create({
  name: "smartPaste",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("smartPaste"),
        props: {
          handlePaste: (view, event) => {
            const clipboard = (event as ClipboardEvent).clipboardData;
            if (!clipboard) return false;

            // A screenshot is somebody else's job, and it is already done by
            // the time this runs.
            if (clipboard.files?.length) return false;

            // Inside a code block or a diagram, a paste is text and only text.
            // Reshaping it there would be actively destructive.
            if (view.state.selection.$from.parent.type.spec.code) return false;

            const text = evenSpacing(clipboard.getData("text/plain") ?? "");
            if (text === "") return false;

            if (looksLikeCode(text)) {
              event.preventDefault();
              return insertCodeBlock(view, text, detectLanguage(text));
            }

            const html = clipboard.getData("text/html") ?? "";
            if (html !== "" && isLinesOfText(html, parseHtml)) {
              event.preventDefault();
              return insertAsMarkdown(view, text);
            }

            return false;
          },
        },
      }),
    ];
  },
});

/** The clipboard's HTML, read as a document rather than as a string. */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** One code block holding the whole paste, however many lines it runs to. */
function insertCodeBlock(view: EditorView, text: string, language: string): boolean {
  const type = view.state.schema.nodes.codeBlock;
  if (!type) return false;

  const node = type.create(language ? { language } : null, view.state.schema.text(text));
  const tr = view.state.tr.replaceSelectionWith(node);

  /**
   * Somewhere to carry on writing.
   *
   * A code block that ends the document is a wall: there is no block after it
   * to put the caret in, so the note is finished whether or not its author
   * was. A paste should never be able to do that.
   */
  const end = tr.selection.$to;
  if (end.pos >= tr.doc.content.size - 1) {
    const paragraph = view.state.schema.nodes.paragraph?.create();
    if (paragraph) tr.insert(tr.doc.content.size, paragraph);
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * The plain text, read as markdown.
 *
 * Exactly the path a text-only paste already takes — `clipboardTextParser` is
 * the markdown extension's own hook — so a paste that carries useless HTML
 * lands identically to the same paste without it, rather than in some third
 * shape invented here.
 */
function insertAsMarkdown(view: EditorView, text: string): boolean {
  const slice = view.someProp("clipboardTextParser", (parser) =>
    parser(text, view.state.selection.$from, false, view),
  );
  if (!slice) return false;

  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
}
