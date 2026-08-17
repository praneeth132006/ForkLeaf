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

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The app renders markdown from arbitrary repositories, so the usual
          // clickjacking and sniffing protections matter here.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
