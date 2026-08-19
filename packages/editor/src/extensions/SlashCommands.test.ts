import { describe, expect, it } from "vitest";
import { SLASH_COMMANDS, filterSlashCommands, readSlashState } from "./SlashCommands";
import type { Editor } from "@tiptap/core";

/**
 * When the `/` menu opens is a question with a wrong answer in both
 * directions: too eager and it fires inside every URL someone pastes, too shy
 * and the feature the placeholder text advertises does not appear.
 *
 * `readSlashState` holds those rules, and this exercises them against a fake
 * selection rather than a real ProseMirror document — the rules are about text
 * before the caret, and nothing else in the editor participates.
 */

/** The slice of Tiptap's editor that `readSlashState` actually reads. */
function fakeEditor(textBefore: string, options: { empty?: boolean; blockStart?: number } = {}) {
  const { empty = true, blockStart = 1 } = options;

  return {
    state: {
      selection: {
        empty,
        $from: {
          parent: { textBetween: () => textBefore },
          parentOffset: textBefore.length,
          start: () => blockStart,
        },
      },
    },
  } as unknown as Editor;
}

describe("readSlashState", () => {
  it("opens on a slash at the start of a block", () => {
    expect(readSlashState(fakeEditor("/"))).toMatchObject({ active: true, query: "" });
  });

  it("captures what has been typed after the slash", () => {
    expect(readSlashState(fakeEditor("/diag"))).toMatchObject({ active: true, query: "diag" });
  });

  it("opens after a space, so a slash mid-sentence still works", () => {
    expect(readSlashState(fakeEditor("see /tab"))).toMatchObject({ active: true, query: "tab" });
  });

  it("stays shut inside a URL, where a slash means a path separator", () => {
    expect(readSlashState(fakeEditor("https://example.com/docs")).active).toBe(false);
  });

  it("stays shut mid-word", () => {
    expect(readSlashState(fakeEditor("and/or")).active).toBe(false);
  });

  it("closes once the user types a space — they moved on to prose", () => {
    expect(readSlashState(fakeEditor("/diagram of")).active).toBe(false);
  });

  it("stays shut when there is no slash at all", () => {
    expect(readSlashState(fakeEditor("just writing")).active).toBe(false);
  });

  it("stays shut while text is selected, where there is no single caret", () => {
    expect(readSlashState(fakeEditor("/", { empty: false })).active).toBe(false);
  });

  it("uses the last slash, so a second one restarts the query", () => {
    expect(readSlashState(fakeEditor("/head /tab"))).toMatchObject({ query: "tab" });
  });

  it("reports the document position of the slash, which is what gets replaced", () => {
    // Block starts at 10, the slash is the fifth character in "see /tab".
    expect(readSlashState(fakeEditor("see /tab", { blockStart: 10 })).from).toBe(14);
  });
});

describe("filterSlashCommands", () => {
  it("returns everything when nothing has been typed yet", () => {
    expect(filterSlashCommands("")).toEqual(SLASH_COMMANDS);
  });

  it("matches on the title", () => {
    expect(filterSlashCommands("heading").length).toBeGreaterThan(0);
  });

  it("matches on keywords", () => {
    const titles = filterSlashCommands("mermaid").map((command) => command.title);
    expect(titles).toContain("Diagram");
  });

  it("is case-insensitive", () => {
    expect(filterSlashCommands("DIAGRAM")).toEqual(filterSlashCommands("diagram"));
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filterSlashCommands("zzzznothing")).toEqual([]);
  });

  it("gives every command a title, an icon and something to run", () => {
    for (const command of SLASH_COMMANDS) {
      expect(command.title).toBeTruthy();
      expect(command.icon).toBeTruthy();
      expect(typeof command.run).toBe("function");
    }
  });

  it("has no two commands with the same title, which would be unpickable", () => {
    const titles = SLASH_COMMANDS.map((command) => command.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
