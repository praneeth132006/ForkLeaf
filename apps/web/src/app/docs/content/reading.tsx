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
        a linked file, reading a PDF beside the note you are writing from it, and locking a note so
        that reading it cannot change it.
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

      <H2 id="pdf">Reading a PDF</H2>
      <P>
        ForkLeaf opens PDFs. Not as an attachment or a download — as a document beside the note you
        are writing from it, with the passages you quote linked back to the exact words on the page.
      </P>

      <H3 id="pdf-open">Four ways in</H3>
      <UL>
        <LI>
          <strong>The document button</strong> beside <strong>New Note</strong> in the sidebar, or{" "}
          <strong>Open a PDF…</strong> in the command palette (<Code>⌘K</Code>). Chromium browsers
          only — Firefox and Safari have no file picker ForkLeaf can use, which is why the next one
          exists.
        </LI>
        <LI>
          <strong>Drag one onto the window.</strong> Works in every browser.
        </LI>
        <LI>
          <strong>Click one in the sidebar.</strong> A PDF committed to your repository sits in the
          file tree beside your notes, and clicking it opens the reader rather than trying to edit
          it as text.
        </LI>
        <LI>
          <strong>Click a link to one in a note.</strong> An ordinary markdown link —{" "}
          <Code>[the paper](papers/attention.pdf)</Code> — opens the reader instead of navigating
          away from what you were writing.
        </LI>
      </UL>
      <P>
        Install ForkLeaf and <Code>.pdf</Code> joins <Code>.md</Code> in your operating
        system&rsquo;s <strong>Open with</strong> list. ForkLeaf does not make itself your default
        PDF viewer and should not; that is your setting to make.
      </P>

      <H3 id="pdf-where">A tab, or beside the note</H3>
      <P>
        A PDF from your repository opens in a <strong>tab of its own</strong>, because a typeset
        page squeezed into half a laptop screen is not a width anybody reads a book at. That tab is
        a real link: bookmark it, open two of them side by side, or send it to somebody with access
        to the same repository and it opens on the same page.
      </P>
      <P>
        When you are writing <em>from</em> a document rather than reading it, you want both at once.
        Two ways to get that:
      </P>
      <UL>
        <LI>
          <strong>Open beside this note</strong> from the right-click menu on a PDF in the sidebar —
          just this once.
        </LI>
        <LI>
          <strong>Open PDFs beside the note instead</strong> in the command palette — from now on.
          The setting is remembered on this device, and <strong>Open in tab</strong> in the
          reader&rsquo;s own header gives the room back when you want it.
        </LI>
      </UL>
      <P>
        The reader tab has no note to write into, so selecting a passage there offers{" "}
        <strong>Copy quotation</strong> instead: the same markdown the panel would have inserted,
        ready to paste into whichever note you want it in.
      </P>

      <H3 id="pdf-save">Keeping a PDF in your notebook</H3>
      <P>
        A PDF dragged in from your desktop can be read and quoted, but the quotation cannot{" "}
        <em>link</em> back to it — there is no path in your repository for a link to point at, so it
        gets a plain attribution instead. <strong>Save to notebook</strong> in the reader&rsquo;s
        header commits the file into a <Code>papers/</Code> folder beside the note you are reading
        it with, exactly as an image is filed beside the note that uses it. Every citation of it
        becomes a real link from then on.
      </P>
      <P>
        ForkLeaf can read a document far larger than it can save one. A commit from the browser
        carries the file as text inside a request the host caps at a few megabytes, so anything over
        3 MB can be read all day and cannot be committed — the reader says so rather than letting
        the save fail.
      </P>

      <H3 id="pdf-reader">In the reader</H3>
      <Table
        head={["", "What it does"]}
        rows={[
          [
            "Contents",
            "The document's own bookmarks, with page numbers. The heading you are currently under is shown beside the page count.",
          ],
          [
            "Find",
            "Searches the whole document, not the page. Matches across line breaks, through hyphenation, and through the ligatures a typesetter left in — so “find” matches a page that really contains “ﬁnd”.",
          ],
          ["Fit", "Fits the page to the panel. Zooming by hand turns it off and leaves it off."],
          [
            "Page box",
            "Type a number and press Enter. Page Up, Page Down and the arrow keys turn pages.",
          ],
        ]}
      />

      <H3 id="pdf-cite">Quoting into a note</H3>
      <P>
        Select a passage and the reader offers <strong>Quote into note</strong>. What lands in the
        note is a blockquote and a link, and nothing else:
      </P>
      <P>
        <Code>
          &gt; The key result is that latency fell by half.
          <br />
          &gt;
          <br />
          &gt; — [On Attention, p. 12](papers/attention.pdf#page=12&amp;q=…)
        </Code>
      </P>
      <P>
        That is a plain markdown link. It renders on github.com, it opens page 12 in Acrobat, in
        Preview and in your browser&rsquo;s own viewer — <Code>#page=</Code> is the parameter every
        PDF reader has understood since 2003 — and in ForkLeaf it does something more.
      </P>

      <H3 id="pdf-anchors">Why the link carries the sentence</H3>
      <P>
        A citation that records only a page number is wrong the moment the document changes. Add a
        figure to page 4 of a paper and every reference to page 12 now points at page 13 — silently,
        because the link still opens.
      </P>
      <P>
        So a ForkLeaf citation records the <em>words</em>, with the page number kept only as a hint
        about where to start looking. Clicking one searches the document for that passage, uses the
        text either side of it to tell two occurrences apart, and opens the page it is actually on
        with the sentence highlighted. If the passage has genuinely gone, you are told — rather than
        being shown whatever happens to be on page 12 now.
      </P>
      <P>
        The <Code>q=</Code>, <Code>pre=</Code> and <Code>suf=</Code> parameters are how that is
        carried, and any tool that does not understand them ignores them and still lands on the
        right page.
      </P>

      <Note>
        ForkLeaf reads PDFs and does not write them. It will not annotate, sign or fill one in: the
        file in your repository stays exactly as it was committed, and everything you add lives in
        markdown next to it — which is the only form in which your annotations are still readable in
        ten years, by something other than ForkLeaf. A PDF opened from your own disk rather than
        from the repository is quoted with a plain attribution instead of a link, because a link to
        a path on one computer is a broken link everywhere else.
      </Note>

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
