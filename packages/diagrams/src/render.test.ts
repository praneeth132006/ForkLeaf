import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  clearDiagramCache,
  fitSvgToContainer,
  renderDiagram,
  LIGHT_THEME,
  DARK_THEME,
} from "./render";

/**
 * The cache is the point of these tests.
 *
 * Rendering the same diagram twice used to mean two full mermaid runs — parse,
 * layout, DOM build, text measurement, then a DOMPurify walk over the result —
 * and the preview asked for every diagram in a note on every keystroke. What
 * matters is that the second ask is free and still correct.
 */

const renderSpy = vi.fn();
const parseSpy = vi.fn();

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: (code: string) => {
      parseSpy(code);
      if (code.includes("BROKEN")) return Promise.reject(new Error("Parse error on line 1"));
      return Promise.resolve(true);
    },
    render: (id: string, code: string) => {
      renderSpy(id, code);
      return Promise.resolve({ svg: `<svg data-code="${code.replace(/"/g, "")}"></svg>` });
    },
  },
}));

beforeEach(() => {
  clearDiagramCache();
  renderSpy.mockClear();
  parseSpy.mockClear();
});

afterEach(() => {
  clearDiagramCache();
});

describe("renderDiagram", () => {
  it("renders once and serves the repeat from cache", async () => {
    const first = await renderDiagram("flowchart TD\n a --> b", LIGHT_THEME);
    const second = await renderDiagram("flowchart TD\n a --> b", LIGHT_THEME);

    expect(first.svg).toBeTruthy();
    expect(second.svg).toBe(first.svg);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a different source as a different diagram", async () => {
    await renderDiagram("flowchart TD\n a --> b", LIGHT_THEME);
    await renderDiagram("flowchart TD\n a --> c", LIGHT_THEME);

    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it("does not serve a light diagram to a dark one", async () => {
    // The palette is baked into the SVG, so sharing the entry across themes
    // would leave a note in dark mode showing the light-mode drawing.
    await renderDiagram("flowchart TD\n a --> b", LIGHT_THEME);
    await renderDiagram("flowchart TD\n a --> b", DARK_THEME);

    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it("caches failures too", async () => {
    // Half-typed source is invalid far more often than it is valid, so
    // re-parsing the same broken string is the most repeated work of the lot.
    const first = await renderDiagram("BROKEN", LIGHT_THEME);
    const second = await renderDiagram("BROKEN", LIGHT_THEME);

    expect(first.svg).toBeNull();
    expect(first.error).not.toBeNull();
    expect(second).toEqual(first);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("returns nothing for empty source without touching mermaid", async () => {
    expect(await renderDiagram("   ", LIGHT_THEME)).toEqual({ svg: null, error: null });
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("evicts the oldest entry rather than growing without limit", async () => {
    // SVG strings run to tens of kilobytes; an unbounded map would hold every
    // draft of every diagram edited in the session.
    for (let index = 0; index < 70; index += 1) {
      await renderDiagram(`flowchart TD\n a${index} --> b`, LIGHT_THEME);
    }
    renderSpy.mockClear();

    // The first is long gone, the last is still there.
    await renderDiagram("flowchart TD\n a0 --> b", LIGHT_THEME);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    await renderDiagram("flowchart TD\n a69 --> b", LIGHT_THEME);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps a re-used entry alive past newer ones", async () => {
    await renderDiagram("flowchart TD\n keep --> me", LIGHT_THEME);

    for (let index = 0; index < 60; index += 1) {
      // Touching the first entry as we go should keep it from being evicted.
      await renderDiagram("flowchart TD\n keep --> me", LIGHT_THEME);
      await renderDiagram(`flowchart TD\n n${index} --> b`, LIGHT_THEME);
    }

    renderSpy.mockClear();
    await renderDiagram("flowchart TD\n keep --> me", LIGHT_THEME);
    expect(renderSpy).not.toHaveBeenCalled();
  });
});

/**
 * The other half of a diagram being readable: being drawn at a size.
 *
 * Mermaid hands back `width="100%"` with the laid-out width as a `max-width`,
 * which resolves to the 300px default for a replaced element in every
 * shrink-to-fit box this app shows diagrams in — the reason a 1277px flowchart
 * was arriving as a row of specks 31px tall.
 */
describe("fitSvgToContainer", () => {
  const svg = (attrs: string) => `<svg ${attrs}><g /></svg>`;

  it("replaces mermaid's width cap with one that scales to the column", () => {
    const fitted = fitSvgToContainer(
      svg('id="d" width="100%" style="max-width: 400px;" viewBox="0 0 400 100"'),
    );

    expect(fitted).toContain("width: 100%");
    expect(fitted).toContain("height: auto");
    // Room to grow past the size it was laid out at, and a floor under it.
    expect(fitted).toContain("max-width: 500px");
    expect(fitted).toContain("min-width: 240px");
    // The old attributes are gone rather than left to disagree with the style.
    expect(fitted).not.toContain('width="100%"');
    expect(fitted).not.toContain("max-width: 400px");
  });

  it("keeps everything else about the root element", () => {
    const fitted = fitSvgToContainer(
      svg('id="d" class="flowchart" aria-roledescription="flowchart" viewBox="0 0 400 100"'),
    );

    expect(fitted).toContain('id="d"');
    expect(fitted).toContain('class="flowchart"');
    expect(fitted).toContain('aria-roledescription="flowchart"');
    expect(fitted).toContain("<g />");
  });

  it("leaves markup it cannot measure exactly as it found it", () => {
    // No viewBox, so there is no laid-out width to scale against — and an
    // error page rather than a diagram is markup that is not ours to resize.
    const unmeasurable = svg('id="d" width="100%"');
    expect(fitSvgToContainer(unmeasurable)).toBe(unmeasurable);
    expect(fitSvgToContainer("<p>not a diagram</p>")).toBe("<p>not a diagram</p>");
    expect(fitSvgToContainer(svg('viewBox="0 0 0 0"'))).toBe(svg('viewBox="0 0 0 0"'));
  });
});
