import { Suspense } from "react";
import { EditorWorkspace } from "@/components/editor/EditorWorkspace";
import { BootScreen } from "@/components/BootScreen";

export const metadata = {
  title: "Markdown editor",
  description:
    "A free Markdown editor in the browser with wikilinks, Mermaid diagrams and offline editing. Works with no account; connect GitHub to sync your notes to your own repository.",
  alternates: { canonical: "/editor" },
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
 * The editor is an app, not a page to read: it is never zoomed as a whole.
 *
 * Without this, a phone or tablet zooms the entire editor in the moment a
 * field with small text takes focus — and the Home Screen app, which has no
 * browser chrome to zoom back out with, comes back from a reload still
 * zoomed. The writing itself is already sized for reading.
 */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfa" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

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
