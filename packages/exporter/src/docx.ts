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
} from "docx";
import { parseToAst } from "@mdnotion/markdown-engine";
import type { Root, RootContent, PhrasingContent, Heading, List, Table as MdTable } from "mdast";

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

/** Flattens inline markdown into styled runs, carrying nested emphasis down. */
function toRuns(
  nodes: PhrasingContent[],
  style: InlineStyle = {},
): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "text":
        runs.push(new TextRun({ text: node.value, ...style }));
        break;
      case "strong":
        runs.push(...toRuns(node.children, { ...style, bold: true }));
        break;
      case "emphasis":
        runs.push(...toRuns(node.children, { ...style, italics: true }));
        break;
      case "delete":
        runs.push(...toRuns(node.children, { ...style, strike: true }));
        break;
      case "inlineCode":
        runs.push(new TextRun({ text: node.value, font: "Consolas", ...style }));
        break;
      case "link":
        runs.push(
          new ExternalHyperlink({
            link: node.url,
            children: toRuns(node.children, { ...style }).filter(
              (r): r is TextRun => r instanceof TextRun,
            ),
          }),
        );
        break;
      case "break":
        runs.push(new TextRun({ break: 1 }));
        break;
      case "image":
        // Remote images cannot be fetched and embedded reliably offline, so
        // the alt text is kept rather than leaving a silent gap.
        runs.push(new TextRun({ text: node.alt ?? "[image]", italics: true }));
        break;
      default:
        if ("children" in node && Array.isArray(node.children)) {
          runs.push(...toRuns(node.children as PhrasingContent[], style));
        }
    }
  }

  return runs;
}

function listParagraphs(list: List, depth = 0): (Paragraph | Table)[] {
  const paragraphs: (Paragraph | Table)[] = [];

  for (const item of list.children) {
    const [first, ...rest] = item.children;

    // A task list item renders as a checkbox glyph — Word has no native
    // checkbox that survives a round trip.
    const prefix = typeof item.checked === "boolean" ? (item.checked ? "☑ " : "☐ ") : "";

    if (first?.type === "paragraph") {
      paragraphs.push(
        new Paragraph({
          children: [...(prefix ? [new TextRun({ text: prefix })] : []), ...toRuns(first.children)],
          ...(list.ordered
            ? { numbering: { reference: "mdnotion-ordered", level: depth } }
            : { bullet: { level: depth } }),
        }),
      );
    }

    for (const child of rest) {
      if (child.type === "list") paragraphs.push(...listParagraphs(child, depth + 1));
      else paragraphs.push(...blockToParagraphs(child));
    }
  }

  return paragraphs;
}

function tableToDocx(node: MdTable): Table {
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
                    children: toRuns(cell.children as PhrasingContent[], {
                      bold: rowIndex === 0,
                    }),
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

function blockToParagraphs(node: RootContent): (Paragraph | Table)[] {
  switch (node.type) {
    case "heading": {
      const heading = node as Heading;
      return [
        new Paragraph({
          heading: HEADING_LEVELS[heading.depth - 1],
          children: toRuns(heading.children),
          spacing: { before: 240, after: 120 },
        }),
      ];
    }

    case "paragraph":
      return [new Paragraph({ children: toRuns(node.children), spacing: { after: 160 } })];

    case "list":
      return listParagraphs(node);

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
        blockToParagraphs(child).map((p) =>
          p instanceof Paragraph
            ? new Paragraph({
                children: toRuns(child.type === "paragraph" ? child.children : [], {
                  italics: true,
                }),
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
      return [tableToDocx(node)];

    default:
      return [];
  }
}

/** Converts markdown to a .docx file as a Blob, ready to download. */
export async function toDocx(markdown: string, title: string): Promise<Blob> {
  const tree = parseToAst(markdown) as Root;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title })],
      spacing: { after: 320 },
    }),
    ...tree.children.flatMap(blockToParagraphs),
  ];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "mdnotion-ordered",
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
