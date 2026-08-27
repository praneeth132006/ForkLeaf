"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { previewLink, type LinkPreviewResult } from "@/lib/gateway";

/**
 * What a link points at, shown before it is followed.
 *
 * A note is full of addresses, and an address is not a description. Deciding
 * whether `https://github.com/hmaverickadams/breach-parse` is the thing you
 * meant used to require opening it, which is the cost this removes: hover, and
 * the page says what it is.
 *
 * Mounted once per editor and delegated from the document rather than wired
 * per link. The rendered preview is injected HTML with no React elements to
 * attach handlers to, and the rich-text surface is ProseMirror's, which
 * rebuilds its DOM whenever the document changes — anything bound per anchor
 * would be lost on the next keystroke.
 *
 * The picture a page offers of itself is shown, because "is this the right
 * link" is often a question about what the page looks like — but it is served
 * through `/api/link-image` rather than from the site itself. An `<img>`
 * pointing at the linked host would tell that host the pointer passed over a
 * word in somebody's private note, which is not a thing hovering should do.
 */

/** Long enough that crossing a link on the way somewhere else shows nothing. */
const OPEN_DELAY_MS = 350;

/** Grace for the pointer to travel from the link to the card and back. */
const CLOSE_DELAY_MS = 180;

/** Roughly the card's width, used to keep it inside the viewport. */
const CARD_WIDTH = 320;

interface Anchored {
  url: string;
  /** Viewport coordinates of the link this belongs to. */
  rect: { left: number; right: number; top: number; bottom: number };
  /** True when the link is in the rich-text editor, where clicks are ours. */
  editable: boolean;
}

type Loaded = { status: "loading" } | { status: "ready"; preview: LinkPreviewResult };

/**
 * Answers already fetched, for the life of the page.
 *
 * A note links the same address more than once, and a reader hovers the same
 * link repeatedly while deciding. Module-level rather than in state so it
 * survives the card unmounting between hovers.
 */
const cache = new Map<string, LinkPreviewResult>();

export interface LinkHoverCardProps {
  /**
   * Where links live. Hovers outside it are ignored.
   *
   * A selector rather than a ref because there are two surfaces — the rendered
   * preview and the rich-text editor — and which of them exists depends on the
   * view mode the reader chose.
   */
  within: string;
  /**
   * Whether the page itself may be read, which needs a session.
   *
   * False still shows a card — the address and the host are worth knowing on
   * their own, and are what the reader is deciding from anyway. It just
   * carries no title, because there is nobody to ask.
   */
  canRead?: boolean;
}

export function LinkHoverCard({ within, canRead = true }: LinkHoverCardProps) {
  const [anchored, setAnchored] = useState<Anchored | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** Set when the page's picture will not load, so the card drops it. */
  const [imageFailed, setImageFailed] = useState(false);

  // Timers and the pointer's whereabouts are not rendered, so they are refs:
  // re-rendering the card because the mouse moved would defeat the point.
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const overCard = useRef(false);
  /**
   * The link the card is currently about.
   *
   * Kept beside the state rather than read out of it: by the time a fetch
   * lands the pointer may be on a different link, and the answer that arrives
   * late must not replace the one the reader is actually looking at.
   */
  const showing = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const close = useCallback(() => {
    clearTimers();
    showing.current = null;
    setAnchored(null);
    setLoaded(null);
  }, [clearTimers]);

  useEffect(() => {
    const show = (anchor: HTMLAnchorElement, url: string) => {
      const box = anchor.getBoundingClientRect();
      showing.current = url;
      setImageFailed(false);
      setAnchored({
        url,
        rect: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
        editable: anchor.closest(".ProseMirror") !== null,
      });

      const known = cache.get(url);
      if (known) {
        setLoaded({ status: "ready", preview: known });
        return;
      }

      if (!canRead) {
        setLoaded({
          status: "ready",
          preview: { url, title: null, description: null, host: hostOf(url), image: null },
        });
        return;
      }

      setLoaded({ status: "loading" });

      void previewLink(url)
        .then((preview) => {
          cache.set(url, preview);
          return preview;
        })
        .catch(
          // A page that cannot be read still deserves a card: the host and the
          // address are what the reader is deciding from either way, and an
          // empty card reads as the feature being broken rather than as the
          // page being unreachable. Not cached — the next hover may reach it.
          (): LinkPreviewResult => ({
            url,
            title: null,
            description: null,
            host: hostOf(url),
            image: null,
          }),
        )
        .then((preview) => {
          if (showing.current === url) setLoaded({ status: "ready", preview });
        });
    };

    const onOver = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      const url = anchor?.getAttribute("href") ?? "";

      // Wikilinks and repository links open in the app and are described by
      // the app; only addresses that leave it need explaining.
      if (!anchor || !anchor.closest(within) || !/^https?:\/\//i.test(url)) return;
      if (anchor.hasAttribute("data-wikilink")) return;

      clearTimers();
      if (anchored?.url === url) return;

      openTimer.current = window.setTimeout(() => show(anchor, url), OPEN_DELAY_MS);
    };

    const onOut = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      if (openTimer.current !== null) window.clearTimeout(openTimer.current);
      openTimer.current = null;

      closeTimer.current = window.setTimeout(() => {
        // Left open while the pointer is on the card itself, which is what
        // makes the address inside it selectable.
        if (!overCard.current) close();
      }, CLOSE_DELAY_MS);
    };

    // Escape closes it, and so does anything that moves what it is pinned to:
    // it is positioned in viewport coordinates and would otherwise float over
    // unrelated text once the note scrolled.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);

    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      clearTimers();
    };
  }, [within, canRead, anchored?.url, clearTimers, close]);

  if (!anchored || !loaded) return null;

  // Below the link where there is room, above it where there is not, and never
  // past either edge of the window.
  const below = anchored.rect.bottom + 8;
  const above = anchored.rect.top - 8;
  const tall = loaded.status === "ready" && Boolean(loaded.preview.image) && !imageFailed;
  const height = tall ? 300 : 150;
  const openDownwards = below + height < window.innerHeight || above < height;

  const left = Math.min(
    Math.max(8, anchored.rect.left),
    Math.max(8, window.innerWidth - CARD_WIDTH - 8),
  );

  return (
    <div
      role="tooltip"
      onMouseEnter={() => {
        overCard.current = true;
        if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      }}
      onMouseLeave={() => {
        overCard.current = false;
        close();
      }}
      style={{
        left,
        ...(openDownwards
          ? { top: below }
          : { bottom: Math.max(8, window.innerHeight - anchored.rect.top + 8) }),
        width: CARD_WIDTH,
      }}
      className="fixed z-50 overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3 shadow-[var(--fl-shadow-lg)]"
    >
      {loaded.status === "loading" ? (
        <p className="text-[12px] text-[var(--fl-muted)]">Reading {hostOf(anchored.url)}…</p>
      ) : (
        <div className="space-y-1">
          {/* Above the text, and allowed to fail silently: plenty of pages
              offer no picture, and plenty of the ones that do point at
              something that will not load. `onError` hides it rather than
              leaving the browser's broken-image glyph in a card whose whole
              job is to look like the page. */}
          {loaded.preview.image && !imageFailed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={loaded.preview.image}
              alt=""
              onError={() => setImageFailed(true)}
              className="mb-2 h-32 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] object-cover"
            />
          )}
          <p className="truncate text-[11px] uppercase tracking-wide text-[var(--fl-muted)]">
            {loaded.preview.host}
          </p>

          {loaded.preview.title ? (
            <p className="line-clamp-2 text-[13px] font-medium leading-snug text-[var(--fl-text)]">
              {loaded.preview.title}
            </p>
          ) : (
            <p className="text-[12.5px] leading-snug text-[var(--fl-muted)]">
              {canRead
                ? "This page could not be read from here. It still opens normally."
                : "Sign in with GitHub to see what a page says about itself."}
            </p>
          )}

          {loaded.preview.description && (
            <p className="line-clamp-3 text-[12px] leading-snug text-[var(--fl-muted)]">
              {loaded.preview.description}
            </p>
          )}

          <p className="truncate pt-0.5 font-mono text-[11px] text-[var(--fl-muted)]">
            {anchored.url}
          </p>

          {/* Only where it is true: in the rendered preview a click is the
              browser's own and Alt does nothing special. */}
          {anchored.editable && (
            <p className="pt-1 text-[11px] text-[var(--fl-muted)]">
              Click to open in a new tab · Alt-click to put the cursor in the text
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The host of an address, or the address itself when it will not parse. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
