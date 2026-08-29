/**
 * A PDF, built by hand, for tests.
 *
 * The rest of this package is tested against plain data, which is the right
 * way to test the logic and proves nothing at all about the one assumption
 * everything rests on: that pdf.js hands back what `assemblePageText` thinks
 * it does. A fixture whose exact words and layout are known here closes that
 * gap, in CI, without committing a binary or depending on whatever documents
 * happen to be on the machine running the suite.
 *
 * Written out longhand rather than pulled from a library. A PDF generator is a
 * large dependency to add for a test file of a few hundred bytes, and the
 * format's structure — a header, numbered objects, a cross-reference table
 * pointing at each one's byte offset, a trailer — is short enough to write
 * exactly once and read afterwards.
 */

export interface FixtureLine {
  text: string;
  /** Points from the left of the page. */
  x: number;
  /** Points from the bottom, the way PDF measures. */
  y: number;
  size?: number;
}

export interface FixturePage {
  lines: FixtureLine[];
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

/** Builds a one-font, uncompressed PDF containing exactly these pages. */
export function buildPdf(pages: readonly FixturePage[]): Uint8Array {
  const objects: string[] = [];
  /** Reserves an object number, 1-based, and returns it. */
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  // Object numbers have to be known before the objects that reference them are
  // written, so the tree is laid out first and filled in after.
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  objects.push("", "", "");

  objects[fontId - 1] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  const pageIds: number[] = [];

  for (const page of pages) {
    const stream = page.lines
      .map(
        (line) =>
          `BT /F1 ${line.size ?? 12} Tf 1 0 0 1 ${line.x} ${line.y} Tm (${escapeText(line.text)}) Tj ET`,
      )
      .join("\n");

    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
  }

  objects[pagesId - 1] =
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  // ── Serialise ─────────────────────────────────────────────────────────────
  //
  // The cross-reference table is a list of byte offsets, so the file has to be
  // assembled as bytes while it is being written rather than as a string that
  // is encoded afterwards — a multi-byte character anywhere in the content
  // would put every offset out and the reader would refuse the file.

  const parts: Uint8Array[] = [];
  let length = 0;
  const write = (text: string) => {
    const bytes = new TextEncoder().encode(text);
    parts.push(bytes);
    length += bytes.length;
  };

  write("%PDF-1.7\n");

  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(length);
    write(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xref = length;
  write(`xref\n0 ${objects.length + 1}\n`);
  write("0000000000 65535 f \n");
  for (const offset of offsets) {
    write(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  write(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );

  const file = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    file.set(part, at);
    at += part.length;
  }
  return file;
}

/** Escapes the three characters that end a PDF string early. */
function escapeText(text: string): string {
  return text.replace(/([\\()])/g, "\\$1");
}
