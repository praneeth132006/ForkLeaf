"use client";

import React, { useEffect, useMemo, useState } from "react";
import { workspaceId, type Workspace } from "@forkleaf/types";
import { ApiGatewayError, bootstrapWorkspace, listRepos, type RepoSummaryDto } from "@/lib/gateway";
import { Dialog } from "./Dialog";

export interface ConnectRepoDialogProps {
  onConnect: (workspace: Workspace) => void;
  onClose: () => void;
}

/**
 * Adds a workspace, either from a repository the user already has or from a new
 * one created on the spot.
 *
 * Connecting an existing repo is what makes ForkLeaf useful beyond a personal
 * notes repo: point it at the `docs/` folder of a real project and edit that
 * project's documentation with the same editor. Creating one covers the other
 * case — somebody who just wants somewhere to write and should not have to go
 * to GitHub, make a repo and come back.
 */
export function ConnectRepoDialog({ onConnect, onClose }: ConnectRepoDialogProps) {
  const [mode, setMode] = useState<"existing" | "new">("existing");

  return (
    <Dialog title="Add a workspace" onClose={onClose}>
      <div
        role="tablist"
        aria-label="Workspace source"
        className="mb-4 flex gap-1 rounded-md bg-[var(--fl-elevated)] p-1"
      >
        {(
          [
            ["existing", "Use an existing repo"],
            ["new", "Create a new repo"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`flex-1 rounded px-3 py-1.5 text-sm transition ${
              mode === value
                ? "bg-[var(--fl-surface)] font-semibold text-[var(--fl-text)]"
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
    </Dialog>
  );
}


/**
 * Turns a failure into something the user can act on.
 *
 * A revoked or expired token comes back from GitHub as the bare string "Bad
 * credentials", which tells the user nothing and offers no way out. The one
 * thing that actually fixes it is signing in again, so say that and link to it.
 */
function ErrorNotice({ error }: { error: unknown }) {
  const expired = error instanceof ApiGatewayError && error.needsAuth;

  if (expired) {
    return (
      <div
        role="alert"
        className="mb-3 rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3 text-sm"
      >
        <p className="mb-2 text-[var(--fl-text)]">
          Your GitHub sign-in is no longer valid. This happens when the token is
          revoked or the app&rsquo;s access is withdrawn.
        </p>
        <a
          href="/api/auth/github"
          className="inline-block rounded-md bg-[var(--fl-accent)] px-3 py-1.5 text-sm font-semibold text-[var(--fl-accent-contrast)] hover:opacity-90"
        >
          Sign in with GitHub again
        </a>
      </div>
    );
  }

  return (
    <p role="alert" className="mb-3 text-sm text-[var(--fl-danger)]">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

/**
 * Creates a repository and opens it, without leaving the editor.
 *
 * The scaffold option is on by default. A notes repo that starts with somewhere
 * to put things is easier to keep tidy than one that starts empty and collects
 * files at the root.
 */
function NewRepo({ onConnect }: { onConnect: (workspace: Workspace) => void }) {
  const [name, setName] = useState("forkleaf-notes");
  const [isPrivate, setPrivate] = useState(true);
  const [scaffold, setScaffold] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // GitHub accepts letters, digits, dot, dash and underscore; it silently
  // rewrites anything else, so do it here where the user can see the result.
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

      onConnect({
        id: workspaceId(workspace),
        name: repo.name,
        repo: workspace,
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

      <label className="mb-4 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
          Repository name
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && create()}
          placeholder="forkleaf-notes"
          autoFocus
          className="w-full rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--fl-accent)]"
        />
        <span className="mt-1 block text-xs text-[var(--fl-muted)]">
          {slug && slug !== name.trim()
            ? `Will be created as ${slug}.`
            : "If you already have a repo with this name, it is used as-is."}
        </span>
      </label>

      <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(event) => setPrivate(event.target.checked)}
          className="mt-0.5 accent-[var(--fl-accent)]"
        />
        <span>
          <span className="block text-[var(--fl-text)]">Private repository</span>
          <span className="block text-xs text-[var(--fl-muted)]">
            Only you can read it. You can change this on GitHub later.
          </span>
        </span>
      </label>

      <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm">
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
        className="w-full rounded-md bg-[var(--fl-accent)] px-4 py-2 text-sm font-semibold text-[var(--fl-accent-contrast)] hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "Creating…" : slug ? `Create ${slug}` : "Name your repository"}
      </button>
    </>
  );
}

function ExistingRepo({ onConnect }: { onConnect: (workspace: Workspace) => void }) {
  const [repos, setRepos] = useState<RepoSummaryDto[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RepoSummaryDto | null>(null);
  const [directory, setDirectory] = useState("");

  useEffect(() => {
    listRepos().then(setRepos).catch(setError);
  }, []);

  const results = useMemo(() => {
    if (!repos) return [];
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? repos.filter((repo) => repo.fullName.toLowerCase().includes(needle))
      : repos;
    // Long lists are unusable; the search box handles the rest.
    return matches.slice(0, 50);
  }, [repos, query]);

  const connect = () => {
    if (!selected) return;

    const repo = {
      owner: selected.owner,
      repo: selected.name,
      branch: selected.defaultBranch,
      directory: directory.trim().replace(/^\/+|\/+$/g, ""),
    };

    onConnect({
      id: workspaceId(repo),
      name: selected.name,
      repo,
      isDefault: false,
      isLocal: false,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });
  };

  return (
    <>
      {error != null && <ErrorNotice error={error} />}

      {!repos && error == null && (
        <p className="py-8 text-center text-sm text-[var(--fl-muted)]">
          Loading your repositories…
        </p>
      )}

      {repos && (
        <>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories…"
            aria-label="Search repositories"
            autoFocus
            className="mb-2 w-full rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--fl-accent)]"
          />

          <ul className="mb-3 max-h-60 space-y-0.5 overflow-y-auto">
            {results.map((repo) => (
              <li key={repo.fullName}>
                <button
                  type="button"
                  onClick={() => setSelected(repo)}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition ${
                    selected?.fullName === repo.fullName
                      ? "bg-[var(--fl-accent)]/12"
                      : "hover:bg-[var(--fl-elevated)]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--fl-text)]">
                      {repo.fullName}
                    </span>
                    {repo.description && (
                      <span className="block truncate text-xs text-[var(--fl-muted)]">
                        {repo.description}
                      </span>
                    )}
                  </span>
                  {repo.private && (
                    <span className="shrink-0 rounded bg-[var(--fl-elevated)] px-1.5 py-0.5 text-[0.65rem] text-[var(--fl-muted)]">
                      private
                    </span>
                  )}
                </button>
              </li>
            ))}

            {results.length === 0 && (
              <li className="py-6 text-center text-sm text-[var(--fl-muted)]">
                No repositories match that search.
              </li>
            )}
          </ul>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
              Folder (optional)
            </span>
            <input
              value={directory}
              onChange={(event) => setDirectory(event.target.value)}
              placeholder="docs"
              className="w-full rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--fl-accent)]"
            />
            <span className="mt-1 block text-xs text-[var(--fl-muted)]">
              Leave empty to use the whole repository.
            </span>
          </label>

          <button
            type="button"
            disabled={!selected}
            onClick={connect}
            className="w-full rounded-md bg-[var(--fl-accent)] px-4 py-2 text-sm font-semibold text-[var(--fl-accent-contrast)] hover:opacity-90 disabled:opacity-40"
          >
            {selected ? `Connect ${selected.name}` : "Choose a repository"}
          </button>
        </>
      )}
    </>
  );
}
