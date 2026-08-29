import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Resolved rather than written as a path: pnpm does not hoist, so
 * `pdfjs-dist` lives under the one workspace package that depends on it and
 * nowhere a relative path from here could reliably reach.
 */
const legacyPdfJs = createRequire(r("./packages/pdf/package.json")).resolve(
  "pdfjs-dist/legacy/build/pdf.mjs",
);

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
      "@forkleaf/pdf": r("./packages/pdf/src/index.ts"),
      /**
       * pdf.js's Node build, for the tests only.
       *
       * The default entry point targets current browsers and reaches for
       * whatever V8 has shipped most recently — `Map.getOrInsertComputed` and
       * `Math.sumPrecise` among them. Node lags that by a release or two, and
       * the failure mode is the worst kind: `getDocument` never settles, so
       * every test in `document.test.ts` sits there until the timeout with
       * nothing thrown and nothing logged but pdf.js's own advice, which is
       * exactly this — "please use the `legacy` build in Node.js".
       *
       * Scoped to the test runner deliberately. The app still bundles and
       * ships the modern build to browsers, which is where it belongs; only
       * the suite, which has no browser, takes the transpiled one. Guessing at
       * polyfills instead would work until the next V8 feature pdf.js adopts.
       */
      "pdfjs-dist": legacyPdfJs,
    },
  },
});
