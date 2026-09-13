import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl } from "@/lib/app-url";
import { CORS, preflight } from "@/lib/mcp-http";
import { authorizationServerMetadata } from "@/lib/mcp-oauth";

/** RFC 8414: where an assistant finds how to sign in to this ForkLeaf. */
export function GET(request: NextRequest) {
  return NextResponse.json(authorizationServerMetadata(appBaseUrl(request).origin), {
    headers: { ...CORS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = preflight;
