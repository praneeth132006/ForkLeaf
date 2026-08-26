import { A, Code, Def, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";

export function GettingStarted() {
  return (
    <>
      <Lead>
        ForkLeaf works with no account, no install and no configuration. This page takes you from an
        empty editor to notes committed in your own GitHub repository, and explains what is
        happening at each step so nothing about your writing is a mystery.
      </Lead>

      <H2 id="write">1. Write something</H2>
      <P>
        Open <A href="/editor">the editor</A> and press <Code>New note</Code>. You are typing
        immediately — there is no sign-up wall, because at this point ForkLeaf is not talking to any
        server at all.
      </P>
      <P>
        Everything you type is saved to this browser&rsquo;s IndexedDB within a few hundred
        milliseconds. The status bar along the bottom of the window tells you so:{" "}
        <Code>Saved on this device</Code>. Close the tab, kill the browser, lose power — the note is
        still there when you come back.
      </P>
      <Note kind="warn">
        <strong>Browser storage is not a backup.</strong> Clearing site data, using a private
        window, or an aggressive &ldquo;clean up storage&rdquo; setting will delete notes that have
        never been pushed to GitHub. That is the entire reason for step 2.
      </Note>

      <H2 id="sign-in">2. Sign in with GitHub</H2>
      <P>
        Press <strong>Continue with GitHub</strong> — in the sidebar, in the banner at the top of
        the editor, or on the landing page. GitHub asks you to authorise ForkLeaf, and you land back
        in the editor.
      </P>
      <P>Three things happen on that first sign-in:</P>
      <OL>
        <li>
          Your access token is encrypted into an <Code>httpOnly</Code> cookie. It is never sent to
          the browser as readable JavaScript and never appears in a URL.
        </li>
        <li>
          You land on the dashboard and are asked where your notes should live. Nothing is created
          on your account until you choose — connect a repository you already have, or have one
          created for you.
        </li>
        <li>
          Anything you wrote before signing in stays where it is, in local storage, under the{" "}
          <strong>On this device</strong> workspace. It is not silently uploaded — moving it is your
          call.
        </li>
      </OL>
      <P>
        Full detail on the permissions ForkLeaf asks for and why is in{" "}
        <A href="/docs/signing-in">Signing in</A>.
      </P>

      <H2 id="see-it">3. See your notes on GitHub</H2>
      <P>
        This is the part worth checking straight away, because it is the whole premise of the app.
        Every note has links out to the real thing:
      </P>
      <UL>
        <LI>
          <strong>View notes on GitHub</strong> — bottom of the sidebar. Opens the repository.
        </LI>
        <LI>
          <strong>Open on GitHub</strong> — properties panel on the right, and the GitHub icon in
          the header. Opens the current note as a file, rendered by GitHub. Your Mermaid diagrams
          render there too, because they are stored as ordinary <Code>```mermaid</Code> fences.
        </LI>
        <LI>
          <strong>Version history</strong> — properties panel. Every commit that has ever touched
          this note.
        </LI>
        <LI>
          <strong>When each paragraph was written</strong> — properties panel. Every paragraph with
          its date in the margin, shaded by age, and the commit behind whichever one you point at —
          including what else you changed that day. <Code>git blame</Code>, for prose: the answer to
          &ldquo;when did I learn this, and do I still believe it?&rdquo;
        </LI>
        <LI>
          <strong>Replay how this was written</strong> — properties panel, right below it. A chart
          of the note&rsquo;s word count across every revision, and a scrubber that plays through
          them. Useful for the question a commit list cannot answer: whether this page arrived in
          one sitting or was assembled over a year.
        </LI>
      </UL>
      <P>You can also just clone it. Nothing about a ForkLeaf repository is special:</P>
      <Pre label="terminal">{`git clone https://github.com/you/forkleaf-notes.git
cd forkleaf-notes
ls
# README.md  architecture/  meetings/  reading-list.md`}</Pre>

      <H2 id="learn-the-editor">4. Learn the two things worth knowing</H2>
      <H3>The slash key</H3>
      <P>
        Type <Code>/</Code> on an empty line and a menu opens: headings, lists, tables, code blocks,
        images, and diagrams. This works in <strong>all three views</strong> — rich text, split and
        source. If you would rather click, the <strong>Insert</strong> button on the toolbar has the
        same list.
      </P>
      <H3>The three views</H3>
      <Table
        head={["View", "What you see", "Good for"]}
        rows={[
          [
            <strong key="r">Rich</strong>,
            "Formatted text, formatted as you type",
            "Drafting prose, meeting notes, anything you want to read while writing",
          ],
          [
            <strong key="s">Split</strong>,
            "Raw Markdown on the left, live preview on the right",
            "Tables, complex nesting, and checking exactly what will be committed",
          ],
          [
            <strong key="o">Source</strong>,
            "Raw Markdown only",
            "Editing a README or a file that came from somewhere else",
          ],
        ]}
      />
      <P>
        Switching views never rewrites the file. All three are windows onto the same Markdown
        string, which matters when that string is a commit in your repository.
      </P>

      <H2 id="next">Where to go next</H2>
      <UL>
        <LI>
          <A href="/docs/how-it-works">How ForkLeaf works</A> — the architecture, in one page.
        </LI>
        <LI>
          <A href="/docs/diagrams">Diagrams</A> — the part people underuse.
        </LI>
        <LI>
          <A href="/docs/sync">Syncing &amp; commits</A> — what the status bar is telling you.
        </LI>
      </UL>
    </>
  );
}

export function HowItWorks() {
  return (
    <>
      <Lead>
        ForkLeaf has an unusual shape for a notes app: there is no notes database. This page
        explains what there is instead, and what follows from that.
      </Lead>

      <H2 id="shape">The shape of the thing</H2>
      <Pre>{`Your browser                          Our server              GitHub
────────────                          ──────────              ──────
[ editor ]                            [ session cookie ]      [ your repo ]
    │                                        │                      │
    ├──► IndexedDB  (source of truth,        │                      │
    │      instant, offline)                 │                      │
    │                                        │                      │
    └──► sync queue ──► /api/gh/* ──────────►│──► GitHub API ──────►│
                        (adds your token,        commits             .md files
                         never returns it)`}</Pre>
      <P>
        Notes live in two places: IndexedDB in your browser, and files in your GitHub repository.
        There is no third copy on a ForkLeaf server. The server exists only to hold your encrypted
        session cookie and to proxy calls to GitHub with the token attached.
      </P>

      <H2 id="local-first">Local-first, not offline-mode</H2>
      <P>
        &ldquo;Offline mode&rdquo; usually means an app degrades when the network drops. ForkLeaf is
        the other way round: the local copy is always the one you are editing, and the network is a
        background job that catches the repository up.
      </P>
      <Def term="Every keystroke goes to IndexedDB first">
        Debounced by a few hundred milliseconds, then written. This is why the editor never blocks
        on a request, and why a flaky connection cannot lose a sentence.
      </Def>
      <Def term="Changes queue as intents, not snapshots">
        The queue holds &ldquo;this path changed, here is the new content, here is the SHA it was
        based on&rdquo;. Repeated edits to one note collapse into one pending change instead of
        stacking up.
      </Def>
      <Def term="The queue drains when it can">
        On reconnect, on a timer, or immediately when you press <Code>⌘S</Code>. A failed push
        leaves the change in the queue and says so in the status bar.
      </Def>

      <H2 id="commits">Why commits, specifically</H2>
      <P>
        A note could have been stored as a row in a table. Storing it as a file in a git repository
        buys several things that are hard to add later:
      </P>
      <UL>
        <LI>
          <strong>Version history you already trust.</strong> Not a bespoke &ldquo;note
          history&rdquo; feature — actual commits, with diffs, that you can revert with{" "}
          <Code>git revert</Code>.
        </LI>
        <LI>
          <strong>Storage that is not ours to meter.</strong> GitHub is already hosting the files,
          which is why there is no storage tier to buy.
        </LI>
        <LI>
          <strong>An exit that costs nothing.</strong> <Code>git clone</Code> and you have
          everything, in a format every other Markdown tool reads.
        </LI>
        <LI>
          <strong>Interoperability by default.</strong> The same file renders on github.com, opens
          in Obsidian, and builds in Hugo or Jekyll.
        </LI>
      </UL>
      <P>
        Multi-file operations go through GitHub&rsquo;s tree API as a single atomic commit, so
        renaming a note — which is a delete plus a create — can never half-apply.
      </P>

      <H2 id="packages">How the code is arranged</H2>
      <P>
        ForkLeaf is a pnpm monorepo. Each package has one job and no knowledge of the UI, which is
        what keeps the sync logic testable without a browser.
      </P>
      <Table
        head={["Package", "Responsibility"]}
        rows={[
          [<Code key="a">@forkleaf/types</Code>, "The shared domain model. No logic."],
          [
            <Code key="b">@forkleaf/markdown-engine</Code>,
            "Front matter, parsing, sanitised rendering, path helpers, document stats.",
          ],
          [
            <Code key="c">@forkleaf/github-client</Code>,
            "The GitHub REST client: trees, file reads, atomic multi-file commits, commit squashing.",
          ],
          [
            <Code key="d">@forkleaf/store</Code>,
            "IndexedDB storage, the change queue, the sync engine, and conflict detection.",
          ],
          [
            <Code key="e">@forkleaf/diagrams</Code>,
            "Mermaid rendering, the graph model behind the visual builder, templates, error mapping.",
          ],
          [
            <Code key="f">@forkleaf/editor</Code>,
            "The editing surfaces: Tiptap for rich text, CodeMirror for source, and the diagram studio.",
          ],
          [<Code key="g">@forkleaf/exporter</Code>, "Markdown, HTML, Word and PDF generation."],
          [
            <Code key="h">apps/web</Code>,
            "The Next.js application: routes, API proxy, and chrome.",
          ],
        ]}
      />

      <H2 id="not">What ForkLeaf deliberately does not do</H2>
      <P>Being clear about this is more useful than a longer feature list.</P>
      <UL>
        <LI>
          <strong>Real-time collaborative editing.</strong> Two cursors in one document needs a
          server holding shared state, which is exactly the thing this design does not have.
          Concurrent edits are handled as conflicts, not merged live.
        </LI>
        <LI>
          <strong>Server-side rendering of your notes.</strong> Exports run in your browser. Nothing
          is uploaded to be turned into a PDF.
        </LI>
        <LI>
          <strong>Storing your notes.</strong> There is no table to leak.
        </LI>
      </UL>
    </>
  );
}
