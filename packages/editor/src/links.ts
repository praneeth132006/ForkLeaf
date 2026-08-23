import type { ResolvedWikilink, WikiLink } from "@forkleaf/markdown-engine";

/**
 * How the editor asks the app about `[[wikilinks]]`.
 *
 * The same shape as the image bridge, and for the same reason: which note a
 * link points at depends on the workspace, and the editor has no idea what a
 * workspace is. It knows only that a link was written, and that clicking one
 * should do something.
 *
 * Optional throughout. With no bridge, wikilinks still render as links and
 * simply do nothing when clicked — which is the right behaviour for a preview
 * with no library behind it, such as an exported HTML file.
 */
export interface LinkBridge {
  /**
   * Where this link goes, and whether the note is really there.
   *
   * Returning null leaves the link inert, which is different from returning
   * `exists: false` — that means "no such note *yet*", and is drawn as an
   * invitation to create it.
   */
  resolve: (link: WikiLink) => ResolvedWikilink | null;

  /**
   * Opens the target. Called instead of following the href, so the app can
   * open a tab rather than navigating away from unsaved work.
   */
  open: (target: string, anchor: string | null) => void;
}

/** The resolver `markdownToHtml` wants, from a bridge that may not be there. */
export function wikilinkResolver(bridge: LinkBridge | undefined) {
  return bridge ? bridge.resolve : undefined;
}

/**
 * Turns a click anywhere inside rendered markdown into a wikilink open.
 *
 * Delegated from a container rather than bound per link: the HTML is injected
 * with `dangerouslySetInnerHTML`, so there is no React element to put a
 * handler on. Returns true when the click was a wikilink and has been handled.
 */
export function handleWikilinkClick(event: MouseEvent, bridge: LinkBridge | undefined): boolean {
  if (!bridge) return false;
  // Leave the browser's own affordances alone: ⌘-click, middle-click and
  // right-click should still do what they do everywhere else.
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const anchor = (event.target as HTMLElement | null)?.closest<HTMLElement>("a[data-wikilink]");
  const target = anchor?.dataset.wikilink;
  if (!target) return false;

  event.preventDefault();
  bridge.open(target, anchor?.dataset.wikilinkAnchor ?? null);
  return true;
}
