"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The right-click menu used by the note tree.
 *
 * A folder needs four actions — new note, new subfolder, rename, delete — and
 * hanging four buttons off every row is what turned the sidebar into a grid of
 * icons the moment a pointer went near it, with the folder names squeezed into
 * whatever was left. A context menu is where people already look for those
 * actions, and it costs the resting state nothing.
 */

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Draws the item in the danger colour and puts it below a divider. */
  destructive?: boolean;
  disabled?: boolean;
}

export interface MenuPosition {
  x: number;
  y: number;
}

export function ContextMenu({
  position,
  items,
  onClose,
}: {
  position: MenuPosition;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(position);

  // Flipped back on screen after measuring: a menu opened near the bottom edge
  // otherwise renders half of itself past the fold, where the destructive item
  // usually is.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const { width, height } = element.getBoundingClientRect();
    setPlace({
      x: Math.min(position.x, window.innerWidth - width - 8),
      y: Math.min(position.y, window.innerHeight - height - 8),
    });
  }, [position]);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    // `pointerdown` rather than `click`, so scrolling or clicking straight into
    // another row does not leave the menu floating over the new selection.
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: place.x, top: place.y }}
      className="fixed z-50 min-w-[11rem] overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] py-1 shadow-[var(--fl-shadow-lg)]"
    >
      {items.map((item, index) => {
        const firstDestructive = item.destructive && !items[index - 1]?.destructive && index > 0;

        return (
          <div key={item.label}>
            {firstDestructive && <div className="my-1 h-px bg-[var(--fl-border)]" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className={`block w-full px-3 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40 ${
                item.destructive
                  ? "text-[var(--fl-danger)] hover:bg-[var(--fl-danger)]/10"
                  : "text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
              }`}
            >
              {item.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Menu state, plus the handler that opens it from a right-click. */
export function useContextMenu<T>() {
  const [menu, setMenu] = useState<{ position: MenuPosition; target: T } | null>(null);

  const open = (
    event: { clientX: number; clientY: number; preventDefault: () => void },
    target: T,
  ) => {
    event.preventDefault();
    setMenu({ position: { x: event.clientX, y: event.clientY }, target });
  };

  return { menu, open, close: () => setMenu(null) };
}
