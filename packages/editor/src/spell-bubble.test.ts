// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuggestionBubble } from "./spelling";

/**
 * The bubble's keyboard, with it hanging below its word and sitting above it.
 *
 * Near the bottom of the screen the bubble opens above the word. It used to
 * keep its below-the-word order there, so the first ↑ — the natural key for
 * reaching something above you — jumped straight to "Ignore", the furthest
 * thing from the word.
 */

let bubble: SuggestionBubble;
afterEach(() => {
  bubble?.hide();
  vi.unstubAllGlobals();
});

function open(wordTop: number) {
  bubble = new SuggestionBubble();
  bubble.show({
    word: "amasing",
    rect: { left: 20, top: wordTop, bottom: wordTop + 20 },
    suggestions: ["amassing", "amazing", "amusing"],
    onPick: vi.fn(),
    onLearn: vi.fn(),
    onIgnore: vi.fn(),
  });
  return document.querySelector<HTMLElement>(".fl-spell-bubble")!;
}

const key = (name: string) => bubble.handleKey(new KeyboardEvent("keydown", { key: name }));
const active = () => document.querySelector(".is-active")?.textContent ?? null;

describe("suggestion bubble", () => {
  it("below the word: ↓ goes to the first correction", () => {
    const element = open(100);
    expect(element.classList.contains("is-above")).toBe(false);
    expect(key("ArrowDown")).toBe(true);
    expect(active()).toBe("amassing");
    expect(key("ArrowDown")).toBe(true);
    expect(active()).toBe("amazing");
  });

  it("below the word: ↑ with nothing highlighted is the editor's", () => {
    open(100);
    expect(key("ArrowUp")).toBe(false);
    expect(active()).toBeNull();
  });

  it("above the word: ↑ goes to the first correction, not to Ignore", () => {
    // Too close to the bottom of the window to fit underneath.
    const element = open(window.innerHeight - 30);
    expect(element.classList.contains("is-above")).toBe(true);
    expect(key("ArrowUp")).toBe(true);
    expect(active()).toBe("amassing");
    expect(key("ArrowUp")).toBe(true);
    expect(active()).toBe("amazing");
    expect(key("ArrowDown")).toBe(true);
    expect(active()).toBe("amassing");
    // Back past the first correction returns to the text.
    expect(key("ArrowDown")).toBe(true);
    expect(active()).toBeNull();
    expect(key("ArrowDown")).toBe(false);
  });
});
