import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

/**
 * When the `/` block menu should be open.
 *
 * The menu's *contents* live in `insert-actions`, which is the single list the
 * toolbar, the rich-text menu and the raw-markdown menu all read. This file
 * once carried a second, parallel list of commands, and the two had already
 * drifted — the older one still inserted images through a `window.prompt`. Only
 * the trigger rules belong here.
 */

/**
 * Tracks whether a slash menu should be open.
 *
 * The trigger rules live here rather than in the React component so they can be
 * unit tested: the menu opens on `/` at the start of an empty-ish paragraph and
 * closes as soon as the query stops matching anything.
 */
export interface SlashState {
  active: boolean;
  query: string;
  /** Document position of the `/` character. */
  from: number;
}

export function readSlashState(editor: Editor): SlashState {
  const { state } = editor;
  const { $from, empty } = state.selection;

  if (!empty) return { active: false, query: "", from: 0 };

  // Only consider the text between the start of the block and the cursor.
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const slashIndex = textBefore.lastIndexOf("/");
  if (slashIndex === -1) return { active: false, query: "", from: 0 };

  // A slash mid-word (as in a URL or a path) should not open the menu.
  const charBefore = slashIndex > 0 ? textBefore[slashIndex - 1] : "";
  if (charBefore && !/\s/.test(charBefore)) return { active: false, query: "", from: 0 };

  const query = textBefore.slice(slashIndex + 1);
  // A space ends the query — the user moved on to writing prose.
  if (/\s/.test(query)) return { active: false, query: "", from: 0 };

  return {
    active: true,
    query,
    from: $from.start() + slashIndex,
  };
}

/** No-op extension kept so the menu can later attach ProseMirror plugins. */
export const SlashCommands = Extension.create({
  name: "slashCommands",
});
