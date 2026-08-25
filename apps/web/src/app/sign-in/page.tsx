import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";
import { safeReturnPath } from "@/lib/app-url";
import { githubOAuthConfigured } from "@/lib/session";

export const metadata = {
  title: "Sign in with GitHub — ForkLeaf",
  description:
    "Choose how much access ForkLeaf gets to your GitHub repositories, and see exactly what each level is used for.",
};

/**
 * The permission choice, made before GitHub's own consent screen.
 *
 * GitHub's screen names a scope and says what it covers; it cannot say what
 * *this* app does with it, and it offers no alternative. Somebody arriving at
 * "repo — full control of private repositories" with no context has one
 * reasonable response, which is to close the tab.
 *
 * So the choice is made here, in words, with the narrower option offered as an
 * equal rather than buried: a person who only ever keeps public notes should
 * never grant access to their private code, and until now they had no way to
 * say so without reading the documentation first.
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
        <Frame>
          <h1 className="text-2xl font-semibold tracking-tight">GitHub sign-in is not set up</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--fl-muted)]">
            This deployment has no GitHub OAuth application configured, so notes stay on this
            device. That works — it is the whole app, minus syncing.{" "}
            <Link href="/docs/self-hosting" className="fl-link">
              Setting it up
            </Link>{" "}
            takes a few minutes.
          </p>
          <Link href={back ?? "/editor"} className="fl-btn fl-btn-primary mt-6 inline-flex">
            Start writing on this device
          </Link>
        </Frame>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <Frame>
        <h1 className="text-3xl font-semibold tracking-tight">
          {expired ? "Sign in to GitHub again" : "Sign in with GitHub"}
        </h1>

        {expired && (
          <p
            role="status"
            className="mt-4 max-w-2xl rounded-lg border border-[var(--fl-warn)]/40 bg-[var(--fl-warn)]/10 px-4 py-3 text-sm text-[var(--fl-text)]"
          >
            Your previous sign-in expired, which is why pushing stopped. Nothing was lost — every
            change is saved on this device and goes to GitHub as soon as you are back in.
          </p>
        )}

        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--fl-muted)]">
          ForkLeaf keeps your notes as Markdown files in a repository you own, so it needs
          permission to read and write files there. Choose how much of your account that covers. You
          can change it later, and revoke it entirely, from GitHub.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Choice
            href={`/api/auth/github?access=all${next}`}
            scope="repo"
            title="Private and public repositories"
            recommended
            need="Needed if your notes live in a private repository — which is what most people want for notes."
            covers={[
              "Read and write files in the repository you connect",
              "Commit on your behalf, with your name on the commit",
              "List your repositories, so you can pick one",
            ]}
            caveat="GitHub's classic scopes have no per-repository option, so this grant technically covers every repository your account can reach. ForkLeaf only ever reads or writes the one you connect."
          />

          <Choice
            href={`/api/auth/github?access=public${next}`}
            scope="public_repo"
            title="Public repositories only"
            need="Enough if your notes are going to be public. ForkLeaf literally cannot open a private repository with this — the token is refused by GitHub, not by us."
            covers={[
              "Read and write files in your public repositories",
              "Commit on your behalf, with your name on the commit",
            ]}
            caveat="If you later want a private notes repository, you will be asked to sign in again with the wider permission."
          />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Aside title="Organisation repositories">
            If your notes live in an organisation, an owner may need to approve ForkLeaf under{" "}
            <em>Settings → Third-party Access → OAuth App access</em>. Until they do, GitHub reports
            the repository as missing rather than as forbidden — if a repository you can see on
            github.com is not listed here, that is usually why.
          </Aside>

          <Aside title="Taking it back">
            Revoke at any time from{" "}
            <a
              href="https://github.com/settings/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="fl-link"
            >
              github.com/settings/applications
            </a>
            . Your notes are files in your repository and stay exactly where they are.
          </Aside>
        </div>

        <p className="mt-8 text-[13.5px] text-[var(--fl-muted)]">
          Not ready to connect anything?{" "}
          <Link href="/editor" className="fl-link">
            Write on this device instead
          </Link>{" "}
          — no account, nothing leaves the browser, and you can connect a repository later.
        </p>
      </Frame>
    </SiteShell>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl px-6 py-16">{children}</div>;
}

function Choice({
  href,
  scope,
  title,
  need,
  covers,
  caveat,
  recommended,
}: {
  href: string;
  scope: string;
  title: string;
  need: string;
  covers: string[];
  caveat: string;
  recommended?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[17px] font-semibold text-[var(--fl-text)]">{title}</h2>
        {recommended && (
          <span className="rounded-full bg-[var(--fl-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--fl-accent)]">
            Most people
          </span>
        )}
      </div>

      <p className="mt-1 font-mono text-[12px] text-[var(--fl-muted)]">{scope}</p>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--fl-text)]">{need}</p>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
        What it is used for
      </p>
      <ul className="mt-2 space-y-1.5">
        {covers.map((line) => (
          <li key={line} className="flex gap-2 text-[13.5px] text-[var(--fl-muted)]">
            <span aria-hidden="true">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--fl-muted)]">{caveat}</p>

      <a href={href} className="fl-btn fl-btn-primary mt-5 justify-center">
        Continue with this
      </a>
    </div>
  );
}

function Aside({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--fl-border)] p-4">
      <h2 className="text-[14px] font-semibold text-[var(--fl-text)]">{title}</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--fl-muted)]">{children}</p>
    </div>
  );
}
