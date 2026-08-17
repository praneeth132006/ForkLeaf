import React from "react";
import { SiteShell } from "@/components/SiteShell";
import { A, Code, H2, Lead, LI, Note, OL, P, Table, UL } from "@/components/prose";
import { LegalPage, CONTACT_EMAIL } from "@/components/LegalPage";

export const metadata = {
  title: "Privacy Policy",
  description:
    "What ForkLeaf collects, what it does not, where your notes live, and how to delete everything.",
};

export default function PrivacyPage() {
  return (
    <SiteShell>
      <LegalPage title="Privacy Policy">
        <Lead>
          ForkLeaf is a Markdown editor that stores your notes in a GitHub repository you own. That
          design decides most of this policy: there is no ForkLeaf database holding your writing, so
          most of the questions a privacy policy usually has to answer do not arise.
        </Lead>

        <Note>
          <strong>The short version.</strong> Your notes are in your browser and in your own GitHub
          repository. We never store them. We collect anonymous usage events and a small account
          record. We do not sell anything to anyone, and there are no advertising trackers.
        </Note>

        <H2 id="who">1. Who this covers</H2>
        <P>
          This policy applies to the hosted ForkLeaf service. ForkLeaf is open source under
          Apache-2.0, and anyone may run their own instance — a self-hosted copy is operated by
          whoever deployed it, not by us, and this policy does not govern it. A self-hosted instance
          with no Firebase configuration collects nothing described in section 3.
        </P>

        <H2 id="notes">2. Your notes</H2>
        <P>Notes are stored in exactly two places, and neither is a server we run:</P>
        <Table
          head={["Location", "What is stored", "Controlled by"]}
          rows={[
            [
              <strong key="a">Your browser</strong>,
              "Notes you have opened, plus the queue of changes not yet pushed, in IndexedDB",
              "You. Clearing site data deletes it.",
            ],
            [
              <strong key="b">Your GitHub repository</strong>,
              "Notes as .md files, with their full commit history",
              "You, under GitHub's own terms and privacy policy",
            ],
          ]}
        />
        <P>
          Note content passes through our servers in memory when it is being relayed to the GitHub
          API, in order to attach your access token server-side. It is not written to disk, not
          logged and not retained.
        </P>

        <H2 id="collect">3. What we do collect</H2>

        <P>
          <strong>Account information.</strong> When you sign in with GitHub we store, in Google
          Firestore:
        </P>
        <UL>
          <LI>Your GitHub numeric id and username</LI>
          <LI>Your display name and avatar URL</LI>
          <LI>When your account was created and when it was last active</LI>
        </UL>
        <P>
          That is the whole record. It exists so a subscription has something to attach to and so
          the app can show which account you are signed in as.
        </P>

        <P>
          <strong>Usage analytics.</strong> Through Google Firebase Analytics we record which
          screens are opened and which features are used — for example that a note was created, a
          diagram was inserted, or an export was run. These events contain <em>no</em> note content,
          note titles, filenames or repository names.
        </P>

        <P>
          <strong>Session data.</strong> Your GitHub access token and public profile, encrypted into
          an <Code>httpOnly</Code> cookie that only our server can decrypt. It expires after 30
          days. It is never readable by JavaScript in your browser and never appears in a URL.
        </P>

        <P>
          <strong>Server logs.</strong> Our hosting provider keeps standard HTTP request logs — IP
          address, user agent, path, timestamp — for operational and security purposes.
        </P>

        <H2 id="not-collect">4. What we do not collect</H2>
        <UL>
          <LI>The content of your notes</LI>
          <LI>The names of your notes, folders or repositories</LI>
          <LI>Your GitHub password — we never see it; authentication happens on github.com</LI>
          <LI>Payment card details — no payment provider is currently connected at all</LI>
          <LI>Location data beyond what an IP address implies</LI>
          <LI>Anything from advertising networks, data brokers or session-replay tools</LI>
        </UL>

        <H2 id="cookies">5. Cookies</H2>
        <P>ForkLeaf sets two cookies, both strictly necessary:</P>
        <Table
          head={["Cookie", "Purpose", "Lifetime"]}
          rows={[
            [
              <Code key="a">forkleaf_session</Code>,
              "Your encrypted sign-in session",
              "30 days, or until you sign out",
            ],
            [
              <Code key="b">forkleaf_oauth_state</Code>,
              "Cross-site request forgery protection during sign-in",
              "10 minutes, deleted as soon as it is used",
            ],
          ]}
        />
        <P>
          Firebase Analytics may set its own identifiers in browser storage. It is not used for
          advertising, and blocking it does not affect the app.
        </P>
        <P>
          Preferences such as your theme choice are kept in <Code>localStorage</Code> on your device
          and are never sent to us.
        </P>

        <H2 id="processors">6. Who else is involved</H2>
        <Table
          head={["Provider", "Role", "What they receive"]}
          rows={[
            [
              <strong key="a">GitHub, Inc.</strong>,
              "Hosts your notes repository and authenticates you",
              "Everything in your repository — it is your repository on their platform",
            ],
            [
              <strong key="b">Google (Firebase)</strong>,
              "Analytics, account record, future billing state",
              "Anonymous usage events and the account record in section 3",
            ],
            [
              <strong key="c">Our hosting provider</strong>,
              "Serves the application",
              "Standard HTTP request logs",
            ],
          ]}
        />
        <P>
          We do not sell personal information, and we do not share it with anyone beyond the
          processors above.
        </P>

        <H2 id="legal">7. Why we are allowed to process it</H2>
        <P>
          For users in the UK, EEA and other jurisdictions with equivalent law, our lawful bases
          are:
        </P>
        <UL>
          <LI>
            <strong>Contract</strong> — session data and the account record are necessary to provide
            a service you asked for.
          </LI>
          <LI>
            <strong>Legitimate interests</strong> — anonymous analytics and server logs, to keep the
            service working and to understand which features matter. You can block both without
            losing functionality.
          </LI>
        </UL>

        <H2 id="retention">8. How long we keep it</H2>
        <UL>
          <LI>
            <strong>Session cookie:</strong> 30 days, or until you sign out.
          </LI>
          <LI>
            <strong>Account record:</strong> until you ask us to delete it.
          </LI>
          <LI>
            <strong>Analytics events:</strong> according to the retention window configured in
            Firebase, currently 14 months.
          </LI>
          <LI>
            <strong>Server logs:</strong> according to our hosting provider&rsquo;s retention
            policy, typically 30 days.
          </LI>
          <LI>
            <strong>Your notes:</strong> we do not hold them, so there is nothing for us to retain
            or delete. They persist for as long as you keep the repository.
          </LI>
        </UL>

        <H2 id="rights">9. Your rights</H2>
        <P>
          Depending on where you live you may have the right to access, correct, delete, export or
          restrict processing of your personal data, and to object to it. To exercise any of these,
          email <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
        </P>
        <P>You can also do most of it yourself, immediately:</P>
        <OL>
          <li>
            <strong>Notes on GitHub</strong> — delete the repository in your GitHub settings. It is
            your data in your account; we cannot delete it for you.
          </li>
          <li>
            <strong>Notes in your browser</strong> — clear site data for this domain.
          </li>
          <li>
            <strong>Your session</strong> — sign out, then revoke ForkLeaf at{" "}
            <A href="https://github.com/settings/applications">
              GitHub → Settings → Applications → Authorized OAuth Apps
            </A>
            .
          </li>
          <li>
            <strong>Your account record</strong> — email us and it will be deleted within 30 days.
          </li>
        </OL>
        <Note kind="warn">
          Do step 1 before step 2. Notes in the &ldquo;On this device&rdquo; workspace exist only in
          your browser — clearing site data destroys them, and there is no other copy anywhere.
        </Note>

        <H2 id="transfers">10. International transfers</H2>
        <P>
          GitHub and Google both operate globally and may process data outside your country,
          including in the United States, under their own standard contractual clauses and transfer
          mechanisms.
        </P>

        <H2 id="children">11. Children</H2>
        <P>
          ForkLeaf is not directed at children under 13, and we do not knowingly collect their
          personal information. GitHub requires account holders to be at least 13.
        </P>

        <H2 id="changes">12. Changes to this policy</H2>
        <P>
          If this policy changes materially, the date at the top of the page changes and a notice
          appears in the app. The history of every revision is public in the{" "}
          <A href="https://github.com/praneeth132006/MarkDown">git repository</A>, so you can diff
          it.
        </P>

        <H2 id="contact">13. Contact</H2>
        <P>
          Privacy questions, data requests and complaints:{" "}
          <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>. For security vulnerabilities,
          please follow the disclosure process in{" "}
          <A href="https://github.com/praneeth132006/MarkDown/blob/main/SECURITY.md">SECURITY.md</A>{" "}
          instead of filing a public issue.
        </P>
        <P>
          The engineering-level account of the same material, with the exact document shapes, is in{" "}
          <A href="/docs/privacy-and-data">the documentation</A>.
        </P>
      </LegalPage>
    </SiteShell>
  );
}
