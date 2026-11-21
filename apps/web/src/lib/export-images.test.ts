// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@forkleaf/types";
import { exportImageResolver } from "./export-images";
import { MISSING_IMAGE_SRC } from "./assets";

/**
 * What a file that has left the app can and cannot carry.
 *
 * An exported PDF, HTML or Word file is one file on somebody else's desktop.
 * A note's `../assets/chart.png` means nothing there, so the bytes have to
 * travel inside the document — and when they cannot be read, the document has
 * to say so rather than point at a path that will never resolve.
 */

const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: "local",
  name: "Notes",
  repo: { owner: "", repo: "", branch: "main", directory: "" },
  isDefault: false,
  isLocal: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exportImageResolver", () => {
  it("reads an image held on this device and hands back its bytes", async () => {
    // A hand-made response: jsdom's own `Response` does not keep a blob's
    // type, and the type is what the data URL is built from.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["png-bytes"], { type: "image/png" }),
      })),
    );

    const resolve = exportImageResolver(workspace(), "notes/plan.md", {
      "notes/assets/chart.png": "blob:http://localhost:3000/abc",
    });

    await expect(resolve("assets/chart.png")).resolves.toMatch(/^data:image\/png/);
  });

  it("leaves anything already self-contained or absolute alone", async () => {
    const resolve = exportImageResolver(workspace(), "notes/plan.md", {});

    await expect(resolve("https://example.com/a.png")).resolves.toBeNull();
    await expect(resolve(PNG)).resolves.toBeNull();
    await expect(resolve("blob:http://localhost:3000/abc")).resolves.toBeNull();
  });

  /**
   * The bug this is here for: reading the bytes failed — the page's own
   * policy refused it for a year — and the resolver answered "leave the path
   * alone". The path is a relative one, so every exported file drew the
   * browser's broken-image icon, which reads as a damaged document rather
   * than as a picture this device does not have.
   */
  it("says the picture is missing rather than leaving a path that cannot resolve", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const resolve = exportImageResolver(workspace(), "notes/plan.md", {
      "notes/assets/chart.png": "blob:http://localhost:3000/abc",
    });

    await expect(resolve("assets/chart.png")).resolves.toBe(MISSING_IMAGE_SRC);
  });

  it("says so too when the bytes come back as an error page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 404 })),
    );

    const resolve = exportImageResolver(workspace({ isLocal: false }), "notes/plan.md", {});

    await expect(resolve("assets/chart.png")).resolves.toBe(MISSING_IMAGE_SRC);
  });

  it("says so when there is no notebook to resolve against at all", async () => {
    const resolve = exportImageResolver(null, null, {});
    await expect(resolve("assets/chart.png")).resolves.toBe(MISSING_IMAGE_SRC);
  });
});
