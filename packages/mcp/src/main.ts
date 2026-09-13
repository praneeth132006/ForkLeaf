import { createInterface } from "node:readline";
import { GitHubClient } from "@forkleaf/github-client";
import { ConfigError, configFromEnv } from "./config";
import { GitHubNotebook } from "./notebook";
import { PARSE_ERROR, createServer, errorResponse } from "./protocol";
import { INSTRUCTIONS, notebookTools } from "./tools";

/**
 * The server, started by an MCP client as a process.
 *
 * Reads one JSON-RPC message per line from stdin and writes one per line to
 * stdout. Anything meant for a person goes to stderr, because stdout belongs to
 * the protocol and a stray log line there breaks the client's parser.
 */

const log = (message: string) => process.stderr.write(`[forkleaf-mcp] ${message}\n`);

async function main() {
  let config;
  try {
    config = configFromEnv(process.env);
  } catch (error) {
    log(error instanceof ConfigError ? error.message : String(error));
    process.exit(1);
  }

  const client = new GitHubClient({ token: config.token, userAgent: "forkleaf-mcp" });
  const branch = config.branch ?? (await client.getRepo(config.owner, config.repo))?.defaultBranch;
  if (!branch) {
    log(`${config.owner}/${config.repo} was not found, or the token cannot read it.`);
    process.exit(1);
  }

  const notebook = new GitHubNotebook(client, {
    owner: config.owner,
    repo: config.repo,
    branch,
    directory: config.directory,
  });
  const handle = createServer(
    { name: "forkleaf", version: "1.0.0", instructions: INSTRUCTIONS },
    notebookTools(notebook, { readOnly: config.readOnly, root: config.directory }),
  );

  log(
    `Serving ${config.owner}/${config.repo}@${branch}${config.directory ? `/${config.directory}` : ""}` +
      (config.readOnly ? " (read-only)" : ""),
  );

  const send = (response: unknown) => process.stdout.write(`${JSON.stringify(response)}\n`);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line.trim()) continue;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      send(errorResponse(null, PARSE_ERROR, "That line was not JSON."));
      continue;
    }
    // Answered as they finish rather than in order: a slow search should not
    // hold up a ping. Every response carries its request's id.
    void handle(message)
      .then((response) => {
        if (response) send(response);
      })
      .catch((error: unknown) => log(`Unhandled: ${String(error)}`));
  }
}

void main();
