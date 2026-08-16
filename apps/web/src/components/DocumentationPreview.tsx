import React from "react";
import Link from "next/link";

/**
 * DocumentationPreview component displays a grid of popular documentation topics.
 * It provides users with quick links to getting started, architecture, and other key resources.
 */
export function DocumentationPreview() {
  // Array of documentation items to display in the grid
  const docs = [
    {
      title: "Getting Started",
      description: "Learn how to set up mdnotion locally and connect your first repository.",
      icon: "🚀"
    },
    {
      title: "Architecture",
      description: "Dive deep into our local-first approach and how we handle state.",
      icon: "🏗️"
    },
    {
      title: "WebRTC Sync",
      description: "Understand the peer-to-peer sync engine powering collaborative editing.",
      icon: "⚡"
    },
    {
      title: "Custom Integrations",
      description: "Build plugins and integrate mdnotion into your existing workflow.",
      icon: "🔌"
    }
  ];

  return (
    // Main container for the documentation section with proper padding and top border
    <section id="docs" className="w-full max-w-7xl mx-auto px-4 py-24 border-t border-[var(--color-chalk)]">
      
      {/* Section Header: Title, subtitle, and link to full docs */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-12 gap-6">
        <div>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[var(--color-basalt)] mb-4">
            Documentation
          </h2>
          <p className="text-[var(--color-mist)] text-lg max-w-xl">
            Everything you need to know about setting up, extending, and mastering mdnotion.
          </p>
        </div>
        {/* Link to the full documentation page */}
        <Link href="/docs" className="inline-flex items-center gap-2 text-[var(--color-trail-teal)] font-medium hover:text-[var(--color-basalt)] transition-colors">
          View full documentation
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
        </Link>
      </div>

      {/* Grid container for documentation cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {docs.map((doc, idx) => (
          // Individual documentation card
          <div key={idx} className="group bg-[var(--color-paper)] p-6 rounded-2xl border border-[var(--color-chalk)] hover:border-[var(--color-trail-teal)] transition-colors cursor-pointer shadow-sm hover:shadow-md">
            {/* Icon representation */}
            <div className="text-3xl mb-4">{doc.icon}</div>
            {/* Card Title */}
            <h3 className="font-serif text-2xl font-bold text-[var(--color-basalt)] mb-2 group-hover:text-[var(--color-trail-teal)] transition-colors">
              {doc.title}
            </h3>
            {/* Card Description */}
            <p className="text-[var(--color-mist)] leading-relaxed">
              {doc.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
