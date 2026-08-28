import React from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/SiteShell";
import { DocsSidebar } from "./DocsSidebar";

export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s · ForkLeaf Docs",
  },
  description:
    "How ForkLeaf works: the editor, Mermaid diagrams, GitHub sync, conflict resolution, exporting and security.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-6xl gap-12 px-6 py-12">
        {/* Sticky rather than fixed, so it scrolls with short pages and stops
            at the footer instead of overlapping it. */}
        <aside className="sticky top-24 hidden h-[calc(100vh-9rem)] w-56 shrink-0 overflow-y-auto pb-8 lg:block">
          <DocsSidebar />
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </SiteShell>
  );
}
