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

  /**
   * A click on an ordinary markdown link, offered to the app first.
   *
   * Returning true claims the click and stops the browser following it;
   * returning false — or not supplying this at all — leaves the link to behave
   * exactly as it did before.
   *
   * This exists for links to files the app can open itself rather than
   * navigate to. A PDF beside a note is the case it was added for: `[the
   * paper](papers/x.pdf#page=12)` is a perfectly ordinary markdown link, it
   * renders as one on github.com, and in ForkLeaf it should open the reader on
   * page 12 rather than navigating the tab away from unsaved work to a URL the
   * browser cannot resolve anyway.
   *
   * Deliberately a *veto*, not a handler. The bridge sees every link click and
   * claims the few it recognises, so nothing has to enumerate in advance which
   * hrefs are special — and an app that supplies no `openHref` behaves as
   * though this were never added.
   */
  openHref?: (href: string) => boolean;
}

/** The resolver `markdownToHtml` wants, from a bridge that may not be there. */
export function wikilinkResolver(bridge: LinkBridge | undefined) {
  return bridge ? bridge.resolve : undefined;
}

/**
 * Turns a click anywhere inside rendered markdown into an open.
 *
 * Delegated from a container rather than bound per link: the HTML is injected
 * with `dangerouslySetInnerHTML`, so there is no React element to put a
 * handler on. Returns true when the click has been handled and the browser
 * should not follow it.
 *
 * Wikilinks are checked first because they are unambiguous — a `data-wikilink`
 * anchor is one by construction. An ordinary link is only claimed if the app
 * says it wants it.
 */
export function handleLinkClick(event: MouseEvent, bridge: LinkBridge | undefined): boolean {
  if (!bridge) return false;
  // Leave the browser's own affordances alone: ⌘-click, middle-click and
  // right-click should still do what they do everywhere else.
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const element = event.target as HTMLElement | null;

  const wikilink = element?.closest<HTMLElement>("a[data-wikilink]");
  const target = wikilink?.dataset.wikilink;
  if (target) {
    event.preventDefault();
    bridge.open(target, wikilink?.dataset.wikilinkAnchor ?? null);
    return true;
  }

  const anchor = element?.closest<HTMLAnchorElement>("a[href]");
  // `getAttribute` rather than `.href`, which the DOM has already resolved
  // into an absolute URL against this page — turning the relative path the
  // note actually contains into `https://forkleaf.app/papers/x.pdf`, which is
  // not a path the app can look up in a repository.
  const href = anchor?.getAttribute("href");
  if (!href || !bridge.openHref?.(href)) return false;

  event.preventDefault();
  return true;
}

/** @deprecated Use `handleLinkClick`, which also offers ordinary links. */
export const handleWikilinkClick = handleLinkClick;
