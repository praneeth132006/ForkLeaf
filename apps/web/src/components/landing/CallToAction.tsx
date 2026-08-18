import Link from "next/link";
import { ForkLeafMark } from "@/components/Brand";
import { GitHubGlyph } from "./Nav";

export function CallToAction({ githubAvailable }: { githubAvailable: boolean }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24">
      <div className="relative overflow-hidden rounded-3xl border border-[#232823] bg-[#0a0c0a] px-8 py-16 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-[640px] -translate-x-1/2 rounded-full bg-[#3ecf8e] opacity-[0.13] blur-[110px]"
        />

        <div className="relative">
          <span className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-[#232823] bg-[#101310] text-[#3ecf8e]">
            <ForkLeafMark className="h-6 w-6" />
          </span>

          <h2 className="mx-auto max-w-xl text-3xl font-semibold leading-tight tracking-[-0.025em] text-[#e9ece7] sm:text-[2.5rem]">
            Write the first note. It is a commit by the time you look up.
          </h2>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {githubAvailable && (
              <a
                href="/api/auth/github"
                className="fl-btn bg-[#3ecf8e] text-[#04180d] hover:bg-[#52dd9d]"
              >
                <GitHubGlyph />
                Continue with GitHub
              </a>
            )}
            <Link
              href="/editor"
              className="fl-btn border border-[#2f3a31] text-[#e9ece7] hover:bg-[#101310]"
            >
              Open the editor
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
