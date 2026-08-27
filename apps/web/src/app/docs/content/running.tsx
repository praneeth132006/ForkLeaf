import { A, Code, Def, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";

export function SelfHosting() {
  return (
    <>
      <Lead>
        ForkLeaf is a single Next.js application with no database. Anywhere that runs Node 20 will
        host it, and the whole thing is Apache-2.0 licensed.
      </Lead>

      <H2 id="requirements">What you need</H2>
      <UL>
        <LI>Node 20.9 or newer, and pnpm 9 or newer.</LI>
        <LI>A GitHub account, to register an OAuth app.</LI>
        <LI>Somewhere to deploy. Vercel, Fly, Railway, a container, or your own box.</LI>
        <LI>
          Optionally a Firebase project, if you want analytics and the user record — see{" "}
          <A href="/docs/firebase">Firebase setup</A>. Everything works without it.
        </LI>
      </UL>

      <H2 id="local">Running it locally</H2>
      <Pre label="terminal">{`git clone https://github.com/praneeth132006/ForkLeaf.git forkleaf
cd forkleaf
pnpm install
cp .env.example apps/web/.env.local
pnpm dev`}</Pre>
      <P>
        Open <Code>http://localhost:3000</Code>. With no configuration at all, ForkLeaf starts in
        local mode: notes are stored in the browser and GitHub sign-in is hidden. That is a valid
        way to run it.
      </P>

      <H2 id="oauth">Registering the GitHub OAuth app</H2>
      <OL>
        <li>
          Go to{" "}
          <A href="https://github.com/settings/developers">
            GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
          </A>
          .
        </li>
        <li>
          <strong>Application name:</strong> anything. This is what users see on the consent screen.
        </li>
        <li>
          <strong>Homepage URL:</strong> <Code>http://localhost:3000</Code> for development, or your
          real origin.
        </li>
        <li>
          <strong>Authorization callback URL:</strong>{" "}
          <Code>http://localhost:3000/api/auth/callback</Code>. This must match exactly — GitHub
          rejects the redirect otherwise.
        </li>
        <li>Register, then generate a client secret and copy both values.</li>
      </OL>
      <Note kind="warn">
        Development and production need <strong>separate OAuth apps</strong>, because each app has
        one callback URL. Trying to share one between localhost and a deployed domain does not work.
      </Note>

      <H2 id="env">Environment variables</H2>
      <P>
        All of these go in <Code>apps/web/.env.local</Code> locally, or in your host&rsquo;s
        environment settings in production.
      </P>
      <Table
        head={["Variable", "Required", "What it is"]}
        rows={[
          [
            <Code key="a">GITHUB_OAUTH_CLIENT_ID</Code>,
            "For GitHub sign-in",
            "The client ID from the OAuth app above. Not secret.",
          ],
          [
            <Code key="b">GITHUB_OAUTH_CLIENT_SECRET</Code>,
            "For GitHub sign-in",
            "The client secret. Secret — never commit it.",
          ],
          [
            <Code key="c">SESSION_SECRET</Code>,
            "For GitHub sign-in",
            "At least 32 random characters. The key that encrypts session cookies. Anyone holding it can forge a session.",
          ],
          [
            <Code key="d">NEXT_PUBLIC_APP_URL</Code>,
            "In production",
            "The public origin, used to build the callback URL. Required behind a proxy, where request.url is the internal address.",
          ],
          [
            <Code key="e">NEXT_PUBLIC_FIREBASE_*</Code>,
            "Optional",
            "Analytics and billing. See the Firebase page.",
          ],
          [
            <Code key="f">NEXT_PUBLIC_POSTHOG_KEY</Code>,
            "Optional",
            "Product analytics through PostHog. Without it, nothing is sent and nothing warns.",
          ],
          [
            <Code key="g">NEXT_PUBLIC_POSTHOG_HOST</Code>,
            "Optional",
            "Only if your PostHog project is not on the US cloud — for the EU cloud, https://eu.i.posthog.com.",
          ],
        ]}
      />
      <Pre label="generate a session secret">{`openssl rand -base64 32`}</Pre>
      <Note kind="danger">
        <Code>SESSION_SECRET</Code> has no default and no fallback. A deployment that forgets it
        fails loudly rather than silently using a shared constant — which would mean anyone could
        forge a session cookie against your instance.
      </Note>

      <H2 id="deploy">Deploying</H2>
      <H3>Vercel</H3>
      <OL>
        <li>Import the repository.</li>
        <li>
          Set the root directory to <Code>apps/web</Code>; the framework is detected as Next.js.
        </li>
        <li>Add the environment variables above.</li>
        <li>
          Deploy, then update the OAuth app&rsquo;s callback URL to{" "}
          <Code>https://your-domain/api/auth/callback</Code>.
        </li>
      </OL>
      <H3>Anywhere else</H3>
      <Pre label="terminal">{`pnpm install --frozen-lockfile
pnpm build
pnpm --filter @forkleaf/web start   # serves on $PORT, default 3000`}</Pre>
      <P>
        Put it behind a TLS-terminating reverse proxy and set <Code>NEXT_PUBLIC_APP_URL</Code> to
        the public origin. Session cookies are marked <Code>Secure</Code> in production, so sign-in
        will not work over plain HTTP.
      </P>

      <H2 id="github-app">Using a GitHub App instead</H2>
      <P>
        The default flow requests the <Code>repo</Code> scope, which grants access to every
        repository in the account. A GitHub App lets each user grant access repository by
        repository, which is a much better fit for an organisation.
      </P>
      <P>
        A GitHub App&rsquo;s user-to-server tokens use the same OAuth endpoints ForkLeaf already
        calls, so only <Code>apps/web/src/app/api/auth/</Code> needs changing — mainly handling the
        refresh token, which classic OAuth tokens do not have. The details are in{" "}
        <A href="https://github.com/praneeth132006/ForkLeaf/blob/main/docs/self-hosting.md">
          docs/self-hosting.md
        </A>{" "}
        in the repository.
      </P>

      <H2 id="checks">Before you ship a change</H2>
      <Pre label="terminal">{`pnpm check   # format:check, typecheck, lint, test, build`}</Pre>
    </>
  );
}

export function Firebase() {
  return (
    <>
      <Lead>
        Firebase is optional. It powers product analytics and the thin user record on the hosted
        deployment. With no Firebase configuration, ForkLeaf works identically and collects nothing.
      </Lead>

      <H2 id="what-for">What it is used for</H2>
      <Table
        head={["Service", "Used for", "Required?"]}
        rows={[
          [
            <strong key="a">Analytics</strong>,
            "Which screens and features get used. No note content, ever.",
            "No",
          ],
          [
            <strong key="b">Anonymous Auth</strong>,
            "An identity to key the user and billing documents against",
            "Only if you want Firestore",
          ],
          [
            <strong key="c">Firestore</strong>,
            "One user record per person, and their subscription state",
            "Only for billing",
          ],
        ]}
      />
      <Note>
        Firebase is <strong>not</strong> used for signing in to ForkLeaf. Repository access comes
        from the server-side GitHub OAuth flow, whose token never reaches the browser — Firebase
        Auth is only there to give Firestore rules a principal to scope documents to.
      </Note>

      <H2 id="project">Setting up the project</H2>
      <OL>
        <li>
          Create a project at{" "}
          <A href="https://console.firebase.google.com">console.firebase.google.com</A>.
        </li>
        <li>
          Add a <strong>Web app</strong> and copy the config object it gives you.
        </li>
        <li>
          Under <strong>Authentication → Sign-in method</strong>, enable <strong>Anonymous</strong>.
          Nothing else is required.
        </li>
        <li>
          Under <strong>Firestore Database</strong>, create a database in production mode.
        </li>
        <li>
          Under <strong>Analytics</strong>, enable Google Analytics if you want event reporting.
        </li>
      </OL>

      <H2 id="env">Environment variables</H2>
      <P>
        Map the config object onto these. They are all <Code>NEXT_PUBLIC_</Code> because a Firebase
        web config is shipped to every browser by design — the <Code>apiKey</Code> is a project
        identifier, not a credential. What protects the data is the security rules.
      </P>
      <Pre label="apps/web/.env.local">{`NEXT_PUBLIC_FIREBASE_API_KEY=…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
NEXT_PUBLIC_FIREBASE_APP_ID=…
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-…`}</Pre>
      <P>
        Leave them out and every Firebase call in the app becomes a no-op. That is checked at each
        call site, not assumed.
      </P>

      <H2 id="rules">Security rules</H2>
      <P>
        Deploy the rules from <Code>firestore.rules</Code> in the repository. They are short and
        worth reading in full:
      </P>
      <Pre label="firestore.rules">{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;

      match /billing/{document} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if false;   // webhook only, via the Admin SDK
      }
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}`}</Pre>
      <Pre label="terminal">{`firebase deploy --only firestore:rules`}</Pre>

      <H2 id="events">The events that are recorded</H2>
      <Table
        head={["Event", "Fired when"]}
        rows={[
          [
            <Code key="a">page_view</Code>,
            "Any route is opened, including client-side navigations",
          ],
          [<Code key="b">note_created</Code>, "A note is created"],
          [<Code key="c">note_exported</Code>, "An export completes"],
          [<Code key="d">repo_connected</Code>, "A repository is connected"],
          [<Code key="e">github_sign_in_started</Code>, "The sign-in button is pressed"],
          [<Code key="f">diagram_inserted</Code>, "A diagram block is inserted"],
        ]}
      />
      <P>
        None of these carry note content, note titles, filenames or repository names. Analytics is
        fire-and-forget and swallows its own errors: a metrics call must never break a user action.
      </P>

      <H2 id="posthog">PostHog</H2>
      <P>
        The same events go to PostHog as well, if you want funnels, retention and session-level
        analysis that Firebase does not give you. Set two environment variables:
      </P>
      <Pre label=".env.local">{`NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
# Only if your project is on the EU cloud:
# NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`}</Pre>
      <P>
        Find the key in PostHog under <strong>Settings → Project → Project API Key</strong>. Set the
        same variables in your hosting project so the deployed site reports too. With no key, every
        PostHog call is a no-op — no warnings, no network requests, nothing to configure for a fork
        or a local checkout.
      </P>
      <P>
        Both sinks are fed from the one <Code>track()</Code> call, so the event list above is the
        complete list for PostHog too. A second set of call sites would have drifted from the first
        within a month.
      </P>

      <H3 id="posthog-privacy">What is deliberately switched off</H3>
      <P>
        PostHog&rsquo;s defaults are built for marketing sites. This is a text editor holding
        people&rsquo;s private notes, so three of them are turned off:
      </P>
      <UL>
        <LI>
          <strong>Autocapture</strong> — records every click and the text of what was clicked, which
          here would be the contents of somebody&rsquo;s notes.
        </LI>
        <LI>
          <strong>Session recording</strong> — replays the screen, which is worse.
        </LI>
        <LI>
          <strong>Automatic page views</strong> — ForkLeaf reports its own on route change, so
          leaving this on would double-count every navigation.
        </LI>
      </UL>
      <P>
        Text and element attributes are masked as well, so a future PostHog default cannot start
        collecting note content without somebody here deciding to allow it. People are identified by
        their GitHub login only — already public on github.com — and <Code>posthog.reset()</Code>{" "}
        runs on sign-out so a shared browser does not attribute the next session to whoever just
        left.
      </P>

      <H2 id="payments">Adding payments later</H2>
      <P>The data model is already in place; what is missing is a provider. To add one:</P>
      <OL>
        <li>
          Add a checkout route that creates a session with your provider and redirects to their
          hosted page.
        </li>
        <li>
          Add a webhook route that verifies the signature and writes{" "}
          <Code>users/&#123;uid&#125;/billing/subscription</Code> with the Firebase Admin SDK.
        </li>
        <li>
          Nothing else changes. <Code>usePlan()</Code> already subscribes to that document, and{" "}
          <Code>isPaid()</Code> already gates on it.
        </li>
      </OL>
      <Pre label="the document the webhook writes">{`{
  "plan": "pro",
  "status": "active",
  "provider": "stripe",
  "currentPeriodEnd": "2026-09-17T00:00:00.000Z"
}`}</Pre>
      <Note kind="warn">
        Write it with the Admin SDK from a server route only. The rules deny browser writes to that
        path on purpose — a client that can set its own plan makes the paywall decorative.
      </Note>
    </>
  );
}

export function Troubleshooting() {
  return (
    <>
      <Lead>The errors people actually hit, and what each one means.</Lead>

      <H2 id="sign-in">Sign-in</H2>
      <Def term="“GitHub sign-in is not configured on this deployment”">
        One of <Code>GITHUB_OAUTH_CLIENT_ID</Code>, <Code>GITHUB_OAUTH_CLIENT_SECRET</Code> or{" "}
        <Code>SESSION_SECRET</Code> is missing. All three are required before the sign-in button
        appears at all.
      </Def>
      <Def term="“That sign-in link expired or did not match”">
        The OAuth <Code>state</Code> cookie was missing or did not match. Usually you left the
        consent screen open for more than ten minutes, or started the flow in one browser and
        finished it in another. Start again from the app.
      </Def>
      <Def term="“Could not complete sign-in with GitHub”">
        The code-for-token exchange failed. Check that the client secret is correct and has not been
        regenerated, and that the OAuth app&rsquo;s callback URL exactly matches{" "}
        <Code>&lt;your origin&gt;/api/auth/callback</Code> — including scheme and any trailing path.
      </Def>
      <Def term="“redirect_uri_mismatch” on github.com">
        The callback URL registered on the OAuth app differs from the one ForkLeaf sent. Set{" "}
        <Code>NEXT_PUBLIC_APP_URL</Code> to your real public origin; behind a proxy the request
        origin is the internal address, not the one users see.
      </Def>
      <Def term="Signed in, but it immediately signs me out">
        Almost always <Code>SESSION_SECRET</Code> changing between requests — different values
        across instances in a load-balanced deployment, or a redeploy that regenerated it. Set one
        fixed value across every instance.
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

      <H2 id="build">Building and running</H2>
      <Def term="Type errors in packages/* after pulling">
        Workspace packages ship untranspiled source. Run <Code>pnpm install</Code> to relink, then{" "}
        <Code>pnpm typecheck</Code>.
      </Def>
      <Def term="Tailwind classes missing inside the editor package">
        <Code>globals.css</Code> has an <Code>@source</Code> directive pointing at{" "}
        <Code>packages/editor/src</Code>. Without it Tailwind never scans those files and drops
        every class they use.
      </Def>
      <Def term="Hydration mismatch warnings on load">
        The theme is applied by an inline script before React hydrates, which is deliberate — the
        alternative is a visible flash of the wrong palette on every page load. The{" "}
        <Code>&lt;html&gt;</Code> element carries <Code>suppressHydrationWarning</Code> for exactly
        this. Warnings about anything else are real.
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
        you only keep public notes, <Code>public_repo</Code> is offered as an equal choice, and
        self-hosters can use a GitHub App for per-repository consent.{" "}
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
        Not yet. It commits directly to the configured branch, so point it at a branch without
        protection rules.
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
        repository names. A self-hosted copy without Firebase collects nothing.
      </Def>
      <Def term="How do I delete everything?">
        Delete the repository on GitHub, clear site data in your browser, and revoke the OAuth app.
        Step-by-step in <A href="/docs/privacy-and-data">Your data</A>.
      </Def>
    </>
  );
}
