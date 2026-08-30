// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { canShrink, fittingBytes, shrinkImage, ShrinkError } from "./shrink-image";
import { MAX_REQUEST_BYTES } from "@forkleaf/store";

/**
 * A canvas that reports a plausible size rather than drawing anything.
 *
 * jsdom has no 2D context and no `toBlob`, so the ladder — try a quality, try
 * a smaller size, give up honestly — could not otherwise be tested at all.
 * Bytes are modelled as proportional to the pixels and to the quality, which
 * is the property the ladder actually relies on.
 */
function fakeCanvas(bytesFor: (pixels: number, quality: number) => number) {
  const drawn: { width: number; height: number; quality: number }[] = [];

  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") throw new Error(`unexpected ${tag}`);

    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        drawImage: () => {},
      }),
      toBlob: (callback: (blob: Blob | null) => void, type: string, quality?: number) => {
        const q = quality ?? 1;
        drawn.push({ width: canvas.width, height: canvas.height, quality: q });
        const size = bytesFor(canvas.width * canvas.height, q);
        callback(new Blob([new Uint8Array(size)], { type }));
      },
    };

    return canvas as unknown as HTMLElement;
  }) as typeof document.createElement);

  return drawn;
}

const bitmap = (width: number, height: number) =>
  ({ width, height, close: () => {} }) as unknown as ImageBitmap;

const source = (type: string) => new Blob([new Uint8Array(8)], { type });

afterEach(() => vi.restoreAllMocks());

describe("canShrink", () => {
  it("offers to resize the formats a canvas can honestly re-encode", () => {
    expect(canShrink("assets/shot.png")).toBe(true);
    expect(canShrink("assets/photo.JPG")).toBe(true);
    expect(canShrink("assets/thing.webp")).toBe(true);
  });

  it("refuses an animation, which a canvas would flatten to one frame", () => {
    expect(canShrink("assets/loop.gif")).toBe(false);
  });

  it("refuses what is not an image at all", () => {
    expect(canShrink("papers/attention.pdf")).toBe(false);
    expect(canShrink("notes/plan.md")).toBe(false);
  });
});

describe("fittingBytes", () => {
  it("leaves room for base64, rather than aiming at the limit itself", () => {
    // Aiming at the limit produces a file that is refused for being over it,
    // which is the worst possible outcome of pressing "make this fit".
    const fitting = fittingBytes("assets/shot.png");
    expect(fitting).toBeLessThan(MAX_REQUEST_BYTES);
    expect(Math.ceil((fitting * 4) / 3)).toBeLessThanOrEqual(MAX_REQUEST_BYTES);
  });
});

describe("shrinkImage", () => {
  it("drops quality before it drops pixels, for a photograph", async () => {
    // Big enough that full size at top quality misses, small enough that the
    // next quality down lands.
    const drawn = fakeCanvas((pixels, quality) => Math.round(pixels * quality));

    const result = await shrinkImage(source("image/jpeg"), 800_000, async () => bitmap(1000, 1000));

    expect(result.width).toBe(1000);
    expect(result.scale).toBe(1);
    expect(drawn.map((attempt) => attempt.quality)).toEqual([0.85, 0.7]);
  });

  it("comes down in size when quality alone will not do it", async () => {
    fakeCanvas((pixels, quality) => Math.round(pixels * quality));

    const result = await shrinkImage(source("image/jpeg"), 200_000, async () => bitmap(1000, 1000));

    expect(result.scale).toBeLessThan(1);
    expect(result.width).toBeLessThan(1000);
  });

  it("keeps a PNG a PNG, and shrinks it by size alone", async () => {
    const drawn = fakeCanvas((pixels) => pixels);

    const result = await shrinkImage(source("image/png"), 400_000, async () => bitmap(1000, 1000));

    expect(result.mediaType).toBe("image/png");
    // One attempt per size, since there is no quality dial on a PNG.
    expect(new Set(drawn.map((attempt) => attempt.quality))).toEqual(new Set([1]));
    expect(result.blob.size).toBeLessThanOrEqual(400_000);
  });

  it("says so rather than handing back something still too big", async () => {
    fakeCanvas(() => 9_000_000);

    await expect(
      shrinkImage(source("image/png"), 100_000, async () => bitmap(4000, 3000)),
    ).rejects.toBeInstanceOf(ShrinkError);
  });

  it("explains an image it cannot even decode", async () => {
    fakeCanvas(() => 1);

    await expect(
      shrinkImage(source("image/png"), 100_000, async () => {
        throw new Error("broken");
      }),
    ).rejects.toThrow(/could not be read/i);
  });
});
