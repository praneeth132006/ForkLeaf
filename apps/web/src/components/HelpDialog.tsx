"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { SessionUser, Workspace } from "@forkleaf/types";
import { Dialog } from "./Dialog";
import { commitsUrl, repoUrl } from "@/lib/github-links";

export interface HelpDialogProps {
  onClose: () => void;
  user: SessionUser | null;
  workspace: Workspace | null;
  githubAvailable: boolean;
  onSignIn: () => void;
  onConnectRepo: () => void;
}

type Tab = "start" | "writing" | "diagrams" | "sync" | "keys";

const TABS: { id: Tab; label: string }[] = [
  { id: "start", label: "Getting started" },
  { id: "writing", label: "Writing" },
  { id: "diagrams", label: "Diagrams" },
  { id: "sync", label: "GitHub & sync" },
  { id: "keys", label: "Shortcuts" },
];

/**
 * In-editor help.
 *
 * Answers the questions people actually hit — where are my notes on GitHub, how
 * do I sign in, how does syncing work, how do I insert a diagram — at the
 * moment they hit them. Documentation on a separate site does not help someone
 * who is already staring at an empty editor wondering what `/` does.
 */
export function HelpDialog({
  onClose,
  user,
  workspace,
  githubAvailable,
  onSignIn,
  onConnectRepo,
}: HelpDialogProps) {
  const [tab, setTab] = useState<Tab>("start");

  return (
    <Dialog
      title="Help"
      subtitle="How ForkLeaf works, in about two minutes"
      onClose={onClose}
      wide
    >
      <div
        role="tablist"
        aria-label="Help topics"
        className="mb-5 flex flex-wrap gap-1 border-b border-[var(--fl-border)] pb-3"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
              tab === item.id
                ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                : "text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "start" && (
        <Section>
          <Step n={1} title="Write something">
            You do not need an account. Notes are saved to this browser
            immediately — the status bar at the bottom says{" "}
            <Mono>Saved on this device</Mono> when that has happened.
          </Step>
          <Step n={2} title="Sign in with GitHub to keep them">
            Browser storage is not a backup: clearing site data deletes it.
            Signing in creates a private repository called{" "}
            <Mono>forkleaf-notes</Mono> in your GitHub account and starts
            committing your notes there.
            {!user &&
              (githubAvailable ? (
                <button type="button" onClick={onSignIn} className="fl-btn fl-btn-primary mt-3">
                  Continue with GitHub
                </button>
              ) : (
                <Callout>
                  GitHub sign-in is not configured on this deployment. Whoever
                  runs it needs to set <Mono>GITHUB_OAUTH_CLIENT_ID</Mono>,{" "}
                  <Mono>GITHUB_OAUTH_CLIENT_SECRET</Mono> and{" "}
                  <Mono>SESSION_SECRET</Mono> — see the{" "}
                  <DocLink href="/docs/self-hosting">self-hosting guide</DocLink>.
                </Callout>
              ))}
          </Step>
          <Step n={3} title="Point it at any repo you like">
            You are not limited to the notes repo. Connect an existing
            repository — a docs folder, a wiki, a project README — and edit it
            here.
            {user && (
              <button type="button" onClick={onConnectRepo} className="fl-btn fl-btn-ghost mt-3">
                Connect a repository
              </button>
            )}
          </Step>
        </Section>
      )}

      {tab === "writing" && (
        <Section>
          <Item title="Three views of the same file">
            <strong>Rich text</strong> formats as you type. <strong>Split</strong>{" "}
            shows raw Markdown beside a live preview. <strong>Source</strong> is
            just the Markdown. Switching never rewrites the file, so the commit
            in your repo is the same either way.
          </Item>
          <Item title="Press / for anything">
            Type <Mono>/</Mono> on an empty line for headings, lists, tables,
            code blocks, images and diagrams. This works in{" "}
            <strong>all three views</strong> — in Split and Source it inserts
            the Markdown directly. The same list is in the{" "}
            <strong>Insert</strong> button on the toolbar.
          </Item>
          <Item title="Properties are real front matter">
            The Title and Tags fields in the right-hand panel are written into
            the file as a YAML block at the top. That is why notes written here
            open correctly in Obsidian, Jekyll and Hugo.
          </Item>
          <Item title="Export">
            <Mono>Export</Mono> in the header produces Markdown, PDF, HTML, Word
            or plain text. Everything is generated in your browser — the note is
            never uploaded anywhere to become a file.
          </Item>
        </Section>
      )}

      {tab === "diagrams" && (
        <Section>
          <Item title="Insert one">
            Press <Mono>/</Mono> and choose <strong>Diagram</strong>, or use{" "}
            <strong>Diagram</strong> on the toolbar. In rich text a diagram
            block appears; in Split or Source you get a{" "}
            <Mono>```mermaid</Mono> fence.
          </Item>
          <Item title="Choose a type">
            A new diagram opens the gallery: flowcharts, sequence diagrams,
            state machines, ER diagrams, Gantt charts, mind maps, pie charts,
            user journeys, timelines, git graphs and quadrant charts. Each card
            draws the shape it produces. Pick one and edit it — starting from
            something that already renders beats starting from an empty box.
          </Item>
          <Item title="Two ways to edit">
            <strong>Visual</strong> lets you drag boxes and draw arrows on a
            canvas — available for flowcharts. <strong>Source</strong> is the
            Mermaid text, with autocomplete, inline error messages that point at
            the offending line, and a <strong>Syntax help</strong> panel you can
            click snippets out of. Both write the same code, and the preview
            updates as you go.
          </Item>
          <Item title="They are not locked in">
            A diagram is stored as an ordinary <Mono>```mermaid</Mono> code
            fence, so GitHub renders it natively when you view the file there,
            and so does anything else that speaks Mermaid.
          </Item>
        </Section>
      )}

      {tab === "sync" && (
        <Section>
          <Item title="How saving actually works">
            Every keystroke goes to this browser first, which is why the editor
            works with no network. A background queue then pushes the changes to
            GitHub as commits. The status bar names both halves — “Saved
            locally · 2 to push” means nothing is lost, it just has not landed
            in the repo yet. <Mono>⌘S</Mono> pushes immediately instead of
            waiting.
          </Item>
          <Item title="Where your notes live on GitHub">
            {workspace && !workspace.isLocal ? (
              <>
                This workspace is{" "}
                <Mono>
                  {workspace.repo.owner}/{workspace.repo.repo}
                </Mono>{" "}
                on branch <Mono>{workspace.repo.branch}</Mono>.
                <span className="mt-3 flex flex-wrap gap-2">
                  <External href={repoUrl(workspace)}>Open the repository</External>
                  <External href={commitsUrl(workspace)}>See every commit</External>
                </span>
                <span className="mt-3 block">
                  Individual notes have their own{" "}
                  <strong>Open on GitHub</strong> and <strong>History</strong>{" "}
                  links in the properties panel on the right.
                </span>
              </>
            ) : (
              <>
                Nothing is on GitHub yet — this workspace is local to this
                browser. Sign in and ForkLeaf creates a private{" "}
                <Mono>forkleaf-notes</Mono> repository, then commits each note to
                it as a plain <Mono>.md</Mono> file you can read, clone or edit
                anywhere.
              </>
            )}
          </Item>
          <Item title="Working across devices">
            Sign in with the same GitHub account on another machine and ForkLeaf
            pulls the repository down. Both devices commit to the same branch.
          </Item>
          <Item title="If two devices edit the same note">
            ForkLeaf detects it and shows you both versions rather than picking
            one silently. You choose: keep yours, keep the remote one, or keep
            both as separate files.
          </Item>
          <Item title="What ForkLeaf can see">
            Your GitHub token is encrypted into an httpOnly cookie that only the
            server can open — no script on the page can read it, and it is never
            put in a URL. There is no ForkLeaf database holding your notes.{" "}
            <DocLink href="/docs/security">Read the security model</DocLink>.
          </Item>
        </Section>
      )}

      {tab === "keys" && (
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {[
            ["/", "Open the insert menu"],
            ["⌘S / Ctrl+S", "Push to GitHub now"],
            ["⌘⇧N", "New note"],
            ["⌘⇧E", "Export the current note"],
            ["⌘B / ⌘I", "Bold / italic (rich text)"],
            ["⌘Z / ⌘⇧Z", "Undo / redo"],
            ["Tab", "Indent (source view)"],
            ["Esc", "Close a dialog or the diagram editor"],
          ].map(([keys, what]) => (
            <div
              key={keys}
              className="flex items-center justify-between gap-4 border-b border-[var(--fl-border)] py-2 last:border-0"
            >
              <span className="text-[13.5px] text-[var(--fl-muted)]">{what}</span>
              <kbd className="shrink-0 rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2 py-1 font-mono text-[11.5px] text-[var(--fl-text)]">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 border-t border-[var(--fl-border)] pt-4 text-[13px] text-[var(--fl-muted)]">
        Still stuck? The <DocLink href="/docs">full documentation</DocLink> goes
        into much more depth.
      </p>
    </Dialog>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[14px] font-semibold text-[var(--fl-text)]">{title}</h3>
      <p className="text-[13.5px] leading-relaxed text-[var(--fl-muted)]">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--fl-accent-soft)] font-mono text-[11px] font-semibold text-[var(--fl-accent)]">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 text-[14px] font-semibold text-[var(--fl-text)]">{title}</h3>
        <div className="text-[13.5px] leading-relaxed text-[var(--fl-muted)]">{children}</div>
      </div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-1 py-0.5 font-mono text-[12px] text-[var(--fl-text)]">
      {children}
    </code>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-3 block rounded-lg border border-[var(--fl-warn)]/40 bg-[var(--fl-warn)]/10 px-3 py-2 text-[13px] text-[var(--fl-text)]">
      {children}
    </span>
  );
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[var(--fl-accent)] underline underline-offset-2">
      {children}
    </Link>
  );
}

function External({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fl-border)] px-3 py-1.5 text-[13px] font-medium text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
    >
      {children} ↗
    </a>
  );
}
