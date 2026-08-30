"use client";

import { useCallback, useRef } from "react";

export interface ColumnResizerProps {
  /** What is being resized, read out by a screen reader. */
  label: string;
  /** The column's current width, in pixels. */
  width: number;
  min: number;
  max: number;
  /**
   * Which side of this handle the column being resized is on.
   *
   * Dragging right widens a `"left"` column and narrows a `"right"` one, which
   * is the only way a handle between two panels can behave without feeling
   * inverted on one of its sides.
   */
  side: "left" | "right";
  onChange: (width: number) => void;
  /** Double-click, and the keyboard's way back to the width it shipped with. */
  onReset: () => void;
  className?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** How far one arrow key moves the edge. Shift multiplies it by four. */
const STEP = 16;

/**
 * The draggable seam between two panels.
 *
 * It lives in the gap the layout already leaves between panels rather than
 * taking width of its own, so turning a fixed column into an adjustable one
 * moves nothing on screen until somebody drags it.
 *
 * Pointer events rather than mouse events, so the same handle works under a
 * finger and a stylus; the pointer is captured on the way down so a fast drag
 * that outruns the handle — or leaves the window entirely — keeps resizing
 * instead of stopping dead. `touch-none` is what stops a drag on a touchscreen
 * being read as a scroll before the handle ever sees it.
 *
 * It is also a real `separator` widget: focusable, with arrow keys, because a
 * column width is exactly the kind of thing that is unusable if the only way
 * to set it is to hold a mouse steady.
 */
export function ColumnResizer({
  label,
  width,
  min,
  max,
  side,
  onChange,
  onReset,
  className = "",
}: ColumnResizerProps) {
  /** Where the drag started, so the width follows the pointer exactly. */
  const start = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Anything other than the primary button is somebody opening a context
      // menu on the seam, not resizing with it.
      if (event.button !== 0) return;
      start.current = { x: event.clientX, width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const from = start.current;
      if (!from) return;
      const moved = event.clientX - from.x;
      onChange(clamp(from.width + (side === "left" ? moved : -moved), min, max));
    },
    [onChange, side, min, max],
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    start.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? STEP * 4 : STEP;
      const nudge = (by: number) => {
        event.preventDefault();
        onChange(clamp(width + (side === "left" ? by : -by), min, max));
      };

      switch (event.key) {
        case "ArrowLeft":
          nudge(-step);
          break;
        case "ArrowRight":
          nudge(step);
          break;
        case "Home":
          event.preventDefault();
          onChange(min);
          break;
        case "End":
          event.preventDefault();
          onChange(max);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          onReset();
          break;
      }
    },
    [onChange, onReset, width, side, min, max],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`${label} width`}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`Drag to resize · double-click to reset`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={`group relative -mx-1 w-2 shrink-0 cursor-col-resize touch-none select-none focus:outline-none ${className}`}
    >
      {/* The visible seam is a hairline that thickens on hover, so the layout
          reads as panels with a gap between them until somebody reaches for
          the gap. The hit area around it stays a comfortable eight pixels. */}
      <span
        aria-hidden
        className="absolute inset-y-2 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-[var(--fl-border)] group-focus-visible:bg-[var(--fl-accent)] group-active:bg-[var(--fl-accent)]"
      />
    </div>
  );
}
