import { describe, expect, it } from "vitest";
import { isSavedOnGitHub, mindItemsFromSaves } from "./saved-items";

describe("mindItemsFromSaves", () => {
  it("turns each save into a card that opens its file on GitHub", () => {
    const items = mindItemsFromSaves({
      repo: { url: "https://github.com/ada/forkleaf-saves", branch: "main" },
      items: [
        {
          path: "images/2026/09/2026-09-13-sunset.md",
          title: "Sunset",
          kind: "image",
          url: "https://example.com/sunset.jpg",
          site: "example.com",
          saved: "2026-09-13",
          savedAt: "2026-09-13T10:00:00.000Z",
          excerpt: "",
        },
        {
          path: "quotes/2026/09/2026-09-12-cities.md",
          title: "Cities",
          kind: "quote",
          url: "javascript:alert(1)",
          site: null,
          saved: "",
          savedAt: "",
          excerpt: "Cities are for people.",
        },
      ],
    });

    expect(items[0]).toMatchObject({
      path: "https://github.com/ada/forkleaf-saves/blob/main/images/2026/09/2026-09-13-sunset.md",
      kind: "image",
      image: "https://example.com/sunset.jpg",
    });
    expect(items[1]).toMatchObject({ url: null, image: null, saved: null });
    expect(isSavedOnGitHub(items[0]!.path)).toBe(true);
    expect(isSavedOnGitHub("inbox/cities.md")).toBe(false);
  });

  it("has nothing to show before the first save", () => {
    expect(mindItemsFromSaves({ repo: null, items: [] })).toEqual([]);
  });
});
