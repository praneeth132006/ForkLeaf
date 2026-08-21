"use client";

import { useEffect, useMemo, useState } from "react";
import { workspaceId, type Workspace } from "@forkleaf/types";
import { ApiGatewayError, bootstrapWorkspace, listRepos, type RepoSummaryDto } from "@/lib/gateway";

export interface RepoChooserProps {
  onConnect: (workspace: Workspace) => Promise<void> | void;
  /** Shown as the first-run step rather than as a way to add a second repo. */
  firstRun?: boolean;
  onSkip?: () => void;
}

/**
 * Where the notes go.
 *
 * ForkLeaf used to answer this question on the user's behalf: signing in
 * created a private `forkleaf-notes` repository on their account and dropped
 * them into it, with no screen in between. That is a write to somebody's GitHub
 * account made without asking, and it is the wrong default for the people this
 * is actually for — someone who already keeps notes in a repo, or wants to edit
 * a project's `docs/` folder, had a repository created for them anyway and then
 * had to go and find the connect dialog.
 *
 * So the choice is made here, explicitly, and creating a new repository is one
 * of the options rather than the only one.
 */
export function RepoChooser({ onConnect, firstRun = false, onSkip }: RepoChooserProps) {
  const [mode, setMode] = useState<"existing" | "new">("existing");

  return (
    <section className="rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-6 shadow-[var(--fl-shadow)] sm:p-8">
      <header className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fl-accent)]">
          {firstRun ? "One step left" : "Add a repository"}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--fl-text)]">
          {firstRun ? "Choose where your notes live" : "Connect another repository"}
        </h2>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
          Every note is a markdown file committed to a GitHub repository you own. Point ForkLeaf at
          one you already have — a notes repo, or the <code>docs/</code> folder of a project — or
          create a new one now.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Repository source"
        className="mb-5 flex max-w-md gap-1 rounded-lg bg-[var(--fl-elevated)] p-1"
      >
        {(
          [
            ["existing", "Use a repository I have"],
            ["new", "Create a new one"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`flex-1 rounded-md px-3 py-2 text-sm transition ${
              mode === value
                ? "bg-[var(--fl-surface)] font-semibold text-[var(--fl-text)] shadow-[var(--fl-shadow)]"
                : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "existing" ? (
        <ExistingRepo onConnect={onConnect} />
      ) : (
        <NewRepo onConnect={onConnect} />
      )}

      {firstRun && onSkip && (
        <p className="mt-6 border-t border-[var(--fl-border)] pt-4 text-sm text-[var(--fl-muted)]">
          Not now?{" "}
          <button
            type="button"
            onClick={onSkip}
            className="font-medium text-[var(--fl-text)] underline underline-offset-4"
          >
            Keep writing on this device
          </button>{" "}
          — notes stay in this browser until you connect a repository.
        </p>
      )}
    </section>
  );
}

/** A failure the user can act on, rather than GitHub's bare wording. */
function ErrorNotice({ error }: { error: unknown }) {
  if (error instanceof ApiGatewayError && error.needsAuth) {
    return (
      <div
        role="alert"
        className="mb-4 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-4 text-sm"
      >
        <p className="mb-3 text-[var(--fl-text)]">
          Your GitHub sign-in is no longer valid — the token was revoked, or the app&rsquo;s access
          was withdrawn.
        </p>
        <a href="/sign-in" className="fl-btn fl-btn-primary !py-2 !text-sm">
          Sign in with GitHub again
        </a>
      </div>
    );
  }

  return (
    <p role="alert" className="mb-4 text-sm text-[var(--fl-danger)]">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

function ExistingRepo({ onConnect }: { onConnect: RepoChooserProps["onConnect"] }) {
  const [repos, setRepos] = useState<RepoSummaryDto[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RepoSummaryDto | null>(null);
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listRepos().then(setRepos).catch(setError);
  }, []);

  const results = useMemo(() => {
    if (!repos) return [];
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? repos.filter(
          (repo) =>
            repo.fullName.toLowerCase().includes(needle) ||
            (repo.description ?? "").toLowerCase().includes(needle),
        )
      : repos;
    return matches.slice(0, 60);
  }, [repos, query]);

  const connect = async () => {
    if (!selected || busy) return;
    setBusy(true);

    const repo = {
      owner: selected.owner,
      repo: selected.name,
      branch: selected.defaultBranch,
      directory: directory.trim().replace(/^\/+|\/+$/g, ""),
    };

    try {
      await onConnect({
        id: workspaceId(repo),
        name: selected.name,
        repo,
        isDefault: false,
        isLocal: false,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <>
      {error != null && <ErrorNotice error={error} />}

      {!repos && error == null && (
        <p className="py-10 text-center text-sm text-[var(--fl-muted)]" aria-busy="true">
          Reading your repositories…
        </p>
      )}

      {repos && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your repositories…"
              aria-label="Search repositories"
              className="fl-input mb-2 w-full"
            />

            <ul className="max-h-80 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--fl-border)] p-1">
              {results.map((repo) => {
                const active = selected?.fullName === repo.fullName;
                return (
                  <li key={repo.fullName}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelected(repo)}
                      className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition ${
                        active
                          ? "bg-[var(--fl-accent-soft)] ring-1 ring-[var(--fl-accent)]"
                          : "hover:bg-[var(--fl-elevated)]"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--fl-text)]">
                          {repo.fullName}
                        </span>
                        <span className="block truncate text-xs text-[var(--fl-muted)]">
                          {repo.description ?? `Default branch: ${repo.defaultBranch}`}
                        </span>
                      </span>
                      {repo.private && (
                        <span className="shrink-0 rounded bg-[var(--fl-elevated)] px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-[var(--fl-muted)]">
                          private
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}

              {results.length === 0 && (
                <li className="py-8 text-center text-sm text-[var(--fl-muted)]">
                  Nothing matches that search.
                </li>
              )}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
                Folder (optional)
              </span>
              <input
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
                placeholder="docs"
                className="fl-input w-full"
              />
              <span className="mt-1.5 block text-xs leading-relaxed text-[var(--fl-muted)]">
                Leave empty to use the whole repository. Set it to <code>docs</code> to edit only
                that folder.
              </span>
            </label>

            <button
              type="button"
              disabled={!selected || busy}
              onClick={connect}
              className="fl-btn fl-btn-primary w-full justify-center !py-2.5 disabled:opacity-40"
            >
              {busy ? "Connecting…" : selected ? `Connect ${selected.name}` : "Pick a repository"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function NewRepo({ onConnect }: { onConnect: RepoChooserProps["onConnect"] }) {
  const [name, setName] = useState("forkleaf-notes");
  const [isPrivate, setPrivate] = useState(true);
  const [scaffold, setScaffold] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // GitHub silently rewrites anything outside this set, so do it here where the
  // user can see the name they will actually get.
  const slug = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const create = async () => {
    if (!slug || busy) return;
    setBusy(true);
    setError(null);

    try {
      const { repo, workspace } = await bootstrapWorkspace({
        name: slug,
        private: isPrivate,
        scaffold,
      });

      await onConnect({
        id: workspaceId(workspace),
        name: repo.name,
        repo: workspace,
        isDefault: true,
        isLocal: false,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      {error != null && <ErrorNotice error={error} />}

      <label className="mb-4 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
          Repository name
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && create()}
          placeholder="forkleaf-notes"
          className="fl-input w-full"
        />
        <span className="mt-1 block text-xs text-[var(--fl-muted)]">
          {slug && slug !== name.trim()
            ? `Will be created as ${slug}.`
            : "If you already own a repo with this name, it is used as-is."}
        </span>
      </label>

      <label className="mb-3 flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(event) => setPrivate(event.target.checked)}
          className="mt-0.5 accent-[var(--fl-accent)]"
        />
        <span>
          <span className="block text-[var(--fl-text)]">Private repository</span>
          <span className="block text-xs text-[var(--fl-muted)]">
            Only you can read it. Changeable on GitHub later.
          </span>
        </span>
      </label>

      <label className="mb-5 flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={scaffold}
          onChange={(event) => setScaffold(event.target.checked)}
          className="mt-0.5 accent-[var(--fl-accent)]"
        />
        <span>
          <span className="block text-[var(--fl-text)]">Start with a folder structure</span>
          <span className="block text-xs text-[var(--fl-muted)]">
            Creates <code>inbox/</code>, <code>notes/</code>, <code>projects/</code> and{" "}
            <code>archive/</code>, each with a note explaining what belongs in it.
          </span>
        </span>
      </label>

      <button
        type="button"
        disabled={!slug || busy}
        onClick={create}
        className="fl-btn fl-btn-primary !py-2.5 disabled:opacity-40"
      >
        {busy ? "Creating…" : slug ? `Create ${slug}` : "Name your repository"}
      </button>
    </div>
  );
}
