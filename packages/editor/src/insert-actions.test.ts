import { describe, expect, it } from "vitest";
import {
  INSERT_DEFINITIONS,
  filterInsertActions,
  insertActionsFor,
  insertDefinitionsFor,
  runSourceAction,
} from "./insert-actions";
import type { SourceEditorHandle } from "./SourceEditor";

/** Records what a toolbar press asks the raw-markdown editor to do. */
function fakeHandle(selection = "") {
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
    };

  const handle = {
    insertAtCursor: record("insertAtCursor"),
    focus: record("focus"),
    wrapSelection: record("wrapSelection"),
    toggleLinePrefix: record("toggleLinePrefix"),
    indent: record("indent"),
    undo: record("undo"),
    redo: record("redo"),
    canUndo: () => false,
    canRedo: () => false,
    selection: () => selection,
    currentLine: () => "",
  } as unknown as SourceEditorHandle;

  return { handle, calls };
}

/**
 * The insert menu is the `/` menu, and it is the main way anything other than
 * plain prose gets into a note. It had no tests at all — so a definition that
 * claimed to work in the source editor while emitting nothing, or a keyword
 * nobody could search by, would have shipped silently.
 */

describe("insertDefinitionsFor", () => {
  it("gives the rich surface everything not marked source-only", () => {
    const rich = insertDefinitionsFor("rich").map((definition) => definition.id);
    const sourceOnly = INSERT_DEFINITIONS.filter(
      (definition) => definition.availableIn === "source",
    ).map((definition) => definition.id);

    for (const id of sourceOnly) expect(rich).not.toContain(id);
  });

  it("never offers a surface an action that surface cannot apply", () => {
    for (const definition of insertDefinitionsFor("source")) {
      expect(definition.availableIn ?? "both").not.toBe("rich");
    }
  });

  it("has no duplicate ids, which would make `run` pick one arbitrarily", () => {
    const ids = INSERT_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every definition markdown to insert in the source editor", () => {
    for (const definition of insertDefinitionsFor("source")) {
      // `link` and `image` prompt for a URL instead, and are handled separately.
      if (definition.id === "link" || definition.id === "image") continue;
      expect(definition.markdown.text, `${definition.id} inserts nothing`).not.toBe("");
    }
  });

  it("keeps every caret offset inside the text it belongs to", () => {
    // `cursor` is optional — omitting it means "leave the caret at the end".
    // An offset past the end of the snippet would put it outside the document.
    for (const definition of INSERT_DEFINITIONS) {
      if (definition.markdown.cursor === undefined) continue;
      expect(definition.markdown.cursor).toBeGreaterThanOrEqual(0);
      expect(definition.markdown.cursor).toBeLessThanOrEqual(definition.markdown.text.length);
    }
  });
});

describe("insertActionsFor", () => {
  it("strips the apply functions, so the toolbar cannot hold a stale editor", () => {
    for (const action of insertActionsFor("rich")) {
      expect(action).not.toHaveProperty("rich");
      expect(action).not.toHaveProperty("markdown");
    }
  });

  it("carries the label and icon the toolbar renders", () => {
    for (const action of insertActionsFor("rich")) {
      expect(action.label).toBeTruthy();
      expect(action.icon).toBeTruthy();
    }
  });
});

describe("filterInsertActions", () => {
  it("returns everything available when nothing is typed", () => {
    expect(filterInsertActions("", "rich")).toEqual(insertDefinitionsFor("rich"));
    expect(filterInsertActions("   ", "rich")).toEqual(insertDefinitionsFor("rich"));
  });

  it("matches on the label, case-insensitively", () => {
    const ids = filterInsertActions("TABLE", "rich").map((action) => action.id);
    expect(ids).toContain("table");
  });

  it("matches on keywords, which is the point of having them", () => {
    const ids = filterInsertActions("mermaid", "rich").map((action) => action.id);
    expect(ids).toContain("diagram");
  });

  it("never returns an action the surface cannot apply", () => {
    const sourceOnly = INSERT_DEFINITIONS.find((definition) => definition.availableIn === "source");

    if (sourceOnly) {
      const ids = filterInsertActions(sourceOnly.label, "rich").map((action) => action.id);
      expect(ids).not.toContain(sourceOnly.id);
    }
  });

  it("returns nothing rather than everything for a query that matches nothing", () => {
    expect(filterInsertActions("zzzznothing", "rich")).toEqual([]);
  });
});

describe("runSourceAction", () => {
  it("wraps the selection for an inline mark instead of typing empty markers", () => {
    const { handle, calls } = fakeHandle("important");
    runSourceAction(handle, "bold");

    expect(calls).toEqual([{ name: "wrapSelection", args: ["**"] }]);
  });

  it("toggles a line prefix for a block style, so levels replace rather than stack", () => {
    const { handle, calls } = fakeHandle();
    runSourceAction(handle, "h2");

    expect(calls[0]?.name).toBe("toggleLinePrefix");
    expect(calls[0]?.args[0]).toBe("## ");
  });

  it("types its snippet for anything with no selection behaviour", () => {
    const { handle, calls } = fakeHandle();
    runSourceAction(handle, "table");

    expect(calls[0]?.name).toBe("insertAtCursor");
    expect(String(calls[0]?.args[0])).toContain("| --- |");
  });

  it("hands images and links to the app, which knows where files go", () => {
    const { handle, calls } = fakeHandle();
    let asked = "";

    runSourceAction(handle, "image", { requestImage: () => (asked = "image") });
    expect(asked).toBe("image");

    runSourceAction(handle, "link", { requestLink: () => (asked = "link") });
    expect(asked).toBe("link");

    // Neither reached the editor directly.
    expect(calls).toEqual([]);
  });

  it("does nothing at all without a live editor", () => {
    expect(() => runSourceAction(null, "bold")).not.toThrow();
  });
});

describe("source definitions", () => {
  it("gives every heading, list and quote a selection-aware behaviour", () => {
    const shouldToggle = ["h1", "h2", "h3", "h4", "h5", "h6", "bullet", "ordered", "task", "quote"];

    for (const id of shouldToggle) {
      const definition = INSERT_DEFINITIONS.find((item) => item.id === id);
      expect(definition?.source, `${id} has no source behaviour`).toBeTypeOf("function");
    }
  });

  it("gives every inline mark one too", () => {
    for (const id of ["bold", "italic", "strike", "inline-code"]) {
      const definition = INSERT_DEFINITIONS.find((item) => item.id === id);
      expect(definition?.source, `${id} has no source behaviour`).toBeTypeOf("function");
    }
  });
});
