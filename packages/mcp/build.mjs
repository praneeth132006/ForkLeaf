import { build } from "esbuild";

/**
 * Bundles the server into one file that `npx @forkleaf/mcp` can run.
 *
 * The workspace packages it depends on are TypeScript sources, not published
 * libraries, so they are bundled in rather than installed: the published
 * package has no dependencies at all, and starts without a compile step.
 */
await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/forkleaf-mcp.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: true,
  legalComments: "none",
  banner: {
    // A shebang so npm can link it as a command, and `require` for the few
    // CommonJS modules the markdown pipeline still pulls in.
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __forkleafRequire } from "node:module";',
      "const require = __forkleafRequire(import.meta.url);",
    ].join("\n"),
  },
});
