// @ts-check

/**
 * What the page says about itself, read inside the page.
 *
 * Passed to `chrome.scripting.executeScript` as a function, which serialises
 * its source into the tab — so it must stand alone: no imports, no helpers
 * from outside its own body, nothing but the page's own `document`.
 *
 * Nothing leaves the page except the address, a title, a one-line description
 * and whatever text the person had selected.
 *
 * @returns {{ url: string, title: string, description: string, selection: string }}
 */
export function extractPage() {
  /** @param {string} selector */
  const meta = (selector) => {
    const value = document.querySelector(selector)?.getAttribute("content");
    return value ? value.replace(/\s+/g, " ").trim() : "";
  };

  let url = location.href;
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (canonical) {
    try {
      const resolved = new URL(canonical, location.href);
      // A canonical link on another site is usually a syndicated copy's
      // original — fine to prefer — but never a non-web address.
      if (resolved.protocol === "https:" || resolved.protocol === "http:") url = resolved.href;
    } catch {
      // A malformed canonical link is ignored; the address bar is still true.
    }
  }

  const title = meta('meta[property="og:title"]') || document.title.replace(/\s+/g, " ").trim();
  const description = (
    meta('meta[name="description"]') || meta('meta[property="og:description"]')
  ).slice(0, 500);
  const selection = String(window.getSelection ? window.getSelection() : "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, 20000);

  return { url, title, description, selection };
}
