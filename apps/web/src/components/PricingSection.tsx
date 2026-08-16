import React from "react";

/**
 * PricingSection component displays the pricing tiers for mdnotion.
 * It contains two columns: Open Source (Free) and Cloud (Paid/Coming Soon).
 * The design aligns with the Waypoint design system.
 */
export function PricingSection() {
  return (
    // Main container for the pricing section with proper padding and centering
    <section id="pricing" className="w-full max-w-7xl mx-auto px-4 py-24">
      
      {/* Section Header: Title and subtitle explaining the value proposition */}
      <div className="text-center mb-16">
        <h2 className="font-serif text-4xl md:text-5xl font-bold text-[var(--color-basalt)] mb-4">
          Simple, transparent pricing
        </h2>
        <p className="text-[var(--color-mist)] text-lg max-w-2xl mx-auto">
          Choose the plan that fits your workflow. No hidden fees, no lock-in.
        </p>
      </div>

      {/* Grid container for pricing cards */}
      <div className="flex flex-col md:flex-row gap-8 max-w-5xl mx-auto">
        
        {/* Open Source Plan Card */}
        <div className="flex-1 bg-[var(--color-paper)] p-8 rounded-2xl border border-[var(--color-chalk)] shadow-xl shadow-[var(--color-fog)]/5 flex flex-col">
          <div className="mb-8">
            {/* Plan Title */}
            <h3 className="font-serif text-3xl font-bold text-[var(--color-basalt)] mb-2">Open Source</h3>
            {/* Plan Price */}
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-4xl font-bold text-[var(--color-ink)]">Free</span>
              <span className="text-[var(--color-mist)] font-medium">forever</span>
            </div>
            {/* Plan Description */}
            <p className="text-[var(--color-mist)]">Perfect for individuals and self-hosters.</p>
          </div>
          
          {/* Plan Features List */}
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-center gap-3 text-[var(--color-ink)]">
              <span className="text-[var(--color-trail-teal)]">✓</span> Local + GitHub backend
            </li>
            <li className="flex items-center gap-3 text-[var(--color-ink)]">
              <span className="text-[var(--color-trail-teal)]">✓</span> Unlimited local files
            </li>
            <li className="flex items-center gap-3 text-[var(--color-ink)]">
              <span className="text-[var(--color-trail-teal)]">✓</span> Full WYSIWYG editor
            </li>
            <li className="flex items-center gap-3 text-[var(--color-ink)]">
              <span className="text-[var(--color-trail-teal)]">✓</span> Community support
            </li>
          </ul>
          
          {/* Call to Action Button */}
          <button className="w-full bg-transparent text-[var(--color-ink)] font-semibold px-6 py-3 rounded-lg border border-[var(--color-chalk)] hover:bg-[var(--color-chalk)] transition-colors">
            Get Started
          </button>
        </div>

        {/* Cloud Plan Card - Highlighted with darker background */}
        <div className="flex-1 bg-[var(--color-basalt)] p-8 rounded-2xl border border-[var(--color-contour)] shadow-xl relative flex flex-col">
          {/* "Coming Soon" Badge positioned at the top right */}
          <div className="absolute top-0 right-8 transform -translate-y-1/2 bg-[var(--color-signal-amber)] text-[var(--color-basalt)] px-3 py-1 rounded-full text-sm font-bold shadow-md">
            Coming Soon
          </div>
          
          <div className="mb-8">
            {/* Plan Title */}
            <h3 className="font-serif text-3xl font-bold text-[var(--color-paper)] mb-2">mdnotion Cloud</h3>
            {/* Plan Price */}
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-4xl font-bold text-[var(--color-paper)]">$8</span>
              <span className="text-[var(--color-contour)] font-medium">/mo</span>
            </div>
            {/* Plan Description */}
            <p className="text-[var(--color-contour)]">For teams and users wanting sync across devices.</p>
          </div>
          
          {/* Plan Features List */}
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-center gap-3 text-[var(--color-paper)]">
              <span className="text-[var(--color-signal-amber)]">✓</span> Everything in Open Source
            </li>
            <li className="flex items-center gap-3 text-[var(--color-paper)]">
              <span className="text-[var(--color-signal-amber)]">✓</span> Hosted WebRTC Sync
            </li>
            <li className="flex items-center gap-3 text-[var(--color-paper)]">
              <span className="text-[var(--color-signal-amber)]">✓</span> Cross-device collaboration
            </li>
            <li className="flex items-center gap-3 text-[var(--color-paper)]">
              <span className="text-[var(--color-signal-amber)]">✓</span> Priority support
            </li>
          </ul>
          
          {/* Call to Action Button - Disabled for "Coming Soon" state */}
          <button className="w-full bg-[var(--color-paper)] text-[var(--color-basalt)] font-semibold px-6 py-3 rounded-lg hover:bg-[var(--color-chalk)] transition-colors" disabled>
            Join Waitlist
          </button>
        </div>
      </div>
    </section>
  );
}
