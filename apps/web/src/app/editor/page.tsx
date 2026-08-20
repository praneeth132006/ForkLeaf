import { Suspense } from "react";
import { EditorWorkspace } from "@/components/editor/EditorWorkspace";
import { BootScreen } from "@/components/BootScreen";

export const metadata = {
  title: "Editor — ForkLeaf",
};

/**
 * Rendered per request rather than prerendered.
 *
 * This is the route that injects rendered markdown and diagram SVG as HTML, so
 * it is the one that gets the strict nonce-based CSP (see `src/proxy.ts`) — and
 * a nonce only exists for a page rendered per request. The shell here is a
 * loading state around a client component, so nothing is lost by it.
 */
export const dynamic = "force-dynamic";

/**
 * The editor route.
 *
 * A thin server shell around the client editor, so `?ws=` and `?note=` can be
 * read with `useSearchParams` — the hook needs a Suspense boundary, and this is
 * the closest place to put one that still lets the shell be prerendered.
 */
export default function EditorPage() {
  return (
    <Suspense fallback={<BootScreen />}>
      <EditorWorkspace />
    </Suspense>
  );
}
