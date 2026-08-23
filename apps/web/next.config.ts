import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The floating "N" badge in the corner of every dev page.
   *
   * It overlaps the bottom-left of the editor — the sidebar's sign-in button
   * and the status bar both sit under it — so it is not a neutral overlay, it
   * hides controls. Development only; it never shipped to production, but the
   * people looking at ForkLeaf most often are looking at a dev server.
   */
  devIndicators: false,

  // Workspace packages ship TypeScript source rather than a build output, which
  // removes the build-order dance between packages and keeps HMR working across
  // the monorepo. Next compiles them as part of the app.
  transpilePackages: [
    "@forkleaf/types",
    "@forkleaf/markdown-engine",
    "@forkleaf/github-client",
    "@forkleaf/store",
    "@forkleaf/diagrams",
    "@forkleaf/exporter",
    "@forkleaf/editor",
  ],

  /**
   * Baseline headers for every response, including the static assets that
   * `src/proxy.ts` deliberately skips. The policy work that needs a per-request
   * value — Content-Security-Policy with its nonce, HSTS, the cross-origin
   * isolation headers — lives in the proxy instead.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
