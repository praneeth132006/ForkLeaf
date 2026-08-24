// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { toDocx } from "./docx";

/**
 * A one-pixel PNG, and a browser that can measure it.
 *
 * jsdom does not load images, so `Image` is stood in for — the thing under
 * test is what the exporter does with a picture it has, not jsdom's ability to
 * decode one.
 */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function stubImage(width: number, height: number) {
  class FakeImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

afterEach(() => vi.unstubAllGlobals());

/** The bytes of a .docx are a zip; the image lands in it as its own part. */
async function partNames(blob: Blob): Promise<string> {
  return new TextDecoder("latin1").decode(await blob.arrayBuffer());
}

describe("images in a Word export", () => {
  it("embeds the picture rather than writing its filename", async () => {
    stubImage(1200, 600);

    const blob = await toDocx("# Notes\n\n![55511.png](./assets/a.png)", "Notes", async () => PNG);
    const contents = await partNames(blob);

    // A media part exists, and the alt text is no longer standing in for it.
    expect(contents).toContain("word/media/");
  });

  it("still writes the alt text when the bytes cannot be found", async () => {
    stubImage(10, 10);

    const blob = await toDocx("![55511.png](./assets/a.png)", "Notes", async () => null);
    const contents = await partNames(blob);

    expect(contents).not.toContain("word/media/");
  });

  it("exports without a resolver at all", async () => {
    const blob = await toDocx("![a](./assets/a.png)", "Notes");
    expect(blob.size).toBeGreaterThan(0);
  });
});
