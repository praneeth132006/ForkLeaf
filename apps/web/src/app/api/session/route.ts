import { NextResponse } from "next/server";
import { getSession, githubOAuthConfigured } from "@/lib/session";

/**
 * Reports who is signed in, and whether GitHub sign-in is even available on
 * this deployment. The client uses the second flag to decide whether to show
 * "Continue with GitHub" or point at the self-hosting setup docs.
 *
 * Never returns the access token.
 */
export async function GET() {
  const session = await getSession();

  return NextResponse.json(
    {
      mode: session ? "github" : "local",
      user: session?.user ?? null,
      githubAvailable: githubOAuthConfigured(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
