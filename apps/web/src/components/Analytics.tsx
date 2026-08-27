"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@/lib/firebase/analytics";
import { postHogIdentify, startPostHog } from "@/lib/posthog";

/**
 * Reports page views to Firebase Analytics.
 *
 * The App Router does a client-side navigation between routes, so Firebase's
 * automatic `page_view` collection only ever sees the first URL of a session.
 * Watching the pathname here is what makes /editor show up as a separate screen
 * from the landing page.
 */
function PageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Started here rather than in the layout: this component is already the one
  // client boundary analytics lives behind, and starting it twice is a no-op.
  useEffect(() => {
    startPostHog();

    // Attributed to the GitHub login, which is already public on github.com.
    // Nothing else — no email, no repository names, nothing from the notes.
    void fetch("/api/session")
      .then((response) => (response.ok ? response.json() : null))
      .then((session) => {
        const login = session?.user?.login;
        if (typeof login === "string") postHogIdentify(login);
      })
      .catch(() => {
        /* Analytics is best-effort; a failed read is not worth a retry. */
      });
  }, []);

  useEffect(() => {
    track("page_view", {
      page_path: pathname,
      page_location: typeof window === "undefined" ? undefined : window.location.href,
      // Kept so campaign links can be attributed; note that ForkLeaf never puts
      // anything about the user or their notes in a URL.
      page_query: searchParams.toString() || undefined,
    });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Mounted once in the root layout. Renders nothing.
 *
 * `useSearchParams` opts its subtree out of static rendering, so the Suspense
 * boundary is what keeps the rest of the page prerenderable.
 */
export function Analytics() {
  return (
    <Suspense fallback={null}>
      <PageViews />
    </Suspense>
  );
}
