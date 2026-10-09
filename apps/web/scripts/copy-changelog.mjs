/**
 * Copies the repository's CHANGELOG.md into this app, for `/changelog`.
 *
 * The page renders the changelog from the file rather than from a copy kept
 * by hand, so the two cannot drift. But the file lives at the monorepo root,
 * outside the app, and shipping a file from there with a page made Next's
 * tracer pull in over a thousand unrelated files — root dev dependencies
 * included. Copied here, it is one file inside the app like any other.
 *
 * Run before `dev` and `build`; the copy is not committed.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "..", "CHANGELOG.md");
const target = join(here, "..", "content", "CHANGELOG.md");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
