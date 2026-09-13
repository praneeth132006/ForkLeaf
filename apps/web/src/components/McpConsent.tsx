"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { redirectWith } from "@/lib/mcp-oauth";

/**
 * "Let this assistant use your notebook?"
 *
 * Choose the repository, optionally a folder and a branch, and whether the
 * assistant may write. Allow sends the person through GitHub once, for a grant
 * that belongs to the assistant; Don't allow tells the assistant no.
 */

const RESUME_KEY = "forkleaf:mcp-authorize";

interface SessionInfo {
  mode: "github" | "local";
  githubAvailable: boolean;
  user: { login: string } | null;
}

interface RepoOption {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  canPush: boolean;
  updatedAt: string;
}

export interface McpConsentProps {
  resume?: boolean;
  query?: string;
  clientName?: string;
  redirectUri?: string;
  state?: string | null;
}

const field =
  "w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[13.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]";

export function McpConsent({
  resume,
  query = "",
  clientName,
  redirectUri,
  state,
}: McpConsentProps) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [repos, setRepos] = useState<RepoOption[] | null>(null);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [directory, setDirectory] = useState("");
  const [branch, setBranch] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Back from signing in: the original request was kept in this tab.
  useEffect(() => {
    if (!resume) return;
    try {
      const saved = window.sessionStorage.getItem(RESUME_KEY);
      window.sessionStorage.removeItem(RESUME_KEY);
      if (saved?.startsWith("/mcp/authorize?")) window.location.replace(saved);
    } catch {
      // Nothing kept; the assistant can start again.
    }
  }, [resume]);

  useEffect(() => {
    if (resume) return;
    let live = true;
    fetch("/api/session", { cache: "no-store" })
      .then((response) => response.json() as Promise<SessionInfo>)
      .then(async (info) => {
        if (!live) return;
        setSession(info);
        if (info.mode !== "github") return;
        const response = await fetch("/api/gh/repos", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as { repos?: RepoOption[] } | null;
        if (live) {
          setRepos([...(body?.repos ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        }
      })
      .catch(() => live && setProblem("ForkLeaf could not be reached. Try again."));
    return () => {
      live = false;
    };
  }, [resume]);

  const suggested = useMemo(
    () =>
      repos?.find((repo) => /notes|forkleaf/i.test(repo.name))?.fullName ?? repos?.[0]?.fullName,
    [repos],
  );
  const chosen = picked ?? suggested ?? null;
  const shown = useMemo(
    () =>
      (repos ?? []).filter((repo) =>
        repo.fullName.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [repos, filter],
  );

  if (resume) {
    return <p className="text-[14px] text-[var(--fl-muted)]">Picking up where you left off…</p>;
  }

  const signIn = () => {
    try {
      window.sessionStorage.setItem(
        RESUME_KEY,
        `${window.location.pathname}${window.location.search}`,
      );
    } catch {
      // Without storage the assistant will have to start again after sign-in.
    }
    // A full page load on purpose: sign-in is a route handler that redirects to
    // GitHub, which client-side navigation cannot follow.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(
      `/api/auth/github?next=${encodeURIComponent("/mcp/authorize?resume=1")}`,
    );
  };

  const deny = () => {
    if (redirectUri)
      window.location.assign(
        redirectWith(redirectUri, { error: "access_denied", state: state ?? null }),
      );
  };

  const allow = async () => {
    const repo = repos?.find((each) => each.fullName === chosen);
    if (!repo) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/mcp/oauth/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          owner: repo.owner,
          repo: repo.name,
          branch,
          directory,
          readOnly,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.url !== "string") {
        setProblem(body?.error?.message ?? "That did not work. Try again.");
        setBusy(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setProblem("ForkLeaf could not be reached. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fl-card w-full max-w-lg p-6">
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-accent)]">
        Connect an AI assistant
      </p>
      <h1 className="mt-2 text-xl font-semibold text-[var(--fl-text)]">
        Let {clientName} use your notebook?
      </h1>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[13.5px] text-[var(--fl-muted)]">
        <li>It can search and read the notes in the repository you choose.</li>
        <li>
          {readOnly
            ? "It cannot change anything."
            : "It can create and change notes there. Every change is a commit you can undo."}
        </li>
        <li>Encrypted notes stay sealed — it is never given a passphrase.</li>
      </ul>

      {session === null ? (
        <p className="mt-5 text-[13px] text-[var(--fl-muted)]">Checking your sign-in…</p>
      ) : session.mode !== "github" ? (
        <div className="mt-5">
          <p className="text-[13.5px] text-[var(--fl-muted)]">
            Sign in with GitHub first, so you can choose which notebook it may use.
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={signIn} className="fl-btn fl-btn-primary">
              Sign in with GitHub
            </button>
            <button type="button" onClick={deny} className="fl-btn fl-btn-ghost">
              Don&rsquo;t allow
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
              Notebook repository
            </span>
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter your repositories…"
              aria-label="Filter repositories"
              className={field}
            />
          </label>
          <div
            role="radiogroup"
            aria-label="Notebook repository"
            className="max-h-52 overflow-y-auto rounded-lg border border-[var(--fl-border)]"
          >
            {repos === null ? (
              <p className="p-3 text-[13px] text-[var(--fl-muted)]">Loading your repositories…</p>
            ) : shown.length === 0 ? (
              <p className="p-3 text-[13px] text-[var(--fl-muted)]">No repository matches.</p>
            ) : (
              shown.map((repo) => (
                <label
                  key={repo.fullName}
                  className="flex cursor-pointer items-center gap-2 border-b border-[var(--fl-border)] px-3 py-2 text-[13px] last:border-b-0"
                >
                  <input
                    type="radio"
                    name="repository"
                    checked={chosen === repo.fullName}
                    onChange={() => setPicked(repo.fullName)}
                    className="accent-[var(--fl-accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[var(--fl-text)]">
                    {repo.fullName}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--fl-muted)]">
                    {repo.private ? "private" : "public"}
                    {repo.canPush ? "" : " · read only"}
                  </span>
                </label>
              ))
            )}
          </div>

          <details className="text-[13px] text-[var(--fl-muted)]">
            <summary className="cursor-pointer">Folder and branch (optional)</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
                placeholder="Folder, e.g. notes"
                aria-label="Folder"
                className={field}
              />
              <input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="Branch (default)"
                aria-label="Branch"
                className={field}
              />
            </div>
          </details>

          <label className="flex items-center gap-2 text-[13.5px] text-[var(--fl-text)]">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
              className="accent-[var(--fl-accent)]"
            />
            Read only — it may search and read, but not write
          </label>

          {problem && (
            <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
              {problem}
            </p>
          )}

          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!chosen || busy}
              onClick={() => void allow()}
              className="fl-btn fl-btn-primary disabled:opacity-60"
            >
              {busy ? "Opening GitHub…" : "Allow"}
            </button>
            <button type="button" onClick={deny} className="fl-btn fl-btn-ghost">
              Don&rsquo;t allow
            </button>
          </div>
          <p className="text-[12px] text-[var(--fl-muted)]">
            GitHub confirms it next. To stop it later, remove it in your assistant, or revoke
            ForkLeaf at GitHub → Settings → Applications (which also signs ForkLeaf out).{" "}
            <Link href="/docs/mcp" className="underline">
              How this works
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
