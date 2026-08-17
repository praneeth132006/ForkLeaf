"use client";

import React from "react";
import Link from "next/link";
import type { SessionUser } from "@forkleaf/types";
import { PLANS, formatPrice, type Plan } from "@/lib/plans";
import { usePlan, isPaid } from "@/lib/firebase/billing";
import { track } from "@/lib/firebase/analytics";
import { isFirebaseConfigured } from "@/lib/firebase/config";

export interface AccountPanelProps {
  user: SessionUser | null;
  githubAvailable: boolean;
}

/**
 * Account and plan.
 *
 * This is where "what do I actually get for Pro?" is answered inside the app
 * rather than only on the marketing page — including the honest answer that
 * nothing is on sale yet.
 */
export function AccountPanel({ user, githubAvailable }: AccountPanelProps) {
  const { subscription, loading } = usePlan();
  const currentPlan = PLANS.find((plan) => plan.id === subscription.plan) ?? PLANS[0]!;
  const paid = isPaid(subscription);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
        Account
      </p>
      <h1 className="mt-3 text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--fl-text)]">
        Your account &amp; plan
      </h1>

      {/* ── Identity ──────────────────────────────────────────────────── */}
      <section className="fl-card mt-10 p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
          Signed in as
        </h2>

        {user ? (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote GitHub
                avatar; next/image would need a domain allowlist per avatar host. */}
            <img
              src={user.avatarUrl}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-full"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold text-[var(--fl-text)]">
                {user.name ?? user.login}
              </p>
              <p className="text-[13.5px] text-[var(--fl-muted)]">
                GitHub · <span className="font-mono">@{user.login}</span>
              </p>
            </div>
            <a
              href="https://github.com/settings/applications"
              target="_blank"
              rel="noreferrer"
              className="fl-btn fl-btn-ghost !py-2 !text-[13px]"
            >
              Manage access on GitHub ↗
            </a>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
              You are not signed in. Notes are being kept in this browser only, and nothing is backed
              up.
            </p>
            {githubAvailable && (
              <a href="/api/auth/github" className="fl-btn fl-btn-primary mt-4">
                Continue with GitHub
              </a>
            )}
          </div>
        )}
      </section>

      {/* ── Current plan ──────────────────────────────────────────────── */}
      <section className="fl-card mt-4 p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
          Current plan
        </h2>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[26px] font-semibold tracking-tight text-[var(--fl-text)]">
            {loading ? "…" : currentPlan.name}
          </span>
          <span className="text-[14px] text-[var(--fl-muted)]">
            {loading
              ? "Checking your subscription"
              : paid
                ? `${formatPrice(currentPlan)} / month · ${subscription.status}`
                : "Free forever, no card, no limits on your own writing"}
          </span>
        </div>

        {paid && subscription.currentPeriodEnd && (
          <p className="mt-2 text-[13.5px] text-[var(--fl-muted)]">
            Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            {subscription.provider ? ` · billed through ${subscription.provider}` : ""}
          </p>
        )}

        {!isFirebaseConfigured() && (
          <p className="mt-3 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2 text-[13px] text-[var(--fl-muted)]">
            This deployment has no Firebase project configured, so there is no billing backend.
            Everyone is on Free.
          </p>
        )}
      </section>

      {/* ── Plan comparison ───────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-[1.6rem] font-semibold tracking-[-0.02em] text-[var(--fl-text)]">
          What each plan includes
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--fl-muted)]">
          Pro and Team are announced, not on sale — no payment provider is connected yet. The editor
          itself is free permanently, because your notes live in your own GitHub account and there is
          no storage for anyone to bill you for.
        </p>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              current={plan.id === subscription.plan && !loading}
            />
          ))}
        </div>

        <p className="mt-6 text-[13.5px] text-[var(--fl-muted)]">
          Full detail, including the commitments about what Free will always include, is in{" "}
          <Link href="/docs/plans" className="text-[var(--fl-accent)] underline underline-offset-2">
            the documentation
          </Link>
          .
        </p>
      </section>

      {/* ── Data controls ─────────────────────────────────────────────── */}
      <section className="fl-card mt-14 p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
          Your data
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
          ForkLeaf does not store your notes. They are in this browser and in your GitHub
          repository — which means deleting them is something you do directly, not something you ask
          us to do.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/docs/privacy-and-data" className="fl-btn fl-btn-ghost !py-2 !text-[13px]">
            What is stored, exactly
          </Link>
          <Link href="/privacy" className="fl-btn fl-btn-ghost !py-2 !text-[13px]">
            Privacy Policy
          </Link>
          <Link href="/terms" className="fl-btn fl-btn-ghost !py-2 !text-[13px]">
            Terms &amp; Conditions
          </Link>
        </div>
      </section>
    </div>
  );
}

function PlanCard({ plan, current }: { plan: Plan; current: boolean }) {
  const free = plan.amount === 0;

  return (
    <article
      className={`fl-card relative flex flex-col p-6 ${
        current ? "border-[var(--fl-accent)]" : ""
      }`}
    >
      {current && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-[var(--fl-accent)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-accent-contrast)]">
          Your plan
        </span>
      )}

      <h3 className="text-[16px] font-semibold tracking-tight text-[var(--fl-text)]">{plan.name}</h3>
      <p className="mt-1 text-[13.5px] text-[var(--fl-muted)]">{plan.tagline}</p>

      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[28px] font-semibold tracking-tight text-[var(--fl-text)]">
          {formatPrice(plan)}
        </span>
        {!free && <span className="text-[13.5px] text-[var(--fl-muted)]">/ month</span>}
      </p>

      {free ? (
        <Link href="/editor" className="fl-btn fl-btn-ghost mt-5 w-full !py-2.5 !text-[13.5px]">
          {current ? "Open the editor" : "Switch to Free"}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => track("upgrade_viewed", { plan: plan.id })}
          className="fl-btn fl-btn-ghost mt-5 w-full !py-2.5 !text-[13.5px]"
        >
          Coming soon
        </button>
      )}

      <ul className="mt-6 space-y-2 text-[13.5px] text-[var(--fl-muted)]">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
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
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
