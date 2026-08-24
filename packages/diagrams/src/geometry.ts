import { splitMembers, type NodeShape } from "./graph-model";

/**
 * How big each kind of box is.
 *
 * This used to live inside the canvas component, which was fine while the
 * canvas was the only thing that drew a graph. It is not any more: the SVG
 * renderer draws the same graphs on the server, with no React and no DOM, and
 * a diagram whose boxes are one size in the editor and another in a rendered
 * SVG is two different pictures of one file.
 *
 * Sizes are computed from the label rather than measured, because measuring
 * needs a DOM. The constants below approximate mermaid's own metric closely
 * enough that the canvas is a preview of the diagram rather than a promise
 * about it.
 */

export interface Size {
  width: number;
  height: number;
}

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 56;

/** Width of one character and the padding around a label, in pixels. */
export const LABEL_CHAR_WIDTH = 9;
export const LABEL_PADDING = 30;
const MIN_NODE_WIDTH = 64;
const MAX_NODE_WIDTH = 300;

/** Height of one member line inside a class or entity box. */
export const MEMBER_HEIGHT = 17;
/** Height of the name bar above the members. */
export const MEMBER_HEADER = 30;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function textWidth(label: string | undefined): number {
  return (label ?? "").length * LABEL_CHAR_WIDTH;
}

function labelWidth(label: string | undefined): number {
  return textWidth(label) + LABEL_PADDING;
}

/**
 * Node footprints.
 *
 * A state diagram's `[*]` markers and choice diamonds are landmarks rather
 * than boxes with words in them; drawing them at the size of a process step
 * makes a state chart read like a flowchart with four blank boxes in it.
 */
export function sizeOf(node: { shape: NodeShape; label?: string }): Size {
  switch (node.shape) {
    case "start":
    case "end":
      return { width: 40, height: 40 };
    case "choice":
      return { width: 64, height: 64 };
    case "fork":
      return { width: 130, height: 14 };
    case "circle": {
      // A connector is round in the note, so it is round here too.
      const size = clamp(labelWidth(node.label), NODE_HEIGHT, 160);
      return { width: size, height: size };
    }
    case "diamond": {
      // A rhombus only offers its full width along the centre line, so both
      // dimensions grow with the text and the words stay inside the shape.
      const text = textWidth(node.label);
      return {
        width: clamp(text * 1.4 + 36, 112, 320),
        height: clamp(72 + text * 0.22, 72, 160),
      };
    }
    case "hexagon":
    case "parallelogram": {
      // Slanted sides eat into the usable width the same way, if less of it.
      const text = textWidth(node.label);
      return { width: clamp(text + LABEL_PADDING + 28, 96, MAX_NODE_WIDTH), height: NODE_HEIGHT };
    }
    case "mind-circle":
    case "mind-bang":
      return { width: 96, height: 96 };
    case "mind-round":
    case "mind-square":
    case "mind-cloud":
    case "mind-hexagon":
      return { width: 132, height: 48 };
    case "class":
    case "entity": {
      // A class or entity box is as tall as what is in it. A fixed height meant
      // a class with six fields either overflowed its box or had its fields
      // hidden, and hiding them removes the only reason the diagram was drawn.
      const { name, members } = splitMembers(node.label ?? "");
      const widest = Math.max(name.length, ...members.map((line) => line.length), 10);
      return {
        width: Math.min(300, Math.max(NODE_WIDTH, widest * 7.4 + 28)),
        height: MEMBER_HEADER + Math.max(members.length, 0) * MEMBER_HEIGHT + 8,
      };
    }
    default:
      return {
        width: clamp(labelWidth(node.label), MIN_NODE_WIDTH, MAX_NODE_WIDTH),
        height: NODE_HEIGHT,
      };
  }
}

/** True for the box shapes whose label is a name followed by a list. */
export function hasMembers(shape: NodeShape): boolean {
  return shape === "class" || shape === "entity";
}

/** Pseudo-states have no text of their own — mermaid draws them as marks. */
export function isMarker(shape: NodeShape): boolean {
  return shape === "start" || shape === "end" || shape === "fork";
}
