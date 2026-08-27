import { Code, H2, H3, Lead, LI, Note, P, Table, UL } from "@/components/prose";

/**
 * Reading a note, as opposed to writing one.
 *
 * The rest of the documentation is about getting text in. This page is about
 * everything that happens once it is there and you are looking at it: links
 * that open, a card that says where they go, files read in place, and a lock
 * that stops your hands changing what you came to read.
 */
export function Reading() {
  return (
    <>
      <Lead>
        A notebook is read far more often than it is written. This page covers what a note does when
        you are reading it: following links, seeing where they go before you commit to them, opening
        a linked file, and locking a note so that reading it cannot change it.
      </Lead>

      <H2 id="links">Opening a link</H2>
      <P>
        Click it. Links always open in a new tab, from the preview and from Rich view alike — the
        alternative is navigating away from a note that may hold writing which has not reached
        GitHub yet.
      </P>

      <Table
        head={["Where you are", "Click", "Alt-click", "⌘ / Ctrl-click"]}
        rows={[
          [
            "Rich view",
            "Opens the link in a new tab",
            "Puts the cursor in the link text",
            "Opens the link in a new tab",
          ],
          [
            "Split & Source (preview side)",
            "Opens the link in a new tab",
            "—",
            "Opens the link in a new tab",
          ],
          ["Source (markdown side)", "The address is plain text; edit it as text", "—", "—"],
        ]}
      />

      <P>
        Alt-click is how you edit a link&rsquo;s text in Rich view. It takes the modifier rather
        than the plain click because a link gets followed a great many times for every time its
        wording is changed — and in Source view the markdown is plain text you edit like any other.
      </P>

      <H3 id="wikilinks">Links to your own notes</H3>
      <P>
        A <Code>[[wikilink]]</Code> opens the note it names in a tab here, rather than in the
        browser. If no note of that name exists yet, clicking it writes one — linking ahead of
        yourself is how an outline gets built.
      </P>

      <H2 id="hover">The hover card</H2>
      <P>Rest the pointer on a link for a moment and a small card appears with:</P>
      <UL>
        <LI>
          the host — <Code>github.com</Code>, <Code>builtwith.com</Code>;
        </LI>
        <LI>the page&rsquo;s own title;</LI>
        <LI>its own one-line description of itself, when it publishes one;</LI>
        <LI>the picture it offers of itself, when it has one;</LI>
        <LI>the full address, so you can see where you are actually going.</LI>
      </UL>
      <P>
        The card stays while the pointer is on it, so the address can be selected and copied. Escape
        closes it, and it closes by itself when the note scrolls.
      </P>

      <Note>
        <strong>Nothing in the card is loaded from the site you are hovering.</strong> The page is
        read by ForkLeaf&rsquo;s own server, and even the picture is fetched by the server and
        served back from this origin. Hovering a link in your private notes does not tell the other
        end that you did — no request, no referrer, no address. That is also why the card needs you
        to be signed in: the reading is done server-side. Signed out, the card still names the host
        and the full address.
      </Note>

      <P>
        A page that cannot be read — offline, blocked, an address inside a private network — still
        gets a card with its host and address. Addresses that resolve inside a private network are
        refused outright, which is why a link to something on your own machine or an intranet shows
        no title.
      </P>

      <H2 id="repo-files">Reading a linked file</H2>
      <P>
        A <Code>[[repo:path/to/file]]</Code> link names a file in the repository rather than a note.
        Clicking one opens the file for reading without leaving the note:
      </P>
      <UL>
        <LI>Markdown renders as markdown; everything else is shown as highlighted source.</LI>
        <LI>Images are shown as images.</LI>
        <LI>
          It opens at the revision the link pinned — <Code>@a1b2c3d</Code> — not at whatever the
          branch holds now. That is the point: a link that reports itself stale has to be able to
          show you what the note was actually written about.
        </LI>
        <LI>
          <strong>Open on GitHub</strong> is there for the rest — history, blame, editing.
        </LI>
      </UL>
      <P>
        The file names listed under <strong>Freshness</strong> in the properties panel open the same
        viewer.
      </P>

      <H2 id="locking">Locking a note</H2>
      <P>
        A reference note is one you read far more often than you write. Reading it means clicking
        around in it, which leaves the cursor somewhere in the text — and from there a stray
        keystroke is an edit that saves itself, commits itself, and is found weeks later as a lone
        character in the middle of a paragraph.
      </P>
      <P>
        The padlock in the editor header locks the note on screen. <Code>⌘⇧L</Code> does the same,
        and so does <strong>Lock this note against editing</strong> in the command palette.
      </P>

      <H3 id="locking-what">What a lock stops</H3>
      <UL>
        <LI>Typing, in all three views.</LI>
        <LI>The formatting bar, which disappears rather than sitting there greyed out.</LI>
        <LI>
          The <Code>/</Code> menu, and every toolbar action that would write to the note.
        </LI>
        <LI>Pasting or dropping an image.</LI>
        <LI>Undo and redo.</LI>
        <LI>The properties panel — title, tags and custom fields are all disabled.</LI>
        <LI>Adding a linked file or a captured source, which say so rather than doing nothing.</LI>
        <LI>The automatic repair pass that fixes image links when a note opens.</LI>
      </UL>

      <H3 id="locking-what-not">What it does not stop</H3>
      <UL>
        <LI>
          Reading, selecting and copying — the whole point. Links still open, diagrams still render.
        </LI>
        <LI>
          Changes arriving from GitHub. A colleague&rsquo;s commit still lands: the lock is about
          your hands, not about freezing the file.
        </LI>
        <LI>
          Renaming or deleting the note. Both are deliberate acts behind their own confirmation, and
          a lock carries across a rename rather than falling off.
        </LI>
        <LI>Editing the same note somewhere else. The lock is remembered on this device only.</LI>
      </UL>

      <Note>
        Locks are per device and per workspace, kept beside your other preferences rather than in
        the note itself. Writing them into the file would mean a commit every time anybody locked or
        unlocked anything — history nobody asked for, from a button whose whole job is to prevent
        changes nobody asked for. They survive a reload, and a locked note that is renamed stays
        locked.
      </Note>
    </>
  );
}
