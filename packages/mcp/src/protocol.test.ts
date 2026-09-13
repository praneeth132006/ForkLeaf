import { describe, expect, it, vi } from "vitest";
import {
  INVALID_PARAMS,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  ToolInputError,
  createServer,
  text,
  type Tool,
} from "./protocol";

const echo: Tool = {
  name: "echo",
  description: "Says it back.",
  inputSchema: { type: "object", properties: { words: { type: "string" } } },
  annotations: { readOnlyHint: true },
  run: vi.fn(async (args) => text(String(args.words))),
};
const refuse: Tool = {
  name: "refuse",
  description: "Always refuses.",
  inputSchema: { type: "object" },
  run: async () => {
    throw new ToolInputError("That path is not a note.");
  },
};

const handle = createServer({ name: "forkleaf", version: "1.0.0", instructions: "Notes." }, [
  echo,
  refuse,
]);

describe("createServer", () => {
  it("initialises, agreeing on a version it supports", async () => {
    const response = await handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {} },
    });
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "forkleaf", version: "1.0.0" },
        instructions: "Notes.",
      },
    });
  });

  it("offers its newest version to a client asking for one it does not know", async () => {
    const response = await handle({
      jsonrpc: "2.0",
      id: "a",
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    expect((response!.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
  });

  it("answers ping, and does not answer notifications", async () => {
    expect(await handle({ jsonrpc: "2.0", id: 2, method: "ping" })).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {},
    });
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await handle({ jsonrpc: "2.0", method: "anything/else" })).toBeNull();
  });

  it("lists tools without their implementations", async () => {
    const response = await handle({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    const tools = (response!.result as { tools: Record<string, unknown>[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(["echo", "refuse"]);
    expect(tools[0]).toEqual({
      name: "echo",
      description: "Says it back.",
      inputSchema: echo.inputSchema,
      annotations: { readOnlyHint: true },
    });
    expect("run" in tools[0]!).toBe(false);
  });

  it("calls a tool with its arguments", async () => {
    const response = await handle({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "echo", arguments: { words: "hello" } },
    });
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 4,
      result: { content: [{ type: "text", text: "hello" }] },
    });
  });

  it("reports a tool that could not do it as a result the assistant can read", async () => {
    const response = await handle({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "refuse", arguments: {} },
    });
    expect(response!.result).toEqual({
      content: [{ type: "text", text: "That path is not a note." }],
      isError: true,
    });
  });

  it("uses JSON-RPC errors for requests it cannot make sense of", async () => {
    expect(await handle({ jsonrpc: "2.0", id: 6, method: "resources/list" })).toMatchObject({
      error: { code: METHOD_NOT_FOUND },
    });
    expect(
      await handle({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nope" } }),
    ).toMatchObject({ id: 7, error: { code: INVALID_PARAMS } });
    expect(
      await handle({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "echo", arguments: "words" },
      }),
    ).toMatchObject({ error: { code: INVALID_PARAMS } });
    expect(await handle({ id: 9, method: "ping" })).toMatchObject({
      id: 9,
      error: { code: INVALID_REQUEST },
    });
    expect(await handle("not even an object")).toMatchObject({
      id: null,
      error: { code: INVALID_REQUEST },
    });
    expect(await handle({ jsonrpc: "2.0", id: { nested: true }, method: "ping" })).toMatchObject({
      id: null,
      error: { code: INVALID_REQUEST },
    });
  });
});
