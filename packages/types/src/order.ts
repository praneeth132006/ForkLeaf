/**
 * How names are compared wherever ForkLeaf lists files and folders.
 *
 * `localeCompare` gets a numbered notebook wrong. Given `1. Introduction`,
 * `2. Networking` and `10. Attacking AD`, it compares the `1`, then the `0`
 * against the `.`, and files the tenth folder second — so a repository whose
 * folders are numbered precisely so they read in order was shown out of order,
 * and the numbering the author added was the thing being ignored.
 *
 * Digits are compared as numbers here, and everything between them as text.
 *
 * It lives in the types package because four separate places build or re-sort
 * the same tree — the GitHub client that first assembles it, the note
 * repository that patches it on create and rename, the editor's notebook hook
 * that grafts locally made folders on, and the dashboard's library index — and
 * a fifth private copy of "compare two names" is a fifth chance for two
 * listings of one folder to disagree with each other.
 */

/** Runs of digits and runs of everything else, in the order they appear. */
const CHUNKS = /\d+|\D+/g;
const ALL_DIGITS = /^\d+$/;

/**
 * A leading serial number, when a name starts with one — `7` for
 * `7. Capstone Projects`, `null` for `Reconnaissance`.
 *
 * The number has to be followed by punctuation, a space, or the end of the
 * name, so `2024 review` counts and `2fa-notes` does not: the first is somebody
 * numbering their material, the second is a word that happens to start with a
 * digit.
 */
const SERIAL = /^\s*(\d{1,9})(?=\s*(?:[.)\]:_-]|\s|$))/;

export function serialNumberOf(name: string): number | null {
  const match = SERIAL.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * Natural comparison: `2. Networking` before `10. Attacking AD`, and `img2`
 * before `img10`.
 */
export function compareTreeNames(a: string, b: string): number {
  const left = a.match(CHUNKS) ?? [];
  const right = b.match(CHUNKS) ?? [];
  const shared = Math.min(left.length, right.length);

  for (let index = 0; index < shared; index += 1) {
    const one = left[index]!;
    const two = right[index]!;

    const difference =
      ALL_DIGITS.test(one) && ALL_DIGITS.test(two)
        ? compareNumeric(one, two)
        : one.localeCompare(two, undefined, { sensitivity: "base" });

    if (difference !== 0) return difference;
  }

  if (left.length !== right.length) return left.length - right.length;

  // Same shape, same letters to a case-insensitive eye. A strict compare last
  // keeps the order total, so `Notes.md` and `notes.md` cannot swap places
  // between two renders of the same folder.
  return a.localeCompare(b);
}

/** Folders before files, then by name — the shape every listing shares. */
export function compareTreeEntries(
  a: { kind: "file" | "folder"; name: string },
  b: { kind: "file" | "folder"; name: string },
): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  return compareTreeNames(a.name, b.name);
}

/**
 * Two runs of digits by value, without going through `Number`.
 *
 * A path can hold a run of digits longer than a double can represent exactly —
 * a timestamp, a hash fragment — and two such runs both parse to the same
 * float and compare equal, which is a sort that quietly loses entries' order.
 */
function compareNumeric(a: string, b: string): number {
  const one = a.replace(/^0+(?=\d)/, "");
  const two = b.replace(/^0+(?=\d)/, "");

  if (one.length !== two.length) return one.length - two.length;
  if (one !== two) return one < two ? -1 : 1;

  // Equal in value: `01` and `1` still need a fixed order between them.
  return a.length - b.length;
}
