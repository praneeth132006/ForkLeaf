/**
 * Copies Tesseract — the text recogniser — into `public/ocr`.
 *
 * Reading the words in a screenshot or a photographed page happens on the
 * device, in a worker, with Tesseract compiled to WebAssembly. Its worker, its
 * engine and its English model are served from this app rather than from the
 * CDN the library defaults to: a picture of somebody's notes is the last thing
 * that should be announced to a third party on its way to being read, and the
 * Content Security Policy would refuse the request anyway.
 *
 * Only the LSTM engines are copied — with and without SIMD; the library picks
 * whichever the browser can run — and the compact "best_int" English model.
 * Copied at build time rather than committed, like pdf.js's data.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "public", "ocr");

const library = dirname(dirname(fileURLToPath(import.meta.resolve("tesseract.js"))));
// The engine is a dependency of the library, not of this app, so it is found
// from the library's own folder.
const core = dirname(
  createRequire(join(library, "package.json")).resolve("tesseract.js-core/package.json"),
);
const english = dirname(fileURLToPath(import.meta.resolve("@tesseract.js-data/eng")));

const version = [
  JSON.parse(await readFile(join(library, "package.json"), "utf8")).version,
  JSON.parse(await readFile(join(core, "package.json"), "utf8")).version,
  JSON.parse(await readFile(join(english, "package.json"), "utf8")).version,
].join(" ");
const stamp = join(target, ".version");

try {
  if ((await readFile(stamp, "utf8")).trim() === version) process.exit(0);
} catch {
  // No stamp yet. Copy.
}

await mkdir(join(target, "lang"), { recursive: true });
await copyFile(join(library, "dist", "worker.min.js"), join(target, "worker.min.js"));
for (const file of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"]) {
  await copyFile(join(core, file), join(target, file));
}
await copyFile(
  join(english, "4.0.0_best_int", "eng.traineddata.gz"),
  join(target, "lang", "eng.traineddata.gz"),
);
await copyFile(join(core, "LICENSE"), join(target, "LICENSE-tesseract.txt"));
await writeFile(stamp, `${version}\n`);
