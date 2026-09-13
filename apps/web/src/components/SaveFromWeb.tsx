"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parseSaveRequest, siteOf, titleFor, type SaveRequest } from "@/lib/inbox";
import { SAVES_REPO, savePath, type SavedEntry } from "@/lib/saves";

/**
 * "Save this?" — for things arriving from the web.
 *
 * The address that brings a page here can be written into a link on any site,
 * so arriving is not asking: nothing is written until Save is pressed. What is
 * saved goes to the person's own `forkleaf-saves` repository, filed by kind and
 * month, never into whichever notebook they happen to have open.
 *
 * Signed out, it offers to sign in — the request is kept in this tab while
 * GitHub is visited, since the words being saved can be longer than a return
 * address may be — or to keep it on this device instead.
 */

const PENDING_KEY = "forkleaf:pending-save";

interface SessionInfo {
  mode: "github" | "local";
  githubAvailable: boolean;
  user: { login: string } | null;
}

interface RepoLinks {
  owner: string;
  name: string;
  branch: string;
  url: string;
  index: string;
}

type Stage =
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "saved"; entry: SavedEntry; repo: RepoLinks; isPrivate: boolean }
  | { kind: "duplicate"; existing: SavedEntry; repo: RepoLinks };

const KIND_LABEL: Record<SaveRequest["kind"], string> = {
  page: "Page",
  quote: "Quote",
  image: "Image",
  link: "Link",
};

const readStash = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
};

export function SaveFromWeb() {
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();
  const [stash] = useState(readStash);
  const [now] = useState(() => new Date());

  // The request as it arrived, or as it was kept while signing in.
  const sourceKey = useMemo(() => {
    const params = new URLSearchParams(paramsKey);
    return params.get("resume") === "1" && stash ? stash : paramsKey;
  }, [paramsKey, stash]);
  const request = useMemo(() => {
    const params = new URLSearchParams(sourceKey);
    params.set("save", "1");
    return parseSaveRequest(params);
  }, [sourceKey]);

  const [title, setTitle] = useState(() => (request ? titleFor(request) : ""));
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "ready" });
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/session", { cache: "no-store" })
      .then((response) => response.json() as Promise<SessionInfo>)
      .then(
        (info) => live && setSession(info),
        () => live && setSession({ mode: "local", githubAvailable: false, user: null }),
      );
    return () => {
      live = false;
    };
  }, []);

  const localHref = useMemo(() => {
    const params = new URLSearchParams(sourceKey);
    params.delete("resume");
    params.set("save", "1");
    params.set("local", "1");
    return `/editor?${params.toString()}`;
  }, [sourceKey]);

  if (!request) {
    return (
      <Card>
        <h1 className="text-lg font-semibold text-[var(--fl-text)]">Nothing to save here</h1>
        <p className="mt-2 text-[14px] text-[var(--fl-muted)]">
          This address is how the Save to ForkLeaf extension, the bookmarklet and the share sheet
          hand things over, and nothing came with it.
        </p>
        <Link href="/docs/saving" className="fl-btn fl-btn-ghost mt-4 inline-flex">
          How saving works
        </Link>
      </Card>
    );
  }

  const cleanTitle = title.trim() || titleFor(request);
  const filedAs = savePath({ ...request, title: cleanTitle }, now, new Set());
  const site = siteOf(request.url);

  const save = async (force = false) => {
    setStage({ kind: "saving" });
    setProblem(null);
    try {
      const response = await fetch("/api/saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, title: cleanTitle, force }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setProblem(body?.error?.message ?? "It could not be saved.");
        setStage({ kind: "ready" });
        return;
      }
      try {
        window.sessionStorage.removeItem(PENDING_KEY);
      } catch {
        // Storage refused; the stash simply stays until the tab closes.
      }
      setStage(
        body.saved
          ? { kind: "saved", entry: body.entry, repo: body.repo, isPrivate: body.private }
          : { kind: "duplicate", existing: body.existing, repo: body.repo },
      );
    } catch {
      setProblem("Could not reach ForkLeaf. Nothing was saved.");
      setStage({ kind: "ready" });
    }
  };

  const signIn = () => {
    try {
      window.sessionStorage.setItem(PENDING_KEY, sourceKey);
    } catch {
      // Without storage the request cannot survive the trip; it is still in
      // the extension or the page it came from.
    }
    // A full page load on purpose: sign-in is a route handler that redirects to
    // GitHub, which client-side navigation cannot follow.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/api/auth/github?next=${encodeURIComponent("/save?resume=1")}`);
  };

  if (stage.kind === "saved") {
    const fileUrl = `${stage.repo.url}/blob/${stage.repo.branch}/${stage.entry.path}`;
    return (
      <Card>
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-accent)]">
          Saved
        </p>
        <h1 className="mt-2 text-lg font-semibold text-[var(--fl-text)]">{stage.entry.title}</h1>
        <p className="mt-2 text-[14px] text-[var(--fl-muted)]">
          Filed in{" "}
          <code className="text-[var(--fl-text)]">
            {stage.repo.name}/{stage.entry.path}
          </code>
          , and added to the top of the index.
        </p>
        {!stage.isPrivate && (
          <p role="alert" className="mt-3 text-[13px] text-[var(--fl-danger)]">
            {stage.repo.owner}/{stage.repo.name} is a public repository, so this save can be seen by
            anyone. Make it private on GitHub if that is not what you want.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={fileUrl} target="_blank" rel="noreferrer" className="fl-btn fl-btn-primary">
            Open it on GitHub
          </a>
          <a
            href={stage.repo.index}
            target="_blank"
            rel="noreferrer"
            className="fl-btn fl-btn-ghost"
          >
            Everything saved
          </a>
          <button type="button" onClick={() => window.close()} className="fl-btn fl-btn-ghost">
            Close this tab
          </button>
        </div>
      </Card>
    );
  }

  if (stage.kind === "duplicate") {
    const fileUrl = `${stage.repo.url}/blob/${stage.repo.branch}/${stage.existing.path}`;
    return (
      <Card>
        <h1 className="text-lg font-semibold text-[var(--fl-text)]">Already saved</h1>
        <p className="mt-2 text-[14px] text-[var(--fl-muted)]">
          You saved this {KIND_LABEL[stage.existing.kind].toLowerCase()} on {stage.existing.saved},
          as <strong className="text-[var(--fl-text)]">{stage.existing.title}</strong>.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={fileUrl} target="_blank" rel="noreferrer" className="fl-btn fl-btn-primary">
            Open that one
          </a>
          <button type="button" onClick={() => void save(true)} className="fl-btn fl-btn-ghost">
            Save it again anyway
          </button>
        </div>
      </Card>
    );
  }

  const signedIn = session?.mode === "github";

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-[var(--fl-text)]">Save to ForkLeaf?</h1>
        <span className="rounded-full bg-[var(--fl-accent-soft)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--fl-accent)]">
          {KIND_LABEL[request.kind]}
        </span>
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
          Title
        </span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[14px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
        />
      </label>

      <div className="mt-4 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3 text-[13.5px]">
        {request.kind === "image" && request.url ? (
          // Through ForkLeaf's proxy, so the site never sees this page looking.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/link-image?url=${encodeURIComponent(request.url)}`}
            alt=""
            className="max-h-56 rounded-md"
          />
        ) : request.text ? (
          <blockquote className="max-h-56 overflow-y-auto whitespace-pre-wrap border-l-2 border-[var(--fl-accent)] pl-3 text-[var(--fl-text)]">
            {request.text}
          </blockquote>
        ) : null}
        {request.url && (
          <p className="mt-2 truncate text-[12.5px] text-[var(--fl-muted)]">
            {site} · {request.url}
          </p>
        )}
      </div>

      <p className="mt-3 text-[12.5px] text-[var(--fl-muted)]">
        Goes to your private <code className="text-[var(--fl-text)]">{SAVES_REPO}</code> repository
        as <code className="break-all text-[var(--fl-text)]">{filedAs}</code> — kept apart from your
        notebooks, and filed by kind and month automatically.
      </p>

      {problem && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--fl-danger)]">
          {problem}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {session === null ? (
          <span className="text-[13px] text-[var(--fl-muted)]">Checking your sign-in…</span>
        ) : signedIn ? (
          <button
            type="button"
            autoFocus
            disabled={stage.kind === "saving"}
            onClick={() => void save()}
            className="fl-btn fl-btn-primary disabled:opacity-60"
          >
            {stage.kind === "saving" ? "Saving…" : "Save"}
          </button>
        ) : session.githubAvailable ? (
          <button type="button" onClick={signIn} className="fl-btn fl-btn-primary">
            Sign in with GitHub to save
          </button>
        ) : null}
        {session !== null && (
          <Link
            href={localHref}
            className={
              signedIn || session.githubAvailable ? "fl-btn fl-btn-ghost" : "fl-btn fl-btn-primary"
            }
          >
            Keep it on this device instead
          </Link>
        )}
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="fl-card w-full max-w-lg p-6">{children}</div>;
}
