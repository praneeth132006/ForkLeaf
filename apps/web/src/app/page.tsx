import { githubOAuthConfigured } from "@/lib/session";
import { SignInError } from "@/components/SignInError";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { ScrollStory } from "@/components/landing/ScrollStory";
import { Features } from "@/components/landing/Features";
import { Ownership } from "@/components/landing/Ownership";
import { Pricing } from "@/components/landing/Pricing";
import { CallToAction } from "@/components/landing/CallToAction";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "ForkLeaf — Markdown notes stored in your own GitHub repo",
  description:
    "ForkLeaf is a local-first Markdown editor with first-class Mermaid diagrams. Every note is a plain .md file in a GitHub repository you own: real version history, offline editing, and no lock-in.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const githubAvailable = githubOAuthConfigured();

  // `clip` rather than `hidden` on the root below: hidden makes it a scroll
  // container, and a scroll container that never scrolls silently breaks
  // `position: sticky` inside it — which is the entire scroll story.
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[var(--fl-bg)] font-sans text-[var(--fl-text)]">
      <Nav githubAvailable={githubAvailable} />

      {error && (
        <div className="mx-auto mt-4 w-full max-w-3xl px-6">
          <SignInError code={error} />
        </div>
      )}

      <main className="flex-1">
        <Hero githubAvailable={githubAvailable} />
        <ScrollStory />
        <Features />
        <Ownership />
        <Pricing />
        <CallToAction githubAvailable={githubAvailable} />
      </main>

      <Footer />
    </div>
  );
}
