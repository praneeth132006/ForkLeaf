"use client";

import React, { useEffect, useMemo, useState } from "react";
import { workspaceId, type Workspace } from "@mdnotion/types";
import { listRepos, type RepoSummaryDto } from "@/lib/gateway";
import { Dialog } from "./Dialog";

export interface ConnectRepoDialogProps {
  onConnect: (workspace: Workspace) => void;
  onClose: () => void;
}

/**
 * Connects an existing repository as an additional workspace.
 *
 * This is what makes mdnotion useful beyond a personal notes repo: point it at
 * the `docs/` folder of a real project and edit that project's documentation
 * with the same editor.
 */
export function ConnectRepoDialog({ onConnect, onClose }: ConnectRepoDialogProps) {
  const [repos, setRepos] = useState<RepoSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RepoSummaryDto | null>(null);
  const [directory, setDirectory] = useState("");

  useEffect(() => {
    listRepos()
      .then(setRepos)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load repositories."),
      );
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
    <Dialog title="Connect a repository" onClose={onClose}>
      {error && (
        <p role="alert" className="mb-3 text-sm text-[var(--color-ember)]">
          {error}
        </p>
      )}

      {!repos && !error && (
        <p className="py-8 text-center text-sm text-[var(--color-mist)]">
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
            className="mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-trail-teal)]"
          />

          <ul className="mb-3 max-h-60 space-y-0.5 overflow-y-auto">
            {results.map((repo) => (
              <li key={repo.fullName}>
                <button
                  type="button"
                  onClick={() => setSelected(repo)}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition ${
                    selected?.fullName === repo.fullName
                      ? "bg-[var(--color-trail-teal)]/12"
                      : "hover:bg-[var(--color-chalk)]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--color-ink)]">
                      {repo.fullName}
                    </span>
                    {repo.description && (
                      <span className="block truncate text-xs text-[var(--color-mist)]">
                        {repo.description}
                      </span>
                    )}
                  </span>
                  {repo.private && (
                    <span className="shrink-0 rounded bg-[var(--color-chalk)] px-1.5 py-0.5 text-[0.65rem] text-[var(--color-mist)]">
                      private
                    </span>
                  )}
                </button>
              </li>
            ))}

            {results.length === 0 && (
              <li className="py-6 text-center text-sm text-[var(--color-mist)]">
                No repositories match that search.
              </li>
            )}
          </ul>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-mist)]">
              Folder (optional)
            </span>
            <input
              value={directory}
              onChange={(event) => setDirectory(event.target.value)}
              placeholder="docs"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-trail-teal)]"
            />
            <span className="mt-1 block text-xs text-[var(--color-mist)]">
              Leave empty to use the whole repository.
            </span>
          </label>

          <button
            type="button"
            disabled={!selected}
            onClick={connect}
            className="w-full rounded-md bg-[var(--color-signal-amber)] px-4 py-2 text-sm font-semibold text-[var(--color-basalt)] hover:opacity-90 disabled:opacity-40"
          >
            {selected ? `Connect ${selected.name}` : "Choose a repository"}
          </button>
        </>
      )}
    </Dialog>
  );
}
