import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { markdownToHtml } from "@forkleaf/markdown-engine";
import { SiteShell } from "@/components/SiteShell";
import { REPO_URL } from "@/lib/constants";
import {
  formatChangelogDate,
  parseChangelog,
  type ChangeKind,
  type ChangelogRelease,
} from "@/lib/changelog";

export const metadata = {
  title: "Changelog",
  description: "Everything that has changed in ForkLeaf, newest first, day by day.",
};

/**
 * The changelog as a timeline.
 *
 * Rendered from the repository's own `CHANGELOG.md`, so the page and the file
 * cannot drift apart: an entry is added once, in the file, and appears here.
 * The file is traced into the server bundle by `outputFileTracingIncludes` in
 * `next.config.ts`; the candidates below cover both the monorepo layout in
 * development and the traced layout in a deployment.
 */
async function readChangelog(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "CHANGELOG.md"),
    path.join(process.cwd(), "..", "..", "CHANGELOG.md"),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // Try the next layout.
    }
  }
  return "";
}

const KIND_LABEL: Record<ChangeKind, string> = {
  new: "New",
  fixed: "Fixed",
  security: "Security",
};

const KIND_STYLE: Record<ChangeKind, string> = {
  new: "bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]",
  fixed: "bg-[var(--fl-warn)]/15 text-[var(--fl-warn)]",
  security: "bg-[var(--fl-danger)]/12 text-[var(--fl-danger)]",
};

export default async function ChangelogPage() {
  // An empty Unreleased section is a placeholder for the next change, not news.
  const releases = parseChangelog(await readChangelog()).filter(
    (release) => release.entries.length > 0,
  );
  const total = releases.reduce((sum, release) => sum + release.entries.length, 0);

  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
        <header className="pb-10 pt-16 sm:pt-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
            Changelog
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--fl-text)] sm:text-[3rem]">
            What changed, and when
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-[var(--fl-muted)]">
            Every notable change to ForkLeaf, newest first. {total} changes across {releases.length}{" "}
            releases. The same record lives in{" "}
            <a
              href={`${REPO_URL}/blob/main/CHANGELOG.md`}
              target="_blank"
              rel="noreferrer"
              className="fl-link"
            >
              CHANGELOG.md
            </a>
            , and the commit history is the full one.
          </p>
        </header>

        {releases.length === 0 ? (
          <p className="text-[var(--fl-muted)]">The changelog could not be read.</p>
        ) : (
          <ol className="relative">
            {releases.map((release, index) => (
              <Release key={release.label} release={release} last={index === releases.length - 1} />
            ))}
          </ol>
        )}

        <p className="mt-12 text-[14px] text-[var(--fl-muted)]">
          Looking for what it does rather than what changed?{" "}
          <Link href="/features" className="fl-link">
            Every feature
          </Link>
          .
        </p>
      </div>
    </SiteShell>
  );
}

function Release({ release, last }: { release: ChangelogRelease; last: boolean }) {
  const id = release.date ?? "unreleased";
  const heading = release.date ? formatChangelogDate(release.date) : "Not yet released";

  return (
    <li id={id} className="relative grid gap-x-8 pb-12 sm:grid-cols-[10rem_minmax(0,1fr)]">
      {/* The date sits beside its changes on a wide screen and above them on
          a narrow one; the rail and its dot mark where each day begins. */}
      <div className="mb-4 flex items-center gap-3 pl-8 sm:mb-0 sm:block sm:pl-0 sm:text-right">
        <div className="sm:sticky sm:top-24">
          <a
            href={`#${id}`}
            className="text-[15px] font-semibold text-[var(--fl-text)] hover:text-[var(--fl-accent)]"
          >
            {heading}
          </a>
          {release.version && (
            <p className="mt-1 inline-block rounded-full border border-[var(--fl-border-strong)] px-2 py-0.5 font-mono text-[11.5px] text-[var(--fl-muted)] sm:mt-1.5">
              v{release.version}
            </p>
          )}
          <p className="text-[12.5px] text-[var(--fl-muted)] sm:mt-1">
            {release.entries.length} {release.entries.length === 1 ? "change" : "changes"}
          </p>
        </div>
      </div>

      <div className="relative pl-8">
        {/* The rail. Stops at the last release rather than trailing off. */}
        <span
          aria-hidden="true"
          className={`absolute left-[7px] top-2 w-px bg-[var(--fl-border-strong)] ${
            last ? "h-4" : "-bottom-2"
          } max-sm:-top-8`}
        />
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-[var(--fl-accent)] bg-[var(--fl-bg)] max-sm:-top-[2.1rem]"
        />

        {release.intro && (
          <div
            className="fl-changelog-body mb-4"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(release.intro) }}
          />
        )}

        <div className="space-y-3">
          {release.entries.map((entry) => (
            <article
              key={entry.slug}
              id={entry.slug}
              className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${KIND_STYLE[entry.kind]}`}
                >
                  {KIND_LABEL[entry.kind]}
                </span>
                <h2 className="text-[16px] font-semibold leading-snug text-[var(--fl-text)]">
                  <a href={`#${entry.slug}`} className="hover:text-[var(--fl-accent)]">
                    {entry.title.replace(/^Fixed\s+—\s+/i, "")}
                  </a>
                </h2>
              </div>
              {entry.body && (
                <div
                  className="fl-changelog-body mt-2.5"
                  // Our own CHANGELOG.md, rendered by the same pipeline as a
                  // note — which sanitises its output.
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(entry.body) }}
                />
              )}
            </article>
          ))}
        </div>
      </div>
    </li>
  );
}
