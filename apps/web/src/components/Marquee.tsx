"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/** Space between the end of the text and its next pass, in pixels. */
const GAP = 48;
/** How fast the text travels, in pixels a second. Slow enough to read. */
const SPEED = 40;

/**
 * One line of text in a fixed amount of room.
 *
 * The status bar gives each thing it says a set width, and a note four folders
 * deep has a path far longer than that. Growing to fit pushed everything else
 * off the bar; truncating hid the part that says which note it is. So when the
 * text does not fit it scrolls, pauses under the pointer, and stays still for
 * anyone who has asked for less motion. The whole text is always its title.
 */
export function Marquee({ text, className = "" }: { text: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = copy.current;
    if (!outer || !inner) return;

    const measure = () => {
      const needed = inner.offsetWidth;
      setWidth(needed > outer.clientWidth + 1 ? needed : 0);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [text]);

  const scrolling = width > 0;
  const shift = width + GAP;

  return (
    <span
      ref={box}
      title={text}
      data-scrolling={scrolling || undefined}
      className={`fl-marquee relative block min-w-0 overflow-hidden whitespace-nowrap ${className}`}
    >
      <span
        className="fl-marquee-track inline-flex"
        style={
          scrolling
            ? ({
                "--fl-marquee-shift": `${shift}px`,
                animationDuration: `${Math.max(6, shift / SPEED)}s`,
              } as CSSProperties)
            : undefined
        }
      >
        <span ref={copy} className="shrink-0">
          {text}
        </span>
        {scrolling && (
          <span aria-hidden="true" className="shrink-0" style={{ paddingLeft: GAP }}>
            {text}
          </span>
        )}
      </span>
    </span>
  );
}
