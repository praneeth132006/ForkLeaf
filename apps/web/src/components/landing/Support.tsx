import React from "react";
import Link from "next/link";
import { ISSUES_URL, SECURITY_URL, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/constants";
import { SectionHeading } from "./SectionHeading";

/**
 * Where to go when something is wrong.
 *
 * The page argued the product for nine sections and never once said how to
 * reach anybody. That is a strange omission for an app you are being asked to
 * trust with your notes: the question underneath "is this any good" is "and
 * what happens when it breaks", and a site with no answer to the second reads
 * as one that would rather not be asked.
 *
 * Four routes, in the order they are usually the right one, each saying what it
 * is for. A single "contact us" would make somebody with a crashed editor and
 * somebody with a security finding pick the same door.
 */

const ROUTES = [
  {
    title: "Read the documentation",
    body: "Most questions are already answered in writing — signing in, syncing, conflicts, exporting, and the errors people actually hit.",
    action: "Open the docs",
    href: "/docs",
    external: false,
  },
  {
    title: "Email support",
    body: "Anything else: a bug, a note that will not sync, a question about your data, or a feature you wish existed. A real inbox, read by the person who builds this.",
    action: SUPPORT_EMAIL,
    href: SUPPORT_MAILTO,
    external: false,
  },
  {
    title: "Open an issue",
    body: "Bugs and feature requests, in public, where anyone else hitting the same thing can find the answer and add to it.",
    action: "Go to GitHub Issues",
    href: ISSUES_URL,
    external: true,
  },
  {
    title: "Report a vulnerability",
    body: "Security findings go through the disclosure policy rather than the public tracker, so a flaw is fixed before it is advertised.",
    action: "Read the security policy",
    href: SECURITY_URL,
    external: true,
  },
] as const;

export function Support() {
  return (
    <section id="support" className="border-t border-[var(--fl-border)] py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SectionHeading
          eyebrow="Support"
          title="If something breaks, here is who to tell"
          body="ForkLeaf is free and open source, and it is also somebody's notes. Every route below reaches a person; the first one that fits is the right one."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {ROUTES.map((route) => (
            <div
              key={route.title}
              className="flex flex-col rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-6"
            >
              <h3 className="text-[17px] font-semibold text-[var(--fl-text)]">{route.title}</h3>
              <p className="mt-2.5 flex-1 text-[15px] leading-relaxed text-[var(--fl-muted)]">
                {route.body}
              </p>

              <p className="mt-5">
                {route.external ? (
                  <a
                    href={route.href}
                    target="_blank"
                    rel="noreferrer"
                    className="fl-link break-words text-[15px] font-medium"
                  >
                    {route.action} →
                  </a>
                ) : (
                  <Link href={route.href} className="fl-link break-words text-[15px] font-medium">
                    {route.action} →
                  </Link>
                )}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
          One person answers this inbox, so a reply takes as long as it takes — usually a couple of
          days. Nothing you send is needed to recover your work in the meantime: your notes are
          Markdown files in your own repository, and{" "}
          <Link href="/support" className="fl-link">
            the support page
          </Link>{" "}
          lists what to try first and what to include when you write in.
        </p>
      </div>
    </section>
  );
}
