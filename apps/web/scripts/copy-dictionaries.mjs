/**
 * Copies the English Hunspell dictionary into `public/dictionaries`.
 *
 * Spelling suggestions run in a worker in the browser and need the
 * dictionary's two files, `.aff` (the rules) and `.dic` (the words). They are
 * served from this app rather than a CDN for the same reason pdf.js's data is:
 * checking somebody's spelling must not tell a third party what they are
 * writing, and the Content Security Policy would refuse it anyway.
 *
 * Copied at build time rather than committed, so the files always match the
 * installed `dictionary-en`.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// The package's `exports` list only its JavaScript entry, so its folder is
// found from that entry rather than from its package.json.
const source = dirname(fileURLToPath(import.meta.resolve("dictionary-en")));
const target = join(here, "..", "public", "dictionaries");

const version = JSON.parse(await readFile(join(source, "package.json"), "utf8")).version;
const stamp = join(target, ".version");

try {
  if ((await readFile(stamp, "utf8")).trim() === version) process.exit(0);
} catch {
  // No stamp yet. Copy.
}

await mkdir(target, { recursive: true });
await copyFile(join(source, "index.aff"), join(target, "en.aff"));
await copyFile(join(source, "index.dic"), join(target, "en.dic"));
await copyFile(join(source, "license"), join(target, "LICENSE-en.txt"));
await writeFile(stamp, `${version}\n`);
