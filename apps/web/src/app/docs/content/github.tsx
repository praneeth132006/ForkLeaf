import { A, Code, Def, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";

export function SigningIn() {
  return (
    <>
      <Lead>
        Signing in is what turns ForkLeaf from a browser scratchpad into a notes app with a backup.
        This page covers what it asks GitHub for, what it uses that for, and how to take it back.
      </Lead>

      <H2 id="scopes">The permissions it asks for</H2>
      <P>
        One scope, and it is the one that lets ForkLeaf write your notes. There is no second
        permission bundled alongside it, so the consent screen has exactly one thing on it for you
        to weigh.
      </P>
      <Table
        head={["Scope", "What GitHub grants", "Why ForkLeaf asks for it", "What it does not do"]}
        rows={[
          [
            <Code key="a">repo</Code>,
            "Read and write access to your repositories, public and private",
            "A note is a file. Opening one is a read, saving one is a commit, renaming one is a commit that deletes and adds — none of that is possible without write access, and private repositories need this scope specifically",
            "It is never used to enumerate, read or modify anything but the repository you connect and the list of repository names the picker shows",
          ],
          [
            <Code key="b">public_repo</Code>,
            "The same, restricted to your public repositories",
            "The alternative offered on the sign-in page, for notes that are going to be public anyway",
            "It cannot open a private repository. GitHub refuses the request; ForkLeaf does not get the choice",
          ],
        ]}
      />

      <H3 id="not-asked">What it deliberately does not ask for</H3>
      <P>
        The consent screen used to carry a second block — <strong>Personal user data</strong>,
        &ldquo;this application will be able to read your private profile information&rdquo; —
        because the request included <Code>read:user</Code>. That was there to put your name and
        avatar in the sidebar, which turns out not to need it: <Code>GET /user</Code> returns your
        login, name and avatar to any authenticated token. The scope bought a warning about private
        profile access and nothing else, so it is gone.
      </P>
      <UL>
        <LI>
          <Code>read:user</Code> — not asked for. Your name and avatar come back with the token
          regardless; ForkLeaf never sees a private profile field, and does not read your email
          address at all.
        </LI>
        <LI>
          <Code>user:email</Code> — not asked for. Commits are attributed by GitHub from your own
          account settings, so ForkLeaf never needs your address.
        </LI>
        <LI>
          <Code>admin:org</Code>, <Code>delete_repo</Code>, <Code>workflow</Code>,{" "}
          <Code>admin:repo_hook</Code> — not asked for. ForkLeaf never creates a webhook, edits a
          workflow file, changes a repository setting or deletes a repository.
        </LI>
        <LI>
          <Code>gist</Code>, <Code>notifications</Code> — not asked for. It does not touch either.
        </LI>
      </UL>
      <Note>
        The <Code>repo</Code> scope&rsquo;s own description on GitHub&rsquo;s screen lists settings,
        webhooks and deploy keys among the things it <em>could</em> reach. That is GitHub describing
        the scope, not ForkLeaf describing itself: the scope is a single coarse grant and cannot be
        narrowed further as a classic OAuth app. Every request ForkLeaf makes goes through its own{" "}
        <Code>/api/gh/*</Code> routes, which are contents, tree, commit, branch and pull request
        endpoints — you can read the list in the source.
      </Note>

      <Note kind="warn">
        <strong>
          <Code>repo</Code> is broader than anyone would like.
        </strong>{" "}
        It is the narrowest classic OAuth scope GitHub offers that still allows writing to a private
        repository — there is no &ldquo;only this one repo&rdquo; classic scope. If that is too much
        for your account, <A href="/sign-in">sign in with public-repository access only</A> — or use
        ForkLeaf with no account at all, on this device.
      </Note>
      <P>
        You are not made to take the wide one. Under the <strong>Continue with GitHub</strong>{" "}
        button, <A href="/sign-in">the sign-in page</A> offers{" "}
        <strong>Public repositories only</strong>, which asks for <Code>public_repo</Code> instead —
        with it, ForkLeaf cannot open a private repository at all, because GitHub refuses the token
        rather than because we decline to try. Pick it if your notes are going to be public; you can
        sign in again with the wider permission whenever that changes, and nothing has to be redone.
      </P>
      <P>
        Whichever you choose, ForkLeaf reads and writes exactly one repository — the one you connect
        — plus the list of repository names, so the picker has something to show. If a repository
        you can see on github.com is missing from that list, it is almost always one of two things:
        it is private and you granted public-only access, or it belongs to an organisation that has
        not approved ForkLeaf under <em>Settings → Third-party Access</em>. The dashboard says
        which, and what to do about it, rather than repeating GitHub&rsquo;s &ldquo;Not
        Found&rdquo;.
      </P>

      <H2 id="signing-out">Signing out</H2>
      <P>
        <strong>Sign out</strong> in the sidebar account menu deletes the session cookie. It does
        not revoke the token on GitHub&rsquo;s side and it does not touch your repository. To revoke
        access entirely, go to{" "}
        <A href="https://github.com/settings/applications">
          GitHub → Settings → Applications → Authorized GitHub Apps
        </A>{" "}
        and remove ForkLeaf. Revoking takes effect at once rather than at the end of the current
        eight-hour token: the next renewal is refused, and ForkLeaf ends the session where it finds
        out.
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
        Signing in does not create anything. ForkLeaf asks where your notes should live, on the
        dashboard: connect a repository you already have — optionally scoped to a subfolder such as{" "}
        <Code>docs/</Code> — or have it create a new one for you.
      </P>
      <P>
        If you ask it to create one, the default name is <Code>forkleaf-notes</Code> and it is
        private, with a README and a short welcome note. If a repository of that name already
        exists, it is used as-is and nothing is overwritten.
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

      <H2 id="publishing">Publishing a note as a page</H2>
      <P>
        <strong>Publish as a page</strong> in the right-hand panel renders the open note to one
        self-contained HTML file, commits it to <Code>docs/</Code> in the same repository, and
        switches GitHub Pages on. Nothing is uploaded to ForkLeaf — the page is a file in your
        repository, served by GitHub, and it outlives this app entirely.
      </P>
      <P>
        A published note is marked as such wherever you look at it afterwards. The right-hand panel
        gains a <strong>Published</strong> section with the address, and the dashboard lists every
        page the repository is serving under <strong>Published pages</strong>, each with its link
        and an <strong>Unpublish</strong> button. That list is read back from <Code>docs/</Code>
        rather than remembered here, so deleting a page on GitHub directly unpublishes it as
        completely as the button does.
      </P>
      <P>
        Unpublishing deletes the file — one commit, recoverable from your git history — and leaves
        the note alone. GitHub Pages stays switched on, because it is a repository-wide setting you
        may have had before ForkLeaf ever touched it.
      </P>
      <Note kind="warn">
        Anyone with the link can read a published page, whether or not the repository is private.
        Publishing from a private repository needs a paid GitHub plan; GitHub says so if that
        applies to yours, and the page is committed either way, so turning Pages on later publishes
        it as it stands.
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
      <P>
        Switching branch from the status bar moves the workspace across: open notes are closed,
        because their content and base revisions belong to the branch you left, and the file tree
        and every note are re-read from the branch you moved to. The repository is still listed once
        in the switcher — a branch is not a second connection to the same repository. The one
        exception is a branch you left with edits that never reached GitHub: that stays listed on
        its own, because the writing only exists on this device and closing it away would lose it.
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
            <strong key="e">A sentence saying what went wrong — click to retry</strong>,
            "The push failed. The message says what happened and what to do about it; nothing was lost, and your work is on this device either way.",
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

export function Conversations() {
  return (
    <>
      <Lead>
        Talk about a note with the people you share the notebook with, beside the note itself. Every
        message is a GitHub Discussion in the notebook&rsquo;s own repository, so nothing about it
        lives anywhere but GitHub.
      </Lead>

      <H2 id="open">Open it</H2>
      <P>
        The column beside the note has three tabs — <strong>Note</strong>, <strong>Chat</strong> and{" "}
        <strong>Assistant</strong> — and one click switches between them. You can also use the
        speech bubble in the editor header, or <Code>⌘K → Talk about this note</Code>. When someone
        replies while you are looking at something else, the Chat tab shows how many messages you
        have not read, and the header button gets a dot.
      </P>

      <H2 id="how">How it works</H2>
      <UL>
        <LI>
          The first message about a note starts a discussion in the repository&rsquo;s{" "}
          <strong>General</strong> category, titled after the note and linking to its file. Every
          message after that is a comment on it, and a reply is a reply on GitHub.
        </LI>
        <LI>
          Collaborators can answer here or on github.com and in GitHub&rsquo;s phone app. Both
          places show the same conversation.
        </LI>
        <LI>
          New messages are checked for every fifteen seconds while the Chat tab is open, every
          minute while it is not, and not at all while the browser tab is in the background. Coming
          back to the tab checks at once.
        </LI>
        <LI>
          Messages are Markdown. <Code>Enter</Code> starts a new line and <Code>⌘↵</Code> sends.
        </LI>
        <LI>
          This device remembers which messages you have seen, so the unread count is per device.
        </LI>
      </UL>

      <H2 id="turn-on">Turn on Discussions</H2>
      <P>
        Discussions is a repository setting, off by default. ForkLeaf does not change repository
        settings for you, so the Chat tab links to the right page: on GitHub, open the
        repository&rsquo;s <strong>Settings</strong>, tick <strong>Discussions</strong> under{" "}
        <strong>Features</strong>, then press <strong>Check again</strong>.
      </P>

      <H2 id="lounge">The Lounge: every conversation at once</H2>
      <P>
        <Code>⌘K → Open the Lounge</Code>, or the Lounge button in the Chat tab, shows every
        conversation in the notebook: the ones about notes and the ones people started on
        github.com.
      </P>
      <UL>
        <LI>
          <strong>Channels</strong> are the repository&rsquo;s Discussions categories, each with an
          unread count. <strong>Unanswered</strong> lists questions in Q&amp;A-style categories that
          nobody has answered yet.
        </LI>
        <LI>
          <strong>Threads</strong> show which are unread, answered, about a note, or locked.
        </LI>
        <LI>
          A thread opens with its first post and a line marking what is{" "}
          <strong>new since you were last here</strong>. From there you can reply, mark an answer,
          open the note it is about, or save it as a note.
        </LI>
        <LI>
          <strong>New thread</strong> starts one in any channel except Polls, which GitHub does not
          let apps create.
        </LI>
      </UL>
      <P>
        The first time you open the Lounge on a device sets a starting point. Threads that were
        quiet before then are not shown as unread, so a busy repository doesn&rsquo;t open with
        hundreds of old threads marked new.
      </P>

      <H2 id="answers">Answers</H2>
      <P>
        In a category that takes answers, such as Q&amp;A, the person who asked and the
        repository&rsquo;s maintainers see <strong>Mark as answer</strong> under each reply. This
        works in the Chat tab and the Lounge, and it is the same answer GitHub shows.
      </P>

      <H2 id="save">Save a conversation as a note</H2>
      <P>
        <strong>Save as note</strong> writes the conversation into <Code>conversations/</Code>:
        every message in order, who said it and when, the answer marked, and a link back to the
        discussion. Messages a maintainer hid are left out.
      </P>
      <Note>
        If the assistant is set up, you can tick <strong>Add a summary</strong> to put decisions,
        to-dos and open questions at the top. This sends the conversation to your model provider
        with your own key, and it appears in Receipts. It is off unless you tick it.
      </Note>

      <H2 id="who">Who can take part, and who can read it</H2>
      <Table
        head={["Repository", "Who can read", "Who can write"]}
        rows={[
          ["Private", "Its collaborators", "Its collaborators"],
          ["Public", "Anyone", "Anyone signed in to GitHub"],
        ]}
      />
      <P>
        The Chat tab says so when a repository is public. A maintainer can lock a conversation or
        hide a message on GitHub, and the Chat tab respects both.
      </P>

      <Note>
        Encrypted notes never get a conversation. Anyone who can read the repository can read a
        discussion&rsquo;s title and messages, and those are exactly the people an encrypted note is
        kept from.
      </Note>

      <H2 id="passages">Talk about a passage</H2>
      <P>
        Select some words in a note and press <strong>Discuss</strong>, the button that appears
        under the selection. The Chat tab opens with the passage quoted, and your first message
        starts a thread about those words alone.
      </P>
      <UL>
        <LI>
          The Chat tab lists a note&rsquo;s passage threads above its own messages, marking new and
          answered ones. Click one to read it in the Lounge.
        </LI>
        <LI>
          <strong>Show in note</strong> selects the passage on the page. If the words have since
          been rewritten, the thread says <em>Passage changed since</em> instead of pointing at the
          wrong place.
        </LI>
        <LI>
          A passage is matched by its words, ignoring spacing, so it is found in rich text, in the
          source view and after a paragraph is re-wrapped.
        </LI>
      </UL>
      <P>
        <Code>[[Links]]</Code> in any message, in the Chat tab or the Lounge, open the note they
        name.
      </P>

      <H2 id="comments">Comments on published books and gardens</H2>
      <P>
        In <strong>Publish as a book…</strong>, tick <strong>Comments on every page</strong>.
        Readers sign in with GitHub to comment, through <A href="https://giscus.app">giscus</A>, an
        open-source comments widget built on GitHub Discussions. Each page&rsquo;s comments are the
        same conversation as its note&rsquo;s Chat tab, whichever side starts it.
      </P>
      <OL>
        <LI>The notes repository must be public, so readers can see the comments.</LI>
        <LI>Discussions must be switched on.</LI>
        <LI>
          The <A href="https://github.com/apps/giscus">giscus app</A> must be installed on the
          repository. The dialog links to it.
        </LI>
      </OL>
      <Note>
        The comments load giscus&rsquo;s script on the published page, and only when a reader
        scrolls down to them. Pages published without the box ticked load nothing extra.
      </Note>

      <H2 id="assistants">AI assistants</H2>
      <P>
        An assistant connected over <A href="/docs/mcp">MCP</A> can read a note&rsquo;s
        conversation, list every conversation or only the unanswered questions, and read one in
        full. It can reply too, under your name. It is told to do that only when you ask, after
        showing you the text, and it cannot reply on a read-only connection.
      </P>

      <H2 id="live">Live updates and notifications</H2>
      <P>
        On forkleaf.in, new messages arrive as they are posted: a reply shows up in the Chat tab and
        the Lounge within a few seconds, without a refresh. The dot on the bell (<strong>🔔</strong>
        , in the Chat tab and the Lounge) is filled while that is working. When it is hollow,
        ForkLeaf checks for new messages every 15 seconds instead.
      </P>
      <P>The bell also turns on notifications, per repository and per device:</P>
      <Table
        head={["Setting", "You are told about"]}
        rows={[
          ["Off (the default)", "Nothing"],
          [
            "Threads I'm in",
            "New messages in threads you have opened or written in on this device, and messages that @mention you",
          ],
          ["Everything", "Every new message in the notebook"],
        ]}
      />
      <UL>
        <LI>
          You are only notified while ForkLeaf is not the window in front, and never about your own
          messages, edits or deletions.
        </LI>
        <LI>
          A busy thread updates one notification instead of stacking many. Clicking it opens the
          thread.
        </LI>
        <LI>
          The tab&rsquo;s title also counts new messages, for example <em>(2) Editor</em>. This
          works even if your browser blocks notifications, and clears when you look at the tab.
        </LI>
        <LI>
          With notifications on, ForkLeaf stays connected while the tab is in the background,
          because that is when they matter. With them off, it disconnects until you come back.
        </LI>
      </UL>

      <H2 id="self-hosting">Running your own ForkLeaf</H2>
      <P>
        ForkLeaf signs in as a GitHub App, and a GitHub App can only do what its permissions allow.
        To use conversations, give the App the <strong>Discussions: Read and write</strong>{" "}
        repository permission. Accounts that already installed it must then approve the new
        permission, which GitHub asks them to do. Until they do, the Chat tab explains that ForkLeaf
        is not yet allowed to use Discussions in that repository.
      </P>
      <H3 id="self-hosting-live">Live updates</H3>
      <OL>
        <LI>
          In the GitHub App&rsquo;s settings, turn on <strong>Webhook</strong>. Set the URL to{" "}
          <Code>https://&lt;your host&gt;/api/gh/webhook</Code> and choose a secret (
          <Code>openssl rand -hex 32</Code>).
        </LI>
        <LI>
          Under <strong>Subscribe to events</strong>, tick <strong>Discussion</strong> and{" "}
          <strong>Discussion comment</strong>.
        </LI>
        <LI>
          Set <Code>GITHUB_WEBHOOK_SECRET</Code> to the same secret, and set{" "}
          <Code>UPSTASH_REDIS_REST_URL</Code> and <Code>UPSTASH_REDIS_REST_TOKEN</Code>. A webhook
          and a reader&rsquo;s live stream can run on different server instances, and the shared
          store is what connects them.
        </LI>
      </OL>
      <P>
        Each delivery&rsquo;s signature is checked before anything is read, and a delivery GitHub
        sends twice is recorded once. ForkLeaf keeps a short log per repository for a day: the
        discussion number, what happened, who did it, and the first 140 characters of a new message.
        Only people who can read the repository can open that repository&rsquo;s live stream. The
        stream checks for news every 3 seconds with a single store read, which comes to about 29,000
        Upstash commands per day for a tab left open all day.
      </P>
    </>
  );
}
