"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { SessionUser, Workspace } from "@forkleaf/types";
import { Dialog } from "./Dialog";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/constants";

export interface HelpDialogProps {
  onClose: () => void;
  user: SessionUser | null;
  workspace: Workspace | null;
  githubAvailable: boolean;
  onSignIn: () => void;
  onConnectRepo: () => void;
}

type Tab = "start" | "writing" | "papers" | "diagrams" | "checks" | "sync" | "keys";

const TABS: { id: Tab; label: string }[] = [
  { id: "start", label: "Getting started" },
  { id: "writing", label: "Writing" },
  { id: "papers", label: "Papers & PDFs" },
  { id: "diagrams", label: "Diagrams" },
  { id: "checks", label: "Checks & history" },
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
    <Dialog title="Help" subtitle="How ForkLeaf works, in about two minutes" onClose={onClose} wide>
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
            You do not need an account. Notes are saved to this browser immediately — the status bar
            at the bottom says <Mono>Saved on this device</Mono> when that has happened.
          </Step>
          <Step n={2} title="Sign in with GitHub to keep them">
            Browser storage is not a backup: clearing site data deletes it. Signing in asks which
            repository your notes should live in — one you already have, or a new private one — and
            then commits every note there.
            {!user &&
              (githubAvailable ? (
                <button type="button" onClick={onSignIn} className="fl-btn fl-btn-primary mt-3">
                  Continue with GitHub
                </button>
              ) : (
                <Callout>
                  GitHub sign-in is unavailable on this deployment, so notes stay on this device.
                  Everything else in this list still works —{" "}
                  <DocLink href="/docs/privacy-and-data">where your notes live</DocLink>.
                </Callout>
              ))}
          </Step>
          <Step n={3} title="Point it at any repo you like">
            You are not limited to the notes repo. Connect an existing repository — a docs folder, a
            wiki, a project README — and edit it here.
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
            <strong>Rich text</strong> formats as you type. <strong>Split</strong> shows raw
            Markdown beside a live preview. <strong>Source</strong> is just the Markdown. Switching
            never rewrites the file, so the commit in your repo is the same either way.
          </Item>
          <Item title="Press / for anything">
            Type <Mono>/</Mono> on an empty line for headings, lists, tables, code blocks, images
            and diagrams. This works in <strong>all three views</strong> — in Split and Source it
            inserts the Markdown directly.
          </Item>
          <Item title="Everything Markdown can do, on the toolbar">
            Undo and redo, a paragraph-style dropdown, bold, italic, strikethrough, inline code and
            highlight, the three kinds of list with indent and outdent, links, images, tables,
            dividers and diagrams. It drives whichever view you are in: in Split and Source the
            buttons edit the Markdown itself, so selecting a word and pressing <strong>B</strong>{" "}
            wraps it in <Mono>**</Mono>. There are no fonts or colours, because none of those
            survive being saved as a <Mono>.md</Mono> file.
          </Item>
          <Item title="Paste images straight in">
            Paste a screenshot, drop a file, or use the <strong>Image</strong> button. On a
            connected repository the file is committed to an <Mono>assets/</Mono> folder and the
            note links to it by a relative path, so it still renders on github.com. With no
            repository connected the image is embedded in the note instead.
          </Item>
          <Item title="Properties are real front matter">
            The Title and Tags fields in the right-hand panel are written into the file as a YAML
            block at the top. That is why notes written here open correctly in Obsidian, Jekyll and
            Hugo.
          </Item>
          <Feature
            title="Make the columns the width you want"
            what="Every panel here can be resized, including the reader."
            doThis="Drag the seam between two panels. Double-click it to put it back; arrow keys move it too."
            then="The widths are remembered on this device, and bounded so nothing can be dragged into uselessness."
          />
          <Feature
            title="Search that knows what you are working on"
            what="Typing “setup” in the middle of a project should find that project's setup."
            doThis={
              <>
                <Mono>⌘K</Mono> with a note open.
              </>
            }
            then="Notes linked to the one you are in float to the top — both the ones you linked to and the ones that linked to you. A note actually called what you typed still wins."
          />
          <Item title="Export">
            <Mono>Export</Mono> in the header produces Markdown, PDF, HTML, Word or plain text.
            Everything is generated in your browser — the note is never uploaded anywhere to become
            a file.
          </Item>
        </Section>
      )}

      {tab === "papers" && (
        <Section>
          <Feature
            title="Read a paper in the notebook it belongs to"
            what="A PDF in your repository is part of the notebook, not an attachment to it."
            doThis={
              <>
                Click a <Mono>.pdf</Mono> in the sidebar, or drop one onto the window.
              </>
            }
            then="It opens in the middle column, with its own table of contents beside it. Drag the seam between them to give either more room."
          />
          <Feature
            title="Choose where PDFs open"
            what="Three different things people do with a document, so three answers."
            doThis={
              <>
                <Mono>⌘K</Mono> → <strong>Open PDFs in this window</strong>,{" "}
                <strong>beside the note</strong>, or <strong>in their own browser tab</strong>.
              </>
            }
            then="The one you pick is marked, and remembered on this device."
          />
          <Feature
            title="Quote a passage into a note"
            what="A citation that records the sentence, not just the page it was on."
            doThis={
              <>
                Select text in the document, then <strong>Quote into note</strong>.
              </>
            }
            then={
              <>
                A blockquote and an ordinary Markdown link —{" "}
                <Mono>[On Attention, p. 12](paper.pdf#page=12…)</Mono> — that renders on github.com
                and still finds the passage after the paper is revised.
              </>
            }
          />
          <Feature
            title="See everything you have written about a paper"
            what="Months later this list is the useful thing, not the paper."
            doThis={
              <>
                Open the document and choose the <strong>Notes</strong> tab beside it.
              </>
            }
            then="Every note quoting it, each with the passage it took and the page, in the document's own order. Click a passage to go to that page, or the note to open it."
          />
          <Feature
            title="Start a note from a paper"
            what="A page that already has the paper's shape, instead of a blank one."
            doThis={<strong>Write about this</strong>}
            then="A new note with the title, author and publication date filled in, and the paper's sections as headings — each linked to the page it starts on. The document moves aside and sits beside it."
          />
          <Feature
            title="Search inside your documents"
            what="The words in your papers, not only the words in your notes."
            doThis={
              <>
                <Mono>⌘K</Mono> and type a phrase.
              </>
            }
            then="Matches from every document you have opened, under Documents, with the sentence they were found in. Opening one goes straight to the page."
          />
          <Feature
            title="Keep the paper and the note on the same page"
            what="What people open two windows to fake: write about page 12, scroll the document to page 12, over and over."
            doThis={
              <>
                Read the document <strong>beside the note</strong>, in Split or Source view, with at
                least one passage already quoted. <Mono>⌘K</Mono> →{" "}
                <strong>Stop the document following the note</strong> switches it off.
              </>
            }
            then="Moving the cursor past a citation turns the document to that page; turning to a page scrolls the note to what you wrote about it. Your citations are the map, so nothing is guessed."
          />
          <Feature
            title="Send a passage to something that is not ForkLeaf"
            what="The citation format is a relative path plus a standard fragment, so other tools can follow it."
            doThis={
              <>
                Select a passage, then <strong>Copy link</strong>.
              </>
            }
            then={
              <>
                <Mono>papers/attention.pdf#page=12&amp;q=…</Mono> on the clipboard. Any PDF reader
                opens the right page; one that reads the quotation finds the right sentence even
                after the paper is revised.{" "}
                <DocLink href="/docs/citation-links">The format, written down</DocLink>.
              </>
            }
          />
          <Feature
            title="Keep a PDF from your desktop"
            what="A dropped file has no path in the repository, so nothing can link to it."
            doThis={<strong>Save to notebook</strong>}
            then={
              <>
                It is committed to a <Mono>papers/</Mono> folder beside your note, and its citations
                become real links.
              </>
            }
          />
        </Section>
      )}

      {tab === "diagrams" && (
        <Section>
          <Item title="Insert one">
            Press <Mono>/</Mono> and choose <strong>Diagram</strong>, or use{" "}
            <strong>Diagram</strong> on the toolbar. In rich text a diagram block appears; in Split
            or Source you get a <Mono>```mermaid</Mono> fence.
          </Item>
          <Item title="Choose a type">
            A new diagram opens the gallery: flowcharts, sequence diagrams, state machines, ER
            diagrams, Gantt charts, mind maps, pie charts, user journeys, timelines, git graphs and
            quadrant charts. Each card draws the shape it produces. Pick one and edit it — starting
            from something that already renders beats starting from an empty box.
          </Item>
          <Item title="Two ways to edit">
            <strong>Visual</strong> lets you drag boxes and draw arrows on a canvas — available for
            flowcharts. <strong>Source</strong> is the Mermaid text, with autocomplete, inline error
            messages that point at the offending line, and a <strong>Syntax help</strong> panel you
            can click snippets out of. Both write the same code, and the preview updates as you go.
          </Item>
          <Feature
            title="A box can be a note"
            what="Which turns a diagram into a map of the notebook rather than a picture of one."
            doThis={
              <>
                Put a wikilink in the label: <Mono>A[&quot;[[Deploy runbook]]&quot;]</Mono>. An
                alias works too — <Mono>[[deploy/runbook|The runbook]]</Mono>.
              </>
            }
            then={
              <>
                The box reads <strong>Deploy runbook</strong> and opens that note when clicked in
                the preview. It is still an ordinary Mermaid label, so the diagram renders on
                github.com exactly as before.
              </>
            }
          />
          <Item title="They are not locked in">
            A diagram is stored as an ordinary <Mono>```mermaid</Mono> code fence, so GitHub renders
            it natively when you view the file there, and so does anything else that speaks Mermaid.
          </Item>
        </Section>
      )}

      {tab === "checks" && (
        <Section>
          <Feature
            title="Are my quotations still true?"
            what="Every other tool stores a page number, which quietly stops being right when a paper is revised."
            doThis={
              <>
                <Mono>⌘K</Mono> → <strong>Check my citations against their documents</strong>
              </>
            }
            then="Which quotations moved to another page, which matched only loosely, and which are no longer in the document at all. A moved one can have its page number corrected in place, one press per citation."
          />
          <Feature
            title="What has gone stale?"
            what="Notes rot quietly. Nobody opens a note to find out that it did."
            doThis={
              <>
                <Mono>⌘K</Mono> → <strong>Check which of my notes have gone stale</strong>
              </>
            }
            then={
              <>
                Notes pointing at a file that is not in the repository, <Mono>[[links]]</Mono>{" "}
                matching no note, and datable claims nobody has looked at in years. Nothing is
                changed — <strong>It is fine</strong> hides one until the note is edited again.
              </>
            }
          />
          <Feature
            title="Let readers send corrections back"
            what="Programmers have had “here is a fix for what you wrote” for twenty years. Nobody has offered it to people writing notes."
            doThis={
              <>
                Publish a note. Every published page carries <strong>Suggest an edit</strong>; to
                see what has come in, <Mono>⌘K</Mono> →{" "}
                <strong>See what other people have suggested</strong>.
              </>
            }
            then="The reader fixes the note in GitHub's editor and their change arrives in your list. Read what changed on GitHub, and accept it here — the next sync brings it down to this device."
          />
          <Feature
            title="What did my notebook look like in March?"
            what="Not one note's history — the whole notebook, on a day you choose."
            doThis={
              <>
                <Mono>⌘K</Mono> → <strong>Show me my notebook as it was on…</strong>
              </>
            }
            then="The files that existed that day, and any of them readable as it stood. Read-only: nothing here can change what you have now."
          />
          <Feature
            title="Where did this paragraph come from?"
            what="When you wrote it, and — more usefully — what it said before."
            doThis={
              <>
                Properties panel → <strong>When each paragraph was written</strong>, then point at a
                paragraph.
              </>
            }
            then="The date it last changed, the commit and what else that commit touched, and the wording it replaced. Nothing is claimed for a paragraph that was added rather than rewritten."
          />
        </Section>
      )}

      {tab === "sync" && (
        <Section>
          <Item title="How saving actually works">
            Every keystroke goes to this browser first, which is why the editor works with no
            network. A background queue then pushes the changes to GitHub as commits. The status bar
            names both halves — “Saved locally · 2 to push” means nothing is lost, it just has not
            landed in the repo yet. <Mono>⌘S</Mono> pushes immediately instead of waiting.
          </Item>
          <Item title="Where your notes live on GitHub">
            {workspace && !workspace.isLocal ? (
              <>
                This workspace is the repository{" "}
                <Mono>
                  {workspace.repo.owner}/{workspace.repo.repo}
                </Mono>{" "}
                on branch <Mono>{workspace.repo.branch}</Mono>. Each note is one <Mono>.md</Mono>{" "}
                file in it, at the path shown in the status bar.
                <span className="mt-3 block">
                  To see how a note has changed, open <strong>Version history</strong> in the
                  properties panel on the right — the whole commit log, and any earlier version,
                  without leaving ForkLeaf. <strong>Replay how this was written</strong>, just below
                  it, plays through those revisions instead of listing them, and{" "}
                  <strong>When each paragraph was written</strong> puts the date each paragraph last
                  changed in the margin beside it.
                </span>
                <span className="mt-3 block">
                  Publishing commits a page to <Mono>docs/</Mono> in this repository by default. If
                  these notes are private, point publishing at a second public repository from the
                  publish dialog — the page becomes public, the notes do not.{" "}
                  <strong>Capture a web page as a source</strong> in the command palette writes an
                  address, the time you read it, and an archived copy into the note, so a source
                  that vanishes is still readable.
                </span>
                <span className="mt-3 block">
                  Write <Mono>[[repo:scripts/scan.sh]]</Mono> to link a note to a file in a
                  repository rather than to another note, with <Mono>@a1b2c3d</Mono> to pin the
                  revision you read. The <strong>Freshness</strong> panel then says when that file
                  has changed since — and weighs the claims in the note that expire against how long
                  since you touched it.
                </span>
                <span className="mt-3 block">
                  <strong>Review &amp; merge this note</strong> reads the pull request open on this
                  branch: every comment shown against the paragraph it was written about, with a
                  reply box on each, and a squash-merge once it is settled. Propose changes first to
                  open one.
                </span>
                <span className="mt-3 block">
                  Code blocks in <Mono>bash</Mono>, <Mono>python</Mono> or <Mono>javascript</Mono>{" "}
                  have a <strong>Run</strong> button. The output is written into the note under the
                  block and committed with it, so a runbook keeps its own results. Blocks run in a
                  throwaway virtual machine — never on your computer — which is destroyed as soon as
                  the run finishes.
                </span>
                <span className="mt-3 block">
                  You can also clone it. <Mono>git clone</Mono> the repository and every note is
                  there as plain Markdown.
                </span>
              </>
            ) : (
              <>
                Nothing is on GitHub yet — this workspace is local to this browser. Sign in, choose
                a repository, and ForkLeaf commits each note to it as a plain <Mono>.md</Mono> file
                you can read, clone or edit anywhere.
              </>
            )}
          </Item>
          <Feature
            title="When an image is too big to send"
            what="GitHub will not take more than about 3 MB in one request. The picture is fine; there is just more of it than the wire will carry."
            doThis={
              <>
                Click the sync status in the bar at the bottom, then <strong>Resize</strong> beside
                the file — as large as will still send, 1 MB, or 500 KB.
              </>
            }
            then={
              <>
                It is re-encoded in the same format, replaces the copy on this device, and is pushed
                again. <strong>Remove</strong> is still there, and now also takes the image out of
                the notes that showed it, so nothing is left pointing at a file that has gone.
              </>
            }
          />
          <Item title="Working across devices">
            Sign in with the same GitHub account on another machine and ForkLeaf pulls the
            repository down. Both devices commit to the same branch.
          </Item>
          <Item title="If two devices edit the same note">
            ForkLeaf detects it and shows you both versions rather than picking one silently. You
            choose: keep yours, keep the remote one, or keep both as separate files.
          </Item>
          <Item title="What ForkLeaf can see">
            Your GitHub token is encrypted into an httpOnly cookie that only the server can open —
            no script on the page can read it, and it is never put in a URL. There is no ForkLeaf
            database holding your notes.{" "}
            <DocLink href="/docs/security">Read the security model</DocLink>.
          </Item>
        </Section>
      )}

      {tab === "keys" && (
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {[
            ["⌘K / Ctrl+K", "Search every note, or run any command"],
            ["/", "Open the insert menu"],
            ["⌘S / Ctrl+S", "Push to GitHub now"],
            ["⌘⇧N", "New note"],
            ["⌘⇧D", "Go to the dashboard"],
            ["⌘⇧E", "Export the current note"],
            ["⌘1 / ⌘2 / ⌘3", "Rich, split and source views"],
            ["⌘\\", "Show or hide the sidebar"],
            ["⌘B / ⌘I", "Bold / italic (rich text)"],
            ["⌘Z / ⌘⇧Z", "Undo / redo"],
            ["Tab", "Indent (source view)"],
            ["⌘⇧?", "This dialog"],
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

      {/* "Still stuck?" used to end at the documentation, which is only an
          answer when the documentation has one. Somebody reading this line has
          usually already looked. */}
      <p className="mt-6 border-t border-[var(--fl-border)] pt-4 text-[13px] leading-relaxed text-[var(--fl-muted)]">
        Still stuck? The <DocLink href="/docs">full documentation</DocLink> goes into much more
        depth, and <DocLink href="/support">support</DocLink> is a real inbox — write to{" "}
        <a href={SUPPORT_MAILTO} className="text-[var(--fl-accent)] underline underline-offset-2">
          {SUPPORT_EMAIL}
        </a>{" "}
        with what happened and what you expected.
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

/**
 * One feature, in three beats: what it is, what to do, what happens.
 *
 * The shape exists because a paragraph of prose about a feature is a paragraph
 * people skim and then still do not know which button to press. Somebody
 * opening help has one question — "how do I do the thing?" — and the answer is
 * a command name and a sentence about the result. Anything longer belongs in
 * the documentation, which is linked at the bottom of every tab.
 */
function Feature({
  title,
  what,
  doThis,
  then,
}: {
  title: string;
  what: React.ReactNode;
  /** The exact words on the button or in the palette, so it can be found. */
  doThis: React.ReactNode;
  then: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--fl-border)] px-3 py-2.5">
      <h3 className="text-[14px] font-semibold text-[var(--fl-text)]">{title}</h3>
      <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--fl-muted)]">{what}</p>

      <dl className="mt-2 grid grid-cols-[3.75rem_1fr] gap-x-3 gap-y-1">
        <dt className="pt-[3px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--fl-muted)]">
          Do
        </dt>
        <dd className="text-[13px] leading-relaxed text-[var(--fl-text)]">{doThis}</dd>

        <dt className="pt-[3px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--fl-muted)]">
          You get
        </dt>
        <dd className="text-[13px] leading-relaxed text-[var(--fl-muted)]">{then}</dd>
      </dl>
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
