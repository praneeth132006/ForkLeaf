import { describe, expect, it } from "vitest";
import {
  addNode,
  bounds,
  canvasTitle,
  colorOf,
  connect,
  edgePath,
  emptyCanvas,
  fitView,
  isCanvasPath,
  moveNodes,
  newCanvasPath,
  parseCanvas,
  placeNew,
  removeNodes,
  resizeNode,
  serializeCanvas,
  sideFacing,
  zoomAt,
  type Canvas,
} from "./canvas";

const board: Canvas = {
  nodes: [
    { id: "a", type: "text", text: "Idea", x: 0, y: 0, width: 200, height: 100 },
    { id: "b", type: "file", file: "notes/Plan.md", x: 400, y: 0, width: 250, height: 120 },
    { id: "g", type: "group", label: "Group", x: -20, y: 200, width: 500, height: 300 },
    { id: "c", type: "link", url: "https://example.com", x: 0, y: 250, width: 200, height: 80 },
  ],
  edges: [{ id: "e1", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" }],
};

describe("reading and writing .canvas files", () => {
  it("reads JSON Canvas, keeping fields another tool wrote", () => {
    const text = JSON.stringify({
      nodes: [{ ...board.nodes[0], obsidianOnly: true }],
      edges: [],
      metadata: { version: "1.0" },
    });
    const { canvas, problem, dropped } = parseCanvas(text);
    expect(problem).toBeNull();
    expect(dropped).toBe(0);
    expect(canvas.nodes[0]).toMatchObject({ id: "a", text: "Idea", obsidianOnly: true });
    expect(canvas.metadata).toEqual({ version: "1.0" });
  });

  it("drops malformed nodes and edges whose ends are gone, and counts them", () => {
    const text = JSON.stringify({
      nodes: [
        board.nodes[0],
        { id: "bad", type: "text", x: 0, y: 0, width: 10, height: 10 },
        { id: "zero", type: "group", x: 0, y: 0, width: 0, height: 10 },
        { id: "odd", type: "video", x: 0, y: 0, width: 10, height: 10 },
      ],
      edges: [
        { id: "keep", fromNode: "a", toNode: "a" },
        { id: "dangling", fromNode: "a", toNode: "missing" },
      ],
    });
    const { canvas, dropped } = parseCanvas(text);
    expect(canvas.nodes.map((node) => node.id)).toEqual(["a"]);
    expect(canvas.edges.map((edge) => edge.id)).toEqual(["keep"]);
    expect(dropped).toBe(4);
  });

  it("opens an empty file as an empty board, and refuses a file that is not a canvas", () => {
    expect(parseCanvas("  ")).toEqual({ canvas: emptyCanvas(), problem: null, dropped: 0 });
    expect(parseCanvas("# a note").problem).toMatch(/not valid JSON Canvas/);
    expect(parseCanvas("[1,2]").problem).toMatch(/not a JSON Canvas board/);
  });

  it("writes tab-indented JSON with whole-pixel positions, and reads it back", () => {
    const moved = moveNodes(board, new Set(["a"]), 10.4, 0.6);
    const text = serializeCanvas(moved);
    expect(text).toContain('\n\t"nodes": [');
    expect(text).toContain('"x": 10');
    expect(text.endsWith("}\n")).toBe(true);
    expect(parseCanvas(text).canvas.nodes).toHaveLength(4);
  });
});

describe("editing a board", () => {
  it("adds a node with a fresh 16-character id", () => {
    const { canvas, id } = addNode(board, {
      type: "text",
      text: "New",
      x: 1,
      y: 2,
      width: 100,
      height: 50,
    });
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(canvas.nodes).toHaveLength(5);
    expect(board.nodes).toHaveLength(4);
  });

  it("moves a group together with the nodes inside it", () => {
    const moved = moveNodes(board, new Set(["g"]), 50, 25);
    const byId = new Map(moved.nodes.map((node) => [node.id, node]));
    expect(byId.get("g")).toMatchObject({ x: 30, y: 225 });
    expect(byId.get("c")).toMatchObject({ x: 50, y: 275 });
    expect(byId.get("a")).toMatchObject({ x: 0, y: 0 });
  });

  it("never resizes a node below a readable size", () => {
    const resized = resizeNode(board, "a", 10, 5);
    expect(resized.nodes[0]).toMatchObject({ width: 80, height: 40 });
  });

  it("removes nodes with every edge that touches them", () => {
    const removed = removeNodes(board, new Set(["b"]));
    expect(removed.nodes.map((node) => node.id)).toEqual(["a", "g", "c"]);
    expect(removed.edges).toEqual([]);
  });

  it("connects two nodes once, on the sides that face each other", () => {
    const joined = connect(board, "a", "c");
    const edge = joined.edges.at(-1)!;
    expect(edge).toMatchObject({
      fromNode: "a",
      fromSide: "bottom",
      toNode: "c",
      toSide: "top",
      toEnd: "arrow",
    });
    expect(connect(joined, "c", "a").edges).toHaveLength(joined.edges.length);
    expect(connect(board, "a", "a")).toBe(board);
    expect(connect(board, "a", "missing")).toBe(board);
  });

  it("works out which side faces which", () => {
    const [a, b] = board.nodes as [Canvas["nodes"][number], Canvas["nodes"][number]];
    expect(sideFacing(a, b)).toBe("right");
    expect(sideFacing(b, a)).toBe("left");
  });

  it("draws an edge from side to side", () => {
    expect(edgePath(board.nodes[0]!, board.nodes[1]!, board.edges[0]!)).toBe(
      "M 200 50 C 300.1 50, 299.9 60, 400 60",
    );
  });
});

describe("the view", () => {
  it("fits the whole board, never zooming in past 100%", () => {
    const box = bounds(board.nodes)!;
    expect(box).toEqual({ x: -20, y: 0, width: 670, height: 500 });
    const view = fitView(board, { width: 1000, height: 800 });
    expect(view.zoom).toBe(1);
    expect(view.x + 1000 / 2).toBeCloseTo(box.x + box.width / 2);

    const small = fitView(board, { width: 400, height: 300 });
    expect(small.zoom).toBeLessThan(1);
    expect(fitView(emptyCanvas(), { width: 400, height: 300 })).toEqual({
      x: -200,
      y: -150,
      zoom: 1,
    });
  });

  it("zooms around the cursor, within limits", () => {
    const view = { x: 0, y: 0, zoom: 1 };
    const zoomed = zoomAt(view, { x: 100, y: 100 }, 2);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.x + 100 / zoomed.zoom).toBeCloseTo(100);
    expect(zoomAt(view, { x: 0, y: 0 }, 100).zoom).toBe(2.5);
    expect(zoomAt(view, { x: 0, y: 0 }, 0.001).zoom).toBe(0.2);
  });

  it("places a new card in the middle of the view, clear of one already there", () => {
    const view = { x: 0, y: 0, zoom: 1 };
    const first = placeNew(
      emptyCanvas(),
      view,
      { width: 400, height: 300 },
      { width: 200, height: 100 },
    );
    expect(first).toEqual({ x: 100, y: 100 });
    const { canvas } = addNode(emptyCanvas(), {
      type: "text",
      text: "",
      ...first,
      width: 200,
      height: 100,
    });
    const second = placeNew(canvas, view, { width: 400, height: 300 }, { width: 200, height: 100 });
    const clear = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      a.x >= b.x + 200 || a.x + 200 <= b.x || a.y >= b.y + 100 || a.y + 100 <= b.y;
    expect(clear(second, first)).toBe(true);

    // A card of another size, centred on the same point, is stepped clear too.
    const wide = placeNew(canvas, view, { width: 400, height: 300 }, { width: 280, height: 150 });
    expect(wide.x >= first.x + 200 || wide.y >= first.y + 100).toBe(true);
  });
});

describe("paths, names and colours", () => {
  it("recognises and names canvas files, and finds a free path for a new one", () => {
    expect(isCanvasPath("boards/Plan.canvas")).toBe(true);
    expect(isCanvasPath("notes/Plan.md")).toBe(false);
    expect(canvasTitle("canvases/Launch map.canvas")).toBe("Launch map");
    const now = new Date(2026, 8, 13);
    expect(newCanvasPath([], now)).toBe("canvases/Canvas 2026-09-13.canvas");
    expect(newCanvasPath(["canvases/Canvas 2026-09-13.canvas"], now)).toBe(
      "canvases/Canvas 2026-09-13 2.canvas",
    );
  });

  it("reads the six preset colours and hex colours, and nothing else", () => {
    expect(colorOf("1")).toBe("#e5484d");
    expect(colorOf("#0A0B0C")).toBe("#0A0B0C");
    expect(colorOf("red")).toBeNull();
    expect(colorOf(undefined)).toBeNull();
  });
});
