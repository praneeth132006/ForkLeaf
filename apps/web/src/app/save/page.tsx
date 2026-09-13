import { Suspense } from "react";
import type { Metadata } from "next";
import { SaveFromWeb } from "@/components/SaveFromWeb";

export const metadata: Metadata = {
  title: "Save to ForkLeaf",
  robots: { index: false },
};

/**
 * Where the extension, the bookmarklet and the share sheet send what to save.
 *
 * A page of its own rather than the editor: saving a quote should not load a
 * whole notebook, and what is saved goes to its own repository anyway.
 */
export default function SavePage() {
  return (
    <main className="flex min-h-screen items-start justify-center bg-[var(--fl-bg)] px-4 py-10 sm:py-16">
      <Suspense fallback={null}>
        <SaveFromWeb />
      </Suspense>
    </main>
  );
}
