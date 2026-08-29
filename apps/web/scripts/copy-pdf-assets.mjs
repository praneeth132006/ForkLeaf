/**
 * Copies pdf.js's font and character-map data into `public/pdfjs`.
 *
 * pdf.js does not embed two things it frequently needs: the fourteen standard
 * PDF fonts, and the character maps that make CJK text readable. It fetches
 * them at runtime from wherever it is told, and the default is a CDN.
 *
 * ForkLeaf serves them itself, for the reason the rest of this app exists:
 * a notes application that quietly reports every document you open to a third
 * party's server — which is what a CDN fetch for a document's own character
 * map amounts to — has no business claiming your notes are yours. The Content
 * Security Policy would refuse the request in any case.
 *
 * Copied at build time rather than committed, so the data can never drift out
 * of step with the installed version of pdf.js. Run before `dev` and `build`
 * alike: the reader needs them in development too, and a Japanese PDF that
 * extracts no text only on one developer's machine is a bad afternoon.
 */
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const source = dirname(require.resolve("pdfjs-dist/package.json"));
const target = join(here, "..", "public", "pdfjs");

const version = JSON.parse(await readFile(join(source, "package.json"), "utf8")).version;
const stamp = join(target, ".version");

// Skipping the copy when the version already matches keeps `next dev` starting
// promptly; without it this is two thousand small file copies on every start.
try {
  if ((await readFile(stamp, "utf8")).trim() === version) process.exit(0);
} catch {
  // No stamp, or an unreadable one. Copy.
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const folder of ["standard_fonts", "cmaps"]) {
  await cp(join(source, folder), join(target, folder), { recursive: true });
}

const { writeFile } = await import("node:fs/promises");
await writeFile(stamp, `${version}\n`);

console.log(`[forkleaf] pdf.js ${version} assets copied to public/pdfjs`);
