import { A, Code, Def, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";

export function SigningIn() {
  return (
    <>
      <Lead>
        Signing in is what turns ForkLeaf from a browser scratchpad into a notes app with a backup.
        This page covers exactly what the flow does, what it asks for, and what it can see.
      </Lead>

      <H2 id="flow">What happens when you press the button</H2>
      <OL>
        <li>
          ForkLeaf generates a random <Code>state</Code> value, stores it in a short-lived cookie,
          and redirects you to github.com.
        </li>
        <li>GitHub shows you its consent screen listing the permissions being requested.</li>
        <li>
          You approve, and GitHub redirects back to <Code>/api/auth/callback</Code> with a one-time
          code.
        </li>
        <li>
          The server checks the <Code>state</Code> matches, exchanges the code for an access token,
          and confirms the token works by fetching your profile.
        </li>
        <li>
          The token is encrypted — JWE, A256GCM — into an <Code>httpOnly</Code> cookie, and you land
          in the editor.
        </li>
      </OL>
      <Note>
        The <Code>state</Code> check is not ceremony. Without it, someone can complete the OAuth
        flow inside your browser and quietly bind your session to <em>their</em> GitHub account — a
        login-CSRF that ends with your notes being committed to a stranger&rsquo;s repository.
      </Note>

      <H2 id="scopes">The permissions it asks for</H2>
      <Table
        head={["Scope", "What it allows", "Why ForkLeaf needs it"]}
        rows={[
          [
            <Code key="a">repo</Code>,
            "Read and write access to your repositories, public and private",
            "Notes are files it has to create, update and delete — including in a private repo",
          ],
          [
            <Code key="b">read:user</Code>,
            "Your public profile",
            "Your name and avatar in the sidebar, so you can tell which account you are in",
          ],
        ]}
      />
      <Note kind="warn">
        <strong>
          <Code>repo</Code> is broader than anyone would like.
        </strong>{" "}
        It is the narrowest classic OAuth scope GitHub offers that still allows writing to a private
        repository — there is no &ldquo;only this one repo&rdquo; classic scope. If that is too much
        for your account, install ForkLeaf as a GitHub App instead, where you grant access
        repository by repository. See <A href="/docs/self-hosting">Self-hosting</A>.
      </Note>

      <H2 id="token">Where the token lives</H2>
      <P>
        In an encrypted <Code>httpOnly</Code> cookie that only the server can open. Specifically:
      </P>
      <UL>
        <LI>
          It is <strong>never</strong> sent to the browser as readable JavaScript. No script on the
          page — including a compromised dependency — can read it.
        </LI>
        <LI>
          It is <strong>never</strong> put in a URL, a query string, or a redirect, so it cannot end
          up in a server log or a referrer header.
        </LI>
        <LI>
          Every GitHub call goes through ForkLeaf&rsquo;s own <Code>/api/gh/*</Code> routes, which
          attach the token server-side.
        </LI>
        <LI>
          <Code>SameSite=Lax</Code>, and <Code>Secure</Code> in production.
        </LI>
        <LI>It expires after 30 days, at which point you sign in again.</LI>
      </UL>
      <P>
        The usual shortcut — a token in <Code>localStorage</Code> — would be readable by any script
        that ever runs on the page. More in <A href="/docs/security">the security model</A>.
      </P>

      <H2 id="google">Google sign-in</H2>
      <P>
        Google is enabled as an identity provider on the Firebase project, but it does not grant
        repository access — only GitHub can do that. GitHub is the sign-in that matters for
        ForkLeaf, which is why it is the only button offered.
      </P>

      <H2 id="signing-out">Signing out</H2>
      <P>
        <strong>Sign out</strong> in the sidebar account menu deletes the session cookie. It does
        not revoke the token on GitHub&rsquo;s side and it does not touch your repository. To revoke
        access entirely, go to{" "}
        <A href="https://github.com/settings/applications">
          GitHub → Settings → Applications → Authorized OAuth Apps
        </A>{" "}
        and remove ForkLeaf.
      </P>
      <P>
        Notes in the <strong>On this device</strong> workspace stay in your browser after signing
        out; notes in a repository stay in the repository.
      </P>
    </>
  );
}

export function Repositories() {
  return (
    <>
      <Lead>
        A workspace is one repository, one branch, and optionally one subdirectory inside it. You
        can have as many as you like and switch between them from the sidebar.
      </Lead>

      <H2 id="default">The notes repository</H2>
      <P>
        On first sign-in ForkLeaf looks for a repository called <Code>forkleaf-notes</Code> in your
        account. If it is not there, it creates it — private, with a README and a short welcome
        note. If it is there, it is used as-is and nothing is overwritten.
      </P>
      <P>
        This is a normal repository. Rename it, add collaborators, make it public, add a GitHub
        Action that publishes it as a website — none of that breaks ForkLeaf.
      </P>

      <H2 id="connect">Connecting your own repository</H2>
      <P>
        Open the workspace switcher at the top of the sidebar and choose{" "}
        <strong>Connect another repository…</strong>. You are shown the repositories you have write
        access to. Pick one and set:
      </P>
      <Def term="Branch">
        Defaults to the repository&rsquo;s default branch. Point ForkLeaf at <Code>docs</Code> or{" "}
        <Code>notes</Code> if you would rather it never touched <Code>main</Code>.
      </Def>
      <Def term="Directory">
        Optional. Set it to <Code>docs/</Code> and ForkLeaf treats that folder as the root of the
        workspace, leaving the rest of the repository alone. This is how you edit the documentation
        folder of a code project without the file tree filling up with source files.
      </Def>
      <Note kind="warn">
        Repositories you can only read are not offered. ForkLeaf has to be able to commit, and
        showing you a repository it cannot save to would be worse than hiding it.
      </Note>

      <H2 id="switching">Switching workspaces</H2>
      <P>
        The switcher lists every connected repository plus <strong>On this device</strong>. Each
        workspace has its own file tree and its own sync state. Switching does not move anything
        between them.
      </P>

      <H2 id="local">The local workspace</H2>
      <P>
        <strong>On this device</strong> always exists, signed in or not. It stores notes in
        IndexedDB and pushes nothing. It is useful for scratch notes, and it is where anything you
        wrote before signing in stays.
      </P>
      <Note kind="warn">
        Nothing in the local workspace is backed up. Clearing site data deletes it. To move a local
        note into a repository, open it, copy the content, and paste it into a new note in the
        repository workspace — an automatic migration is on the list, but pretending it exists would
        be worse than saying so.
      </Note>

      <H2 id="branches">Branches and protection rules</H2>
      <P>
        ForkLeaf commits directly to the configured branch. If that branch has protection rules
        requiring reviews or status checks, the push is rejected by GitHub and the change stays
        queued with the error shown in the status bar. Point the workspace at an unprotected branch.
      </P>
      <P>
        Opening a pull request instead of committing directly is not currently supported. It is a
        commonly requested feature and it is tracked in the repository&rsquo;s issues.
      </P>

      <H2 id="layout">What the repository looks like</H2>
      <Pre label="forkleaf-notes/">{`README.md
architecture/
  sync-engine.md
  storage.md
meetings/
  2026-08-14.md
reading-list.md`}</Pre>
      <P>
        Folders in the sidebar are directories on disk. Note titles become slugified filenames.
        There is no index file, no manifest, and no hidden state directory — the file tree{" "}
        <em>is</em> the data model.
      </P>
    </>
  );
}

export function Sync() {
  return (
    <>
      <Lead>
        ForkLeaf is deliberately explicit about the difference between &ldquo;saved on this
        device&rdquo; and &ldquo;pushed to GitHub&rdquo;. An autosaving app that is vague about that
        distinction is how people come to believe they lost work.
      </Lead>

      <H2 id="lifecycle">The life of an edit</H2>
      <OL>
        <li>You type. The editor updates.</li>
        <li>
          A few hundred milliseconds later the note is written to IndexedDB. It is now safe against
          a crash, a closed tab, or a flat battery.
        </li>
        <li>
          A pending change is queued: the path, the new content, and the SHA the edit was based on.
        </li>
        <li>
          The sync engine drains the queue — on a timer, on reconnect, or immediately when you press{" "}
          <Code>⌘S</Code>.
        </li>
        <li>Changes are pushed to GitHub as a commit, and the queue empties.</li>
      </OL>

      <H2 id="status">Reading the status bar</H2>
      <Table
        head={["What it says", "What it means"]}
        rows={[
          [
            <strong key="a">All changes saved</strong>,
            "Local and GitHub agree. Nothing is pending.",
          ],
          [
            <strong key="b">Saved locally · 2 to push</strong>,
            "Two notes are safely on this device but have not reached GitHub yet. Click to push now.",
          ],
          [<strong key="c">Saving to GitHub…</strong>, "A push is in flight."],
          [
            <strong key="d">Offline · 3 changes queued</strong>,
            "No network. Everything is on this device and will go up automatically when you reconnect.",
          ],
          [
            <strong key="e">Couldn&apos;t sync — click to retry</strong>,
            "GitHub rejected the push. The reason is at the right of the status bar. Nothing was lost.",
          ],
          [
            <strong key="f">2 conflicts — click to resolve</strong>,
            "The same note changed here and on GitHub. See Conflicts.",
          ],
          [
            <strong key="g">Saved on this device</strong>,
            "You are in the local workspace, which never pushes.",
          ],
        ]}
      />

      <H2 id="commits">What the commits look like</H2>
      <P>
        One commit per sync, containing every change in that batch. Multi-file operations — a rename
        is a delete plus a create — go through GitHub&rsquo;s tree API as a single atomic commit, so
        the repository can never be left half-updated.
      </P>
      <Pre label="git log --oneline">{`a3f9c21 forkleaf: update architecture/sync-engine.md
7b21e08 forkleaf: update 3 notes
1c94ffa forkleaf: rename reading.md to reading-list.md`}</Pre>

      <H3>Commit squashing</H3>
      <P>
        Typing produces a lot of small saves, and a commit per keystroke-batch would bury your
        history. So when the branch head is a commit ForkLeaf made recently, the next push amends it
        rather than stacking a new one.
      </P>
      <P>The guard rails on that are strict, because rewriting history is dangerous:</P>
      <UL>
        <LI>Only if the head commit carries ForkLeaf&rsquo;s own marker in its message.</LI>
        <LI>Only within a short time window.</LI>
        <LI>Only if the author matches.</LI>
        <LI>Never if anyone else has pushed in the meantime.</LI>
      </UL>
      <Note kind="danger">
        A way to make ForkLeaf rewrite or destroy a commit it did not create is a security bug.
        Please report it — see <A href="/docs/security">the security model</A>.
      </Note>

      <H2 id="offline">Offline</H2>
      <P>
        Everything works: opening notes, writing, switching views, inserting diagrams, exporting.
        The queue accumulates and the status bar says how much is waiting. On reconnect it drains
        automatically.
      </P>
      <P>If you try to close the tab with unpushed changes, the browser asks you to confirm.</P>

      <H2 id="devices">Across devices</H2>
      <P>
        Sign in with the same GitHub account elsewhere and ForkLeaf pulls the repository down. Both
        devices commit to the same branch, and each pulls the other&rsquo;s commits on the next
        sync. If they both changed the same note, you get a conflict rather than a silent overwrite.
      </P>

      <H2 id="deleting">Deleting</H2>
      <P>
        Deleting a note commits the deletion. The content remains in your git history, so it is
        recoverable:
      </P>
      <Pre label="terminal">{`# find the commit that deleted it
git log --diff-filter=D --name-only -- meetings/2026-08-14.md

# restore it from the commit before that
git checkout <commit>^ -- meetings/2026-08-14.md`}</Pre>

      <H2 id="limits">Rate limits</H2>
      <P>
        Authenticated GitHub requests are capped at 5,000 per hour per user. ForkLeaf stays well
        under that by batching and by squashing, but if you do hit it, pushes fail with a rate-limit
        error and resume automatically once the window resets. Nothing is lost in the meantime.
      </P>
    </>
  );
}

export function Conflicts() {
  return (
    <>
      <Lead>
        A conflict means the same note changed in two places since ForkLeaf last looked. It is not
        an error, and nothing has been lost — you are being asked which version you want.
      </Lead>

      <H2 id="how">How a conflict is detected</H2>
      <P>
        Each pending change records the SHA of the file it was based on. Before pushing, ForkLeaf
        checks whether the file on GitHub still has that SHA. If it does not, someone else — your
        other laptop, a collaborator, a GitHub Action, or you editing the file directly on
        github.com — has changed it in the meantime.
      </P>
      <P>
        Rather than overwriting, the change is held and a conflict is raised. The status bar turns
        red and the resolution dialog opens.
      </P>

      <H2 id="resolving">Resolving one</H2>
      <P>You are shown both versions side by side, and you have three choices:</P>
      <Def term="Keep mine">
        Your local version wins. The remote version is replaced — and remains in the git history, so
        it is recoverable.
      </Def>
      <Def term="Keep theirs">
        The remote version wins and your local edits are discarded. Copy anything you want out of
        your version first: unlike the remote one, your local edits were never committed, so they
        are not in the history.
      </Def>
      <Def term="Keep both">
        The safe choice. Your version is saved alongside the remote one under a new filename, and
        you merge them by hand afterwards. Nothing is thrown away.
      </Def>
      <Note>
        Dismissing the dialog does not resolve anything. The conflict stays, and the status bar
        keeps a count you can click to reopen it. Pushes for that note are paused until it is
        settled; other notes continue to sync normally.
      </Note>

      <H2 id="avoiding">Avoiding them</H2>
      <UL>
        <LI>
          Press <Code>⌘S</Code> before you close the laptop, so your device is not carrying stale
          pending changes.
        </LI>
        <LI>
          Let a device finish syncing before you start editing the same note somewhere else — the
          status bar tells you when it has.
        </LI>
        <LI>
          For notes several people edit, give each person their own file and link between them. Git
          is good at separate files and bad at the same paragraph.
        </LI>
      </UL>

      <H2 id="no-merge">Why there is no automatic merge</H2>
      <P>
        ForkLeaf could run a three-way text merge. It deliberately does not. A silent automatic
        merge of prose produces a document that reads as if someone wrote it, when in fact nobody
        did — and you would have no reason to check. Showing both versions is slower and honest.
      </P>
      <P>
        Real-time collaborative editing, where the merge is continuous and visible, would need a
        server holding shared document state. ForkLeaf has no such server, by design — see{" "}
        <A href="/docs/how-it-works">How ForkLeaf works</A>.
      </P>
    </>
  );
}
