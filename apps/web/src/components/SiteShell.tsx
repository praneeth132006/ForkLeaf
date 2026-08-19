import React from "react";
import { Nav } from "./landing/Nav";
import { Footer } from "./landing/Footer";
import { getSession, githubOAuthConfigured } from "@/lib/session";

/**
 * Chrome for every page that is not the editor: the marketing nav on top, the
 * footer underneath, content in between.
 */
export async function SiteShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--fl-bg)] font-sans text-[var(--fl-text)]">
      <Nav githubAvailable={githubOAuthConfigured()} signedIn={Boolean(session?.user)} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
