import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

/**
 * Signs the user out.
 *
 * POST only: a GET logout can be triggered by any page embedding an image
 * pointing at this URL, which would let a third-party site sign people out.
 */
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
