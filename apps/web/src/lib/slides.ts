/**
 * A note as slides.
 *
 * Nothing about the note changes to present it. A slide ends where the writer
 * already put a break: a `---` line, the spelling every markdown slide tool
 * reads (Marp, reveal.js, Obsidian's own). A note with no `---` is split at
 * its second-level headings instead, so an ordinary note with sections
 * presents as one slide per section, with anything above the first section —
 * the title, an introduction — as the opening slide.
 *
 * A `---` or heading inside a fenced block is code and splits nothing.
 */

const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s{0,3}(-\s*){3,}\s*$/;
const SECTION = /^##\s+\S/;

export function splitSlides(markdown: string): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let fence: string | null = null;
  const inCode = lines.map((line) => {
    const open = FENCE.exec(line);
    if (fence === null) {
      if (open) fence = open[1]!;
      return open !== null;
    }
    if (open && open[1] === fence) fence = null;
    return true;
  });

  const rules = lines.some((line, i) => !inCode[i] && RULE.test(line));

  const slides: string[][] = [[]];
  lines.forEach((line, i) => {
    if (!inCode[i] && rules && RULE.test(line)) {
      slides.push([]);
      return;
    }
    if (!inCode[i] && !rules && SECTION.test(line) && slides[slides.length - 1]!.some(Boolean)) {
      slides.push([]);
    }
    slides[slides.length - 1]!.push(line);
  });

  return slides.map((slide) => slide.join("\n").trim()).filter(Boolean);
}
