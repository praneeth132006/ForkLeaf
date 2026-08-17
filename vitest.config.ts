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
      "@mdnotion/types": r("./packages/types/src/index.ts"),
      "@mdnotion/markdown-engine": r("./packages/markdown-engine/src/index.ts"),
      "@mdnotion/github-client": r("./packages/github-client/src/index.ts"),
      "@mdnotion/store": r("./packages/store/src/index.ts"),
      "@mdnotion/diagrams": r("./packages/diagrams/src/index.ts"),
      "@mdnotion/exporter": r("./packages/exporter/src/index.ts"),
      "@mdnotion/editor": r("./packages/editor/src/index.ts"),
    },
  },
});
