import Link from "next/link";
import { ForkLeafMark } from "@/components/Brand";
import { GitHubGlyph } from "@/components/landing/Nav";
import { SiteShell } from "@/components/SiteShell";
import { safeReturnPath } from "@/lib/app-url";
import { githubOAuthConfigured } from "@/lib/session";

export const metadata = {
  title: "Sign in",
  description:
    "Sign in to ForkLeaf with GitHub. Your notes stay as Markdown files in your own repository.",
};

/**
 * Sign in: one button.
 *
 * This page used to be a choice between two permission levels, each with a
 * list of what it covers, what it never does and a caveat — two cards of fine
 * print standing between someone and the thing they came to do. Almost
 * everyone wants their notes in a private repository, so the button asks for
 * that, and GitHub's own screen names the permission before anything is
 * granted.
 *
 * The narrower grant has not gone anywhere: somebody who only keeps public
 * notes can still ask for `public_repo`, from a quiet link under the button,
 * and the documentation explains both. It is an option, not a step.
 */
export default async function SignInPage({
  searchParams,
}: {
  /**
   * `next` is where to return to afterwards, and `expired` says this is a
   * sign-in that interrupted something rather than a first one. Both arrive
   * from the editor, which is the only place that knows either.
   */
  searchParams: Promise<{ next?: string; expired?: string }>;
}) {
  const params = await searchParams;
  const back = safeReturnPath(params.next);
  const expired = params.expired === "1";
  // Appended to both grant links, so whichever level is chosen ends up in the
  // same place. Encoded once, here, rather than in each href.
  const next = back ? `&next=${encodeURIComponent(back)}` : "";

  if (!githubOAuthConfigured()) {
    return (
      <SiteShell>
        <Card>
          <h1 className="text-2xl font-semibold tracking-tight">GitHub sign-in is not set up</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--fl-muted)]">
            GitHub sign-in is unavailable here, so notes stay on this device. That works — it is the
            whole app, minus syncing.
          </p>
          <Link href={back ?? "/editor"} className="fl-btn fl-btn-primary mt-6 w-full">
            Start writing on this device
          </Link>
        </Card>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <Card>
        <ForkLeafMark className="mx-auto h-10 w-10" />
        <h1 className="mt-5 text-center text-[26px] font-semibold tracking-tight">
          {expired ? "Sign in again" : "Sign in to ForkLeaf"}
        </h1>
        <p
          role={expired ? "status" : undefined}
          className="mt-2 text-center text-[15px] leading-relaxed text-[var(--fl-muted)]"
        >
          {expired
            ? "Your sign-in expired, so pushing paused. Nothing was lost — your changes are saved on this device and sync as soon as you are back."
            : "Your notes are Markdown files in a GitHub repository you own."}
        </p>

        <a
          href={`/api/auth/github?access=all${next}`}
          className="fl-btn fl-btn-primary mt-7 w-full !py-3.5 !text-[15.5px]"
        >
          <GitHubGlyph className="h-[18px] w-[18px]" />
          Continue with GitHub
        </a>

        <p className="mt-4 text-center text-[13px] leading-relaxed text-[var(--fl-muted)]">
          ForkLeaf only asks to read and write your repositories — not your email, profile or
          organisations. Revoke it any time on GitHub.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-[var(--fl-border)] pt-5 text-[13.5px] text-[var(--fl-muted)]">
          <Link href={back ?? "/editor"} className="fl-link">
            Continue without an account
          </Link>
          <span aria-hidden="true">·</span>
          <a
            href={`/api/auth/github?access=public${next}`}
            className="fl-link"
            title="Grants public_repo: ForkLeaf cannot open any private repository"
          >
            Public repositories only
          </a>
        </div>
      </Card>

      <p className="mx-auto -mt-10 mb-16 max-w-md px-4 text-center text-[12.5px] sm:-mt-16">
        <Link href="/docs/signing-in" className="fl-link text-[var(--fl-muted)]">
          What ForkLeaf can and cannot do with your account
        </Link>
      </p>
    </SiteShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <div className="rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-7 shadow-[var(--fl-shadow)] sm:p-9">
        {children}
      </div>
    </div>
  );
}
