import { stripExtension } from "@forkleaf/markdown-engine";

/**
 * A map of contents: the notes that belong with this one, written into it.
 *
 * A hub note — "Machine learning", "Project X" — is only as useful as its list
 * of what else is there, and keeping that list by hand is the chore nobody
 * does. The notebook already knows the answer: the notes that link here, the
 * notes this one links to, and the notes carrying the same tags. This writes
 * them as a `## Map of contents` section of ordinary `[[wikilinks]]`, so it
 * reads the same in Obsidian and on github.com.
 *
 * Running it again replaces the section and nothing else — the rest of the
 * note is left exactly as written.
 */

export const MOC_HEADING = "## Map of contents";

export interface MocNote {
  path: string;
  title: string;
  tags: readonly string[];
}

export interface MocInput {
  note: MocNote;
  /** Paths of notes that link to this one. */
  linkedFrom: readonly string[];
  /** Paths of notes this one links to. */
  linksTo: readonly string[];
  /** Every other note, to find shared tags in. */
  notes: readonly MocNote[];
}

/** `[[path]]`, or `[[path|title]]` when the file name would not say what the note is. */
function linkTo(note: MocNote): string {
  const target = stripExtension(note.path);
  const name = target.split("/").pop() ?? target;
  return name.toLowerCase() === note.title.toLowerCase()
    ? `[[${target}]]`
    : `[[${target}|${note.title}]]`;
}

export function mapOfContents(input: MocInput): string {
  const byPath = new Map(input.notes.map((note) => [note.path, note]));
  const self = input.note.path;
  const seen = new Set<string>([self]);
  const take = (paths: readonly string[]) =>
    paths
      .filter((path) => !seen.has(path) && byPath.has(path))
      .map((path) => {
        seen.add(path);
        return byPath.get(path)!;
      })
      .sort((a, b) => a.title.localeCompare(b.title));

  const sections: { heading: string; notes: MocNote[] }[] = [
    { heading: "Linked from here", notes: take(input.linksTo) },
    { heading: "Links here", notes: take(input.linkedFrom) },
  ];

  const mine = new Set(input.note.tags.map((tag) => tag.toLowerCase()));
  for (const tag of [...mine].sort()) {
    const tagged = input.notes
      .filter((note) => note.tags.some((each) => each.toLowerCase() === tag))
      .map((note) => note.path);
    sections.push({ heading: `Tagged #${tag}`, notes: take(tagged) });
  }

  const body = sections
    .filter((section) => section.notes.length > 0)
    .map(
      (section) =>
        `### ${section.heading}\n\n${section.notes.map((note) => `- ${linkTo(note)}`).join("\n")}`,
    )
    .join("\n\n");

  return `${MOC_HEADING}\n\n${body || "_Nothing links here yet, and no other note shares its tags._"}\n`;
}

/**
 * The note with its map of contents written in: the old section replaced if
 * there is one, else a new one at the end.
 */
export function withMapOfContents(content: string, section: string): string {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim().toLowerCase() === MOC_HEADING.toLowerCase());
  if (start === -1) {
    const trimmed = content.replace(/\s*$/, "");
    return `${trimmed ? `${trimmed}\n\n` : ""}${section}`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,2}\s/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  const before = lines.slice(0, start).join("\n").replace(/\s*$/, "");
  const after = lines.slice(end).join("\n").replace(/^\s*/, "");
  return `${before ? `${before}\n\n` : ""}${section}${after ? `\n${after}` : ""}`;
}
