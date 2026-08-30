import { NextResponse, type NextRequest } from "next/server";
import { THEME_INIT_HASH } from "@/lib/theme-script-hash";

/**
 * Request-time security headers.
 *
 * Two jobs, both of which have to happen before the app renders:
 *
 * 1. **Content Security Policy.** ForkLeaf renders markdown and Mermaid
 *    diagrams from repositories the user does not necessarily control, through
 *    `innerHTML`. Sanitising that content is the primary defence and it happens
 *    on both paths — but a sanitiser bug should not be the only thing standing
 *    between a poisoned README and someone's GitHub token.
 *
 * 2. **Cross-origin write protection.** The session cookie is `SameSite=Lax`,
 *    which already keeps it off cross-site POSTs. The origin check below is the
 *    belt to that pair of braces: any state-changing API call whose `Origin` is
 *    not this site is refused outright, so a future cookie change cannot
 *    silently open a CSRF hole.
 *
 * ## Why there are two policies
 *
 * A nonce is a per-request value, so Next can only stamp it onto the script
 * tags of a page it renders per request. A prerendered page's scripts carry no
 * nonce, and under `strict-dynamic` — which makes `'self'` inert — they would
 * all be refused, leaving a blank screen. So the strict policy is scoped to the
 * routes that both render untrusted note content *and* are rendered per
 * request; everything else keeps its prerendered HTML and a policy that still
 * forbids third-party script, framing, plugins and `<base>` rewriting.
 *
 * Adding a route to `NONCED_ROUTES` therefore means opting that route out of
 * static rendering too (`export const dynamic = "force-dynamic"`), or its
 * scripts will be blocked in production.
 *
 * In Next 16 this file is `proxy.ts`; the old `middleware.ts` name is
 * deprecated.
 */

/**
 * Routes rendered per request that get the nonce policy.
 *
 * These are the screens built out of the user's own repositories: the editor,
 * which injects rendered markdown and diagram SVG as HTML; the dashboard,
 * which builds an index out of every note in them; the pop-out diagram
 * window, which is the editor's diagram studio in a tab of its own; and the
 * pull-request diagram review, which injects SVG built from a repository
 * anyone may have opened a request against.
 */
const NONCED_ROUTES = ["/editor", "/dashboard", "/diagram", "/diagram-diff", "/reader"];

/** Methods that can change something. Everything else is a read. */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV !== "production";

  if (isForbiddenCrossOriginWrite(request)) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Cross-origin request refused." } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const path = request.nextUrl.pathname;
  const nonced = NONCED_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
  const nonce = nonced ? Buffer.from(crypto.randomUUID()).toString("base64") : null;

  const csp = policy(nonce, isDev);

  const headers = new Headers(request.headers);
  if (nonce) {
    headers.set("x-nonce", nonce);
    // Next reads the nonce back out of this header while rendering, and stamps
    // it onto the framework's own script tags.
    headers.set("Content-Security-Policy", csp);
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);

  // Redundant with `frame-ancestors` for modern browsers, kept for old ones.
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

  // Only meaningful over HTTPS, and actively unhelpful on a local http server.
  if (!isDev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}

/**
 * The policy itself.
 *
 * With a nonce: `strict-dynamic`, so only the nonced bundle and whatever it
 * loads may run, and an injected `<script>` cannot.
 *
 * Without one: `'unsafe-inline'`, which is the price of serving prerendered
 * HTML whose script tags cannot carry a per-request value. Every other
 * directive is identical, and the routes on this policy do not render note
 * content.
 */
function policy(nonce: string | null, isDev: boolean): string {
  const script = nonce
    ? // The hash covers the theme script inlined in the document head, which is
      // a build-time constant rather than a per-request tag.
      //
      // No host allowlist here on purpose: `strict-dynamic` makes host sources
      // be ignored, and covers gtag anyway, since Firebase Analytics injects
      // that tag from the nonced bundle.
      `'self' 'nonce-${nonce}' '${THEME_INIT_HASH}' 'strict-dynamic'`
    : // The prerendered routes have no nonce and so no `strict-dynamic`, which
      // means the tag Firebase Analytics injects has to be named explicitly.
      // Without it the landing page loaded analytics and the browser blocked
      // it on every visit — `connect-src` below already expects it to work.
      `'self' 'unsafe-inline' https://www.googletagmanager.com`;

  return [
    "default-src 'self'",
    // React reconstructs server stack traces with eval in development only.
    `script-src ${script}${isDev ? " 'unsafe-eval'" : ""}`,
    // Mermaid writes a <style> element into every SVG it renders, so inline
    // styles cannot be forbidden here without diagrams losing their colours.
    // Styles cannot exfiltrate or execute; scripts are where the risk is.
    "style-src 'self' 'unsafe-inline'",
    // Notes embed images, and an image in someone else's markdown file can
    // legitimately live on any host — an allowlist of GitHub's own domains
    // meant that linking a picture from anywhere else rendered as a broken
    // image with a console error, which read as the feature not working. Any
    // https image may load; `img-src` cannot execute anything, and uploads
    // committed to the repository come from this origin regardless.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // GitHub itself is never called from the browser — it goes through this
    // app's own routes. These are Firebase's endpoints, and only apply when a
    // Firebase project is configured.
    [
      "connect-src 'self'",
      "https://*.googleapis.com",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://*.firebaseio.com",
      "wss://*.firebaseio.com",
    ].join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // YouTube embeds are iframes served from youtube-nocookie.com, and are now
    // the only third-party frame the app has. github.com was here for the
    // Sponsors card on the profile page; with that card gone, so is the
    // permission — an origin allowed to frame us is worth removing the moment
    // nothing needs it.
    "frame-src https://www.youtube-nocookie.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * True when this is a write from another site.
 *
 * A missing `Origin` is allowed: same-origin GETs and some legitimate clients
 * omit it, and blocking those would break the app while adding nothing — a
 * browser doing a cross-site write always sends one.
 */
function isForbiddenCrossOriginWrite(request: NextRequest): boolean {
  if (!WRITE_METHODS.has(request.method)) return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  const allowed = new Set<string>([request.nextUrl.origin]);

  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      // Misconfigured env var; the request origin still covers the normal case.
    }
  }

  // Vercel preview deployments are served from a generated hostname that no
  // configuration knows in advance.
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    allowed.add(`https://${forwardedHost}`);
  }

  return !allowed.has(origin);
}

export const config = {
  matcher: [
    {
      // Static assets need no policy, and prefetches are not documents.
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
