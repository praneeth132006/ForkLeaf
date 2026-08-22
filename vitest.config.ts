import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    // Most of the suite is pure logic and runs in node. Files that need a DOM
    // opt in with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["packages/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    globals: true,
  },
  resolve: {
    alias: {
      // The web app's own path alias, so its modules can be unit tested the
      // same way the packages are.
      "@": r("./apps/web/src"),
      // `server-only` throws on import outside a server bundle, so the modules
      // that guard the API routes could not otherwise be unit tested.
      "server-only": r("./test/server-only-stub.ts"),
      "@forkleaf/types": r("./packages/types/src/index.ts"),
      "@forkleaf/markdown-engine": r("./packages/markdown-engine/src/index.ts"),
      "@forkleaf/github-client": r("./packages/github-client/src/index.ts"),
      "@forkleaf/store": r("./packages/store/src/index.ts"),
      "@forkleaf/diagrams": r("./packages/diagrams/src/index.ts"),
      "@forkleaf/exporter": r("./packages/exporter/src/index.ts"),
      "@forkleaf/editor": r("./packages/editor/src/index.ts"),
    },
  },
});
