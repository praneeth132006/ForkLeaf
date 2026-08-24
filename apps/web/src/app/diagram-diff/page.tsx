import { Suspense } from "react";
import { DiagramDiffView } from "@/components/DiagramDiffView";
import { BootScreen } from "@/components/BootScreen";

export const metadata = {
  title: "Diagram review — ForkLeaf",
  description: "See what a pull request changed in your Mermaid diagrams, as a picture.",
};

/**
 * Rendered per request, like the editor and the diagram window: this page
 * injects rendered SVG as markup, so it needs the nonce-based CSP in
 * `src/proxy.ts` — and a nonce only exists for a page that is not prerendered.
 */
export const dynamic = "force-dynamic";

/**
 * Diagram review for a pull request.
 *
 * The one page here that is meant to be opened by somebody who has never used
 * ForkLeaf: a link from a pull-request comment, followed by whoever happens to
 * be reviewing. Public repositories work without an account.
 */
export default function DiagramDiffPage() {
  return (
    <Suspense fallback={<BootScreen message="Opening the review…" />}>
      <DiagramDiffView />
    </Suspense>
  );
}
