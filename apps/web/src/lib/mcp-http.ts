import { NextResponse } from "next/server";

/**
 * Headers and error shapes shared by the assistant-facing endpoints.
 *
 * These endpoints take a bearer token or nothing, never this site's cookies,
 * so allowing any origin cannot lend a signed-in browser session to another
 * site — and browser-based MCP clients need it to connect at all.
 */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Expose-Headers": "www-authenticate, mcp-session-id",
  "Access-Control-Max-Age": "86400",
};

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** An OAuth error response, as RFC 6749 spells it. */
export function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

export function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}
