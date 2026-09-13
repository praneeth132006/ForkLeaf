import { NextResponse, type NextRequest } from "next/server";
import { GitHubClient } from "@forkleaf/github-client";
import {
  GitHubNotebook,
  INSTRUCTIONS,
  createServer,
  errorResponse,
  notebookTools,
} from "@forkleaf/mcp";
import { appBaseUrl } from "@/lib/app-url";
import { openAccess } from "@/lib/mcp-grants";
import { CORS, noStoreJson, preflight } from "@/lib/mcp-http";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * The notebook, as a remote MCP server.
 *
 * Streamable HTTP without sessions: every POST carries its bearer token and one
 * JSON-RPC message (or a batch), and is answered with JSON. The tools are the
 * same ones the local `packages/mcp` server offers, working on the repository
 * the person chose when connecting — searching, reading, and, unless they asked
 * for read-only, writing notes as commits.
 */

export const maxDuration = 60;

const MAX_BODY = 1_000_000;

function unauthorized(request: NextRequest, description: string) {
  const origin = appBaseUrl(request).origin;
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: description } },
    {
      status: 401,
      headers: {
        ...CORS,
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp", error="invalid_token", error_description="${description.replace(/"/g, "'")}"`,
      },
    },
  );
}

const accepted = () => new NextResponse(null, { status: 202, headers: CORS });

const methodOf = (message: unknown) =>
  typeof message === "object" && message !== null
    ? (message as { method?: unknown }).method
    : undefined;

export async function POST(request: NextRequest) {
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!bearer) return unauthorized(request, "Sign in to ForkLeaf from your assistant to connect.");

  const access = await openAccess(bearer);
  if (!access) return unauthorized(request, "That access token has expired or is not valid.");
  if (access.expiresAt && access.expiresAt <= Math.floor(Date.now() / 1000) + 30) {
    return unauthorized(request, "That access token has expired.");
  }

  try {
    enforceRateLimit(request, { name: "mcp", limit: 120, windowMs: 60_000 });
  } catch {
    return noStoreJson(errorResponse(null, -32000, "Too many requests. Wait a minute."), 429);
  }

  const text = await request.text();
  if (text.length > MAX_BODY) {
    return noStoreJson(errorResponse(null, -32600, "That request is too large."), 413);
  }
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return noStoreJson(errorResponse(null, -32700, "The request body was not JSON."), 400);
  }

  const { target } = access;
  const client = new GitHubClient({ token: access.token, userAgent: "forkleaf-mcp" });
  const messages = Array.isArray(message) ? message : [message];

  // Only a tool call touches the repository; saying hello should not cost a
  // GitHub request.
  let branch = target.branch ?? "main";
  if (!target.branch && messages.some((each) => methodOf(each) === "tools/call")) {
    const repo = await client.getRepo(target.owner, target.repo).catch(() => null);
    if (!repo) {
      return noStoreJson(
        errorResponse(
          null,
          -32002,
          `${target.owner}/${target.repo} could not be read. It may have been renamed or deleted, or access was removed — connect again.`,
        ),
      );
    }
    branch = repo.defaultBranch;
  }

  const notebook = new GitHubNotebook(client, {
    owner: target.owner,
    repo: target.repo,
    branch,
    directory: target.directory,
  });
  const handleMessage = createServer(
    { name: "forkleaf", version: "1.0.0", instructions: INSTRUCTIONS },
    notebookTools(notebook, { readOnly: target.readOnly, root: target.directory }),
  );

  if (Array.isArray(message)) {
    const replies = (await Promise.all(message.map((each) => handleMessage(each)))).filter(
      (reply) => reply !== null,
    );
    return replies.length > 0 ? noStoreJson(replies) : accepted();
  }

  const reply = await handleMessage(message);
  return reply ? noStoreJson(reply) : accepted();
}

/** No server-sent event stream: every answer comes back on its request. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export const DELETE = GET;
export const OPTIONS = preflight;
