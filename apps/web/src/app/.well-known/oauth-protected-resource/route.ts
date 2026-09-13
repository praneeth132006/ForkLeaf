import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl } from "@/lib/app-url";
import { CORS, preflight } from "@/lib/mcp-http";
import { protectedResourceMetadata } from "@/lib/mcp-oauth";

/**
 * RFC 9728: what the MCP endpoint is, and who issues its tokens.
 *
 * Served here and at `/api/mcp` appended to this path, which is where a client
 * following the specification's path-insertion rule looks first.
 */
export function GET(request: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(appBaseUrl(request).origin), {
    headers: { ...CORS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = preflight;
