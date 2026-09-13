import { describe, expect, it } from "vitest";
import {
  audioExtensionFor,
  documentTypeFor,
  extensionForFile,
  extensionOf,
  imageTypeFor,
  isAudioPath,
  isPdfPath,
  safeAssetName,
  servableTypeFor,
} from "@/lib/media";

/**
 * What ForkLeaf will serve back out of a repository.
 *
 * `servableTypeFor` is the gate the raw-asset route checks, and that route
 * reads with the user's OAuth token — so anything it will serve is content the
 * user's own repository can put on this app's origin. The tests that matter
 * here are the refusals.
 */
describe("servableTypeFor", () => {
  it("serves the image types notes embed", () => {
    expect(servableTypeFor("assets/chart.png")).toBe("image/png");
    expect(servableTypeFor("assets/photo.JPEG")).toBe("image/jpeg");
  });

  it("serves PDFs, which the reader opens", () => {
    expect(servableTypeFor("papers/attention.pdf")).toBe("application/pdf");
    expect(servableTypeFor("papers/ATTENTION.PDF")).toBe("application/pdf");
  });

  it("refuses HTML, which is the whole reason this is an allowlist", () => {
    // Serving repository HTML from this origin would be stored XSS with the
    // session cookie sitting right there.
    expect(servableTypeFor("index.html")).toBeNull();
    expect(servableTypeFor("page.htm")).toBeNull();
  });

  it("refuses SVG, which is a document format that can carry script", () => {
    expect(servableTypeFor("logo.svg")).toBeNull();
  });

  it("refuses everything else in a repository", () => {
    expect(servableTypeFor("scripts/deploy.sh")).toBeNull();
    expect(servableTypeFor("notes/plan.md")).toBeNull();
    expect(servableTypeFor("package.json")).toBeNull();
    expect(servableTypeFor("Makefile")).toBeNull();
  });

  it("refuses a name that only looks like one of ours", () => {
    expect(servableTypeFor("pdf")).toBeNull();
    expect(servableTypeFor("report.pdf.exe")).toBeNull();
  });
});

describe("isPdfPath", () => {
  it("is true for a PDF whatever the case", () => {
    expect(isPdfPath("a/b/c.pdf")).toBe(true);
    expect(isPdfPath("a/b/c.PdF")).toBe(true);
  });

  it("is false for anything else", () => {
    expect(isPdfPath("a.md")).toBe(false);
    expect(isPdfPath("a.png")).toBe(false);
    expect(isPdfPath("pdf/notes.md")).toBe(false);
  });
});

describe("documentTypeFor and imageTypeFor stay separate", () => {
  it("does not treat a PDF as an image", () => {
    expect(imageTypeFor("a.pdf")).toBeNull();
    expect(documentTypeFor("a.png")).toBeNull();
  });
});

describe("extensionOf", () => {
  it("takes the last extension, lowercased", () => {
    expect(extensionOf("a/b/Report.PDF")).toBe("pdf");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
  });

  it("is empty for a name with no extension", () => {
    expect(extensionOf("Makefile")).toBe("");
  });

  it("does not read an extension out of a folder name", () => {
    expect(extensionOf("v1.2/README")).toBe("");
  });
});

describe("extensionForFile", () => {
  it("prefers the type the browser reported", () => {
    expect(extensionForFile({ name: "screenshot", type: "image/png" })).toBe("png");
  });

  it("falls back to the name", () => {
    expect(extensionForFile({ name: "a.webp", type: "" })).toBe("webp");
  });

  it("is null for a file ForkLeaf will not store as an image", () => {
    expect(extensionForFile({ name: "paper.pdf", type: "application/pdf" })).toBeNull();
  });
});

describe("safeAssetName", () => {
  it("cannot escape the folder it is given", () => {
    expect(safeAssetName("../../etc/passwd", "png")).toBe("passwd.png");
  });

  it("keeps accented names readable rather than reducing them to initials", () => {
    expect(safeAssetName("Café Menu", "png")).toBe("cafe-menu.png");
  });
});

describe("audio, for voice notes", () => {
  it("serves the recording formats browsers produce, and nothing that only looks like one", () => {
    expect(servableTypeFor("notes/assets/voice.webm")).toBe("audio/webm");
    expect(servableTypeFor("voice.M4A")).toBe("audio/mp4");
    expect(servableTypeFor("voice.mp3")).toBe("audio/mpeg");
    expect(servableTypeFor("voice.webm.html")).toBeNull();
  });

  it("knows a recording from its path", () => {
    expect(isAudioPath("a/b.ogg")).toBe(true);
    expect(isAudioPath("a/b.pdf")).toBe(false);
  });

  it("names a recording from the type MediaRecorder reports, codec and all", () => {
    expect(audioExtensionFor("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExtensionFor("audio/mp4")).toBe("m4a");
    expect(audioExtensionFor("audio/x-wav")).toBe("wav");
    expect(audioExtensionFor("video/webm")).toBeNull();
    expect(audioExtensionFor(undefined)).toBeNull();
    expect(extensionForFile({ name: "blob", type: "audio/ogg;codecs=opus" })).toBe("ogg");
    expect(extensionForFile({ name: "memo.m4a", type: "" })).toBe("m4a");
  });
});
