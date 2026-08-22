import "server-only";
import type { NextRequest } from "next/server";

/**
 * Where this deployment lives, for building redirects.
 *
 * `request.url` is derived from the `Host` header, which is attacker-controlled
 * on any host that does not pin it. Using it to build the OAuth redirect meant
 * a request with a forged `Host` could bounce the user to another origin after
 * sign-in — and could send GitHub a `redirect_uri` this deployment never
 * registered.
 *
 * So the configured URL wins, and the request's own origin is only a fallback
 * for local development and for preview deployments whose hostname is
 * generated after the environment variables were set. In production, an
 * unconfigured `NEXT_PUBLIC_APP_URL` is a misconfiguration worth being loud
 * about rather than quietly trusting a header.
 */
export function appBaseUrl(request: NextRequest): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL;

  if (configured) {
    try {
      return new URL(configured);
    } catch {
      console.error(
        "[forkleaf] NEXT_PUBLIC_APP_URL is not a valid URL; falling back to the request origin.",
      );
    }
  }

  // Vercel sets this for every deployment, including previews, and it is not
  // taken from a client header.
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelUrl) {
    try {
      return new URL(`https://${vercelUrl}`);
    } catch {
      // Fall through to the request origin.
    }
  }

  return new URL(request.nextUrl.origin);
}

/** An absolute URL on this deployment. Never accepts a caller-supplied origin. */
export function appUrl(request: NextRequest, path: string): URL {
  return new URL(path, appBaseUrl(request));
}
