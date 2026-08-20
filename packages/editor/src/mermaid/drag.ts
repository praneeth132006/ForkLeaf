/**
 * Where a dragged node lands.
 *
 * Pulled out of the pointer handler because of the bug it used to hide. The
 * committed position was read from state written inside a `requestAnimationFrame`
 * callback — and the release handler cancelled that frame before it ran, so a
 * drag finished inside a single frame committed nothing and the node snapped
 * back after visibly following the cursor the whole way.
 *
 * The fix is to derive the landing position from the release position alone,
 * which is knowable without any frame having run. As a pure function it can
 * also be tested, which the handler it came from could not be.
 */
export interface DropRequest {
  /** Pointer position, in world coordinates, at the moment of release. */
  world: { x: number; y: number };
  /** Offset from the node's origin to where it was grabbed. */
  grab: { x: number; y: number };
  /** Where the node was before the drag. */
  origin: { x: number; y: number };
  /** True while alt is held, which drags free of the grid. */
  freeform: boolean;
  /** Rounds a coordinate to the grid. */
  snap: (value: number) => number;
}

/**
 * The node's new position, or null when it has not actually moved.
 *
 * Returning null for an unmoved node is what keeps a plain click on a box —
 * which is a drag of zero distance — from landing an empty entry in the undo
 * history.
 */
export function resolveDrop({ world, grab, origin, freeform, snap }: DropRequest): {
  x: number;
  y: number;
} | null {
  const raw = { x: world.x - grab.x, y: world.y - grab.y };
  const to = freeform ? raw : { x: snap(raw.x), y: snap(raw.y) };

  if (to.x === origin.x && to.y === origin.y) return null;
  return to;
}
