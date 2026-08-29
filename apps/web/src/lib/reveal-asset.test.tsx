// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { REVEAL_CLASS, REVEAL_MS, revealAsset } from "./reveal-asset";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

/** A note canvas holding the given images, as one of the two surfaces draws them. */
function canvas(images: { src: string; dataSrc?: string }[]): HTMLElement {
  const root = document.createElement("div");
  for (const image of images) {
    const element = document.createElement("img");
    element.setAttribute("src", image.src);
    if (image.dataSrc) element.setAttribute("data-src", image.dataSrc);
    root.append(element);
  }
  document.body.append(root);
  return root;
}

const reveal = (root: HTMLElement | null, assetPath: string, resolvedSrc?: string | null) =>
  revealAsset({
    root,
    notePath: "Fieldwork/soil.md",
    assetPath,
    ...(resolvedSrc !== undefined ? { resolvedSrc } : {}),
  });

describe("revealAsset", () => {
  it("finds the image the rich editor drew, by what the markdown says", () => {
    const root = canvas([{ src: "/api/gh/raw?path=x", dataSrc: "assets/chart.png" }]);

    expect(reveal(root, "Fieldwork/assets/chart.png")).toBe("revealed");
    expect(root.querySelector("img")!.classList.contains(REVEAL_CLASS)).toBe(true);
  });

  it("finds the image the preview drew, which keeps no copy of the original", () => {
    const root = canvas([{ src: "blob:one" }]);

    expect(reveal(root, "Fieldwork/assets/chart.png", "blob:one")).toBe("revealed");
  });

  it("resolves a path that climbs out of the note's folder", () => {
    const root = canvas([{ src: "blob:one", dataSrc: "../shared/chart.png" }]);

    expect(reveal(root, "shared/chart.png")).toBe("revealed");
  });

  it("does not mistake a same-named picture in another folder for this one", () => {
    const root = canvas([{ src: "blob:one", dataSrc: "assets/chart.png" }]);

    expect(reveal(root, "Archive/assets/chart.png")).toBe("not-rendered");
    expect(root.querySelector("img")!.classList.contains(REVEAL_CLASS)).toBe(false);
  });

  it("marks only the image asked for, out of several in one note", () => {
    const root = canvas([
      { src: "blob:one", dataSrc: "assets/first.png" },
      { src: "blob:two", dataSrc: "assets/second.png" },
      { src: "blob:three", dataSrc: "assets/third.png" },
    ]);

    reveal(root, "Fieldwork/assets/second.png");

    const marked = [...root.querySelectorAll("img")].filter((image) =>
      image.classList.contains(REVEAL_CLASS),
    );
    expect(marked).toHaveLength(1);
    expect(marked[0]!.getAttribute("data-src")).toBe("assets/second.png");
  });

  it("ignores an absolute image, which is not ours to point at", () => {
    const root = canvas([{ src: "https://example.com/assets/chart.png" }]);

    expect(reveal(root, "assets/chart.png")).toBe("not-rendered");
  });

  it("reports a note with no images drawn rather than throwing", () => {
    expect(reveal(canvas([]), "assets/chart.png")).toBe("not-rendered");
    expect(reveal(null, "assets/chart.png")).toBe("not-rendered");
  });

  it("takes the mark off again, so it does not sit on the image for the session", () => {
    vi.useFakeTimers();
    const root = canvas([{ src: "blob:one", dataSrc: "assets/chart.png" }]);

    reveal(root, "Fieldwork/assets/chart.png");
    expect(root.querySelector("img")!.classList.contains(REVEAL_CLASS)).toBe(true);

    vi.advanceTimersByTime(REVEAL_MS + 1);
    expect(root.querySelector("img")!.classList.contains(REVEAL_CLASS)).toBe(false);
  });

  it("scrolls it into view, since being marked off screen is not being found", () => {
    const root = canvas([{ src: "blob:one", dataSrc: "assets/chart.png" }]);
    const image = root.querySelector("img")!;
    image.scrollIntoView = vi.fn();

    reveal(root, "Fieldwork/assets/chart.png");

    expect(image.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });
});
