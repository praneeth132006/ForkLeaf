import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
