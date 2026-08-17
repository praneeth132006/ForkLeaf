import React from "react";

export function FeatureSections() {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-24 flex flex-col gap-32">
      {/* Feature 1: WYSIWYG ⇄ Raw */}
      <section className="flex flex-col md:flex-row items-center gap-12" id="features">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-fog)] text-[var(--color-chalk)] text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-[var(--color-trail-teal)]" />
            Seamless Editing
          </div>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[var(--color-basalt)]">
            Write once, see it live.
          </h2>
          <p className="text-[var(--color-mist)] text-lg leading-relaxed max-w-md">
            Toggle between Notion-style WYSIWYG block editing and raw markdown source. No lock-in,
            just pure text power wrapped in an elegant interface.
          </p>
        </div>
        <div className="flex-1 w-full bg-[var(--color-paper)] p-6 rounded-2xl border border-[var(--color-chalk)] shadow-xl shadow-[var(--color-fog)]/5 relative overflow-hidden group">
          <div className="absolute top-4 right-4 bg-[var(--color-chalk)] text-[var(--color-ink)] px-3 py-1 rounded-md text-xs font-semibold cursor-pointer hover:bg-[var(--color-signal-amber)] hover:text-[var(--color-basalt)] transition-colors z-10 shadow-sm border border-[var(--color-contour)]/10">
            WYSIWYG ⇄ Raw
          </div>
          <div className="font-mono text-sm text-[var(--color-contour)] opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 bg-[var(--color-basalt)] text-[var(--color-chalk)] p-8 flex flex-col justify-center">
            ## Markdown Mode
            <br />
            This is **raw** markdown.
          </div>
          <div className="p-4 group-hover:opacity-0 transition-opacity h-48 flex flex-col justify-center">
            <h2 className="text-2xl font-serif font-bold text-[var(--color-basalt)] mb-2">
              Markdown Mode
            </h2>
            <p className="text-[var(--color-ink)]">
              This is <strong>raw</strong> markdown.
            </p>
          </div>
        </div>
      </section>

      {/* Feature 2: Diagrams */}
      <section className="flex flex-col md:flex-row-reverse items-center gap-12">
        <div className="flex-1 space-y-6">
          {/* Updates badge label to 'Smart Diagramming' to accurately reflect functionality without using 'AI' */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-fog)] text-[var(--color-chalk)] text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-[var(--color-signal-amber)]" />
            Smart Diagramming
          </div>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[var(--color-basalt)]">
            Diagrams without syntax.
          </h2>
          <p className="text-[var(--color-mist)] text-lg leading-relaxed max-w-md">
            Describe what you want to see, and watch it turn into a Mermaid flowchart instantly. You
            map the territory, we handle the syntax.
          </p>
        </div>
        <div className="flex-1 w-full bg-[#1E2530] p-6 rounded-2xl shadow-xl shadow-[var(--color-fog)]/10 relative overflow-hidden flex flex-col gap-4 border border-[var(--color-contour)]">
          <div className="bg-[#14181F] text-[#EDEAE2] p-4 rounded-lg font-mono text-sm border border-[#2A3240] shadow-inner flex items-center">
            <span className="text-[#8A93A3] mr-2">/diagram</span> User logins, then dashboard or
            error
            <span className="ml-auto w-2 h-4 bg-[#E8A33D] animate-pulse" />
          </div>
          <div className="flex-1 border-2 border-dashed border-[#3FA796] rounded-lg p-6 flex items-center justify-center relative">
            {/* Mock Flowchart */}
            <div className="flex flex-col items-center gap-4">
              <div className="bg-[#EDEAE2] text-[#14181F] px-4 py-2 rounded-md font-mono text-sm font-bold border-2 border-[#3FA796]">
                User Login
              </div>
              <div className="w-0.5 h-6 bg-[#3FA796] relative">
                <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-r-2 border-b-2 border-[#3FA796] transform rotate-45"></div>
              </div>
              <div className="flex gap-8">
                <div className="bg-[#EDEAE2] text-[#14181F] px-4 py-2 rounded-md font-mono text-sm border-2 border-[#3FA796]">
                  Dashboard
                </div>
                <div className="bg-[#14181F] text-[#EDEAE2] px-4 py-2 rounded-md font-mono text-sm border-2 border-[#C1483B]">
                  Error
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 3: GitHub PR */}
      <section className="flex flex-col md:flex-row items-center gap-12">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-fog)] text-[var(--color-chalk)] text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-[#E8A33D]" />
            Your Repo
          </div>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[var(--color-basalt)]">
            Commit straight to GitHub.
          </h2>
          <p className="text-[var(--color-mist)] text-lg leading-relaxed max-w-md">
            Direct push or open a Pull Request. We respect your branch protection rules. Your
            knowledge base stays where your code lives.
          </p>
        </div>
        <div className="flex-1 w-full bg-[var(--color-paper)] p-8 rounded-2xl border border-[var(--color-chalk)] shadow-xl shadow-[var(--color-fog)]/5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--color-chalk)] pb-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-[var(--color-trail-teal)]" />
              <span className="font-mono text-sm font-bold text-[var(--color-ink)]">
                mdnotion/update-docs
              </span>
            </div>
            <span className="text-xs font-semibold bg-[var(--color-chalk)] text-[var(--color-mist)] px-2 py-1 rounded">
              Open
            </span>
          </div>
          <div className="font-serif text-xl font-bold text-[var(--color-basalt)]">
            Add new authentication flow docs
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button className="bg-[var(--color-trail-teal)] text-[var(--color-paper)] font-semibold px-4 py-2 rounded-md hover:opacity-90 transition-opacity text-sm">
              Merge Pull Request
            </button>
          </div>
        </div>
      </section>

      {/* Feature 4: Export */}
      <section className="flex flex-col md:flex-row-reverse items-center gap-12">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-fog)] text-[var(--color-chalk)] text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-[var(--color-ember)]" />
            Portability
          </div>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[var(--color-basalt)]">
            Export anywhere.
          </h2>
          <p className="text-[var(--color-mist)] text-lg leading-relaxed max-w-md">
            Need to share a report? Click to render pixel-perfect PDFs, DOCX, HTML, LaTeX, or EPUBs,
            powered by Pandoc.
          </p>
        </div>
        <div className="flex-1 w-full flex flex-wrap gap-4 justify-center">
          {["PDF", "DOCX", "HTML", "LaTeX", "EPUB"].map((ext) => (
            <div
              key={ext}
              className="bg-[var(--color-paper)] border border-[var(--color-chalk)] shadow-sm px-6 py-4 rounded-xl font-mono font-bold text-[var(--color-ink)] hover:border-[var(--color-trail-teal)] hover:text-[var(--color-trail-teal)] hover:-translate-y-1 transition-all cursor-pointer flex items-center justify-center min-w-[120px] text-lg"
            >
              .{ext.toLowerCase()}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
