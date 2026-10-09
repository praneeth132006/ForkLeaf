import { describe, expect, it } from "vitest";
import type { GitHubClient, RepoSummary } from "@forkleaf/github-client";
import type { RepoRef } from "@forkleaf/types";
import { GitHubLibrary, githubBlobUrl, type GitHubLibraryOptions } from "./library";
import type { ToolResult } from "./protocol";
import { notebookTools } from "./tools";

const repo = (fullName: string, extra: Partial<RepoSummary> = {}): RepoSummary => {
  const [owner = "", name = ""] = fullName.split("/");
  return {
    owner,
    name,
    fullName,
    private: true,
    defaultBranch: "main",
    canPush: true,
    description: null,
    updatedAt: "2026-10-01T00:00:00Z",
    ...extra,
  };
};

/** Just enough of GitHub: repositories, and the files in each. */
function fakeClient(repos: RepoSummary[], files: Record<string, Record<string, string>> = {}) {
  const commits: { repo: string; path: string; content: string }[] = [];
  const key = (ref: RepoRef) => `${ref.owner}/${ref.repo}`;
  const client = {
    listRepos: async () => repos,
    getRepo: async (owner: string, name: string) =>
      repos.find((each) => each.fullName.toLowerCase() === `${owner}/${name}`.toLowerCase()) ??
      null,
    listTree: async (ref: RepoRef) =>
      Object.keys(files[key(ref)] ?? {}).map((path) => ({ kind: "file", path, name: path })),
    readFile: async (ref: RepoRef, path: string) => {
      const content = files[key(ref)]?.[path];
      return content === undefined ? null : { content, sha: "x" };
    },
    commitChanges: async (ref: RepoRef, changes: { path: string; content: string }[]) => {
      for (const change of changes) {
        commits.push({ repo: key(ref), path: change.path, content: change.content });
        (files[key(ref)] ??= {})[change.path] = change.content;
      }
    },
  };
  return { client: client as unknown as GitHubClient, commits };
}

const OPTIONS: GitHubLibraryOptions = {
  owner: "ada",
  repo: "notes",
  branch: null,
  directory: "",
  readOnly: false,
  allRepositories: true,
};

const REPOS = [
  repo("ada/notes"),
  repo("ada/work"),
  repo("team/handbook", { private: false }),
  repo("team/readonly-docs", { canPush: false }),
];

const body = (result: ToolResult) => result.content.map((part) => part.text).join("");

function tools(options: Partial<GitHubLibraryOptions> = {}) {
  const fake = fakeClient(REPOS, {
    "ada/notes": { "projects/plan.md": "# Plan" },
    "ada/work": { "standups/monday.md": "# Monday" },
  });
  const library = new GitHubLibrary(fake.client, { ...OPTIONS, ...options });
  const byName = new Map(notebookTools(library).map((tool) => [tool.name, tool]));
  const run = (name: string, args: Record<string, unknown> = {}) => byName.get(name)!.run(args);
  return { run, commits: fake.commits, byName };
}

describe("a connection to several repositories", () => {
  it("lists them, the default first, saying which are read only", async () => {
    const listed = body(await tools().run("list_repositories"));
    expect(listed.split("\n").slice(0, 4)).toEqual([
      "ada/notes (default)",
      "ada/work",
      "team/handbook",
      "team/readonly-docs — read only",
    ]);
  });

  it("writes in the default repository unless told otherwise, and says where", async () => {
    const { run, commits } = tools();
    const answer = body(
      await run("write_note", { path: "projects/next.md", content: "# Next steps" }),
    );
    expect(answer).toBe(
      "Created projects/next.md in ada/notes.\nOpen it: https://github.com/ada/notes/blob/main/projects/next.md",
    );
    expect(commits.map((commit) => `${commit.repo}:${commit.path}`)).toEqual([
      "ada/notes:projects/next.md",
    ]);
  });

  it("writes in another repository when it is named — in full or by its name alone", async () => {
    const { run, commits } = tools();
    expect(
      body(
        await run("write_note", {
          repository: "ada/work",
          path: "standups/tuesday.md",
          content: "# Tuesday",
        }),
      ),
    ).toContain("Created standups/tuesday.md in ada/work.");
    await run("append_to_daily_note", { repository: "handbook", text: "Hello" });
    expect(commits.map((commit) => commit.repo)).toEqual(["ada/work", "team/handbook"]);
  });

  it("reads and searches in the repository it is pointed at", async () => {
    const { run } = tools();
    expect(body(await run("list_notes", { repository: "ada/work" }))).toBe(
      "1 note in ada/work:\nstandups/monday.md",
    );
    expect(
      body(await run("read_note", { repository: "ada/work", path: "standups/monday.md" })),
    ).toContain("# Monday");
  });

  it("offers the repository argument on every tool that works on notes", () => {
    const { byName } = tools();
    for (const name of ["list_notes", "search_notes", "read_note", "write_note"]) {
      expect(Object.keys(byName.get(name)!.inputSchema.properties ?? {})).toContain("repository");
    }
  });

  it("will not write where the account can only read", async () => {
    await expect(
      tools().run("write_note", {
        repository: "team/readonly-docs",
        path: "a.md",
        content: "# A",
      }),
    ).rejects.toThrow(/read only/);
  });

  it("explains a name it cannot find", async () => {
    await expect(tools().run("list_notes", { repository: "ada/nope" })).rejects.toThrow(
      /was not found/,
    );
    await expect(tools().run("list_notes", { repository: "nope" })).rejects.toThrow(
      /no repository called nope/,
    );
    await expect(tools().run("list_notes", { repository: "a/b/c" })).rejects.toThrow(/owner\/name/);
  });
});

describe("a connection to one repository", () => {
  it("keeps to it, and says how to allow the others", async () => {
    const { run, byName } = tools({ allRepositories: false });
    expect(Object.keys(byName.get("write_note")!.inputSchema.properties ?? {})).not.toContain(
      "repository",
    );
    expect(body(await run("list_repositories"))).toContain(
      'connect again with "Also let it use my other repositories" ticked',
    );
    await expect(run("list_notes", { repository: "ada/work" })).rejects.toThrow(
      /only covers ada\/notes/,
    );
    // Naming the default repository is always fine.
    expect(body(await run("list_notes", { repository: "ADA/Notes" }))).toContain("ada/notes");
  });

  it("keeps a folder-scoped notebook inside its folder", async () => {
    const fake = fakeClient(REPOS, { "ada/notes": { "docs/a.md": "# A", "README.md": "# R" } });
    const library = new GitHubLibrary(fake.client, { ...OPTIONS, directory: "docs" });
    const run = (name: string, args: Record<string, unknown>) =>
      notebookTools(library)
        .find((tool) => tool.name === name)!
        .run(args);
    expect(body(await run("list_notes", {}))).toBe("1 note in ada/notes:\ndocs/a.md");
    await expect(run("read_note", { path: "README.md" })).rejects.toThrow(/outside/);
  });
});

describe("githubBlobUrl", () => {
  it("escapes each part of the path, not the slashes between them", () => {
    expect(githubBlobUrl("ada", "notes", "main", "My Notes/a #1.md")).toBe(
      "https://github.com/ada/notes/blob/main/My%20Notes/a%20%231.md",
    );
  });
});
