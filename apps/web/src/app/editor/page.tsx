import { Suspense } from "react";
import { EditorWorkspace } from "@/components/editor/EditorWorkspace";
import { ForkLeafLogo } from "@/components/Brand";

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
    <Suspense fallback={<Booting />}>
      <EditorWorkspace />
    </Suspense>
  );
}

function Booting() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--fl-bg)]">
      <ForkLeafLogo markClassName="h-8 w-8" textClassName="text-xl" />
      <p className="text-sm text-[var(--fl-muted)]" aria-busy="true">
        Starting ForkLeaf…
      </p>
    </div>
  );
}
