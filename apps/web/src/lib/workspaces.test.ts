import { describe, expect, it, vi } from "vitest";
import { workspaceId, type PendingChange, type RepoRef, type Workspace } from "@forkleaf/types";
import type { LocalDatabase, NoteRepository } from "@forkleaf/store";
import {
  LOCAL_WORKSPACE,
  claimUnowned,
  collapseBranchDuplicates,
  repositoryKey,
  visibleWorkspaces,
} from "./workspaces";

const NOTES: RepoRef = { owner: "me", repo: "notes", branch: "main", directory: "" };

function on(branch: string, repo: Partial<RepoRef> = {}): Workspace {
  const reference: RepoRef = { ...NOTES, ...repo, branch };
  return {
    id: workspaceId(reference),
    name: reference.repo,
    repo: reference,
    isDefault: false,
    isLocal: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** A database that reports whichever workspaces have unpushed changes. */
function db(pendingFor: string[] = []): LocalDatabase {
  return {
    listQueue: vi.fn(async (workspace?: string) =>
      pendingFor.includes(workspace ?? "")
        ? ([{ id: "change" }] as unknown as PendingChange[])
        : [],
    ),
  } as unknown as LocalDatabase;
}

function notes() {
  const removeWorkspace = vi.fn(async () => {});
  return { repository: { removeWorkspace } as unknown as NoteRepository, removeWorkspace };
}

describe("repositoryKey", () => {
  it("is the same for two branches of one repository", () => {
    expect(repositoryKey(on("main"))).toBe(repositoryKey(on("draft")));
  });

  it("separates a fork from what it was forked from", () => {
    expect(repositoryKey(on("main"))).not.toBe(repositoryKey(on("main", { owner: "someone" })));
  });

  it("separates two notebooks in different directories of one repository", () => {
    expect(repositoryKey(on("main"))).not.toBe(repositoryKey(on("main", { directory: "vault" })));
  });
});

describe("collapseBranchDuplicates", () => {
  it("retires the row for the branch just left", async () => {
    const { repository, removeWorkspace } = notes();
    const keep = on("draft");

    const left = await collapseBranchDuplicates({
      workspaces: [on("main"), keep],
      keep,
      notes: repository,
      db: db(),
    });

    expect(left).toEqual([keep]);
    expect(removeWorkspace).toHaveBeenCalledWith(on("main").id);
  });

  it("keeps a branch holding writing that has never been pushed", async () => {
    // `removeWorkspace` takes the notes with it, so this is somebody's work.
    const { repository, removeWorkspace } = notes();
    const keep = on("draft");
    const stranded = on("main");

    const left = await collapseBranchDuplicates({
      workspaces: [stranded, keep],
      keep,
      notes: repository,
      db: db([stranded.id]),
    });

    expect(left).toEqual([stranded, keep]);
    expect(removeWorkspace).not.toHaveBeenCalled();
  });

  it("leaves other repositories alone", async () => {
    const { repository, removeWorkspace } = notes();
    const keep = on("main");
    const other = on("main", { repo: "tools" });
    const fork = on("main", { owner: "someone" });

    const left = await collapseBranchDuplicates({
      workspaces: [LOCAL_WORKSPACE, other, fork, keep],
      keep,
      notes: repository,
      db: db(),
    });

    expect(left).toEqual([LOCAL_WORKSPACE, other, fork, keep]);
    expect(removeWorkspace).not.toHaveBeenCalled();
  });

  it("drops the retired workspace from the gateway's lookup table too", async () => {
    const { repository } = notes();
    const unregister = vi.fn();
    const keep = on("draft");

    await collapseBranchDuplicates({
      workspaces: [on("main"), keep],
      keep,
      notes: repository,
      db: db(),
      unregister,
    });

    expect(unregister).toHaveBeenCalledWith(on("main").id);
  });

  it("does nothing for the on-device workspace, which has no branches", async () => {
    const { repository, removeWorkspace } = notes();
    const workspaces = [LOCAL_WORKSPACE, on("main")];

    expect(
      await collapseBranchDuplicates({
        workspaces,
        keep: LOCAL_WORKSPACE,
        notes: repository,
        db: db(),
      }),
    ).toEqual(workspaces);
    expect(removeWorkspace).not.toHaveBeenCalled();
  });
});

// ─── Whose notebook is this? ────────────────────────────────────────────────

/** A repository workspace belonging to `ownerId`, or to nobody. */
function ownedBy(ownerId: number | undefined, name = "notes"): Workspace {
  const reference: RepoRef = { ...NOTES, repo: name };
  return {
    id: workspaceId(reference),
    name,
    repo: reference,
    isDefault: false,
    isLocal: false,
    ...(ownerId === undefined ? {} : { ownerId }),
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("visibleWorkspaces", () => {
  const mine = ownedBy(1, "my-notes");
  const theirs = ownedBy(2, "their-notes");

  it("shows an account its own repositories", () => {
    expect(visibleWorkspaces([mine], 1)).toEqual([mine]);
  });

  it("hides another account's repositories", () => {
    // The bug this exists for: signing in as somebody else on the same browser
    // listed the previous account's repositories, with every note they had
    // opened cached and editable underneath.
    expect(visibleWorkspaces([mine, theirs], 1)).toEqual([mine]);
  });

  it("hides every repository from a signed-out browser", () => {
    expect(visibleWorkspaces([mine, theirs], null)).toEqual([]);
  });

  it("always keeps the on-device workspace", () => {
    // It belongs to the browser, not to an account, and hiding it would hide
    // notes that exist nowhere else.
    expect(visibleWorkspaces([LOCAL_WORKSPACE, theirs], 1)).toEqual([LOCAL_WORKSPACE]);
    expect(visibleWorkspaces([LOCAL_WORKSPACE], null)).toEqual([LOCAL_WORKSPACE]);
  });

  it("hides a workspace nobody has claimed", () => {
    expect(visibleWorkspaces([ownedBy(undefined)], 1)).toEqual([]);
  });

  it("does not match an account against a missing id", () => {
    // `undefined === undefined` would have made every unowned workspace
    // visible to every signed-out browser, which is the leak again.
    expect(visibleWorkspaces([ownedBy(undefined)], null)).toEqual([]);
  });

  it("keeps the order it was given", () => {
    const second = { ...ownedBy(1, "other"), name: "other" };
    expect(visibleWorkspaces([mine, second], 1).map((w) => w.name)).toEqual(["my-notes", "other"]);
  });

  it("is empty for an empty list", () => {
    expect(visibleWorkspaces([], 1)).toEqual([]);
  });
});

describe("claimUnowned", () => {
  it("claims the workspaces an upgrade left without an owner", () => {
    const claimed = claimUnowned([ownedBy(undefined)], 7, false);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.ownerId).toBe(7);
  });

  it("claims nothing once the database has been claimed", () => {
    // The one-time window is the upgrade itself. A second account signing in
    // afterwards inherits nothing.
    expect(claimUnowned([ownedBy(undefined)], 2, true)).toEqual([]);
  });

  it("claims nothing for a signed-out browser", () => {
    expect(claimUnowned([ownedBy(undefined)], null, false)).toEqual([]);
  });

  it("never takes a workspace that already has an owner", () => {
    expect(claimUnowned([ownedBy(2)], 1, false)).toEqual([]);
  });

  it("never claims the on-device workspace", () => {
    expect(claimUnowned([LOCAL_WORKSPACE], 1, false)).toEqual([]);
  });

  it("returns only what changed, so nothing else is rewritten", () => {
    const claimed = claimUnowned([ownedBy(1, "a"), ownedBy(undefined, "b")], 1, false);
    expect(claimed.map((w) => w.name)).toEqual(["b"]);
  });
});
