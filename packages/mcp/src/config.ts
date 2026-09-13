/**
 * What the server needs to know, read from its environment.
 *
 * An MCP client starts the server as a process with environment variables it
 * was configured with, so that is where the token and the repository come from.
 * Every mistake is reported as a sentence saying which variable to set, because
 * the person reading it is looking at their assistant's settings, not at code.
 */

export interface ServerConfig {
  token: string;
  owner: string;
  repo: string;
  /** Null means the repository's default branch. */
  branch: string | null;
  /** The folder notes live under, or "" for the whole repository. */
  directory: string;
  /** When true, the tools that write are not offered at all. */
  readOnly: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const NAME = /^[\w.-]{1,100}$/;
const BRANCH = /^(?!\/)(?!.*\.\.)[\w./-]{1,255}(?<!\/)$/;

export function configFromEnv(env: Record<string, string | undefined>): ServerConfig {
  const token = (env.FORKLEAF_GITHUB_TOKEN ?? env.GITHUB_TOKEN ?? "").trim();
  if (!token) {
    throw new ConfigError(
      "Set FORKLEAF_GITHUB_TOKEN to a GitHub token that can read (and, to write notes, write) your notes repository.",
    );
  }

  const target = (env.FORKLEAF_REPO ?? "").trim();
  const [owner, repo, ...rest] = target.split("/");
  if (!owner || !repo || rest.length > 0 || !NAME.test(owner) || !NAME.test(repo)) {
    throw new ConfigError(
      `Set FORKLEAF_REPO to your notes repository as owner/name — for example ada/notes. Got "${target}".`,
    );
  }

  const branch = (env.FORKLEAF_BRANCH ?? "").trim() || null;
  if (branch !== null && !BRANCH.test(branch)) {
    throw new ConfigError(`FORKLEAF_BRANCH "${branch}" is not a branch name.`);
  }

  const directory = (env.FORKLEAF_DIR ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (directory.split("/").some((segment) => segment === "..")) {
    throw new ConfigError("FORKLEAF_DIR must be a folder inside the repository.");
  }

  const readOnly = /^(1|true|yes)$/i.test((env.FORKLEAF_READ_ONLY ?? "").trim());

  return { token, owner, repo, branch, directory, readOnly };
}
