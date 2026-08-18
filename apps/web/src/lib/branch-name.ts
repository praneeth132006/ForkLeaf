/**
 * Trims a branch name down to something git will accept.
 *
 * Git's rules for ref names are a denylist of odd sequences — no `..`, no
 * trailing `.lock`, no leading dot, no doubled slashes — rather than a
 * character class. Reproducing them exactly is fiddly and the failure mode is
 * a rejected push halfway through someone's work, so this aims at the safe
 * subset instead: what a person types as "fix the docs" becomes `fix-the-docs`.
 *
 * Kept out of the route module so it can be tested without dragging
 * `server-only` and the session into a unit test.
 */
export function sanitizeBranchName(raw: string): string {
  return (
    raw
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^A-Za-z0-9._/-]/g, "")
      .replace(/\.\.+/g, ".")
      .replace(/\/\/+/g, "/")
      .replace(/^[./-]+|[./-]+$/g, "")
      .replace(/\.lock$/i, "")
      .slice(0, 200)
      // Slicing can leave a separator stranded at the end.
      .replace(/[./-]+$/g, "")
  );
}

/**
 * A branch name suggested from what the user is doing.
 *
 * Prefixed and dated because these land in other people's repositories, where
 * a branch called `patch-1` tells a maintainer nothing about what it contains.
 */
export function suggestBranchName(login: string, subject: string): string {
  const slug = sanitizeBranchName(subject.toLowerCase()).slice(0, 40) || "edit";
  return sanitizeBranchName(`${login}/${slug}`);
}
