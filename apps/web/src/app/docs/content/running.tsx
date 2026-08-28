import { A, Code, Def, H2, Lead, P } from "@/components/prose";

/**
 * What is left of the operations pages: the errors people hit, and the
 * questions they ask.
 *
 * The deployment guides that used to live here — self-hosting, environment
 * variables, OAuth app registration, Firebase setup — are gone on purpose.
 * They were a runbook for this deployment published on this deployment: they
 * named the variables that hold its secrets, the account it runs under, and the
 * shape of its configuration, none of which is any use to somebody writing
 * notes and all of which is useful to somebody attacking it. What a reader
 * needs from this section is what an error means and what to do next.
 */

export function Troubleshooting() {
  return (
    <>
      <Lead>The errors people actually hit, and what each one means.</Lead>

      <H2 id="sign-in">Signing in</H2>
      <Def term="“That sign-in link expired or did not match”">
        The sign-in round trip took too long, or it was started in one browser and finished in
        another. Start again from the app; the link is single-use and only good for ten minutes.
      </Def>
      <Def term="“Could not complete sign-in with GitHub”">
        GitHub did not complete the exchange. Try once more from{" "}
        <A href="/sign-in">the sign-in page</A>; if it keeps happening, check whether you have
        revoked ForkLeaf&rsquo;s access at{" "}
        <A href="https://github.com/settings/applications">GitHub → Applications</A>.
      </Def>
      <Def term="“Your GitHub sign-in has expired”">
        The sign-in ended — the authorisation was revoked, the same account was signed in elsewhere
        at a different access level, or the browser has been away for longer than the session lasts.
        Press <strong>Sign in again</strong>; your notes and anything queued to push are on this
        device and are waiting for you. <A href="/docs/signing-in">Signing in</A>.
      </Def>
      <Def term="Signed in, but images in a note will not load">
        The same expired sign-in — a note&rsquo;s pictures are fetched from your repository with the
        same credentials the rest of the app uses. Sign in again and they come back.
      </Def>

      <H2 id="sync">Syncing</H2>
      <Def term="Stuck on “Saved locally · N to push”">
        Click it to force a push. If it stays, look at the right of the status bar for the actual
        error. Nothing is lost — the changes are on your device.
      </Def>
      <Def term="“Branch is protected” or a 422 from GitHub">
        The target branch requires reviews or status checks, so a direct push is refused. Point the
        workspace at an unprotected branch — see{" "}
        <A href="/docs/repositories">Repositories &amp; workspaces</A>.
      </Def>
      <Def term="“Rate limit exceeded”">
        5,000 authenticated requests per hour per user. Syncing pauses and resumes automatically
        when the window resets. Queued changes are kept.
      </Def>
      <Def term="A conflict I did not cause">
        Something else changed the file: another device, a collaborator, a GitHub Action, or you
        editing on github.com. See <A href="/docs/conflicts">Conflicts</A>.
      </Def>
      <Def term="The repository list is empty when connecting">
        ForkLeaf only offers repositories you can write to. Read-only access is filtered out,
        because showing you a repository it could never save to would be worse than hiding it.
      </Def>

      <H2 id="editor">The editor</H2>
      <Def term="Pressing / does nothing">
        The menu only opens at the start of a line or after a space — never mid-word, so URLs and
        file paths are left alone. Put the caret on an empty line and try again. If you would rather
        click, the <strong>Insert</strong> button on the toolbar has the same list.
      </Def>
      <Def term="A diagram shows “Empty diagram — click to edit”">
        The block exists but has no source yet. Click it to open the studio and pick a template.
      </Def>
      <Def term="A diagram renders in ForkLeaf but not on GitHub">
        GitHub supports a subset of Mermaid and a slightly older version. Newer diagram types —
        timelines, quadrant charts — may not render there yet. The file is still correct.
      </Def>
      <Def term="My notes vanished">
        Check the workspace switcher at the top of the sidebar. Notes written before signing in are
        in <strong>On this device</strong>, not in your repository — they are two separate
        workspaces and switching accounts does not move anything between them.
      </Def>
      <Def term="Export produced nothing">
        PDF export uses the browser&rsquo;s print dialogue; a pop-up blocker can suppress it. For
        other formats, check that downloads are not being blocked for the site.
      </Def>

      <H2 id="still">Still stuck</H2>
      <P>
        Open an issue at{" "}
        <A href="https://github.com/praneeth132006/ForkLeaf/issues">the repository</A> with what you
        did, what you expected, and what happened. For anything security-related, follow{" "}
        <A href="/docs/security">the disclosure process</A> instead of filing publicly.
      </P>
    </>
  );
}

export function Faq() {
  return (
    <>
      <Lead>Short answers. Each one links to the longer version.</Lead>

      <H2 id="general">General</H2>
      <Def term="Do I need an account?">
        No. The editor works immediately with notes stored in your browser. An account — GitHub — is
        what gives you a backup and sync across devices.
      </Def>
      <Def term="Where exactly are my notes?">
        Two places: IndexedDB in this browser, and <Code>.md</Code> files in your GitHub repository.
        Nowhere else. <A href="/docs/privacy-and-data">Your data</A>.
      </Def>
      <Def term="Is it really free?">
        The editor is, permanently. Your notes live in your GitHub account, so there is no storage
        cost to pass on. <A href="/docs/plans">Plans</A>.
      </Def>
      <Def term="Is it open source?">
        Yes — Apache-2.0.{" "}
        <A href="https://github.com/praneeth132006/ForkLeaf">github.com/praneeth132006/ForkLeaf</A>.
      </Def>

      <H2 id="github-faq">GitHub</H2>
      <Def term="Why does it want access to all my repositories?">
        <Code>repo</Code> is the narrowest classic OAuth scope that can write to a private
        repository; GitHub has no per-repository classic scope. It is also the only scope asked for
        — nothing about your profile, email, organisations or gists is requested alongside it. If
        you only keep public notes, <Code>public_repo</Code> is offered as an equal choice.{" "}
        <A href="/docs/signing-in">Signing in</A>.
      </Def>
      <Def term="Can I use a repository I already have?">
        Yes — any repository you can write to, on any branch, and optionally scoped to a single
        subdirectory. <A href="/docs/repositories">Repositories</A>.
      </Def>
      <Def term="Can I edit the files outside ForkLeaf?">
        Yes. Edit them on github.com, in VS Code, in Obsidian, or with <Code>sed</Code>. ForkLeaf
        picks up the changes on its next sync.
      </Def>
      <Def term="Will it spam my commit history?">
        No. Consecutive edits are squashed into one commit under strict conditions.{" "}
        <A href="/docs/sync">Syncing &amp; commits</A>.
      </Def>
      <Def term="Can it open a pull request instead of committing?">
        Yes. <strong>Propose changes</strong> in the status bar puts your edits on a branch and
        opens a pull request — including against a repository you cannot push to, which ForkLeaf
        forks for you first. <A href="/docs/features">What notes-as-commits gets you</A>.
      </Def>

      <H2 id="editing">Editing</H2>
      <Def term="Does it work offline?">
        Fully. Writing, diagrams and exports all work with no network; changes queue and push on
        reconnect. <A href="/docs/sync">Syncing</A>.
      </Def>
      <Def term="Can two people edit the same note at once?">
        Not simultaneously. Concurrent edits are detected and you choose which version to keep,
        rather than being silently merged. <A href="/docs/conflicts">Conflicts</A>.
      </Def>
      <Def term="Which diagram types are supported?">
        Flowcharts, sequence diagrams, class diagrams, state machines, ER diagrams, Gantt charts,
        mind maps, pie charts, user journeys, timelines, git graphs and quadrant charts.{" "}
        <A href="/docs/diagrams">Diagrams</A>.
      </Def>
      <Def term="Can I import from Notion, Obsidian or Bear?">
        Not through the app. Export Markdown from the other tool, commit it to your notes repository
        with git, and ForkLeaf will show it on the next sync.
      </Def>
      <Def term="Is there a mobile app?">
        No, but the web app works on a phone browser. The editor is intentionally desktop-first —
        the sidebar and properties panel collapse on small screens.
      </Def>

      <H2 id="privacy-faq">Privacy</H2>
      <Def term="Can you read my notes?">
        No. There is no ForkLeaf database holding them, and note content is only ever in flight
        through the API proxy on its way to GitHub. <A href="/docs/privacy-and-data">Your data</A>.
      </Def>
      <Def term="What is tracked?">
        Anonymous feature-usage events through Firebase Analytics — never note content, titles or
        repository names.
      </Def>
      <Def term="How do I delete everything?">
        Delete the repository on GitHub, clear site data in your browser, and revoke the OAuth app.
        Step-by-step in <A href="/docs/privacy-and-data">Your data</A>.
      </Def>
    </>
  );
}
