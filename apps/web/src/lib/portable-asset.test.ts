import { describe, expect, it } from "vitest";
import type { Workspace } from "@forkleaf/types";
import { localAssetSrc, portableAssetSrc, resolveAgainstNote } from "./assets";
import { mcpServerUrl } from "./mcp-url";

const workspace = { id: "praneeth/TCM@main:", isLocal: false } as unknown as Workspace;
const other = { id: "praneeth/other@main:", isLocal: false } as unknown as Workspace;

const FROM = "PEH/6. Exploitation Basics/6.1 Brute Force Attacks.md";
const TO = "PEH/18. Web vulnerabilities/18.6 Authentication attacks/18.6.1-brute-force.md";

describe("carrying an image from one note to another", () => {
  it("lands pointing at the same file from a note in another folder", () => {
    const portable = portableAssetSrc(workspace, FROM, "./assets/2026-09-01-image-ab12.png")!;
    const pasted = localAssetSrc(workspace, TO, portable)!;

    expect(pasted).toBe("../../6. Exploitation Basics/assets/2026-09-01-image-ab12.png");
    expect(resolveAgainstNote(TO, pasted)).toBe(
      "PEH/6. Exploitation Basics/assets/2026-09-01-image-ab12.png",
    );
  });

  it("copes with a src a renderer percent-encoded", () => {
    const portable = portableAssetSrc(workspace, FROM, "./assets/my%20shot.png")!;
    expect(portable).toBe(`${workspace.id}#PEH/6. Exploitation Basics/assets/my shot.png`);
  });

  it("leaves absolute addresses alone", () => {
    expect(portableAssetSrc(workspace, FROM, "https://example.com/a.png")).toBeNull();
    expect(portableAssetSrc(workspace, FROM, "data:image/png;base64,AAAA")).toBeNull();
  });

  it("does not invent a path into a notebook the image never belonged to", () => {
    const portable = portableAssetSrc(workspace, FROM, "./assets/a.png")!;
    expect(localAssetSrc(other, TO, portable)).toBeNull();
    expect(localAssetSrc(workspace, null, portable)).toBeNull();
  });
});

describe("the address an assistant connects to", () => {
  it("is this site's own on a deployment", () => {
    expect(mcpServerUrl("https://forkleaf.vercel.app", undefined)).toEqual({
      url: "https://forkleaf.vercel.app/api/mcp",
      local: false,
    });
  });

  it("is the public deployment when running on localhost, which Claude cannot reach", () => {
    expect(mcpServerUrl("http://localhost:3000", "https://forkleaf.vercel.app/")).toEqual({
      url: "https://forkleaf.vercel.app/api/mcp",
      local: false,
    });
  });

  it("says so when running locally with nothing public to offer", () => {
    expect(mcpServerUrl("http://localhost:3000", "")).toEqual({
      url: "http://localhost:3000/api/mcp",
      local: true,
    });
  });
});
