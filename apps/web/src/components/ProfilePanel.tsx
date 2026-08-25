"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EditorViewMode, SessionUser, SyncPreference, Workspace } from "@forkleaf/types";
import { DEFAULT_SYNC_PREFERENCE } from "@forkleaf/types";
import { openLocalDatabase, type LocalDatabase } from "@forkleaf/store";
import { documentStats } from "@forkleaf/markdown-engine";
import { signOut } from "@/lib/gateway";
import { usePalette, useTheme, type Theme } from "@/hooks/useTheme";
import { PALETTES, normalizeHex } from "@/lib/palette";
import { EVERYTHING } from "@/lib/plans";

export interface ProfilePanelProps {
  user: SessionUser | null;
  githubAvailable: boolean;
}

/** One connected repository, with what is actually in it. */
interface WorkspaceSummary {
  workspace: Workspace;
  notes: number;
  words: number;
  diagrams: number;
  pending: number;
  syncMode: SyncPreference["mode"];
  lastEditedAt: string | null;
}

interface Library {
  workspaces: WorkspaceSummary[];
  notes: number;
  words: number;
  diagrams: number;
  pending: number;
  defaultViewMode: EditorViewMode;
}

const VIEW_MODES: { value: EditorViewMode; label: string; hint: string }[] = [
  { value: "wysiwyg", label: "Rich", hint: "Formats as you type" },
  { value: "split", label: "Split", hint: "Markdown beside a live preview" },
  { value: "source", label: "Source", hint: "Raw markdown only" },
];

const SYNC_LABELS: Record<SyncPreference["mode"], string> = {
  auto: "Pushes automatically",
  interval: "Pushes on a timer",
  manual: "Pushes only when asked",
};

/**
 * Your profile.
 *
 * Who you are, what you have connected, what you have written, and how the
 * editor behaves — in that order, because that is the order the questions get
 * asked in. Everything below the identity card is read from this device's own
 * store rather than from a server: ForkLeaf keeps no copy of anyone's notes, so
 * a profile page that reported writing statistics from an account would have to
 * invent them.
 */
export function ProfilePanel({ user, githubAvailable }: ProfilePanelProps) {
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const accents = usePalette();
  const [library, setLibrary] = useState<Library | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [db, setDb] = useState<LocalDatabase | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // Opened inside the async body rather than guarded by an early return:
        // a bare `setState` in an effect body is a cascading render, and this
        // has to await the open anyway to know which case it is in.
        const { db: database, status } = await openLocalDatabase();
        if (cancelled) return;
        if (status !== "ready") {
          // An in-memory store would report a library of zero notes and zero
          // words, which is a lie the profile page should not tell.
          if (status === "blocked") setBlocked(true);
          else setUnavailable(true);
          return;
        }

        const workspaces = await database.listWorkspaces();
        const queue = await database.listQueue();

        const summaries = await Promise.all(
          workspaces.map(async (workspace): Promise<WorkspaceSummary> => {
            const notes = await database.listNotes(workspace.id);
            const stats = notes.map((note) => documentStats(note.content));
            const preference =
              (await database.getMeta<SyncPreference>(
                `syncPreference:${workspace.repo.owner}/${workspace.repo.repo}`,
              )) ?? DEFAULT_SYNC_PREFERENCE;

            return {
              workspace,
              notes: notes.length,
              words: stats.reduce((total, stat) => total + stat.words, 0),
              diagrams: stats.reduce((total, stat) => total + stat.diagrams, 0),
              pending: queue.filter((item) => item.workspaceId === workspace.id).length,
              syncMode: workspace.isLocal ? "manual" : preference.mode,
              // Notes that were only ever read carry no edit timestamp, and
              // sorting them in alongside the real ones puts `null` last and
              // hides the answer.
              lastEditedAt:
                notes
                  .map((note) => note.updatedAt)
                  .filter((value): value is string => value !== null)
                  .sort()
                  .pop() ?? null,
            };
          }),
        );

        if (cancelled) return;

        setDb(database);
        setLibrary({
          workspaces: summaries,
          notes: summaries.reduce((total, summary) => total + summary.notes, 0),
          words: summaries.reduce((total, summary) => total + summary.words, 0),
          diagrams: summaries.reduce((total, summary) => total + summary.diagrams, 0),
          pending: queue.length,
          defaultViewMode: (await database.getMeta<EditorViewMode>("defaultViewMode")) ?? "wysiwyg",
        });
      } catch {
        // A blocked storage partition is a browser setting, not an error worth
        // shouting about — the rest of the page still says something useful.
        if (!cancelled) setUnavailable(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push("/");
    // The session cookie is gone, so anything rendered from it is now stale.
    router.refresh();
  }, [router]);

  const setDefaultViewMode = useCallback(
    (mode: EditorViewMode) => {
      setLibrary((current) => (current ? { ...current, defaultViewMode: mode } : current));
      void db?.putMeta("defaultViewMode", mode);
    },
    [db],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
        Profile
      </p>

      {/* ── Identity ──────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-5">
        {user ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- remote GitHub
                avatar; next/image would need a domain allowlist per avatar host. */}
            <img
              src={user.avatarUrl}
              alt=""
              width={72}
              height={72}
              className="h-18 w-18 shrink-0 rounded-full border border-[var(--fl-border)]"
              style={{ width: 72, height: 72 }}
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--fl-text)]">
                {user.name ?? user.login}
              </h1>
              <p className="mt-1 text-[14px] text-[var(--fl-muted)]">
                <a
                  href={`https://github.com/${user.login}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[var(--fl-accent)] hover:underline"
                >
                  @{user.login}
                </a>{" "}
                · signed in with GitHub
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a
                href="https://github.com/settings/applications"
                target="_blank"
                rel="noreferrer"
                className="fl-btn fl-btn-ghost !py-2 !text-[13px]"
              >
                Manage access ↗
              </a>
              <button
                type="button"
                onClick={handleSignOut}
                className="fl-btn fl-btn-ghost !py-2 !text-[13px]"
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--fl-text)]">
              Writing on this device
            </h1>
            <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
              You are not signed in, so your notes live in this browser and nowhere else. Nothing is
              backed up, and they will not follow you to another machine.
            </p>
            {githubAvailable && (
              <a href="/sign-in" className="fl-btn fl-btn-primary mt-4">
                Continue with GitHub
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── What you have written ─────────────────────────────────────── */}
      <section className="mt-10">
        <SectionHeading>What you have written</SectionHeading>

        {blocked ? (
          <p className="fl-card mt-3 p-6 text-[14px] leading-relaxed text-[var(--fl-muted)]">
            Another ForkLeaf tab is holding local storage open, so these counts cannot be read.
            Close the other tabs and reload.
          </p>
        ) : unavailable ? (
          <p className="fl-card mt-3 p-6 text-[14px] leading-relaxed text-[var(--fl-muted)]">
            This browser is not letting ForkLeaf use local storage, so there is nothing to count.
            Private windows and blocked third-party storage both do this.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Notes" value={library?.notes} />
            <Stat label="Words" value={library?.words} />
            <Stat label="Diagrams" value={library?.diagrams} />
            <Stat
              label="Waiting to push"
              value={library?.pending}
              hint={
                library && library.pending > 0
                  ? "Saved here, not yet on GitHub"
                  : "Everything is pushed"
              }
            />
          </div>
        )}
      </section>

      {/* ── Repositories ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <SectionHeading>Connected repositories</SectionHeading>

        {library && library.workspaces.length > 0 ? (
          <ul className="mt-3 grid gap-3">
            {library.workspaces.map(({ workspace, ...summary }) => (
              <li key={workspace.id} className="fl-card p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[15px] font-semibold text-[var(--fl-text)]">
                    {workspace.name}
                  </h3>
                  {workspace.isLocal ? (
                    <span className="text-[12.5px] text-[var(--fl-muted)]">
                      This device only — not backed by a repository
                    </span>
                  ) : (
                    <a
                      href={`https://github.com/${workspace.repo.owner}/${workspace.repo.repo}/tree/${workspace.repo.branch}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[12.5px] text-[var(--fl-accent)] hover:underline"
                    >
                      {workspace.repo.owner}/{workspace.repo.repo}@{workspace.repo.branch}↗
                    </a>
                  )}
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-[var(--fl-muted)]">
                  <Pair label="Notes" value={summary.notes.toLocaleString()} />
                  <Pair label="Words" value={summary.words.toLocaleString()} />
                  <Pair label="Diagrams" value={summary.diagrams.toLocaleString()} />
                  {!workspace.isLocal && (
                    <Pair label="Sync" value={SYNC_LABELS[summary.syncMode]} />
                  )}
                  {summary.pending > 0 && (
                    <Pair label="Unpushed" value={`${summary.pending} change(s)`} />
                  )}
                  {summary.lastEditedAt && (
                    <Pair label="Last edited" value={formatDate(summary.lastEditedAt)} />
                  )}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fl-card mt-3 p-6 text-[14px] leading-relaxed text-[var(--fl-muted)]">
            {library
              ? "Nothing connected yet. Open the dashboard and choose a repository to back your notes up."
              : "Reading your library…"}
          </p>
        )}

        <Link href="/dashboard" className="fl-btn fl-btn-ghost mt-3 !py-2 !text-[13px]">
          Open the dashboard
        </Link>
      </section>

      {/* ── Preferences ───────────────────────────────────────────────── */}
      <section className="mt-10">
        <SectionHeading>Preferences</SectionHeading>

        <div className="fl-card mt-3 divide-y divide-[var(--fl-border)]">
          <Setting
            title="Appearance"
            description="Applied before the page paints, so there is no flash of the wrong theme."
          >
            <Choices<Theme>
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              selected={theme}
              onSelect={setTheme}
            />
          </Setting>

          <AccentPicker mode={theme} accents={accents} />

          <Setting
            title="New notes open in"
            description="Each note remembers the view you last used for it; this is where new ones start."
          >
            <Choices<EditorViewMode>
              options={VIEW_MODES.map((mode) => ({
                value: mode.value,
                label: mode.label,
                title: mode.hint,
              }))}
              selected={library?.defaultViewMode ?? "wysiwyg"}
              onSelect={setDefaultViewMode}
              disabled={!library}
            />
          </Setting>
        </div>
      </section>

      {/* ── What you get ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <SectionHeading>What you get</SectionHeading>
        <div className="fl-card mt-3 p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[24px] font-semibold tracking-tight text-[var(--fl-text)]">
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
        </div>
      </section>

      {/* ── Your data ─────────────────────────────────────────────────── */}
      <section className="mt-10">
        <SectionHeading>Your data</SectionHeading>
        <div className="fl-card mt-3 p-6">
          <p className="text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
            ForkLeaf does not store your notes. They are in this browser and in your GitHub
            repository — which means deleting them is something you do directly, not something you
            ask us to do.
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
        </div>
      </section>

      {/* The sponsorship ask used to sit here, as a GitHub Sponsors iframe.
          It belongs on the pricing page, where somebody is deciding what this
          costs — not in the account settings of somebody who has already
          decided and is here to change their theme. It is still on /pricing. */}
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
      {children}
    </h2>
  );
}

/** A counted thing. Shows a dash rather than a zero while the count is loading. */
function Stat({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <div className="fl-card p-5">
      <p className="text-[26px] font-semibold tracking-tight text-[var(--fl-text)]">
        {value === undefined ? "—" : value.toLocaleString()}
      </p>
      <p className="mt-0.5 text-[13px] text-[var(--fl-text)]">{label}</p>
      {hint && <p className="mt-1 text-[12px] text-[var(--fl-muted)]">{hint}</p>}
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex gap-1.5">
      <dt className="text-[var(--fl-muted)]">{label}</dt>
      <dd className="font-medium text-[var(--fl-text)]">{value}</dd>
    </span>
  );
}

/**
 * The accent colour, as swatches rather than a dropdown.
 *
 * A colour is the one setting nobody can choose from its name — "Sage Slate"
 * means nothing until you have seen it — so every option shows the actual
 * colour, in the mode currently on screen. Each palette is a different colour
 * in light and dark, and showing the dark one to somebody sitting in light
 * mode would be picking blind.
 *
 * Its own block rather than a `Setting`, which puts its control on the right:
 * six swatches and a colour field do not belong in a column sized for a
 * two-button toggle.
 */
function AccentPicker({ mode, accents }: { mode: Theme; accents: ReturnType<typeof usePalette> }) {
  const [draft, setDraft] = useState("");

  // What the custom swatch shows: whatever is being typed if it is already a
  // colour, else the saved one, else something to aim at.
  const customPreview = normalizeHex(draft) ?? accents.customHex ?? "#8a9bb8";

  return (
    <div className="p-5">
      <p className="text-[14.5px] font-medium text-[var(--fl-text)]">Accent colour</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--fl-muted)]">
        Only the accent changes. Backgrounds, borders and text stay as they are, in both light and
        dark.
      </p>

      <div
        role="radiogroup"
        aria-label="Accent colour"
        className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {PALETTES.map((palette) => {
          const selected = accents.palette === palette.id;
          const vars = palette[mode];

          return (
            <button
              key={palette.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => accents.choose(palette.id)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                selected
                  ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
                  : "border-[var(--fl-border)] hover:border-[var(--fl-border-strong)] hover:bg-[var(--fl-elevated)]"
              }`}
            >
              <Swatch color={vars.accent} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-[var(--fl-text)]">
                  {palette.name}
                </span>
                <span className="block truncate text-[12px] text-[var(--fl-muted)]">
                  {palette.note}
                </span>
              </span>
            </button>
          );
        })}

        {/* Custom sits in the same grid as the presets: it is one of the
            options, not an advanced escape hatch below them. */}
        <div
          className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
            accents.palette === "custom"
              ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
              : "border-[var(--fl-border)]"
          }`}
        >
          <label className="relative shrink-0 cursor-pointer">
            <Swatch color={customPreview} />
            {/* A real colour input, sized to the swatch and made invisible, so
                the OS picker opens on the thing it is going to change. */}
            <input
              type="color"
              value={customPreview}
              aria-label="Pick a custom accent colour"
              onChange={(event) => {
                setDraft(event.target.value);
                accents.setCustom(event.target.value);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>

          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-[var(--fl-text)]">Custom</span>
            <input
              value={draft || (accents.customHex ?? "")}
              onChange={(event) => {
                setDraft(event.target.value);
                // Applied as soon as it parses, so the page previews it while
                // you type rather than after a Save nobody would find.
                accents.setCustom(event.target.value);
              }}
              placeholder="#8a9bb8"
              spellCheck={false}
              aria-label="Custom accent colour, as hex"
              className="mt-0.5 w-full bg-transparent font-mono text-[12px] text-[var(--fl-muted)] outline-none placeholder:text-[var(--fl-muted)]"
            />
          </span>
        </div>
      </div>
    </div>
  );
}

/** A colour chip. Bordered, so a swatch near the background is still a shape. */
function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ background: color }}
      className="block h-8 w-8 shrink-0 rounded-lg border border-[var(--fl-border-strong)]"
    />
  );
}

function Setting({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium text-[var(--fl-text)]">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--fl-muted)]">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Choices<T extends string>({
  options,
  selected,
  onSelect,
  disabled = false,
}: {
  options: { value: T; label: string; title?: string }[];
  selected: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selected === option.value}
          disabled={disabled}
          title={option.title ?? option.label}
          onClick={() => onSelect(option.value)}
          className={`rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50 ${
            selected === option.value
              ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
              : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Dates are only ever shown to the person who made them, so local format it is. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
