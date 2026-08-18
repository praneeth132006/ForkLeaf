"use client";

import React from "react";
import Link from "next/link";
import type { SessionUser } from "@forkleaf/types";
import { EVERYTHING } from "@/lib/plans";

export interface AccountPanelProps {
  user: SessionUser | null;
  githubAvailable: boolean;
}

/**
 * Account.
 *
 * There are no plans to compare any more — the tiers were removed and every
 * feature ships to everyone — so this is identity, what you get, and the data
 * controls, with a sponsorship ask that buys nothing and is meant not to.
 */
export function AccountPanel({ user, githubAvailable }: AccountPanelProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
        Account
      </p>
      <h1 className="mt-3 text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--fl-text)]">
        Your account
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
              You are not signed in. Notes are being kept in this browser only, and nothing is
              backed up.
            </p>
            {githubAvailable && (
              <a href="/api/auth/github" className="fl-btn fl-btn-primary mt-4">
                Continue with GitHub
              </a>
            )}
          </div>
        )}
      </section>

      {/* ── What you get ──────────────────────────────────────────────── */}
      <section className="fl-card mt-4 p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
          What you get
        </h2>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[26px] font-semibold tracking-tight text-[var(--fl-text)]">
            Everything
          </span>
          <span className="text-[14px] text-[var(--fl-muted)]">
            Free forever, no card, no tiers, no limits on your own writing
          </span>
        </div>

        <ul className="mt-5 grid gap-2 text-[14px] text-[var(--fl-muted)] sm:grid-cols-2">
          {EVERYTHING.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      {/* ── Sponsorship ───────────────────────────────────────────────── */}
      <section className="fl-card mt-4 p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
          Sponsor
        </h2>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
          ForkLeaf is built in the open by one person. Sponsoring unlocks nothing — there is nothing
          left to unlock — it just keeps the work going.
        </p>
        <div className="mt-4 max-w-[600px] overflow-hidden rounded-xl border border-[var(--fl-border)]">
          <iframe
            src="https://github.com/sponsors/praneeth132006/card"
            title="Sponsor praneeth132006"
            height="225"
            width="600"
            loading="lazy"
            className="block w-full"
            style={{ border: 0 }}
          />
        </div>
      </section>

      {/* ── Data controls ─────────────────────────────────────────────── */}
      <section className="fl-card mt-14 p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
          Your data
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
          ForkLeaf does not store your notes. They are in this browser and in your GitHub repository
          — which means deleting them is something you do directly, not something you ask us to do.
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
