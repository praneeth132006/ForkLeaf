import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl } from "@/lib/app-url";
import { CORS, preflight } from "@/lib/mcp-http";
import { protectedResourceMetadata } from "@/lib/mcp-oauth";

/** The same metadata, at the path-inserted address for `/api/mcp`. */
export function GET(request: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(appBaseUrl(request).origin), {
    headers: { ...CORS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = preflight;
