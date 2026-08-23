import { getSession, githubOAuthConfigured } from "@/lib/session";
import { SignInError } from "@/components/SignInError";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Toolkit } from "@/components/landing/Toolkit";
import { Features } from "@/components/landing/Features";
import { Positioning } from "@/components/landing/Positioning";
import { Ownership } from "@/components/landing/Ownership";
import { Faq } from "@/components/landing/Faq";
import { Pricing } from "@/components/landing/Pricing";
import { CallToAction } from "@/components/landing/CallToAction";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "ForkLeaf — Markdown notes stored in your own GitHub repo",
  description:
    "A local-first Markdown workspace whose storage is a GitHub repository you own. Wikilinks, backlinks, full-text search, a visual Mermaid studio, offline editing and PDF/Word/HTML export — over plain .md files, with real commit history and no lock-in. Free and open source.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const githubAvailable = githubOAuthConfigured();
  const session = await getSession();

  // No overflow containment on the root, deliberately.
  //
  // It used to carry `overflow-x-clip` to catch the hero and call-to-action
  // glows, which are wider than the viewport on purpose. That silently broke
  // every anchor on the page: a clip container makes its descendants
  // unreachable to `scrollIntoView`, so the browser's own fragment handling and
  // React's alike changed the URL to `/#features` and then stayed exactly where
  // they were.
  //
  // The glows are clipped by the sections that own them instead, which is where
  // the clipping belonged in the first place.
  return (
    <div className="flex min-h-screen flex-col bg-[var(--fl-bg)] font-sans text-[var(--fl-text)]">
      <Nav githubAvailable={githubAvailable} signedIn={Boolean(session?.user)} />

      {error && (
        <div className="mx-auto mt-4 w-full max-w-3xl px-6">
          <SignInError code={error} />
        </div>
      )}

      <main className="flex-1">
        <Hero githubAvailable={githubAvailable} />
        <HowItWorks />
        <Toolkit />
        <Features />
        <Positioning />
        <Ownership />
        <Pricing />
        <Faq />
        <CallToAction githubAvailable={githubAvailable} />
      </main>

      <Footer />
    </div>
  );
}
