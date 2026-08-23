import { describe, it, expect } from "vitest";
import { resolveDrop } from "./drag";

const GRID = 8;
const snap = (value: number) => Math.round(value / GRID) * GRID;

describe("resolveDrop", () => {
  /**
   * The regression. The old handler read the landing position out of state
   * that only an animation frame ever wrote, and cancelled that frame on
   * release — so a drag completed within one frame moved nothing. Nothing
   * here may depend on a frame having run.
   */
  it("lands the node from the release position alone", () => {
    expect(
      resolveDrop({
        world: { x: 200, y: 100 },
        grab: { x: 24, y: 16 },
        origin: { x: 344, y: 24 },
        freeform: false,
        snap,
      }),
    ).toEqual({ x: 176, y: 88 });
  });

  it("returns null when the node has not moved, so a click is not an undo step", () => {
    expect(
      resolveDrop({
        world: { x: 368, y: 40 },
        grab: { x: 24, y: 16 },
        origin: { x: 344, y: 24 },
        freeform: false,
        snap,
      }),
    ).toBeNull();
  });

  it("snaps to the grid, and stops snapping while alt is held", () => {
    const request = {
      world: { x: 203, y: 99 },
      grab: { x: 0, y: 0 },
      origin: { x: 0, y: 0 },
      snap,
    };

    expect(resolveDrop({ ...request, freeform: false })).toEqual({ x: 200, y: 96 });
    expect(resolveDrop({ ...request, freeform: true })).toEqual({ x: 203, y: 99 });
  });
});
