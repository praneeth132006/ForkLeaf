import { describe, it, expect } from "vitest";
import {
  facingSide,
  pointOnRoute,
  routeAll,
  routeConnector,
  routeToPoint,
  sidePoint,
  type Box,
} from "./connector";

const box = (x: number, y: number, width = 150, height = 56, shape?: Box["shape"]): Box => ({
  x,
  y,
  width,
  height,
  ...(shape ? { shape } : {}),
});

describe("connectors", () => {
  it("joins two stacked boxes at the middle of the facing sides", () => {
    const route = routeConnector(box(0, 0), box(0, 200));
    expect(route.startSide).toBe("bottom");
    expect(route.endSide).toBe("top");
    expect(route.start).toEqual({ x: 75, y: 56 });
    expect(route.end).toEqual({ x: 75, y: 200 });
  });

  it("joins side-by-side boxes at the middle of their left and right sides", () => {
    const route = routeConnector(box(0, 0), box(300, 0));
    expect(route.startSide).toBe("right");
    expect(route.endSide).toBe("left");
    expect(route.start).toEqual({ x: 150, y: 28 });
    expect(route.end).toEqual({ x: 300, y: 28 });
  });

  it("re-routes to the sides facing each other when a box moves", () => {
    expect(routeConnector(box(0, 200), box(0, 0)).startSide).toBe("top");
    expect(routeConnector(box(300, 0), box(0, 0)).startSide).toBe("left");
  });

  it("prefers top and bottom for wide boxes close together vertically", () => {
    // 80px apart sideways but the boxes are 150 wide, so they overlap in x:
    // a sideways arrow would run along their long edges.
    expect(facingSide(box(0, 0), { x: 155, y: 128 }, { width: 150, height: 56 })).toBe("bottom");
  });

  it("leaves each side at a right angle", () => {
    const down = routeConnector(box(0, 0), box(200, 300));
    // The first handle is straight below the start, the last straight above the end.
    expect(down.c1.x).toBe(down.start.x);
    expect(down.c1.y).toBeGreaterThan(down.start.y);
    expect(down.c2.x).toBe(down.end.x);
    expect(down.c2.y).toBeLessThan(down.end.y);
  });

  it("draws a straight line between aligned boxes", () => {
    const route = routeConnector(box(0, 0), box(0, 300));
    const middle = pointOnRoute(route, 0.5);
    expect(middle.x).toBeCloseTo(75);
  });

  it("stops at a parallelogram's slanted side rather than its bounding box", () => {
    expect(sidePoint(box(0, 0, 150, 56, "parallelogram"), "left")).toEqual({ x: 10, y: 28 });
    expect(sidePoint(box(0, 0, 150, 56, "rect"), "left")).toEqual({ x: 0, y: 28 });
  });

  it("loops a node back to itself", () => {
    const one = box(0, 0);
    const route = routeConnector(one, one);
    expect(route.startSide).toBe("right");
    expect(route.endSide).toBe("top");
  });

  it("follows the cursor from the side nearest it while dragging", () => {
    expect(routeToPoint(box(0, 0), { x: 400, y: 30 }).startSide).toBe("right");
    expect(routeToPoint(box(0, 0), { x: 70, y: -200 }).startSide).toBe("top");
  });

  it("starts and ends the curve where it says", () => {
    const route = routeConnector(box(0, 0), box(400, 300));
    expect(pointOnRoute(route, 0)).toEqual(route.start);
    expect(pointOnRoute(route, 1)).toEqual(route.end);
    expect(route.d.startsWith(`M ${route.start.x} ${route.start.y} C`)).toBe(true);
  });

  it("spreads arrows that share a side, and keeps a lone arrow centred", () => {
    const boxes = new Map<string, Box>([
      ["a", box(0, 0)],
      ["b", box(0, 200)],
      ["c", box(-200, 0)],
      ["d", box(0, -200)],
    ]);
    const routes = routeAll(
      [
        { id: "ab", from: "a", to: "b" },
        { id: "cb", from: "c", to: "b" },
        { id: "da", from: "d", to: "a" },
      ],
      boxes,
    );

    // a → b and c → b would both enter b's top; c is to the left, so its
    // arrow enters left of the middle.
    const intoB = [routes.get("ab")!.end, routes.get("cb")!.end];
    expect(intoB[0]!.y).toBe(200);
    expect(intoB[1]!.x).toBeLessThan(intoB[0]!.x);
    expect((intoB[0]!.x + intoB[1]!.x) / 2).toBeCloseTo(75);

    // d → a is the only arrow on a's top: dead centre.
    expect(routes.get("da")!.end).toEqual({ x: 75, y: 0 });
  });

  it("lets arrows meet at a diamond's corner rather than beside it", () => {
    const boxes = new Map<string, Box>([
      ["q", box(0, 200, 100, 70, "diamond")],
      ["a", box(-100, 0)],
      ["b", box(100, 0)],
    ]);
    const routes = routeAll(
      [
        { id: "aq", from: "a", to: "q" },
        { id: "bq", from: "b", to: "q" },
      ],
      boxes,
    );
    expect(routes.get("aq")!.end).toEqual(routes.get("bq")!.end);
  });
});
