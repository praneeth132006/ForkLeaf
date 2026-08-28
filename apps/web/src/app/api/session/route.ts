import { NextResponse } from "next/server";
import { getLiveSession, githubOAuthConfigured } from "@/lib/session";

/**
 * Reports who is signed in, and whether GitHub sign-in is even available on
 * this deployment. The client uses the second flag to decide whether to show
 * "Continue with GitHub" or point at the self-hosting setup docs.
 *
 * Never returns the access token.
 */
export async function GET() {
  // The live session, not just the cookie: this is what the browser asks on
  // every boot, so it is the natural moment to renew an eight-hour token that
  // ran out while the tab was closed — and the answer here is what decides
  // whether the app draws itself as signed in.
  const session = await getLiveSession();

  return NextResponse.json(
    {
      mode: session ? "github" : "local",
      user: session?.user ?? null,
      githubAvailable: githubOAuthConfigured(),
      /**
       * What GitHub granted — never the token itself.
       *
       * The UI needs this to tell a genuine "no such repository" from "you did
       * not give this app access to private ones", which are the same 404 from
       * GitHub and need entirely different things said about them.
       */
      scopes: session?.scopes ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
