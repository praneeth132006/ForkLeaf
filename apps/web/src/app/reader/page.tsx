import { Suspense } from "react";
import { ReaderWindow } from "@/components/ReaderWindow";
import { BootScreen } from "@/components/BootScreen";

export const metadata = {
  title: "Reader — ForkLeaf",
};

/**
 * Rendered per request, for the same reason the editor and the diagram window
 * are: this route gets the strict nonce-based CSP in `src/proxy.ts`, and a
 * nonce only exists for a page that is not prerendered.
 */
export const dynamic = "force-dynamic";

/**
 * A PDF, in a tab of its own.
 *
 * The whole address is in the URL — which repository, which file, which
 * passage — so this is a real link. It can be bookmarked, opened in a second
 * window beside the first, sent to somebody who has access to the same
 * repository, and reopened tomorrow. That is the difference between a document
 * viewer and a panel that happens to contain a document.
 */
export default function ReaderPage() {
  return (
    <Suspense fallback={<BootScreen message="Opening document…" />}>
      <ReaderWindow />
    </Suspense>
  );
}
