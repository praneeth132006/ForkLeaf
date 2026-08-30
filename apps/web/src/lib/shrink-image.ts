"use client";

import { MAX_REQUEST_BYTES } from "@forkleaf/store";
import { IMAGE_TYPES } from "@/lib/media";

/**
 * Making a picture small enough to send, rather than making it go away.
 *
 * A screenshot too big for one request used to leave exactly one move on the
 * table: remove it. That is a strange thing for a notes app to insist on. The
 * picture is fine — there is simply more of it than the wire will take — and
 * every other program that has ever hit this limit offers to shrink the thing
 * instead of deleting it.
 *
 * Re-encoded in the same format it arrived in. A `.png` holding WebP bytes
 * would be smaller and would be a file whose name lies about what is inside
 * it: served with the wrong content type, opened wrongly by anything reading
 * the repository directly, and impossible to explain a year later. The scale
 * comes down until the bytes fit, which is what actually makes a screenshot
 * small — a 4K capture at half size is a quarter of the pixels.
 *
 * Nothing here touches the original. The caller decides whether to keep what
 * comes back.
 */

export class ShrinkError extends Error {}

export interface ShrunkImage {
  /** The re-encoded file, ready to be stored and queued. */
  blob: Blob;
  mediaType: string;
  width: number;
  height: number;
  /** What the longest edge was multiplied by. 1 means quality alone did it. */
  scale: number;
}

/**
 * The formats worth re-encoding.
 *
 * GIF is deliberately absent: a canvas holds one frame, so "shrinking" an
 * animation would silently throw away every frame but the first. AVIF is out
 * because browsers that decode it do not all encode it, and a resize that
 * quietly changed the format would be the lie above. The rest — the formats a
 * screenshot or a photo actually arrives in — are all here.
 */
const SHRINKABLE = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Whether this file is one the reader can be offered a smaller version of. */
export function canShrink(path: string, mediaType?: string): boolean {
  if (mediaType && SHRINKABLE.has(mediaType)) return true;
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return SHRINKABLE.has(IMAGE_TYPES[extension] ?? "");
}

/**
 * How far down to try, in order.
 *
 * Quality first for a photograph, then size, because a JPEG at 70% is
 * indistinguishable at reading size while half-scale is visibly half-scale.
 * Each step is a real step: a ladder with twenty rungs would spend a second
 * of somebody's afternoon encoding images nobody will look at.
 */
const SCALES = [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.22, 0.15];
const QUALITIES = [0.85, 0.7, 0.55, 0.42];

/**
 * Re-encodes an image to fit inside `targetBytes`.
 *
 * Throws rather than returning something too big: a caller that queued an
 * oversized file again would be back where it started, with the difference
 * that the reader now believes the problem was dealt with.
 */
export async function shrinkImage(
  source: Blob,
  targetBytes: number,
  decode: (blob: Blob) => Promise<ImageBitmap> = (blob) => createImageBitmap(blob),
): Promise<ShrunkImage> {
  const mediaType = SHRINKABLE.has(source.type) ? source.type : "image/png";
  const lossy = mediaType !== "image/png";

  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(source);
  } catch {
    throw new ShrinkError("That image could not be read, so it cannot be resized.");
  }

  try {
    let smallest: Blob | null = null;
    let smallestAt = { width: bitmap.width, height: bitmap.height, scale: 1 };

    for (const scale of SCALES) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      for (const quality of lossy ? QUALITIES : [undefined]) {
        const encoded = await draw(bitmap, width, height, mediaType, quality);

        if (encoded.size <= targetBytes) {
          return { blob: encoded, mediaType, width, height, scale };
        }
        if (!smallest || encoded.size < smallest.size) {
          smallest = encoded;
          smallestAt = { width, height, scale };
        }
      }
    }

    throw new ShrinkError(
      smallest
        ? `Even at ${smallestAt.width}×${smallestAt.height} this image is ${describe(smallest.size)}, which is still over the limit.`
        : "That image could not be resized.",
    );
  } finally {
    // The decoded frame can be tens of megabytes of memory; a reader who
    // shrinks four screenshots should not be carrying all four.
    bitmap.close();
  }
}

/** Draws the bitmap at a size and encodes it, once. */
async function draw(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  mediaType: string,
  quality?: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new ShrinkError("This browser cannot resize images.");

  // Without this a downscaled screenshot is a mess of aliased text, which is
  // the one thing a screenshot exists to be readable at.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ShrinkError("This browser could not write the resized image."));
      },
      mediaType,
      quality,
    );
  });
}

/**
 * The largest a file can actually be and still go in one request.
 *
 * Not the limit itself. A file travels to the commit route as base64, which is
 * a third bigger than the bytes, and the path and the JSON around it are not
 * free either — so a picture resized to exactly the limit would be refused for
 * being over it, which is the most annoying possible outcome of pressing a
 * button labelled "make this fit".
 */
export function fittingBytes(path: string): number {
  return Math.floor(((MAX_REQUEST_BYTES - path.length - 64) * 3) / 4);
}

/** Bytes as somebody would say them out loud. */
export function describe(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}
