"use client";

import React from "react";
import Link from "next/link";
import { PLANS, formatPrice, type Plan } from "@/lib/plans";
import { track } from "@/lib/firebase/analytics";
import { SectionHeading } from "./HowItWorks";

/**
 * Pricing.
 *
 * The paid tiers are announced rather than sellable: no payment provider is
 * connected yet, so their buttons register interest instead of pretending to
 * take money. Saying "coming soon" out loud is better than a checkout button
 * that 404s.
 */
export function Pricing() {
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Pricing"
        title="The editor is free. It always will be."
        body="Your notes sit in your own GitHub account, so there is no storage for us to charge you for. The paid tiers buy convenience on top of that — never access to your own writing."
      />

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      <p className="mt-6 text-[13px] text-[var(--fl-muted)]">
        Pro and Team are not on sale yet. If ForkLeaf ever shuts down, your notes are already in
        your repository and keep working without it.
      </p>
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const isFree = plan.amount === 0;

  return (
    <article
      className={`fl-card relative flex flex-col p-7 ${
        plan.highlighted ? "border-[var(--fl-accent)] shadow-[var(--fl-shadow)]" : ""
      }`}
    >
      {plan.highlighted && (
        <span className="absolute -top-2.5 left-7 rounded-full bg-[var(--fl-accent)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-accent-contrast)]">
          Planned
        </span>
      )}

      <h3 className="text-[17px] font-semibold tracking-tight text-[var(--fl-text)]">
        {plan.name}
      </h3>
      <p className="mt-1 text-[14px] text-[var(--fl-muted)]">{plan.tagline}</p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight text-[var(--fl-text)]">
          {formatPrice(plan)}
        </span>
        {!isFree && <span className="text-[14px] text-[var(--fl-muted)]">/ month</span>}
      </p>

      {isFree ? (
        <Link href="/editor" className="fl-btn fl-btn-primary mt-6 w-full">
          Start writing
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => track("upgrade_viewed", { plan: plan.id })}
          className="fl-btn fl-btn-ghost mt-6 w-full"
        >
          Coming soon
        </button>
      )}

      <ul className="mt-7 space-y-2.5 text-[14px] text-[var(--fl-muted)]">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <Check />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[var(--fl-accent)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2.5 8.5 3.5 3.5 7.5-8" />
    </svg>
  );
}
