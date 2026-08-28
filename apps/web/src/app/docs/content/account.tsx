import { A, Code, Def, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";
import { EVERYTHING } from "@/lib/plans";

export function Plans() {
  return (
    <>
      <Lead>
        ForkLeaf is free, all of it, with no tiers and no paid upgrade. Your notes sit in your own
        GitHub account, so there is no storage for anyone to charge you for — and a paywall would
        only ever stand between you and your own writing.
      </Lead>

      <Note>
        <strong>There used to be Pro and Team tiers here.</strong> They were announced but never
        sold, and they are gone: every feature they listed now ships to everyone. Funding comes from{" "}
        <A href="https://github.com/sponsors/praneeth132006">GitHub Sponsors</A>, which unlocks
        nothing and is meant not to.
      </Note>

      <H2 id="tiers">What you get</H2>
      <UL>
        {EVERYTHING.map((feature) => (
          <LI key={feature}>{feature}</LI>
        ))}
      </UL>

      <H2 id="promise">What will always be free</H2>
      <P>
        A free tier is only meaningful if its boundaries are stated. These will not move behind a
        paywall:
      </P>
      <UL>
        <LI>Unlimited notes, of unlimited length, in a repository you own.</LI>
        <LI>All three editing views, and every block type in the insert menu.</LI>
        <LI>Every Mermaid diagram type, the visual builder, and the source editor.</LI>
        <LI>Export to Markdown, PDF, HTML, Word, plain text and JSON.</LI>
        <LI>Offline editing and background sync.</LI>
        <LI>Conflict detection and resolution.</LI>
        <LI>Running the whole thing yourself — the source is Apache-2.0.</LI>
      </UL>
      <P>
        Scale is not a paywall here either: more repositories, search across all of them, and branch
        and pull-request workflows are part of the same free application.
      </P>

      <H2 id="billing">How funding works</H2>
      <P>
        There is no billing. Nothing in ForkLeaf takes a payment, so there is no checkout, no card
        handling, and no subscription record anywhere — the Firestore entitlement document and the
        code that read it were removed along with the tiers.
      </P>
      <P>
        The project is funded by{" "}
        <A href="https://github.com/sponsors/praneeth132006">GitHub Sponsors</A>. Sponsoring grants
        no extra features, changes nothing in the app, and is not linked to your account in any way.
      </P>

      <H2 id="shutdown">If ForkLeaf disappears</H2>
      <P>
        Your notes are already in your GitHub repository as plain Markdown, in a normal git history.
        They keep working with no ForkLeaf involved: clone the repo, open it in any editor, or point
        another tool at it. There is no export step, because there was never an import step.
      </P>
      <P>
        The source is Apache-2.0 licensed and public, so nothing about that depends on this
        deployment continuing to exist.
      </P>
    </>
  );
}

export function PrivacyAndData() {
  return (
    <>
      <Lead>
        A plain inventory of what ForkLeaf holds about you, where each piece lives, and how to get
        rid of it. The formal version is the <A href="/privacy">privacy policy</A>; this is the
        engineering account.
      </Lead>

      <H2 id="notes">Your notes</H2>
      <Table
        head={["Where", "What", "Who can read it"]}
        rows={[
          [
            <strong key="a">Your browser (IndexedDB)</strong>,
            "Every note in every workspace you have opened, plus the pending-change queue",
            "You, on that device",
          ],
          [
            <strong key="b">Your GitHub repository</strong>,
            "Notes as .md files, with full commit history",
            "Whoever you have granted access to that repository",
          ],
          [
            <strong key="c">ForkLeaf servers</strong>,
            "Nothing. Note content passes through the API proxy in memory and is not written down.",
            "—",
          ],
        ]}
      />
      <P>
        There is no notes table. This is not a policy commitment that could be revised — it is the
        architecture. See <A href="/docs/how-it-works">How ForkLeaf works</A>.
      </P>

      <H2 id="session">Your session</H2>
      <Def term="The session cookie">
        Contains your GitHub access token, the refresh token that renews it, and your public profile
        — id, login, name, avatar URL — encrypted with JWE (A256GCM). <Code>httpOnly</Code>,{" "}
        <Code>SameSite=Lax</Code>, <Code>Secure</Code> in production, 30-day expiry. Only the server
        can decrypt it. The refresh token is there because a GitHub App&rsquo;s access token expires
        after eight hours; it is spent server-side to get a new one, and never reaches the browser
        either.
      </Def>
      <Def term="The OAuth state cookie">
        A random value that lives for ten minutes during sign-in and is deleted the moment it is
        used.
      </Def>

      <H2 id="firebase">Analytics and account records</H2>
      <P>
        The hosted deployment uses Firebase for product analytics and for a thin account record. A
        self-hosted copy with no Firebase configuration collects none of this and works identically.
      </P>
      <H3>Analytics</H3>
      <P>
        Firebase Analytics records which screens are opened and which features are used — note
        created, diagram inserted, note exported, repository connected. Events carry no note
        content, no filenames, no repository names and no note text.
      </P>
      <P>
        It degrades to nothing when unavailable: private browsing, a blocked script or a missing
        IndexedDB all result in analytics simply not running, and the app does not care.
      </P>
      <H3>The user record</H3>
      <P>
        One Firestore document, at <Code>users/&#123;uid&#125;</Code>:
      </P>
      <Pre label="users/abc123">{`{
  "githubId": 12345678,
  "githubLogin": "you",
  "displayName": "Your Name",
  "avatarUrl": "https://avatars.githubusercontent.com/u/12345678",
  "createdAt": "2026-08-14T09:12:00Z",
  "lastSeenAt": "2026-08-17T16:40:00Z"
}`}</Pre>
      <P>
        That is the entire record. It exists so a subscription has something to attach to. The{" "}
        <Code>uid</Code> is an anonymous Firebase identity created automatically — you are never
        asked to sign in to Firebase, and it is not your GitHub login.
      </P>

      <H2 id="third-parties">Who else is involved</H2>
      <Table
        head={["Party", "Role", "What they see"]}
        rows={[
          [
            <strong key="a">GitHub</strong>,
            "Stores your notes",
            "Everything in the repository — it is their repository hosting",
          ],
          [
            <strong key="b">Google (Firebase)</strong>,
            "Analytics, user record, billing state",
            "Anonymous usage events and the small profile above",
          ],
          [
            <strong key="c">The host</strong>,
            "Serves the app",
            "Standard HTTP request logs: IP, user agent, path",
          ],
        ]}
      />
      <P>
        No advertising networks, no data brokers, no session-replay tooling, no third-party
        trackers.
      </P>

      <H2 id="delete">Deleting everything</H2>
      <OL>
        <li>
          <strong>Notes on GitHub:</strong> delete the repository from your GitHub settings. That is
          your data in your account — ForkLeaf cannot and does not delete it for you.
        </li>
        <li>
          <strong>Notes in this browser:</strong> clear site data for this domain, which drops the
          IndexedDB database.
        </li>
        <li>
          <strong>Your session:</strong> sign out, then revoke the app at{" "}
          <A href="https://github.com/settings/applications">GitHub → Applications</A> (the hosted
          ForkLeaf is registered as a GitHub App, so it is under <em>Authorized GitHub Apps</em>).
        </li>
        <li>
          <strong>Your Firebase record:</strong> email the address in the{" "}
          <A href="/privacy">privacy policy</A> and it will be deleted.
        </li>
      </OL>
      <Note>
        Step 1 first. Deleting the browser copy of an unsynced local-workspace note is irreversible
        — there is no other copy of it anywhere.
      </Note>
    </>
  );
}

export function Security() {
  return (
    <>
      <Lead>
        ForkLeaf holds a token that can read and write every repository you granted it. That is the
        whole security story, and everything below follows from taking it seriously.
      </Lead>

      <H2 id="token">Token handling</H2>
      <UL>
        <LI>
          The access token is encrypted into an <Code>httpOnly</Code> cookie that only the server
          can open, with authenticated encryption and a key this deployment alone holds.
        </LI>
        <LI>
          It is never serialised into the page, never returned by an API route, and never placed in
          a URL or redirect.
        </LI>
        <LI>
          Every GitHub call is proxied by ForkLeaf&rsquo;s own server, which attaches the token on
          the way out.
        </LI>
        <LI>
          The token expires after eight hours and is renewed server-side with a refresh token held
          in the same cookie, so the sign-in outlives the token without either value ever reaching
          the browser. <A href="/docs/signing-in">Signing in</A>.
        </LI>
      </UL>
      <Note>
        A token in <Code>localStorage</Code> — the usual shortcut — is readable by any script that
        ever runs on the page, including a compromised npm dependency. That single decision is why
        the API proxy exists.
      </Note>

      <H2 id="csrf">OAuth CSRF</H2>
      <P>
        The sign-in round trip carries a single-use random value, held in a short-lived cookie and
        compared on return. It is consumed and deleted whether or not it matched.
      </P>
      <P>
        Without it, an attacker can complete an OAuth flow in your browser and bind your session to
        their account, so your notes start being committed to their repository.
      </P>

      <H2 id="xss">Cross-site scripting</H2>
      <UL>
        <LI>
          Rendered Markdown is sanitised before it reaches the DOM. Raw HTML in a note is not
          executed.
        </LI>
        <LI>
          Mermaid SVG output is sanitised before insertion — a diagram is user input like any other.
        </LI>
        <LI>
          Link and image URLs are restricted to <Code>http</Code>, <Code>https</Code> and{" "}
          <Code>mailto</Code>, in the editor, in pasted content, and in the insert menu. A{" "}
          <Code>javascript:</Code> URL committed into a note would be a stored XSS affecting
          everyone who later opens the file.
        </LI>
      </UL>

      <H2 id="history">Your history is not rewritten</H2>
      <P>
        ForkLeaf squashes consecutive edits so your history is not one commit per keystroke, which
        means it amends commits. It amends <em>only</em> a commit it made itself, moments ago, as
        you, with nothing else having landed since. Anything outside that — a commit from another
        device, from a collaborator, from a GitHub Action, from you on github.com — is never
        touched, and neither is a commit old enough to have been read by somebody.
      </P>
      <Note kind="danger">
        <strong>
          A way to make ForkLeaf rewrite or destroy a commit it did not create is a security bug,
          not a bug report.
        </strong>{" "}
        Please report it privately rather than opening a public issue — the process is in{" "}
        <A href="https://github.com/praneeth132006/ForkLeaf/blob/main/SECURITY.md">SECURITY.md</A>.
      </Note>

      <H2 id="scope">Known trade-offs</H2>
      <Def term="The repo scope is broad">
        It is the narrowest classic OAuth scope that allows writing to a private repository, and it
        is the only scope requested — no profile, email or organisation permission is asked for
        alongside it. If you only keep notes in public repositories, <Code>public_repo</Code> is
        offered as an equal choice on the sign-in page.
      </Def>
      <Def term="Notes are only as private as the repository">
        ForkLeaf creates the notes repository private, but if you make it public, or connect a
        public one, your notes are public. The app cannot protect you from your own repository
        settings.
      </Def>
      <Def term="Local notes are unencrypted">
        IndexedDB content is not encrypted at rest. Anyone with access to your unlocked machine and
        browser profile can read it, as with any web app.
      </Def>

      <H2 id="reporting">Reporting a vulnerability</H2>
      <P>
        Please do not open a public issue. The disclosure process, the response timeline and what is
        in scope are documented in{" "}
        <A href="https://github.com/praneeth132006/ForkLeaf/blob/main/SECURITY.md">SECURITY.md</A>.
      </P>
    </>
  );
}
