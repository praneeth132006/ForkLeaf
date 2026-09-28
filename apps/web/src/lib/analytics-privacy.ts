/**
 * What an address may say to an analytics service.
 *
 * ForkLeaf's own addresses carry notes in their query — the editor is
 * `/editor?ws=…&note=journal/2026-09-27-diagnosis.md` — and a note's file name
 * is often the most private thing about it. Analytics tools attach the current
 * address, the referrer and the landing page to every event by default, so the
 * names of notes were being sent to Google Analytics and PostHog with every
 * page view and every page leave.
 *
 * So an address is reduced to where it is and nothing about what: origin and
 * path, plus the `utm_*` campaign tags that analytics is actually for. Paths
 * hold no notes — the only dynamic route is the public documentation.
 */

const CAMPAIGN = /^utm_[a-z]+$/;

/** The address with its query reduced to campaign tags, and no fragment. */
export function publicUrl(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  // Credentials in an address are never analytics.
  url.username = "";
  url.password = "";
  url.hash = "";
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (CAMPAIGN.test(key)) kept.set(key, value.slice(0, 100));
  }
  url.search = kept.toString();
  return url.toString();
}

/** Just the campaign tags of a query string, or undefined when there are none. */
export function publicQuery(search: string): string | undefined {
  const kept = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) {
    if (CAMPAIGN.test(key)) kept.set(key, value.slice(0, 100));
  }
  const text = kept.toString();
  return text || undefined;
}

/** Properties PostHog fills with addresses on its own. */
const URL_PROPERTIES = [
  "$current_url",
  "$referrer",
  "$initial_referrer",
  "$initial_current_url",
  "$session_entry_url",
  "$session_entry_referrer",
  "$prev_pageview_url",
  "page_location",
  "page_referrer",
];

/**
 * A PostHog event with every address in it reduced by `publicUrl`. Given to
 * PostHog as `before_send`, so it applies to events PostHog makes itself.
 */
export function scrubEvent<
  T extends {
    properties?: Record<string, unknown>;
    $set?: Record<string, unknown>;
    $set_once?: Record<string, unknown>;
  } | null,
>(event: T): T {
  if (!event) return event;
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (!bag) continue;
    for (const key of URL_PROPERTIES) {
      // "$direct" is PostHog's word for "no referrer", not an address.
      if (typeof bag[key] === "string" && bag[key] !== "$direct") {
        const reduced = publicUrl(bag[key] as string);
        if (reduced === undefined) delete bag[key];
        else bag[key] = reduced;
      }
    }
    if (typeof bag.page_query === "string") {
      const query = publicQuery(bag.page_query as string);
      if (query === undefined) delete bag.page_query;
      else bag.page_query = query;
    }
  }
  return event;
}
