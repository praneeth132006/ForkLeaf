import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ExternalHyperlink,
  ImageRun,
} from "docx";
import { parseToAst } from "@forkleaf/markdown-engine";
import type { Root, RootContent, PhrasingContent, Heading, List, Table as MdTable } from "mdast";
import type { ImageResolver } from "./html";

/**
 * Markdown → .docx, entirely in the browser.
 *
 * Walks the mdast tree rather than converting HTML, so headings become real
 * Word heading styles and lists become real Word lists — the document stays
 * editable and navigable rather than arriving as flat styled text.
 */

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
}

/** An image, decoded and measured, ready to be placed in the document. */
interface Picture {
  data: Uint8Array;
  type: "png" | "jpg" | "gif" | "bmp";
  width: number;
  height: number;
}

/**
 * The images found for this document, by the `src` written in the note.
 *
 * Word needs the bytes and the size in pixels, neither of which the markdown
 * carries, so they are gathered before the walk begins and looked up during
 * it — the tree walk is synchronous and fetching is not.
 */
type Pictures = ReadonlyMap<string, Picture>;

/** Flattens inline markdown into styled runs, carrying nested emphasis down. */
function toRuns(
  nodes: PhrasingContent[],
  style: InlineStyle = {},
  pictures: Pictures = new Map(),
): (TextRun | ImageRun | ExternalHyperlink)[] {
  const runs: (TextRun | ImageRun | ExternalHyperlink)[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "text":
        runs.push(new TextRun({ text: node.value, ...style }));
        break;
      case "strong":
        runs.push(...toRuns(node.children, { ...style, bold: true }, pictures));
        break;
      case "emphasis":
        runs.push(...toRuns(node.children, { ...style, italics: true }, pictures));
        break;
      case "delete":
        runs.push(...toRuns(node.children, { ...style, strike: true }, pictures));
        break;
      case "inlineCode":
        runs.push(new TextRun({ text: node.value, font: "Consolas", ...style }));
        break;
      case "link":
        runs.push(
          new ExternalHyperlink({
            link: node.url,
            children: toRuns(node.children, { ...style }, pictures).filter(
              (r): r is TextRun => r instanceof TextRun,
            ),
          }),
        );
        break;
      case "break":
        runs.push(new TextRun({ break: 1 }));
        break;
      case "image": {
        /**
         * The picture itself, when the app could find its bytes.
         *
         * A Word document that says "[image]" where the screenshots were is
         * not an export of the note, it is a description of one — and the alt
         * text a pasted screenshot carries is its filename, so what actually
         * appeared in the document was a column of numbers.
         *
         * The alt text is still the fallback, for an image whose bytes are
         * nowhere to be found. It is honest; it is just no longer the plan.
         */
        const picture = pictures.get(node.url);
        if (picture) {
          runs.push(
            new ImageRun({
              type: picture.type,
              data: picture.data,
              transformation: { width: picture.width, height: picture.height },
              ...(node.alt
                ? { altText: { name: node.alt, description: node.alt, title: node.alt } }
                : {}),
            }),
          );
          break;
        }

        runs.push(new TextRun({ text: node.alt ?? "[image]", italics: true }));
        break;
      }
      default:
        if ("children" in node && Array.isArray(node.children)) {
          runs.push(...toRuns(node.children as PhrasingContent[], style, pictures));
        }
    }
  }

  return runs;
}

function listParagraphs(list: List, pictures: Pictures, depth = 0): (Paragraph | Table)[] {
  const paragraphs: (Paragraph | Table)[] = [];

  for (const item of list.children) {
    const [first, ...rest] = item.children;

    // A task list item renders as a checkbox glyph — Word has no native
    // checkbox that survives a round trip.
    const prefix = typeof item.checked === "boolean" ? (item.checked ? "☑ " : "☐ ") : "";

    if (first?.type === "paragraph") {
      paragraphs.push(
        new Paragraph({
          children: [
            ...(prefix ? [new TextRun({ text: prefix })] : []),
            ...toRuns(first.children, {}, pictures),
          ],
          ...(list.ordered
            ? { numbering: { reference: "forkleaf-ordered", level: depth } }
            : { bullet: { level: depth } }),
        }),
      );
    }

    for (const child of rest) {
      if (child.type === "list") paragraphs.push(...listParagraphs(child, pictures, depth + 1));
      else paragraphs.push(...blockToParagraphs(child, pictures));
    }
  }

  return paragraphs;
}

function tableToDocx(node: MdTable, pictures: Pictures): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: node.children.map(
      (row: MdTable["children"][number], rowIndex: number) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: row.children.map(
            (cell, cellIndex) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: toRuns(
                      cell.children as PhrasingContent[],
                      { bold: rowIndex === 0 },
                      pictures,
                    ),
                    alignment: alignmentFor(node.align?.[cellIndex]),
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

function alignmentFor(align: string | null | undefined) {
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

function blockToParagraphs(node: RootContent, pictures: Pictures): (Paragraph | Table)[] {
  switch (node.type) {
    case "heading": {
      const heading = node as Heading;
      return [
        new Paragraph({
          heading: HEADING_LEVELS[heading.depth - 1],
          children: toRuns(heading.children, {}, pictures),
          spacing: { before: 240, after: 120 },
        }),
      ];
    }

    case "paragraph":
      return [
        new Paragraph({
          children: toRuns(node.children, {}, pictures),
          spacing: { after: 160 },
          // A paragraph that is only a picture reads as a figure, and a figure
          // belongs in the middle of the page rather than hard against the
          // left margin.
          ...(isPictureOnly(node.children, pictures) ? { alignment: AlignmentType.CENTER } : {}),
        }),
      ];

    case "list":
      return listParagraphs(node, pictures);

    case "code":
      // Each line becomes its own paragraph so long code does not run off the page.
      return node.value.split("\n").map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, font: "Consolas", size: 20 })],
            shading: { fill: "F5F3ED" },
            spacing: { after: 0 },
          }),
      );

    case "blockquote":
      return node.children.flatMap((child) =>
        blockToParagraphs(child, pictures).map((p) =>
          p instanceof Paragraph
            ? new Paragraph({
                children: toRuns(
                  child.type === "paragraph" ? child.children : [],
                  { italics: true },
                  pictures,
                ),
                indent: { left: 480 },
                spacing: { after: 160 },
              })
            : p,
        ),
      );

    case "thematicBreak":
      return [
        new Paragraph({
          text: "",
          border: { bottom: { style: "single", size: 6, color: "CCCCCC" } },
        }),
      ];

    case "table":
      return [tableToDocx(node, pictures)];

    default:
      return [];
  }
}

/** True for a paragraph holding nothing but one picture we actually have. */
function isPictureOnly(children: PhrasingContent[], pictures: Pictures): boolean {
  const meaningful = children.filter((child) => child.type !== "text" || child.value.trim() !== "");
  const only = meaningful.length === 1 ? meaningful[0] : undefined;
  return only?.type === "image" && pictures.has(only.url);
}

/**
 * Converts markdown to a .docx file as a Blob, ready to download.
 *
 * `resolveImage` is how the pictures get in: the note refers to them by a path
 * relative to itself, which means nothing outside the app, so the caller — the
 * only part of the system that knows where the bytes live — hands them over.
 * Without it the document still exports, with alt text where the pictures were.
 */
export async function toDocx(
  markdown: string,
  title: string,
  resolveImage?: ImageResolver,
): Promise<Blob> {
  const tree = parseToAst(markdown) as Root;
  const pictures = await gatherPictures(tree, resolveImage);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title })],
      spacing: { after: 320 },
    }),
    ...tree.children.flatMap((node) => blockToParagraphs(node, pictures)),
  ];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "forkleaf-ordered",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: "decimal" as const,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
          })),
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}

// ─── Pictures ───────────────────────────────────────────────────────────────

/** Widest a picture may be, in pixels: a Word page less its default margins. */
const CONTENT_WIDTH = 624;

/** Formats Word can hold directly. Anything else is converted first. */
const NATIVE: Record<string, Picture["type"]> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

/**
 * Finds and decodes every image in the document.
 *
 * Gathered up front, in parallel, and keyed by the `src` exactly as written in
 * the note, because the tree walk that builds the document is synchronous.
 * One unreadable image resolves to nothing and falls back to its alt text
 * rather than failing an export somebody is waiting on.
 */
async function gatherPictures(tree: Root, resolve?: ImageResolver): Promise<Pictures> {
  const pictures = new Map<string, Picture>();
  if (!resolve) return pictures;

  const urls = new Set<string>();
  const walk = (node: RootContent | Root) => {
    if (node.type === "image") urls.add(node.url);
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) walk(child as RootContent);
    }
  };
  walk(tree);
  if (urls.size === 0) return pictures;

  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const dataUrl = (await resolve(url)) ?? (url.startsWith("data:") ? url : null);
        if (!dataUrl) return;

        const picture = await decodePicture(dataUrl);
        if (picture) pictures.set(url, picture);
      } catch {
        // Falls back to alt text; one missing picture is not a failed export.
      }
    }),
  );

  return pictures;
}

/** A `data:` URL as bytes, a format Word accepts, and a size that fits the page. */
async function decodePicture(dataUrl: string): Promise<Picture | null> {
  const match = /^data:([^;,]+)[^,]*,/.exec(dataUrl);
  if (!match) return null;

  const mime = match[1]!.toLowerCase();
  // WebP and AVIF are ordinary things to paste and not things Word can read,
  // so they are re-encoded as PNG through a canvas rather than dropped.
  const usable = NATIVE[mime] ? dataUrl : await toPng(dataUrl);
  if (!usable) return null;

  const type = NATIVE[mime] ?? "png";
  const size = await measure(usable);
  if (!size) return null;

  const scale = Math.min(1, CONTENT_WIDTH / size.width);

  return {
    data: bytesOf(usable),
    type,
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
  };
}

/** The bytes behind a base64 `data:` URL. */
function bytesOf(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Loads an image to learn its natural size, which the markdown never carries. */
function measure(dataUrl: string): Promise<{ width: number; height: number } | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const image = new Image();
    // Capped: an image that neither loads nor errors must not hold an export
    // open forever.
    const fallback = setTimeout(() => resolve(null), 5000);
    const done = (size: { width: number; height: number } | null) => {
      clearTimeout(fallback);
      resolve(size);
    };

    image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => done(null);
    image.src = dataUrl;
  });
}

/** Re-encodes an image Word cannot read — WebP, AVIF — as PNG. */
async function toPng(dataUrl: string): Promise<string | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;

  const size = await measure(dataUrl);
  if (!size) return null;

  const image = new Image();
  const loaded = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
  });
  image.src = dataUrl;
  if (!(await loaded)) return null;

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}
