"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes a menu the way every other menu on the machine closes.
 *
 * A dropdown that only shuts when you click the exact button that opened it is
 * a dropdown people leave open: they click elsewhere, nothing happens, and the
 * panel sits over the thing they were reaching for. Escape and a click outside
 * are the two gestures everybody already knows.
 *
 * `pointerdown` rather than `click`, so the menu is gone before whatever was
 * underneath it receives the press — closing on `click` means the first click
 * outside is swallowed by the dismissal and has to be repeated.
 */
export function useDismissable(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
): void {
  // Kept in a ref so the listeners are attached once per opening rather than
  // re-attached whenever the caller passes a new closure. Written in an effect,
  // never during render.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      dismiss.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss.current();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref]);
}
