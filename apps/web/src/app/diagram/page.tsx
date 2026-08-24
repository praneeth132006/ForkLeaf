import { Suspense } from "react";
import { DiagramWindow } from "@/components/DiagramWindow";
import { BootScreen } from "@/components/BootScreen";

export const metadata = {
  title: "Diagram — ForkLeaf",
};

/**
 * Rendered per request, for the same reason the editor is: this route injects
 * diagram SVG as HTML, so it gets the strict nonce-based CSP in `src/proxy.ts`
 * — and a nonce only exists for a page that is not prerendered.
 */
export const dynamic = "force-dynamic";

/**
 * A single diagram, in a tab of its own.
 *
 * Opened from the "Open in tab" control on a diagram inside a note, and paired
 * with that note through the `?s=` session id. It is a companion window, not a
 * second editor: the note tab still owns and saves the text.
 */
export default function DiagramPage() {
  return (
    <Suspense fallback={<BootScreen message="Opening diagram…" />}>
      <DiagramWindow />
    </Suspense>
  );
}
