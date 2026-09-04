import { redirect } from "next/navigation";
import { getSession, githubOAuthConfigured } from "@/lib/session";
import { SignInError } from "@/components/SignInError";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { Toolkit } from "@/components/landing/Toolkit";
import { Why } from "@/components/landing/Why";
import { Ownership } from "@/components/landing/Ownership";
import { Faq } from "@/components/landing/Faq";
import { Support } from "@/components/landing/Support";
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
  searchParams: Promise<{ error?: string; home?: string }>;
}) {
  const { error, home } = await searchParams;
  const githubAvailable = githubOAuthConfigured();
  const session = await getSession();

  /**
   * Somebody who has already signed in wants their notes, not the pitch.
   *
   * The dashboard is the right landing place because it is the only screen
   * that shows the whole notebook — every note in every connected repository,
   * indexed and searchable — where the editor opens on whatever happened to be
   * last. Arriving at a page selling the product you already use, and having
   * to find the way in from it, is a step that never had a reason.
   *
   * `?home=1` still shows it, so the landing page stays reachable rather than
   * becoming something only signed-out people can read. An error from the
   * sign-in round trip is shown here too — that is the one thing this page has
   * to say to somebody who is already signed in.
   */
  if (session?.user && !error && home !== "1") {
    redirect("/dashboard");
  }

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
        {/* Argument before inventory.
            
            `Toolkit` — the exhaustive list of everything ForkLeaf does — used
            to come before `Features`, which is the illustrated case for why
            any of it matters. That is the wrong way round: a reader who has
            not yet been given a reason to care meets eight groups of ticked
            rows, and a capability list read by somebody who is not yet sold
            is just a long page. `Features` argues, then `Toolkit` proves. */}
        <Hero githubAvailable={githubAvailable} />
        <HowItWorks />
        <Features />
        <Toolkit />
        <Why />
        <Ownership />
        <Pricing />
        <Faq />
        <Support />
        <CallToAction githubAvailable={githubAvailable} />
      </main>

      <Footer />
    </div>
  );
}
