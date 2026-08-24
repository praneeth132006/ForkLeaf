// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { hasRelativeImages, repairNoteLinks, forgetRepositoryFiles } from "@/lib/repair-links";
import type { Workspace } from "@forkleaf/types";

const workspace = {
  id: "octo/notes@main:",
  isLocal: false,
  repo: { owner: "octo", repo: "notes", branch: "main", directory: "" },
} as Workspace;

beforeEach(() => forgetRepositoryFiles(workspace.id));
afterEach(() => vi.unstubAllGlobals());

describe("finding a note's images without being asked", () => {
  it("knows which notes are worth looking at", () => {
    expect(hasRelativeImages("![a](assets/a.png)")).toBe(true);
    expect(hasRelativeImages("![a](https://example.com/a.png)")).toBe(false);
    expect(hasRelativeImages("![a](/a.png)")).toBe(false);
    expect(hasRelativeImages("no pictures here")).toBe(false);
  });

  it("repairs from the images on this device without asking GitHub", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const result = await repairNoteLinks(
      workspace,
      "SOC 101/Phishing/notes.md",
      "![a](assets/shot.png)",
      ["assets/shot.png"],
    );

    expect(result.fixed).toEqual([{ from: "assets/shot.png", to: "../../assets/shot.png" }]);
    // Nothing on this device needed looking up, so nothing was.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to the repository, and reads it once", async () => {
    const fetchImpl = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify({
            tree: [{ kind: "file", path: "assets/shot.png", name: "shot.png" }],
          }),
          { status: 200, headers: { "content-type": "application/json", "x-url": url } },
        ),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const repair = () =>
      repairNoteLinks(workspace, "SOC 101/Phishing/notes.md", "![a](assets/shot.png)", []);

    expect((await repair()).fixed).toHaveLength(1);
    expect((await repair()).fixed).toHaveLength(1);

    // The second note opened does not pay for a second tree read.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0] ?? "").toContain("all=1");
  });

  it("does not reach for the network in a local workspace", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const result = await repairNoteLinks(
      { ...workspace, isLocal: true } as Workspace,
      "n.md",
      "![a](assets/shot.png)",
      [],
    );

    expect(result.fixed).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
