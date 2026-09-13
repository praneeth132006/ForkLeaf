/**
 * The Model Context Protocol, the small part of it this server speaks.
 *
 * JSON-RPC 2.0 messages, one per line over stdio: `initialize`, `ping`,
 * `tools/list` and `tools/call`. Written by hand rather than taken from the
 * SDK, the same choice the GitHub client makes — it is a few dozen lines, and
 * every behaviour an assistant depends on is then explicit and tested here.
 *
 * Two kinds of failure, kept apart the way the protocol asks: a malformed
 * request is a JSON-RPC error, while a tool that ran and could not do what was
 * asked answers with `isError`, so the assistant reads why and can try again.
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface Tool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/** A tool refusing what it was asked, in words for the assistant. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export const text = (value: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: value }],
  ...(isError ? { isError: true } : {}),
});

type Id = string | number | null;
export type Response = Record<string, unknown>;

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validId = (value: unknown): value is Id =>
  value === null || typeof value === "string" || typeof value === "number";

export const errorResponse = (id: Id, code: number, message: string): Response => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

export function createServer(
  info: { name: string; version: string; instructions?: string },
  tools: readonly Tool[],
) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  async function call(params: Record<string, unknown>): Promise<ToolResult | Response> {
    const tool = typeof params.name === "string" ? byName.get(params.name) : undefined;
    if (!tool)
      return { code: INVALID_PARAMS, message: `No tool is called ${String(params.name)}.` };

    const args = params.arguments ?? {};
    if (!isObject(args))
      return { code: INVALID_PARAMS, message: "Tool arguments must be an object." };

    try {
      return await tool.run(args);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return text(message, true);
    }
  }

  /** Answers one message, or returns null for a notification, which gets no answer. */
  return async function handle(message: unknown): Promise<Response | null> {
    if (!isObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      const id = isObject(message) && validId(message.id) ? message.id : null;
      return errorResponse(id, INVALID_REQUEST, "Not a JSON-RPC 2.0 request.");
    }

    const notification = !("id" in message);
    if (!notification && !validId(message.id)) {
      return errorResponse(
        null,
        INVALID_REQUEST,
        "A request id must be a string, a number or null.",
      );
    }
    const id = (message.id ?? null) as Id;
    const params = isObject(message.params) ? message.params : {};

    const reply = (result: unknown): Response | null =>
      notification ? null : { jsonrpc: "2.0", id, result };

    switch (message.method) {
      case "initialize": {
        const asked = params.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(
          asked as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number],
        )
          ? asked
          : SUPPORTED_PROTOCOL_VERSIONS[0];
        return reply({
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: info.name, version: info.version },
          ...(info.instructions ? { instructions: info.instructions } : {}),
        });
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: tools.map(({ run: _run, ...described }) => described) });
      case "tools/call": {
        const outcome = await call(params);
        if ("code" in outcome) {
          return notification
            ? null
            : errorResponse(id, outcome.code as number, outcome.message as string);
        }
        return reply(outcome);
      }
      default:
        // Notifications — `notifications/initialized`, cancellations — need no
        // answer, and an unknown one is not worth an error nobody will read.
        return notification
          ? null
          : errorResponse(id, METHOD_NOT_FOUND, `This server does not handle ${message.method}.`);
    }
  };
}
