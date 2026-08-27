import { Code, H2, H3, Lead, LI, Note, OL, P, Pre, UL } from "@/components/prose";

/**
 * How to actually use the eight features that use git for something.
 *
 * A separate page because they share a shape: each one uses the fact that
 * every note is a commit in a repository you own, and each one is invisible
 * until somebody tells you where the button is. The rest of the docs describe
 * what the app is; this one is a set of instructions.
 */
export function Features() {
  return (
    <>
      <Lead>
        Eight things ForkLeaf can do because your notes are commits in a repository you own. Each
        one below says exactly where the button is.
      </Lead>

      <Note>
        Everything on this page except capturing a page needs a connected GitHub repository, and
        most need a note with more than one commit — there is no history to read on a note you saved
        once. Sign in and edit a note a few times before trying them.
      </Note>

      <H2 id="history">1–3. History, replay, and who wrote what</H2>
      <P>
        Open the <strong>properties panel</strong> (the panel toggle at the top right of the
        editor), find <strong>History, replay &amp; who wrote what</strong>, and click it. One
        window, three tabs across the top:
      </P>
      <UL>
        <LI>
          <strong>Changes</strong> — every commit that has touched this note, and a side-by-side
          diff of any two. <strong>Restore this version</strong> writes an old version back as a new
          commit, so nothing is lost.
        </LI>
        <LI>
          <strong>Replay</strong> — a scrubber. Drag it and the note types and untypes itself
          through its real revisions. The chart underneath is its length over time, so you can see
          where you wrote in bursts and where you deleted a section.
        </LI>
        <LI>
          <strong>Who wrote what</strong> — every paragraph with its date in the margin, shaded by
          age. Point at a paragraph and a card names the commit, the author, and what else that
          commit changed that day. That last part is the useful one: it turns &ldquo;12 March&rdquo;
          into &ldquo;the day I was doing the AD engagement&rdquo;.
        </LI>
      </UL>
      <P>
        In the command palette (<Code>⌘K</Code> / <Code>Ctrl-K</Code>) each tab has its own entry —
        type <Code>replay</Code>, <Code>blame</Code> or <Code>history</Code> to open straight onto
        it.
      </P>

      <H2 id="run">4. Running a code block</H2>
      <P>
        Write a fenced block and set its language to <Code>bash</Code>, <Code>python</Code> or{" "}
        <Code>javascript</Code> — either type the language after the opening fence, or pick it from
        the dropdown on the block itself. A <strong>Run</strong> button appears in the block&rsquo;s
        header.
      </P>
      <P>
        Press it. The output is written into an <Code>output</Code> block directly underneath,
        stamped with when it ran, and committed with the note like any other edit:
      </P>
      <Pre label="in your note">{`\`\`\`python
print("hello world")
\`\`\`

\`\`\`output
— ran 2026-08-27 11:09 UTC · ok · 34ms
hello world
\`\`\``}</Pre>
      <P>
        Running it again replaces that block rather than adding another. The old results are in the
        commit history, which is where history belongs.
      </P>
      <H3>Where the code runs</H3>
      <P>
        In a throwaway virtual machine that is created for the one run and destroyed afterwards —
        never on your computer, and never on the server. It does have internet access, because a
        runbook that cannot reach the host it is about is a text file.
      </P>
      <Note>
        This needs a sandbox to be configured. On your own machine, set <Code>VERCEL_TOKEN</Code>,{" "}
        <Code>VERCEL_TEAM_ID</Code> and <Code>VERCEL_PROJECT_ID</Code> in{" "}
        <Code>apps/web/.env.local</Code>. On a deployment, set the same three in your hosting
        project&rsquo;s environment variables — a local <Code>.env.local</Code> never reaches a
        deployment. Without them, the Run button says so rather than failing quietly.
      </Note>

      <H2 id="review">5. Reviewing a note as a pull request</H2>
      <OL>
        <LI>
          Write something, then open <strong>Propose changes</strong> in the properties panel. That
          puts your edits on a branch and opens a pull request.
        </LI>
        <LI>Have someone comment on it — on github.com, or yourself, or a bot.</LI>
        <LI>
          Back in ForkLeaf, open <strong>Review &amp; merge this note</strong> in the properties
          panel.
        </LI>
      </OL>
      <P>
        Each comment appears against <em>the paragraph it was written about</em>, quoted, with a
        reply box. When it is settled, <strong>Squash and merge</strong> lands it as a single commit
        and puts you back on the main branch.
      </P>
      <P>
        If the branch you are on has no pull request open, the panel says so rather than looking
        broken.
      </P>

      <H2 id="repo-links">6. Linking a note to a file</H2>
      <P>
        A note describing a script and the script itself drift apart silently. Linking them means
        the note can tell you when the file has moved on.
      </P>
      <P>
        In the properties panel, click <strong>Link a file from this repository</strong>. Filter,
        click a file, done — the link is inserted and the file&rsquo;s current revision is recorded
        for you:
      </P>
      <Pre label="what gets inserted">{`[[repo:scripts/scan.sh@a1b2c3d]]`}</Pre>
      <P>
        You can write one by hand if you prefer — <Code>[[repo:path/to/file]]</Code> for this
        repository, <Code>[[repo:owner/name:path/to/file]]</Code> for another — but the picker is
        there because the <Code>@a1b2c3d</Code> part is a commit you have no way of knowing while
        writing, and it is the half that makes the feature work.
      </P>
      <P>
        Afterwards, the <strong>Freshness</strong> section of the properties panel lists the files
        this note links to and whether each has changed since.
      </P>

      <H2 id="freshness">7. Finding notes that have gone off</H2>
      <P>
        The <strong>Freshness</strong> section appears in the properties panel on its own. It weighs
        what the note claims — version numbers, CVEs, dates, sentences hanging on the word
        &ldquo;currently&rdquo; — against how long it has been since you touched it, and against any
        linked file that has changed.
      </P>
      <P>
        It never says a note is wrong. It says it is worth re-reading, and always shows why, so you
        can disagree at a glance. A note with nothing datable in it is never called stale however
        old it is: prose about how you think does not expire.
      </P>

      <H2 id="publish">8. Publishing a page from private notes</H2>
      <P>
        Publishing renders a note to a single self-contained HTML page, commits it to a{" "}
        <Code>docs/</Code> folder, and lets GitHub Pages serve it. Open{" "}
        <strong>Publish as a page</strong> in the properties panel.
      </P>
      <H3>If your notes repository is private</H3>
      <P>
        GitHub will not serve Pages from a private repository on a free plan. Nothing in ForkLeaf
        can change that — but it can publish somewhere else. In the publish dialog, under{" "}
        <strong>Pages go to</strong>:
      </P>
      <UL>
        <LI>
          Click <strong>Create …-site and publish there</strong>. ForkLeaf makes a public repository
          named after your notes repository and points publishing at it. One click.
        </LI>
        <LI>
          Or click <strong>Use another repository</strong> and type the <Code>owner/name</Code> of a
          public repository you already have.
        </LI>
      </UL>
      <P>
        Your notes stay in the private repository. Only the rendered page is public. Leave the box
        empty to go back to publishing alongside your notes.
      </P>

      <H2 id="capture">9. Capturing a web page as a source</H2>
      <P>
        A note that cites a page has a hole in it waiting to open: the page moves, the site is sold,
        the post is deleted, and the citation becomes a dead link that still looks sourced.
      </P>
      <OL>
        <LI>
          Properties panel → <strong>Capture a web page as a source</strong>.
        </LI>
        <LI>
          Paste the address and press <strong>Capture</strong>.
        </LI>
        <LI>
          It shows what it found — the page title, and whether the Wayback Machine has an archived
          copy and how old it is.
        </LI>
        <LI>
          Press <strong>Add to this note</strong>.
        </LI>
      </OL>
      <P>The citation is written at the end of the note as an ordinary blockquote:</P>
      <Pre label="in your note">{`> **Source** — [The article](https://example.com/article)
> Read 2026-08-27 10:04 UTC · [archived copy](https://web.archive.org/…) from 2024-03-15 12:00 UTC`}</Pre>
      <P>
        If there is no archived copy, the citation says so rather than staying quiet — you should
        know that link may not outlive the page.
      </P>
      <Note>
        Capturing needs you to be signed in, because the fetch happens on the server. It refuses
        addresses that resolve inside a private network, which is why it cannot capture a page on
        your own machine or an intranet.
      </Note>
    </>
  );
}
