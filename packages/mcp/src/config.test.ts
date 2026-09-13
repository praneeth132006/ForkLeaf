import { describe, expect, it } from "vitest";
import { ConfigError, configFromEnv } from "./config";

const BASE = { FORKLEAF_GITHUB_TOKEN: "ghp_token", FORKLEAF_REPO: "ada/notes" };

describe("configFromEnv", () => {
  it("reads the repository, token and defaults", () => {
    expect(configFromEnv(BASE)).toEqual({
      token: "ghp_token",
      owner: "ada",
      repo: "notes",
      branch: null,
      directory: "",
      readOnly: false,
    });
  });

  it("accepts GITHUB_TOKEN, a branch, a folder and read-only", () => {
    expect(
      configFromEnv({
        GITHUB_TOKEN: "ghs_other",
        FORKLEAF_REPO: " ada/notes ",
        FORKLEAF_BRANCH: "drafts/2026",
        FORKLEAF_DIR: "/docs/notes/",
        FORKLEAF_READ_ONLY: "TRUE",
      }),
    ).toEqual({
      token: "ghs_other",
      owner: "ada",
      repo: "notes",
      branch: "drafts/2026",
      directory: "docs/notes",
      readOnly: true,
    });
  });

  it("says which variable is missing or wrong", () => {
    expect(() => configFromEnv({ FORKLEAF_REPO: "ada/notes" })).toThrow(/FORKLEAF_GITHUB_TOKEN/);
    for (const repo of ["", "ada", "ada/notes/extra", "ada/../x", "a da/notes"]) {
      expect(() => configFromEnv({ ...BASE, FORKLEAF_REPO: repo })).toThrow(ConfigError);
    }
    expect(() => configFromEnv({ ...BASE, FORKLEAF_BRANCH: "../main" })).toThrow(/FORKLEAF_BRANCH/);
    expect(() => configFromEnv({ ...BASE, FORKLEAF_DIR: "notes/../../etc" })).toThrow(
      /FORKLEAF_DIR/,
    );
  });
});
