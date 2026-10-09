// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { highlightPage } from "./highlight.js";
import { MAX_PER_PAGE, pageKey, remember } from "./highlight-store.js";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

const marks = () => [...document.querySelectorAll("mark.forkleaf-highlight")];
const marked = () =>
  marks()
    .map((mark) => mark.textContent)
    .join("");

describe("highlightPage", () => {
  it("marks the selection, across elements, and returns its words", () => {
    document.body.innerHTML = "<p id=p>Rivers <b>move slowly</b> to the sea.</p>";
    const p = document.getElementById("p")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.querySelector("b")!.firstChild!, 4);
    window.getSelection()!.addRange(range);

    const result = highlightPage([], true);

    expect(result.marked).toBe("Rivers move");
    expect(marked()).toBe("Rivers move");
    expect(p.textContent).toBe("Rivers move slowly to the sea.");
  });

  it("finds remembered words again, with whitespace and case levelled", () => {
    document.body.innerHTML = "<p>Deltas\n   build <em>land</em> over centuries.</p><p>Other.</p>";

    const result = highlightPage(["deltas build land over"], false);

    expect(result.shown).toBe(1);
    expect(marked().replace(/\s+/g, " ")).toBe("Deltas build land over");
  });

  it("does not mark inside scripts, and skips words it cannot find", () => {
    document.body.innerHTML = "<script>var secret = 'needle text'</script><p>Hay.</p>";

    expect(highlightPage(["needle text", "absent words"], false).shown).toBe(0);
    expect(marks()).toHaveLength(0);
  });

  it("does nothing with no selection", () => {
    document.body.innerHTML = "<p>Words.</p>";
    expect(highlightPage([], true)).toEqual({ marked: "", shown: 0 });
  });

  it("stands alone, so it can be sent into a tab", () => {
    expect(highlightPage.toString()).not.toMatch(/\bimport\b|\brequire\(/);
  });
});

describe("highlight store", () => {
  it("keys a page without its fragment, and only web pages", () => {
    expect(pageKey("https://a.com/x#part")).toBe("highlights:https://a.com/x");
    expect(pageKey("chrome://settings")).toBeNull();
    expect(pageKey(undefined)).toBeNull();
  });

  it("remembers each highlight once, and drops the oldest past the limit", () => {
    expect(remember(["one"], "  one ")).toEqual(["one"]);
    expect(remember("garbage", "two")).toEqual(["two"]);
    const full = Array.from({ length: MAX_PER_PAGE }, (_, i) => `h${i}`);
    const next = remember(full, "new");
    expect(next).toHaveLength(MAX_PER_PAGE);
    expect(next[0]).toBe("h1");
    expect(next.at(-1)).toBe("new");
  });
});
