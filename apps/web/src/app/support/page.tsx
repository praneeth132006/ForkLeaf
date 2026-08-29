import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";
import { A, Code, H2, LI, Lead, Note, OL, P, UL } from "@/components/prose";
import { ISSUES_URL, SECURITY_URL, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/constants";

export const metadata = {
  title: "Support",
  description:
    "How to get help with ForkLeaf: what to try first, where to write, what to include, and how long a reply takes.",
};

/**
 * The page every "Support" link in the app points at.
 *
 * It exists because "email us" on its own is not support. Somebody writing in
 * is usually stuck, often worried about their writing, and the two things that
 * actually help are said here rather than in a reply two days later: their
 * notes are safe and reachable without us, and here is the handful of facts
 * that make a reply useful instead of a round of questions.
 */
export default function SupportPage() {
  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-3xl px-6 py-14">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
          Support
        </p>
        <h1 className="mt-3 text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--fl-text)]">
          Getting help
        </h1>

        <div className="mt-10">
          <Lead>
            ForkLeaf is built and answered by one person. Write in about anything — a bug, a note
            that will not sync, a question about your data, or something you wish it did.
          </Lead>

          <Note>
            <strong>Before anything else: your notes are not trapped.</strong> They are Markdown
            files in a GitHub repository you own, in ordinary git history. Whatever is wrong with
            the app, you can clone that repository and keep working in any editor that reads text.
            Nothing you are waiting on a reply for is holding your writing hostage.
          </Note>

          <H2 id="email">Email</H2>
          <P>
            <A href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</A> — the fastest route for anything specific
            to your account, your repository, or something you would rather not post in public. It
            is the same address the{" "}
            <Link href="/privacy" className="fl-link">
              Privacy Policy
            </Link>{" "}
            gives for data requests.
          </P>
          <P>
            One person reads it, so a reply usually takes a day or two rather than an hour. There is
            no paid tier that gets answered sooner.
          </P>

          <H2 id="what-to-include">What to include</H2>
          <P>
            None of this is required — a one-line description of what went wrong is a perfectly good
            email. But a report with these in it can usually be answered rather than asked about:
          </P>
          <UL>
            <LI>What you were doing, and what happened instead.</LI>
            <LI>
              Whether the repository is connected to GitHub or the notes are local to that browser.
            </LI>
            <LI>
              The exact text of any error the app showed, including anything under a “Details” or
              “Why” link — those messages carry the reason the plain sentence leaves out.
            </LI>
            <LI>Your browser and operating system.</LI>
            <LI>
              The note&rsquo;s path if it is about one note — <Code>Fieldwork/soil.md</Code> rather
              than “the soil one”.
            </LI>
          </UL>
          <P>
            Please do not send a GitHub token, a password, or a screenshot with one in it. Nothing
            about a support request needs one, and an address that asks for credentials is one you
            should be suspicious of.
          </P>

          <H2 id="first">Things worth trying first</H2>
          <P>These resolve most of what gets reported, and take less time than an email:</P>
          <OL>
            <LI>
              Read{" "}
              <Link href="/docs/troubleshooting" className="fl-link">
                Troubleshooting
              </Link>{" "}
              — it lists the errors people actually hit and what each one means.
            </LI>
            <LI>
              If changes are not reaching GitHub, open the sync status in the editor&rsquo;s status
              bar. A failed push says why it failed and what to do about it, and a push that was
              refused for being too large names the file.
            </LI>
            <LI>
              If you have been signed out, sign in again from{" "}
              <Link href="/sign-in" className="fl-link">
                the sign-in page
              </Link>
              . Local notes are untouched by signing out.
            </LI>
            <LI>
              If a note looks wrong, its history is on github.com — every save is a commit, and the
              previous version is one click away.
            </LI>
          </OL>

          <H2 id="public">Bugs and feature requests in public</H2>
          <P>
            <A href={ISSUES_URL}>GitHub Issues</A> is the better place for anything other people
            would hit too. It is searchable, other users can add to it, and the fix is visible when
            it lands. ForkLeaf is open source under Apache-2.0, so a pull request is welcome as
            well.
          </P>

          <H2 id="security">Security</H2>
          <P>
            Please do not open a public issue for a vulnerability. The{" "}
            <A href={SECURITY_URL}>security policy</A> explains how to report one privately so it
            can be fixed before it is advertised. Email works too — say “security” in the subject
            and it will be read first.
          </P>

          <H2 id="cost">What this costs</H2>
          <P>
            Nothing. ForkLeaf is free, all of it, with no tiers — see{" "}
            <Link href="/docs/plans" className="fl-link">
              what it costs
            </Link>
            . Support is not a product being sold here, which is also why it is one person&rsquo;s
            inbox rather than a helpdesk.
          </P>

          <div className="mt-16 flex flex-wrap gap-2 border-t border-[var(--fl-border)] pt-8 text-[13.5px]">
            <a
              href={SUPPORT_MAILTO}
              className="rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
            >
              Email support
            </a>
            <Link
              href="/docs"
              className="rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
            >
              Documentation
            </Link>
            <Link
              href="/docs/troubleshooting"
              className="rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
            >
              Troubleshooting
            </Link>
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
            >
              GitHub Issues
            </a>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
