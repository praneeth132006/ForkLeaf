"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Preview, type LinkBridge } from "@forkleaf/editor";
import { splitSlides } from "@/lib/slides";

/**
 * The open note, full screen, one slide at a time.
 *
 * Rendered by the same preview as everything else, so diagrams, maths, images
 * and cards look exactly as they do in the note. Arrow keys, space and
 * Page Up/Down move; Home and End jump; F goes full screen; Escape leaves. A
 * click on the right half of the slide goes forward and on the left half
 * back, which is what a presenter holding a clicker — or a phone — expects.
 */

export interface PresentModeProps {
  title: string;
  markdown: string;
  onClose: () => void;
  resolveImageSrc?: (src: string) => string;
  links?: LinkBridge;
}

export function PresentMode({
  title,
  markdown,
  onClose,
  resolveImageSrc,
  links,
}: PresentModeProps) {
  const slides = useMemo(() => {
    const split = splitSlides(markdown);
    return split.length > 0 ? split : [`# ${title}`];
  }, [markdown, title]);
  const [index, setIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const last = slides.length - 1;
  const current = Math.min(index, last);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    root.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Enter":
          event.preventDefault();
          setIndex((value) => Math.min(value + 1, last));
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          event.preventDefault();
          setIndex((value) => Math.max(value - 1, 0));
          break;
        case "Home":
          event.preventDefault();
          setIndex(0);
          break;
        case "End":
          event.preventDefault();
          setIndex(last);
          break;
        case "f":
        case "F":
          event.preventDefault();
          if (document.fullscreenElement) void document.exitFullscreen?.();
          else void root.current?.requestFullscreen?.().catch(() => undefined);
          break;
        case "Escape":
          // The browser leaves full screen on Escape by itself; a second
          // Escape leaves the presentation.
          if (!document.fullscreenElement) {
            event.preventDefault();
            onCloseRef.current();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [last]);

  return (
    <div
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Presenting ${title}`}
      className="fixed inset-0 z-[80] flex flex-col bg-[var(--fl-bg)] outline-none"
    >
      <div
        className="flex min-h-0 flex-1 cursor-pointer items-center justify-center overflow-auto px-6 py-10 sm:px-16"
        onClick={(event) => {
          // Links and buttons inside the slide do their own thing.
          if ((event.target as HTMLElement).closest("a, button, summary, input")) return;
          const box = event.currentTarget.getBoundingClientRect();
          const forward = event.clientX > box.left + box.width / 2;
          setIndex((value) => (forward ? Math.min(value + 1, last) : Math.max(value - 1, 0)));
        }}
      >
        <div key={current} data-testid="slide" className="fl-slide w-full max-w-4xl">
          <Preview
            markdown={slides[current]!}
            {...(resolveImageSrc ? { resolveImageSrc } : {})}
            {...(links ? { links } : {})}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 px-4 pb-3 text-[12px] text-[var(--fl-muted)]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
        >
          Esc · Leave
        </button>
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--fl-elevated)]"
          aria-hidden="true"
        >
          <div
            className="h-full bg-[var(--fl-accent)] transition-all"
            style={{ width: `${((current + 1) / slides.length) * 100}%` }}
          />
        </div>
        <span className="tabular-nums" aria-live="polite">
          {current + 1} / {slides.length}
        </span>
        <span className="hidden sm:inline">← → to move · F full screen</span>
      </div>
    </div>
  );
}
