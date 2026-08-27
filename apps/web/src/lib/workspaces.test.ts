import { describe, expect, it, vi } from "vitest";
import { workspaceId, type PendingChange, type RepoRef, type Workspace } from "@forkleaf/types";
import type { LocalDatabase, NoteRepository } from "@forkleaf/store";
import { LOCAL_WORKSPACE, collapseBranchDuplicates, repositoryKey } from "./workspaces";

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
