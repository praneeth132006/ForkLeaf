import { HeroSplitDemo } from "@/components/HeroSplitDemo";
import { FeatureSections } from "@/components/FeatureSections";
import { Footer } from "@/components/Footer";
import { PricingSection } from "@/components/PricingSection";
import { DocumentationPreview } from "@/components/DocumentationPreview";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] font-sans flex flex-col relative overflow-x-hidden">
      {/* Ambient Topographic Texture */}
      <div className="absolute inset-0 bg-repeat opacity-[0.03] pointer-events-none z-0" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\\"20\\" height=\\"20\\" viewBox=\\"0 0 20 20\\" xmlns=\\"http://www.w3.org/2000/svg\\"%3E%3Cg fill=\\"%232A3240\\" fill-opacity=\\"1\\" fill-rule=\\"evenodd\\"%3E%3Ccircle cx=\\"3\\" cy=\\"3\\" r=\\"3\\"%3E%3C/circle%3E%3Ccircle cx=\\"13\\" cy=\\"13\\" r=\\"3\\"%3E%3C/circle%3E%3C/g%3E%3C/svg%3E")' }} />

      {/* Navigation */}
      <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--color-trail-teal)] rounded-md flex items-center justify-center text-[var(--color-paper)] font-serif font-bold text-xl leading-none">
            M
          </div>
          <span className="font-serif text-2xl font-semibold tracking-tight text-[var(--color-basalt)]">
            mdnotion
          </span>
        </div>
        <nav className="hidden md:flex gap-8 items-center font-medium text-[var(--color-mist)]">
          <a href="#features" className="hover:text-[var(--color-ink)] transition-colors">Features</a>
          <a href="#docs" className="hover:text-[var(--color-ink)] transition-colors">Documentation</a>
          <a href="#pricing" className="hover:text-[var(--color-ink)] transition-colors">Pricing</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/editor" className="text-[var(--color-ink)] font-medium px-4 py-2 hover:bg-[var(--color-chalk)] rounded-md transition-colors border border-transparent hover:border-[var(--color-contour)]/10">
            Login as Guest
          </Link>
          <button className="bg-[var(--color-signal-amber)] text-[var(--color-basalt)] font-semibold px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity shadow-sm">
            Continue with GitHub
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center pt-20 pb-12 text-center w-full relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-chalk)] text-[var(--color-mist)] text-sm font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-[var(--color-ember)] animate-pulse" />
          mdnotion v2.0 is now in public beta
        </div>
        
        <h1 className="font-serif text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-[var(--color-basalt)] leading-[1.1] mb-6">
          Write with <span className="text-[var(--color-trail-teal)]">clarity</span>.<br />
          Format with <span className="text-[var(--color-signal-amber)]">ease</span>.
        </h1>
        
        <p className="text-xl md:text-2xl text-[var(--color-mist)] max-w-2xl mx-auto leading-relaxed mb-12 font-sans px-4">
          The minimal, powerful markdown editor that gets out of your way. Built for speed, backed by your GitHub repo.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <Link href="/editor" className="bg-[var(--color-basalt)] text-[var(--color-paper)] text-lg font-medium px-8 py-4 rounded-lg hover:bg-[var(--color-ink)] transition-colors shadow-lg flex items-center gap-2">
            Try Guest Mode
          </Link>
          <a href="#docs" className="bg-transparent text-[var(--color-ink)] text-lg font-medium px-8 py-4 rounded-lg border border-[var(--color-chalk)] hover:bg-[var(--color-chalk)] transition-colors flex items-center gap-2">
            View Documentation
          </a>
        </div>

        {/* Hero Demo Video / Split Demo */}
        <div className="w-full px-4 mb-24">
           <HeroSplitDemo />
        </div>

        {/* Quiet Proof Strip */}
        <div className="w-full max-w-5xl mx-auto border-y border-[var(--color-chalk)] py-8 px-4 flex flex-wrap justify-center gap-12 text-[var(--color-mist)] font-medium text-sm md:text-base">
           <div className="flex items-center gap-2">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
             0 servers store your notes
           </div>
           <div className="flex items-center gap-2">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
             MIT Licensed Open Source
           </div>
           <div className="flex items-center gap-2">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
             4.2k GitHub Stars
           </div>
        </div>

        {/* Features Sections */}
        <FeatureSections />

        {/* Documentation Preview Section */}
        <DocumentationPreview />

        {/* Pricing Section */}
        <PricingSection />

      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
