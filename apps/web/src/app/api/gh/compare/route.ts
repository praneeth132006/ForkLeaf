import { type NextRequest } from "next/server";
import type { RepoRef } from "@forkleaf/types";
import { ApiError, assertName, assertRef, handle, requireClient } from "@/lib/api-helpers";

/**
 * What an experiment would do to the branch it came from.
 *
 * The other half of "try a rewrite without losing the original". Keeping or
 * throwing away an experiment already worked; deciding which was the part that
 * did not, because the two versions were never in front of anybody at the same
 * time. Reading the rewrite and remembering the original is not a comparison,
 * it is a memory test.
 *
 * Compared against the **merge base** rather than the base branch's tip. If
 * anything landed on `main` while the rewrite was being written, comparing
 * against the tip reports that work as something the experiment deletes —
 * which would talk somebody out of keeping a rewrite that deletes nothing.
 *
 * The file list comes back with the text, in one response. Notes are small and
 * an experiment touches a handful of them; a request per side per file would
 * be four round trips to show a two-file rewrite.
 */

/** How many files one comparison will read the text of. */
const FILE_LIMIT = 25;

/** Enough to diff a long note, and not enough to be a denial of service. */
const MAX_CHARS = 400_000;

export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;

    const owner = assertName((params.get("owner") ?? "").trim(), "repository owner");
    const repo = assertName((params.get("repo") ?? "").trim(), "repository name");
    const base = assertRef((params.get("base") ?? "").trim(), "base branch");
    const head = assertRef((params.get("head") ?? "").trim(), "branch being compared");

    if (base === head) {
      throw new ApiError(400, "validation", "A branch cannot be compared with itself.");
    }

    const comparison = await client.compareBranches(owner, repo, base, head, FILE_LIMIT);

    // Only text can be diffed. An experiment that adds a screenshot is a real
    // change and is still listed, with no text on either side — saying "this
    // was added" is more use than leaving it out of the list entirely.
    const ref: RepoRef = { owner, repo, branch: base, directory: "" };

    const files = await Promise.all(
      comparison.files.map(async (file) => {
        const diffable = /\.(mdx?|txt|ya?ml|json|csv)$/i.test(file.path);
        if (!diffable) {
          return { ...file, before: null, after: null, diffable: false };
        }

        // A renamed file is one file read from two paths.
        const beforePath = file.previousPath ?? file.path;

        const [before, after] = await Promise.all([
          file.status === "added"
            ? Promise.resolve(null)
            : client.readFileAtCommit(ref, beforePath, comparison.mergeBaseSha),
          file.status === "removed"
            ? Promise.resolve(null)
            : client.readFileAtCommit(ref, file.path, comparison.headSha),
        ]);

        // Too big to diff is reported as such, not as an empty side: a
        // `null` here means "not on this side of the comparison", and a huge
        // file borrowing that value would render as a wholesale deletion.
        const tooBig = (before?.length ?? 0) > MAX_CHARS || (after?.length ?? 0) > MAX_CHARS;
        if (tooBig) return { ...file, before: null, after: null, diffable: false };

        return { ...file, before, after, diffable: true };
      }),
    );

    return {
      base,
      head,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      aheadBy: comparison.aheadBy,
      behindBy: comparison.behindBy,
      truncated: comparison.truncated,
      files,
    };
  });
}
