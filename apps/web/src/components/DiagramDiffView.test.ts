import { describe, expect, it } from "vitest";
import { parseTarget } from "./DiagramDiffView";

const target = (query: string) => parseTarget(new URLSearchParams(query));

describe("parseTarget", () => {
  it("reads a pasted pull request URL, which is what people have to hand", () => {
    expect(target("pr=https://github.com/octocat/hello-world/pull/12")).toEqual({
      owner: "octocat",
      repo: "hello-world",
      number: 12,
    });
  });

  it("reads the short form a posted link uses", () => {
    expect(target("pr=octocat/hello-world/12")).toEqual({
      owner: "octocat",
      repo: "hello-world",
      number: 12,
    });
  });

  it("reads separate parameters", () => {
    expect(target("owner=octocat&repo=hello-world&number=12")).toEqual({
      owner: "octocat",
      repo: "hello-world",
      number: 12,
    });
  });

  it("tolerates a URL with a tab or comment fragment on the end", () => {
    expect(target("pr=https://github.com/octocat/hello-world/pull/12/files")?.number).toBe(12);
  });

  it("refuses anything it cannot read, rather than guessing", () => {
    expect(target("")).toBeNull();
    expect(target("pr=octocat")).toBeNull();
    expect(target("pr=https://example.com/octocat/repo/pull/1")).toBeNull();
    expect(target("owner=octocat&repo=hello-world")).toBeNull();
    expect(target("owner=octocat&repo=hello-world&number=0")).toBeNull();
  });

  it("refuses a name that would address a different endpoint", () => {
    expect(target("pr=../../etc/12")).toBeNull();
  });
});
