import { describe, it, expect } from "vitest";
import type { Workspace } from "@forkleaf/types";
import {
  isRepoRelative,
  MISSING_IMAGE_SRC,
  relativeSrc,
  resolveAgainstNote,
  resolveImageSrc,
  isImagePath,
  assetPathFor,
} from "./assets";
import { extensionForFile, extensionOf, imageTypeFor, safeAssetName } from "./media";

const repo: Workspace = {
  id: "ws",
  name: "notes",
  isLocal: false,
  repo: { owner: "octo", repo: "notes", branch: "main", directory: "" },
} as Workspace;

const local: Workspace = { id: "local", name: "On this device", isLocal: true } as Workspace;

describe("relativeSrc", () => {
  it("links to a sibling folder from the repo root", () => {
    expect(relativeSrc("readme.md", "assets/a.png")).toBe("assets/a.png");
  });

  it("climbs out of the note's folder", () => {
    expect(relativeSrc("notes/plan.md", "assets/a.png")).toBe("../assets/a.png");
    expect(relativeSrc("notes/2026/plan.md", "assets/a.png")).toBe("../../assets/a.png");
  });

  it("keeps a shared prefix rather than climbing to the root and back", () => {
    expect(relativeSrc("docs/guide/plan.md", "docs/assets/a.png")).toBe("../assets/a.png");
  });

  it("marks a same-folder file with ./, so a colon in the name is not a scheme", () => {
    expect(relativeSrc("docs/plan.md", "docs/a.png")).toBe("./a.png");
  });

  it("round-trips back to the repository path", () => {
    for (const [note, asset] of [
      ["readme.md", "assets/a.png"],
      ["notes/2026/plan.md", "assets/a.png"],
      ["docs/guide/plan.md", "docs/assets/a.png"],
      ["docs/plan.md", "docs/a.png"],
    ] as const) {
      expect(resolveAgainstNote(note, relativeSrc(note, asset))).toBe(asset);
    }
  });
});

describe("isRepoRelative", () => {
  it("is true only for paths inside the repository", () => {
    expect(isRepoRelative("assets/a.png")).toBe(true);
    expect(isRepoRelative("../assets/a.png")).toBe(true);
    expect(isRepoRelative("./a.png")).toBe(true);
  });

  it("is false for anything with a scheme or an authority", () => {
    expect(isRepoRelative("https://example.com/a.png")).toBe(false);
    expect(isRepoRelative("data:image/png;base64,AAA")).toBe(false);
    expect(isRepoRelative("//example.com/a.png")).toBe(false);
    expect(isRepoRelative("/a.png")).toBe(false);
  });
});

describe("resolveImageSrc", () => {
  it("routes a repository path through the proxy", () => {
    const url = resolveImageSrc(repo, "notes/plan.md", "../assets/a.png");
    const params = new URL(url, "https://forkleaf.test").searchParams;

    expect(url.startsWith("/api/gh/raw?")).toBe(true);
    expect(params.get("owner")).toBe("octo");
    expect(params.get("repo")).toBe("notes");
    expect(params.get("branch")).toBe("main");
    expect(params.get("path")).toBe("assets/a.png");
  });

  it("leaves absolute and data URLs alone", () => {
    expect(resolveImageSrc(repo, "plan.md", "https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
    expect(resolveImageSrc(repo, "plan.md", "data:image/png;base64,AAA")).toBe(
      "data:image/png;base64,AAA",
    );
  });

  it("uses the copy on this device when there is one", () => {
    const local_ = { "assets/a.png": "blob:forkleaf/abc" };
    expect(resolveImageSrc(local, "plan.md", "assets/a.png", local_)).toBe("blob:forkleaf/abc");
  });

  /**
   * A local workspace has nowhere to proxy to, so an asset that is not on this
   * device is not going to appear. Returning the note-relative path made the
   * browser fetch `/assets/a.png` from the app's own origin, 404, and draw the
   * broken-image icon — which reads as a broken note rather than a missing
   * file.
   */
  it("stands a placeholder in for a local image this device does not have", () => {
    expect(resolveImageSrc(local, "plan.md", "assets/a.png")).toBe(MISSING_IMAGE_SRC);
    expect(MISSING_IMAGE_SRC).toContain("Image%20not%20on%20this%20device");
  });

  it("leaves the src alone when there is no workspace or note to resolve against", () => {
    expect(resolveImageSrc(null, "plan.md", "assets/a.png")).toBe("assets/a.png");
    expect(resolveImageSrc(local, null, "assets/a.png")).toBe("assets/a.png");
  });
});

describe("media", () => {
  it("names the type from the extension, case-insensitively", () => {
    expect(imageTypeFor("a/b/c.PNG")).toBe("image/png");
    expect(imageTypeFor("shot.jpeg")).toBe("image/jpeg");
    expect(imageTypeFor("notes.md")).toBe(null);
  });

  it("refuses SVG, which can carry script", () => {
    expect(imageTypeFor("logo.svg")).toBe(null);
    expect(isImagePath("logo.svg")).toBe(false);
  });

  it("reads the extension from a file's type before its name", () => {
    expect(extensionForFile({ name: "shot.bin", type: "image/png" })).toBe("png");
    expect(extensionForFile({ name: "shot.webp", type: "" })).toBe("webp");
    expect(extensionForFile({ name: "notes.md", type: "text/markdown" })).toBe(null);
  });

  it("strips anything that could change where a file lands", () => {
    expect(safeAssetName("../../etc/passwd", "png")).toBe("passwd.png");
    expect(safeAssetName("My Screenshot (1).png", "png")).toBe("my-screenshot-1.png");
    expect(safeAssetName("   ", "png")).toBe("image.png");
    expect(safeAssetName("ünïcödé", "png")).toBe("unicode.png");
  });

  it("reads no extension when there is none", () => {
    expect(extensionOf("Makefile")).toBe("");
    expect(extensionOf("dir.with.dots/file")).toBe("");
  });
});

describe("assetPathFor", () => {
  /** A stand-in for a pasted screenshot, which is always called this. */
  const screenshot = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });

  it("files an image beside the note that uses it", () => {
    const path = assetPathFor(repo, screenshot, [], "SOC 101/Phishing analysis/introduction.md");

    expect(path.startsWith("SOC 101/Phishing analysis/assets/")).toBe(true);
    expect(path.endsWith(".png")).toBe(true);
  });

  it("uses the repository root for a note that sits there", () => {
    expect(assetPathFor(repo, screenshot, [], "README.md").startsWith("assets/")).toBe(true);
  });

  it("falls back to the workspace directory when there is no note", () => {
    const nested = {
      ...repo,
      repo: { ...repo.repo, directory: "notes" },
    } as Workspace;

    expect(assetPathFor(nested, screenshot, []).startsWith("notes/assets/")).toBe(true);
  });

  it("dates the file, so a week of screenshots is not one heap", () => {
    const path = assetPathFor(repo, screenshot, [], "a.md");
    const today = new Date().toISOString().slice(0, 10);

    expect(path).toContain(`/${today}-`);
  });

  it("never reuses a path that is already taken", () => {
    const first = assetPathFor(repo, screenshot, [], "a.md");
    const second = assetPathFor(repo, screenshot, [first], "a.md");

    expect(second).not.toBe(first);
  });

  it("refuses a file that is not an image it can store", () => {
    const text = new File(["x"], "notes.txt", { type: "text/plain" });
    expect(() => assetPathFor(repo, text, [], "a.md")).toThrow();
  });
});
